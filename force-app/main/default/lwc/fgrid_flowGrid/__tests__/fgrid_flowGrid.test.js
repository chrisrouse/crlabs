import { createElement } from "lwc";
import FgridFlowGrid from "c/fgrid_flowGrid";
import { MIN_COLUMN_WIDTH } from "c/fgrid_gridModel";
import getRecordsByIds from "@salesforce/apex/FlowGridController.getRecordsByIds";
import runFlow from "@salesforce/apex/FlowGridController.runFlow";
import Toast from "lightning/toast";
import ToastContainer from "lightning/toastContainer";
import { loadStyle } from "lightning/platformResourceLoader";
import FgridFlowActionModal from "c/fgrid_flowActionModal";

// The row action's flow now runs in a `lightning/modal`, which renders in the
// platform's overlay container rather than this grid's template -- so there is no
// `lightning-flow` here to drive, and `open()` resolves with the outcome instead of
// relaying `statuschange`. Mocking open() is the pattern the component's own docs
// prescribe for a parent's tests.
jest.mock("c/fgrid_flowActionModal");

/** Makes the next row action resolve with a given outcome, and records the props. */
function stubFlowModal(outcome) {
    const opened = [];
    FgridFlowActionModal.open = jest.fn((props) => {
        opened.push(props);
        return Promise.resolve(outcome);
    });
    return opened;
}

// An emittable wire, so a test can give the grid real column metadata. Without it
// describeByPath is empty, every picklist-dependent assertion passes vacuously, and
// the fan-out never renders.
jest.mock(
    "@salesforce/apex/FlowGridController.getGridMetadata",
    () => {
        // eslint-disable-next-line no-undef
        const { createApexTestWireAdapter } = require("@salesforce/wire-service-jest-util");
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock("@salesforce/apex/FlowGridController.runFlow", () => ({ default: jest.fn() }), { virtual: true });
jest.mock("@salesforce/apex/FlowGridController.getRecordsByIds", () => ({ default: jest.fn() }), { virtual: true });
jest.mock(
    "@salesforce/apex/FlowGridController.getFlowVariables",
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);

function build(props = {}) {
    const element = createElement("c-fgrid_flow-grid", { is: FgridFlowGrid });
    element.objectApiName = "Account";
    element.columnFields = '["Name","Industry"]';
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

function records(count) {
    return Array.from({ length: count }, (_, i) => ({
        Id: `001x${String(i).padStart(12, "0")}`,
        Name: `Account ${i}`,
        Industry: i % 2 ? "Energy" : "Retail"
    }));
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("column width floor", () => {
    it("floors column widths above the platform default", () => {
        // The datatable divides the available width between columns and clamps each
        // at this floor, scrolling horizontally once the floors stop fitting. So
        // columns still fill a wide container; the floor only bites when they
        // cannot. The platform's own default is 50px, narrow enough that a few
        // columns in a quick action collapse to about one word each.
        const element = build({ records: records(3) });

        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").minColumnWidth).toBe(MIN_COLUMN_WIDTH);
        expect(MIN_COLUMN_WIDTH).toBeGreaterThan(50);
    });
});

describe("derived-value memoization", () => {
    // The row pipeline has eight template entry points and LWC does not cache
    // getters, so without memoization a single render rebuilt the rows for every
    // one of them. These tests pin both halves: that repeated reads reuse the work,
    // and — the part that would silently break the grid — that a real change still
    // invalidates it.
    it("reuses the same rows across repeated reads", () => {
        const element = build({ records: records(50) });
        const datatable = () => element.shadowRoot.querySelector("c-fgrid_custom-datatable");

        const first = datatable().data;
        expect(first).toHaveLength(50);
        // Same array instance, not merely an equal one.
        expect(datatable().data).toBe(first);
    });

    it("reuses the same column definitions across reads", () => {
        const element = build({ records: records(5) });
        const datatable = () => element.shadowRoot.querySelector("c-fgrid_custom-datatable");

        expect(datatable().columns).toBe(datatable().columns);
    });

    it("rebuilds rows when the record collection changes", async () => {
        const element = build({ records: records(5) });
        const before = element.shadowRoot.querySelector("c-fgrid_custom-datatable").data;

        element.records = records(9);
        await Promise.resolve();

        const after = element.shadowRoot.querySelector("c-fgrid_custom-datatable").data;
        expect(after).not.toBe(before);
        expect(after).toHaveLength(9);
    });

    it("rebuilds columns when the column configuration changes", async () => {
        const element = build({ records: records(3) });
        const before = element.shadowRoot.querySelector("c-fgrid_custom-datatable").columns;

        element.columnConfig = '{"Name":{"label":"Account"}}';
        await Promise.resolve();

        const after = element.shadowRoot.querySelector("c-fgrid_custom-datatable").columns;
        expect(after).not.toBe(before);
        expect(after[0].label).toBe("Account");
    });

    it("rebuilds columns when a column is added", async () => {
        const element = build({ records: records(3) });
        const before = element.shadowRoot.querySelector("c-fgrid_custom-datatable").columns.length;

        element.columnFields = '["Name","Industry","Rating"]';
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").columns.length).toBe(before + 1);
    });
});

describe("row loading", () => {
    const datatable = (element) => element.shadowRoot.querySelector("c-fgrid_custom-datatable");

    it("renders a window rather than every row, by default", () => {
        const element = build({ records: records(300) });

        // Scroll is the default. Rendering all 300 was the old behaviour and the
        // reason a large grid took seconds to become responsive.
        expect(datatable(element).data).toHaveLength(50);
        expect(datatable(element).enableInfiniteLoading).toBe(true);
    });

    it("grows the window on loadmore, and stops asking once exhausted", async () => {
        const element = build({ records: records(120) });

        datatable(element).dispatchEvent(new CustomEvent("loadmore"));
        await Promise.resolve();
        expect(datatable(element).data).toHaveLength(100);

        datatable(element).dispatchEvent(new CustomEvent("loadmore"));
        await Promise.resolve();
        expect(datatable(element).data).toHaveLength(120);
        // Nothing left to load, so the datatable should stop firing loadmore.
        expect(datatable(element).enableInfiniteLoading).toBe(false);
    });

    it("does not enable infinite loading when everything already fits", () => {
        const element = build({ records: records(10) });
        expect(datatable(element).enableInfiniteLoading).toBe(false);
    });

    it("pages instead of scrolling in Paginate mode", () => {
        const element = build({ records: records(300), rowLoading: "Paginate", recordsPerPage: 10 });

        expect(datatable(element).data).toHaveLength(10);
        expect(datatable(element).enableInfiniteLoading).toBe(false);
    });

    it("resets the window when the result set changes", async () => {
        const element = build({ records: records(300) });
        datatable(element).dispatchEvent(new CustomEvent("loadmore"));
        await Promise.resolve();
        expect(datatable(element).data).toHaveLength(100);

        // A search narrows the results; keeping a window sized for the old set would
        // show more rows than the user asked to see.
        element.shadowRoot
            .querySelector("lightning-input[type='search']")
            ?.dispatchEvent(new CustomEvent("change", { target: { value: "Account 1" } }));
        element.records = records(80);
        await Promise.resolve();

        expect(datatable(element).data).toHaveLength(50);
    });

    it("always applies a height, so the scroll container exists", () => {
        const element = build({ records: records(10) });
        expect(element.shadowRoot.querySelector("[class*='grid__wrapper']").style.height).toBe("30rem");
    });

    it("honours an explicit height", () => {
        const tall = build({ records: records(10), tableHeight: "50vh" });
        expect(tall.shadowRoot.querySelector("[class*='grid__wrapper']").style.height).toBe("50vh");
    });

    it("never emits overflow, so only the datatable scrolls", () => {
        // Two nested scroll containers each reserve a scrollbar gutter, which showed
        // as dead space down the right edge beyond the visible scrollbar.
        const element = build({ records: records(300) });
        expect(element.shadowRoot.querySelector("[class*='grid__wrapper']").style.overflow).toBe("");
    });
});

describe("draft accumulation across cells", () => {
    // `cellchange` reports only the cell that just changed. Replacing the draft set
    // with it discarded every earlier edit as soon as a second cell was touched, and
    // because draft-values is bound back to the table the first cell visibly
    // reverted — inline editing lost work on every move to the next field.
    function change(element, drafts) {
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(new CustomEvent("cellchange", { detail: { draftValues: drafts } }));
    }

    it("keeps an earlier field when a second field on the same row is edited", async () => {
        const element = build({ records: records(2) });
        await Promise.resolve();

        change(element, [{ Id: records(2)[0].Id, Name: "Edited name" }]);
        await Promise.resolve();
        change(element, [{ Id: records(2)[0].Id, Industry: "Banking" }]);
        await Promise.resolve();

        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        expect(table.draftValues).toEqual([{ Id: records(2)[0].Id, Name: "Edited name", Industry: "Banking" }]);
    });

    it("keeps a separate draft per row", async () => {
        const element = build({ records: records(2) });
        await Promise.resolve();
        const [first, second] = records(2);

        change(element, [{ Id: first.Id, Name: "One" }]);
        await Promise.resolve();
        change(element, [{ Id: second.Id, Name: "Two" }]);
        await Promise.resolve();

        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        expect(table.draftValues).toHaveLength(2);
    });

    it("ignores an empty cellchange rather than clearing the bar", async () => {
        const element = build({ records: records(1) });
        await Promise.resolve();

        change(element, [{ Id: records(1)[0].Id, Name: "Kept" }]);
        await Promise.resolve();
        change(element, []);
        await Promise.resolve();

        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        expect(table.draftValues).toEqual([{ Id: records(1)[0].Id, Name: "Kept" }]);
    });
});

describe("navigateNextOnSave respects the screen's available actions", () => {
    // `navigateNextOnSave` dispatched FlowNavigationNextEvent unconditionally. On a
    // flow's LAST screen there is no NEXT -- it is FINISH -- so the event was a
    // no-op the runtime complains about: the admin's setting appeared to do nothing
    // while adding console noise. `availableActions` is Flow's own list of what the
    // current screen permits, and it is now consulted.
    //
    // This had no coverage at all before, in either direction.
    async function saveWith(props) {
        const element = build({ records: records(1), navigateNextOnSave: true, ...props });
        // The datatable has to exist before its `save` can be dispatched.
        await Promise.resolve();
        const fired = [];
        // `lightning__flownavigationnext`, not `flownavigationnext` -- the name
        // comes from FlowNavigationNextEventName in lightning/flowSupport.
        element.addEventListener("lightning__flownavigationnext", (event) => fired.push(event));
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(
                new CustomEvent("save", { detail: { draftValues: [{ Id: records(1)[0].Id, Name: "Edited" }] } })
            );
        await Promise.resolve();
        return fired;
    }

    it("navigates when the screen offers NEXT", async () => {
        expect(await saveWith({ availableActions: ["NEXT", "PAUSE"] })).toHaveLength(1);
    });

    it("does not navigate on a last screen, which offers FINISH instead", async () => {
        expect(await saveWith({ availableActions: ["FINISH", "PAUSE"] })).toHaveLength(0);
    });

    it("still navigates when Flow supplied no action list", async () => {
        // Permissive on an empty list. A grid outside a flow screen has no list at
        // all, and silently disabling a configured behaviour is worse than trying.
        expect(await saveWith({})).toHaveLength(1);
        expect(await saveWith({ availableActions: [] })).toHaveLength(1);
    });

    it("does not navigate when the setting is off, whatever the actions say", async () => {
        expect(await saveWith({ navigateNextOnSave: false, availableActions: ["NEXT"] })).toHaveLength(0);
    });
});

describe("drafts keyed by columnKey", () => {
    // Columns carry a columnKey so a dragged width survives a rebuild, and the
    // datatable then reports drafts under it rather than under fieldName. Writing
    // the draft key straight onto the record created a phantom field — the edit was
    // detected as a change but the real field never received it, so the cell
    // appeared to clear on save.
    function save(element, drafts) {
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(new CustomEvent("save", { detail: { draftValues: drafts } }));
    }

    it("writes the edit to the real field, not to the columnKey", async () => {
        const element = build({ records: records(1) });
        await Promise.resolve();
        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        const nameColumn = table.columns.find((column) => column.fieldName === "Name");
        expect(nameColumn.columnKey).not.toBe("Name");

        save(element, [{ Id: records(1)[0].Id, [nameColumn.columnKey]: "Renamed" }]);
        await Promise.resolve();

        const row = table.data.find((candidate) => candidate.Id === records(1)[0].Id);
        expect(row.Name).toBe("Renamed");
        expect(row[nameColumn.columnKey]).toBeUndefined();
    });

    it("still accepts a draft already keyed by fieldName", async () => {
        const element = build({ records: records(1) });
        await Promise.resolve();

        save(element, [{ Id: records(1)[0].Id, Name: "Direct" }]);
        await Promise.resolve();

        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        const row = table.data.find((candidate) => candidate.Id === records(1)[0].Id);
        expect(row.Name).toBe("Direct");
    });
});

describe("actioned record reports the click", () => {
    // Actioned means clicked, and nothing more. It used to wait for an outcome —
    // a completed flow, or a removal the cap allowed — which made it a second,
    // weaker "edited" rather than a record of what the user acted on.
    function clickRowAction(element, row) {
        element.shadowRoot.querySelector("c-fgrid_custom-datatable").dispatchEvent(
            new CustomEvent("rowaction", {
                detail: { action: { name: "fgridRowAction" }, row }
            })
        );
    }

    it("reports a removal that the cap refused", async () => {
        const element = build({ records: records(3), rowActionType: "Remove", maxRemovedRows: 1 });
        await Promise.resolve();
        const [first, second] = records(3);

        clickRowAction(element, first);
        await Promise.resolve();
        clickRowAction(element, second);
        await Promise.resolve();

        // The second removal is blocked, but the click still happened.
        expect(element.outputActionedRecord.Id).toBe(second.Id);
        expect(element.outputRemovedRecords).toHaveLength(1);
    });

    it("reports the row as soon as a flow action is launched", async () => {
        const element = build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowName: "Some_Flow"
        });
        await Promise.resolve();
        const [first] = records(2);

        clickRowAction(element, first);
        await Promise.resolve();

        // Published on click, so a cancelled flow still leaves it reported.
        expect(element.outputActionedRecord.Id).toBe(first.Id);
    });
});

describe("row-action outcomes are toasts, not banners", () => {
    // A record the action deleted on purpose used to be reported through the same
    // channel as four real failures, which rendered it as a warning with
    // role="alert" and titled the row "This row's action did not finish". The
    // action had finished, and had done exactly what it was asked to. Success and
    // failure are now separate toast variants.
    const target = records(2)[0];

    /**
     * Spies on `Toast.show` rather than listening for `lightning__showtoast`.
     *
     * `lightning/toast` renders through its own page-level container instead of
     * relying on a platform listener -- which is the whole reason it works in LWR,
     * where `platformShowToastEvent` produced nothing.
     */
    function toasts() {
        const seen = [];
        Toast.show = jest.fn((config) => seen.push(config));
        return seen;
    }

    function clickAction(element) {
        element.shadowRoot.querySelector("c-fgrid_custom-datatable").dispatchEvent(
            new CustomEvent("rowaction", {
                detail: { action: { name: "fgridRowAction" }, row: target }
            })
        );
    }

    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function build_() {
        return build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow",
            rowActionFlowRecordVariable: "record"
        });
    }

    it("asks the toast container to clear the SLDS toast layer before showing one", async () => {
        // An LWR theme header was measured at 100001, so the container has to clear
        // it. A toast is the topmost layer by definition -- SLDS puts it above its
        // own modals -- so being outranked by page chrome is a failure.
        //
        // WHAT THIS TEST CANNOT TELL YOU: the mock's `{ style: {} }` is a shape
        // invented here, so a pass proves only that the component asks -- never
        // that the platform honoured it. Read `elevates again after showing` below
        // for the case a green version of this test hid for a whole day.
        const container = { style: {} };
        ToastContainer.instance = jest.fn(() => container);
        loadStyle.mockClear();
        getRecordsByIds.mockResolvedValue([]);
        const element = build_();
        toasts();

        clickAction(element);
        await settle();

        expect(ToastContainer.instance).toHaveBeenCalled();
        expect(container.style.zIndex).toBe("100002");
        // Rejected: a distributed package should not restyle a customer's whole
        // site. The `!important` rule that does work belongs in the site's own CSS.
        expect(loadStyle).not.toHaveBeenCalled();
    });

    it("re-asserts the z-index after the platform rewrites it", async () => {
        // The bug this exists to catch: unmounting `lightning-modal-base` rewrites
        // the toast container's inline style back to 10000 about 180ms after we set
        // it, so the modal row action's toast appeared above the site header and
        // then sank behind it. Traced with a MutationObserver on
        // `lightning-overlay-container`'s shadow root -- one container, rewritten,
        // never replaced.
        //
        // Modelled by having the platform stomp the value once, shortly after the
        // toast. A single pre-`Toast.show` elevation loses to that; the retry window
        // wins because nothing rewrites it after teardown.
        //
        // REAL timers, not fake. `settle()` waits on a `setTimeout`, which never
        // fires while timers are mocked, so the fake-timer version of this test hung
        // until the 5s jest timeout and took the rest of the suite down with it.
        const container = { style: {} };
        ToastContainer.instance = jest.fn(() => container);
        getRecordsByIds.mockResolvedValue([]);
        const element = build_();
        toasts();

        clickAction(element);
        await settle();
        expect(container.style.zIndex).toBe("100002");

        // The platform undoes it, as it does when the modal unmounts.
        container.style.zIndex = "10000";
        await wait(150);

        expect(container.style.zIndex).toBe("100002");
    });

    it("stops re-asserting once the window closes", async () => {
        // Bounded on purpose. An unbounded interval would outlive every toast and
        // fight anything else that legitimately restyles the container. Waits out
        // the whole window, so this test is deliberately the slow one.
        const container = { style: {} };
        ToastContainer.instance = jest.fn(() => container);
        getRecordsByIds.mockResolvedValue([]);
        const element = build_();
        toasts();

        clickAction(element);
        await settle();
        await wait(1200);

        // Past the window, a rewrite is left alone -- the timer is gone.
        container.style.zIndex = "10000";
        await wait(150);

        expect(container.style.zIndex).toBe("10000");
    });

    it("still reports when the container cannot be reached", async () => {
        // Presentation must never stop the message. A platform that stops handing
        // back an element means a toast possibly behind a header, not a silent one.
        ToastContainer.instance = jest.fn(() => {
            throw new Error("no container");
        });
        getRecordsByIds.mockResolvedValue([]);
        const element = build_();
        const seen = toasts();

        clickAction(element);
        await settle();

        expect(seen).toHaveLength(1);
        expect(seen[0].variant).toBe("error");
    });

    it("refuses to launch, as an error, when the record is already gone", async () => {
        // Opposite outcomes: a stale row is a failure, a deleted one is a success.
        // Without checking first the grid cannot tell them apart, because it only
        // re-reads after the flow finishes.
        getRecordsByIds.mockResolvedValue([]);
        stubFlowModal(undefined);
        const element = build_();
        const seen = toasts();

        clickAction(element);
        await settle();

        expect(FgridFlowActionModal.open).not.toHaveBeenCalled();
        expect(seen).toHaveLength(1);
        expect(seen[0].variant).toBe("error");
        // The toast carries the ADMIN's wording, not the diagnostic. "That record
        // no longer exists" was a developer's sentence; a site visitor could not act
        // on it and should not have had to read it.
        expect(seen[0].label).toBe("There was an error updating this record.");
        expect(seen[0].message).toBeUndefined();
        // Same wording on the row, and no detail line -- the row error's title used
        // to be our own "This row's action did not finish".
        const rows = element.shadowRoot.querySelector("c-fgrid_custom-datatable").errors.rows;
        const rowError = rows[target.Id];
        expect(rowError.title).toBe("There was an error updating this record.");
        expect(rowError.messages).toEqual([]);
    });

    it("leaves the stale row in the collection rather than reporting it removed", async () => {
        // Publishing it through outputRemovedRecords would tell the calling flow
        // that this action removed it, and a Delete Records element fed from that
        // would then fail on an already-deleted id.
        getRecordsByIds.mockResolvedValue([]);
        const element = build_();
        const removed = [];
        element.addEventListener("fgridattributechange", (event) => {
            if (event.detail?.attributeName === "outputRemovedRecords") {
                removed.push(event.detail.value);
            }
        });

        clickAction(element);
        await settle();

        expect(removed.flat().filter(Boolean)).toEqual([]);
        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").data).toHaveLength(2);
    });

    it("launches when the record is still there", async () => {
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        const opened = stubFlowModal(undefined);
        const element = build_();

        clickAction(element);
        await settle();

        expect(opened).toHaveLength(1);
        expect(opened[0].flowApiName).toBe("Some_Flow");
        expect(opened[0].size).toBe("medium");
    });

    it("passes the close lock to the modal", async () => {
        // `disableClose` is the base class's own property, set through `open()` as
        // the docs prescribe. It disables the close button and blocks Escape and
        // `close()`; it does not hide the button, which is not available to us.
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        const opened = stubFlowModal(undefined);
        const element = build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow",
            rowActionFlowRecordVariable: "record",
            rowActionFlowPreventClose: true
        });

        clickAction(element);
        await settle();

        expect(opened[0].disableClose).toBe(true);
    });

    it("leaves the modal dismissible when the lock is off", async () => {
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        const opened = stubFlowModal(undefined);
        const element = build_();

        clickAction(element);
        await settle();

        expect(opened[0].disableClose).toBe(false);
    });

    it("reports a deletion with the delete message, not the success message", async () => {
        // "Updated" is wrong for a row that has gone, so a deletion gets its own
        // admin-set wording -- still the success variant, because the action did
        // what it was asked to.
        getRecordsByIds.mockResolvedValueOnce([{ ...target }]).mockResolvedValue([]);
        stubFlowModal({ status: "FINISHED", outputVariables: [] });
        const element = build_();
        const seen = toasts();

        clickAction(element);
        await settle();
        await settle();

        expect(seen).toHaveLength(1);
        expect(seen[0].variant).toBe("success");
        expect(seen[0].label).toBe("The selected record was deleted.");
    });

    it("marks the failing row for every failure, not just the stale one", async () => {
        // `_flowRecord` was nulled as soon as `open()` resolved, and the row error
        // keys off it, so a flow ERROR marked no row at all. Still worth asserting
        // now the wording is shared: without the record the row error cannot render
        // however good the message is.
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        stubFlowModal({ status: "ERROR" });
        const element = build_();

        clickAction(element);
        await settle();
        await settle();

        const rows = element.shadowRoot.querySelector("c-fgrid_custom-datatable").errors.rows;
        expect(rows[target.Id].title).toBe("There was an error updating this record.");
        expect(rows[target.Id].messages).toEqual([]);
    });

    it("keeps the flow's own fault text as the one detail line", async () => {
        // The single exception to folding everything into the configured wording.
        // `error.body.message` is the flow's own fault, wrapped by
        // FlowGridController -- the one error here the grid does not author, and the
        // most useful thing it ever gets. It goes on the row, never in the toast.
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        runFlow.mockRejectedValue({ body: { message: "The flow Delete_It did not run: DML failed." } });
        const element = build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow",
            rowActionFlowLaunchMode: "Headless",
            rowActionFlowRecordVariable: "record"
        });
        const seen = toasts();

        clickAction(element);
        await settle();
        await settle();

        expect(seen[0].label).toBe("There was an error updating this record.");
        const rows = element.shadowRoot.querySelector("c-fgrid_custom-datatable").errors.rows;
        expect(rows[target.Id].title).toBe("There was an error updating this record.");
        expect(rows[target.Id].messages).toEqual(["The flow Delete_It did not run: DML failed."]);
    });

    it("shows nothing on the row either when the error message is blank", async () => {
        // The same string drives both, so clearing it silences both. A documented
        // consequence of an explicit choice rather than a gap -- but it does mean a
        // blank Error Message leaves the grid showing nothing at all on failure.
        getRecordsByIds.mockResolvedValue([]);
        stubFlowModal(undefined);
        const element = build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow",
            rowActionFlowRecordVariable: "record",
            rowActionFlowErrorMessage: ""
        });
        const seen = toasts();

        clickAction(element);
        await settle();

        expect(seen).toHaveLength(0);
        // `errors` is undefined rather than `{}` when nothing is wrong: an empty
        // object makes the datatable switch on its own row number column, because
        // that is where it draws the row error indicator.
        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").errors).toBeUndefined();
    });

    it("uses the admin's wording for each outcome", async () => {
        // The whole point of the properties: nothing in a toast should be ours.
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        stubFlowModal({ status: "FINISHED", outputVariables: [] });
        const element = build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow",
            rowActionFlowRecordVariable: "record",
            rowActionFlowSuccessMessage: "Your booking is confirmed."
        });
        const seen = toasts();

        clickAction(element);
        await settle();
        await settle();

        expect(seen).toHaveLength(1);
        expect(seen[0].label).toBe("Your booking is confirmed.");
    });

    it("sends no links and no mode, so rich text stays off and dismissal is the platform's", async () => {
        // Rich text is NOT supported. `labelLinks` is what the docs describe as
        // switching on `lightning-formatted-rich-text`; it was tried empty and with
        // a real link in the template, and neither rendered the markup, so nothing
        // here sets it. Leaving `mode` unset keeps the platform's variant-derived
        // dismissal: success auto-dismisses, error stays.
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        stubFlowModal({ status: "FINISHED", outputVariables: [] });
        const element = build_();
        const seen = toasts();

        clickAction(element);
        await settle();
        await settle();

        expect(seen[0].labelLinks).toBeUndefined();
        expect(seen[0].mode).toBeUndefined();
        expect(Object.keys(seen[0]).sort()).toEqual(["label", "variant"]);
    });

    it("says nothing at all when the message is blank", async () => {
        // Blank means "do not announce this", which is how an admin turns a toast
        // off without a second property to disagree with the first.
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        stubFlowModal({ status: "FINISHED", outputVariables: [] });
        const element = build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow",
            rowActionFlowRecordVariable: "record",
            rowActionFlowSuccessMessage: ""
        });
        const seen = toasts();

        clickAction(element);
        await settle();
        await settle();

        expect(seen).toHaveLength(0);
    });

    it("reports a flow that errored as an error, and stays silent on cancel", async () => {
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        stubFlowModal({ status: "ERROR" });
        const element = build_();
        const seen = toasts();

        clickAction(element);
        await settle();

        expect(seen).toHaveLength(1);
        expect(seen[0].variant).toBe("error");

        // Dismissing resolves undefined. Nothing happened, so nothing is announced.
        stubFlowModal(undefined);
        clickAction(element);
        await settle();

        expect(seen.filter((toast) => toast.variant === "success")).toEqual([]);
    });
});

describe("a row-action flow that saves its own changes", () => {
    // When the launched flow does its own DML the change is not pending, so it must
    // not reach Edited Records — the calling flow would save it a second time. But
    // the cell still has to show it, because the collection the grid was handed is
    // now stale. Hence the display-only overlay.
    //
    // The grid re-reads the row after every flow action, so what the DATABASE returns
    // is the whole test: it is what decides saved from unsaved. An earlier version of
    // these tests left the mock returning undefined, which the grid correctly read as
    // "the record was deleted" — it asserted nothing about this feature.
    const target = records(2)[0];

    function build_(props) {
        return build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow",
            rowActionFlowRecordVariable: "record",
            ...props
        });
    }

    /**
     * Runs the row action with the flow resolving a record.
     *
     * The flow lives in a `lightning/modal` now, so there is no `lightning-flow` in
     * this grid to dispatch `statuschange` on -- `open()` resolves the outcome. The
     * two settles cover the existence pre-check and the modal's promise.
     */
    async function runAction(element, flowReturns) {
        stubFlowModal({
            status: "FINISHED",
            outputVariables: [{ name: "record", value: flowReturns }]
        });
        element.shadowRoot.querySelector("c-fgrid_custom-datatable").dispatchEvent(
            new CustomEvent("rowaction", {
                detail: { action: { name: "fgridRowAction" }, row: target }
            })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    function rowFor(element) {
        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        return table.data.find((candidate) => candidate.Id === target.Id);
    }

    it("keeps the change pending when the database shows it was not saved", async () => {
        getRecordsByIds.mockResolvedValue([{ ...target }]);
        const element = build_({ rowActionFlowSavesChanges: true });
        await Promise.resolve();

        await runAction(element, { ...target, Industry: "Banking" });

        // The admin said the flow saves, but it demonstrably did not, so the grid does
        // not take their word for it.
        expect(element.editedCount).toBe(1);
        expect(rowFor(element).Industry).toBe("Banking");
    });

    it("drops the change when the database shows it was saved", async () => {
        getRecordsByIds.mockResolvedValue([{ ...target, Industry: "Banking" }]);
        const element = build_({ rowActionFlowSavesChanges: true });
        await Promise.resolve();

        await runAction(element, { ...target, Industry: "Banking" });

        expect(element.editedCount).toBe(0);
        expect(element.outputEditedRecords).toEqual([]);
        // Still displayed, from the overlay rather than from the pending set.
        expect(rowFor(element).Industry).toBe("Banking");
    });

    it("reports only the unsaved remainder when a flow saves some fields", async () => {
        // All-or-nothing would be wrong in both directions here.
        getRecordsByIds.mockResolvedValue([{ ...target, Industry: "Banking" }]);
        const element = build_({ rowActionFlowSavesChanges: true });
        await Promise.resolve();

        await runAction(element, { ...target, Industry: "Banking", Name: "Not Saved Yet" });

        expect(element.editedCount).toBe(1);
        const [edited] = element.outputEditedRecords;
        expect(edited.Name).toBe("Not Saved Yet");
    });

    it("leaves the change pending when the property is off", async () => {
        // Default behaviour is unchanged: everything a flow returns is pending, even
        // if the database already agrees.
        getRecordsByIds.mockResolvedValue([{ ...target, Industry: "Banking" }]);
        const element = build_({});
        await Promise.resolve();

        await runAction(element, { ...target, Industry: "Banking" });

        expect(element.editedCount).toBe(1);
    });
});

describe("actioned record ids accumulate", () => {
    // Actioned Record holds only the most recent click, which is what makes it useful
    // for reacting on the same screen and useless for reporting afterwards. The
    // collection answers the other question: which rows were actioned in total.
    function clickRowAction(element, row) {
        element.shadowRoot.querySelector("c-fgrid_custom-datatable").dispatchEvent(
            new CustomEvent("rowaction", {
                detail: { action: { name: "fgridRowAction" }, row }
            })
        );
        return Promise.resolve();
    }

    it("collects one id per actioned row, in click order", async () => {
        const element = build({ records: records(3), rowActionType: "Remove" });
        await Promise.resolve();
        const [first, second, third] = records(3);

        await clickRowAction(element, third);
        await clickRowAction(element, first);
        await clickRowAction(element, second);

        expect(element.outputActionedRecordIds).toEqual([third.Id, first.Id, second.Id]);
    });

    it("collapses a repeated action on the same row", async () => {
        // It records which rows were actioned, not how many times.
        const element = build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow"
        });
        await Promise.resolve();
        const [first] = records(2);

        await clickRowAction(element, first);
        await clickRowAction(element, first);
        await clickRowAction(element, first);

        expect(element.outputActionedRecordIds).toEqual([first.Id]);
    });

    it("keeps the single output pointing at the most recent click", async () => {
        // Both outputs coexist; neither replaces the other.
        const element = build({ records: records(2), rowActionType: "Remove" });
        await Promise.resolve();
        const [first, second] = records(2);

        await clickRowAction(element, first);
        await clickRowAction(element, second);

        expect(element.outputActionedRecord.Id).toBe(second.Id);
        expect(element.outputActionedRecordIds).toEqual([first.Id, second.Id]);
    });
});

describe("selection limits and control", () => {
    function table(element) {
        return element.shadowRoot.querySelector("c-fgrid_custom-datatable");
    }

    it("caps Single at one row regardless of the maximum", async () => {
        const element = build({ records: records(5), selectionMode: "Single", maxSelection: 4 });
        await Promise.resolve();

        expect(table(element).maxRowSelection).toBe(1);
    });

    it("applies the maximum only for Multiple, and leaves it open when blank", async () => {
        const capped = build({ records: records(5), selectionMode: "Multiple", maxSelection: 3 });
        await Promise.resolve();
        expect(table(capped).maxRowSelection).toBe(3);

        const open = build({ records: records(5), selectionMode: "Multiple" });
        await Promise.resolve();
        expect(table(open).maxRowSelection).toBeUndefined();
    });

    it("uses a checkbox for single selection only when asked", async () => {
        // The distinction is whether the selection can be undone: a radio cannot be
        // cleared once chosen, a checkbox can. That is why no Clear Selection button
        // is needed any more.
        const radio = build({ records: records(2), selectionMode: "Single" });
        await Promise.resolve();
        expect(table(radio).singleRowSelectionMode).toBeUndefined();

        const checkbox = build({
            records: records(2),
            selectionMode: "Single",
            singleSelectControl: "Checkbox"
        });
        await Promise.resolve();
        expect(table(checkbox).singleRowSelectionMode).toBe("checkbox");
    });

    it("requires the minimum before the screen will advance", async () => {
        const element = build({ records: records(5), selectionMode: "Multiple", minSelection: 2 });
        await Promise.resolve();

        const result = element.validate();
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toBe("Select at least 2 rows to continue.");
    });

    it("ignores the minimum for Single, where Require is the switch", async () => {
        const element = build({ records: records(5), selectionMode: "Single", minSelection: 3 });
        await Promise.resolve();

        expect(element.validate().isValid).toBe(true);
    });

    it("still requires one row for Single when Require is on", async () => {
        const element = build({ records: records(5), selectionMode: "Single", isRequired: true });
        await Promise.resolve();

        const result = element.validate();
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toBe("Select at least one row to continue.");
    });
});

describe("auto-saving edits", () => {
    // The Cancel and Save buttons do not appear because nothing is ever pending, not
    // because they are hidden. The bottom bar itself stays, which is where
    // table-level errors surface — the reference forbids suppressing it.
    function change(element, drafts) {
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(new CustomEvent("cellchange", { detail: { draftValues: drafts } }));
        return Promise.resolve();
    }

    it("commits on cell change and leaves nothing pending", async () => {
        const element = build({ records: records(2), autoSaveEdits: true });
        await Promise.resolve();
        const [first] = records(2);

        await change(element, [{ Id: first.Id, Name: "Saved immediately" }]);

        expect(element.editedCount).toBe(1);
        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").draftValues).toEqual([]);
    });

    it("holds the edit as a draft when auto-save is off", async () => {
        const element = build({ records: records(2) });
        await Promise.resolve();
        const [first] = records(2);

        await change(element, [{ Id: first.Id, Name: "Pending" }]);

        expect(element.editedCount).toBe(0);
        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").draftValues).toHaveLength(1);
    });

    it("still resolves a draft keyed by columnKey", async () => {
        // Auto-save takes its own path through the handler, so it needs the same
        // columnKey translation the Save path does.
        const element = build({ records: records(2), autoSaveEdits: true });
        await Promise.resolve();
        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        const nameColumn = table.columns.find((column) => column.fieldName === "Name");
        const [first] = records(2);

        await change(element, [{ Id: first.Id, [nameColumn.columnKey]: "Renamed" }]);

        const row = element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .data.find((candidate) => candidate.Id === first.Id);
        expect(row.Name).toBe("Renamed");
    });
});

describe("sort state is keyed by columnKey", () => {
    // The datatable identifies a column by columnKey once one exists, and echoes it
    // back on the sort event. Feeding `sorted-by` the fieldName instead meant it never
    // recognised the column as sorted, refused to flip, and emitted nothing at all on
    // the second click — a grid that could only sort ascending.
    function sort(element, detail) {
        element.shadowRoot.querySelector("c-fgrid_custom-datatable").dispatchEvent(new CustomEvent("sort", { detail }));
        return Promise.resolve();
    }

    it("echoes the columnKey back as sorted-by", async () => {
        const element = build({ records: records(3) });
        await Promise.resolve();
        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        const column = table.columns.find((candidate) => candidate.fieldName === "Name");

        await sort(element, { fieldName: "Name", columnKey: column.columnKey, sortDirection: "asc" });

        expect(table.sortedBy).toBe(column.columnKey);
        expect(table.sortedBy).not.toBe("Name");
    });

    it("accepts the flipped direction on a second sort", async () => {
        const element = build({ records: records(3) });
        await Promise.resolve();
        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        const column = table.columns.find((candidate) => candidate.fieldName === "Name");

        await sort(element, { fieldName: "Name", columnKey: column.columnKey, sortDirection: "asc" });
        await sort(element, { fieldName: "Name", columnKey: column.columnKey, sortDirection: "desc" });

        expect(table.sortedDirection).toBe("desc");
        expect(table.data.map((row) => row.Name)).toEqual(["Account 2", "Account 1", "Account 0"]);
    });

    it("reports the real field to the flow, not the columnKey", async () => {
        const element = build({ records: records(3) });
        await Promise.resolve();
        const column = element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .columns.find((candidate) => candidate.fieldName === "Name");

        await sort(element, { fieldName: "Name", columnKey: column.columnKey, sortDirection: "asc" });

        expect(element.sortedBy).toBe("Name");
    });
});

describe("errors are undefined rather than empty when nothing is wrong", () => {
    // Tidiness, not a fix. This was changed on the theory that an empty `errors`
    // object switched on the datatable's own row number column. Measured in a
    // running flow afterwards: `showRowNumberColumn` was still true with `errors`
    // undefined, so the theory was wrong -- the cause was leaving
    // `show-row-number-column` unset. Pinned anyway because `{}` is a poor way to
    // say "nothing is wrong".
    const datatable = (element) => element.shadowRoot.querySelector("c-fgrid_custom-datatable");

    it("sends undefined, not an empty object, when nothing is wrong", async () => {
        const element = build({ records: records(3) });
        await Promise.resolve();

        expect(datatable(element).errors).toBeUndefined();
    });

    it("still sends a real error when there is one", async () => {
        getRecordsByIds.mockResolvedValue([]);
        const element = build({
            records: records(2),
            rowActionType: "Flow",
            rowActionFlowApiName: "Some_Flow",
            rowActionFlowRecordVariable: "record"
        });
        await Promise.resolve();

        datatable(element).dispatchEvent(
            new CustomEvent("rowaction", {
                detail: { action: { name: "fgridRowAction" }, row: records(2)[0] }
            })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(datatable(element).errors).toBeDefined();
        expect(datatable(element).errors.rows).toBeDefined();
    });
});

describe("grid height defaults only where a scroll boundary is needed", () => {
    // The 30rem default exists so `loadmore` has something to fire against. It was
    // applied unconditionally, so a paginated grid was forced to 30rem whatever it
    // held -- ten short rows above a slab of empty grid -- and the help text's
    // "leave blank to fit all rows" was simply false.
    const style = (element) => element.shadowRoot.querySelector(".grid__wrapper").getAttribute("style") || "";

    it("defaults to 30rem when rows load by scrolling", async () => {
        const element = build({ records: records(50) });
        await Promise.resolve();

        expect(style(element)).toContain("height: 30rem");
    });

    it("sets no height at all when paginated and nothing is configured", async () => {
        const element = build({ records: records(50), rowLoading: "Paginate", recordsPerPage: 10 });
        await Promise.resolve();

        expect(style(element)).not.toContain("height");
    });

    it("honours an explicit height in either mode", async () => {
        const scrolling = build({ records: records(50), tableHeight: "20rem" });
        await Promise.resolve();
        expect(style(scrolling)).toContain("height: 20rem");

        const paginated = build({
            records: records(50),
            rowLoading: "Paginate",
            recordsPerPage: 10,
            tableHeight: "20rem"
        });
        await Promise.resolve();
        expect(style(paginated)).toContain("height: 20rem");
    });
});

describe("row numbers continue across pages", () => {
    // The datatable numbers the rows it is HANDED, and in Paginate mode that is one
    // page at a time -- so without an offset, page two of ten-per-page showed rows
    // 11-20 numbered 1-10. Two different records both labelled "1" is worse than no
    // numbers at all.
    //
    // This matters more than it looks, because on an editable grid the platform
    // forces its row number column ON regardless of the setting -- see
    // `showRowNumbers`. The offset is what makes that forced column correct.
    const datatable = (element) => element.shadowRoot.querySelector("c-fgrid_custom-datatable");

    it("offsets by nothing on the first page", async () => {
        const element = build({
            records: records(30),
            rowLoading: "Paginate",
            recordsPerPage: 10,
            showRowNumbers: true
        });
        await Promise.resolve();

        expect(datatable(element).rowNumberOffset).toBe(0);
    });

    it("offsets by a page's worth on the second page", async () => {
        const element = build({
            records: records(30),
            rowLoading: "Paginate",
            recordsPerPage: 10,
            showRowNumbers: true
        });
        await Promise.resolve();

        element.shadowRoot
            .querySelector("c-fgrid_pagination")
            .dispatchEvent(new CustomEvent("pagechange", { detail: { page: 2 } }));
        await Promise.resolve();

        expect(datatable(element).rowNumberOffset).toBe(10);
    });

    it("offsets by nothing in scroll mode, where the window starts at the top", async () => {
        const element = build({ records: records(300), showRowNumbers: true });
        await Promise.resolve();

        expect(datatable(element).rowNumberOffset).toBe(0);
    });

    it("passes the setting through, for the read-only grids where it is honoured", async () => {
        // Passed faithfully, but the PLATFORM overrides it upward: an editable
        // column forces `show-row-number-column` true and the docs say that cannot
        // be overridden. So this asserts what we send, not what renders -- the jest
        // stub does not model the override.
        const on = build({ records: records(3), showRowNumbers: true });
        await Promise.resolve();
        expect(datatable(on).showRowNumberColumn).toBe(true);

        const off = build({ records: records(3) });
        await Promise.resolve();
        expect(datatable(off).showRowNumberColumn).toBe(false);
    });
});

describe("selection survives paging", () => {
    // The datatable reports only the rows it is rendering. Treating that as the whole
    // selection meant paging away deselected everything the user had picked.
    function selectRows(element, rows) {
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(new CustomEvent("rowselection", { detail: { selectedRows: rows } }));
        return Promise.resolve();
    }

    function goToPage(element, page) {
        element.shadowRoot
            .querySelector("c-fgrid_pagination")
            .dispatchEvent(new CustomEvent("pagechange", { detail: { page } }));
        return Promise.resolve();
    }

    it("keeps a selection made on an earlier page", async () => {
        const all = records(4);
        const element = build({ records: all, rowLoading: "Paginate", recordsPerPage: 2 });
        await Promise.resolve();

        await selectRows(element, [all[0]]);
        expect(element.selectedCount).toBe(1);

        // Page two: the datatable reports nothing selected, because it can see
        // neither of the rows the user picked.
        await goToPage(element, 2);
        await selectRows(element, []);

        expect(element.selectedCount).toBe(1);
        expect(element.outputSelectedRecords.map((r) => r.Id)).toEqual([all[0].Id]);
    });

    it("accumulates selections across pages", async () => {
        const all = records(4);
        const element = build({ records: all, rowLoading: "Paginate", recordsPerPage: 2 });
        await Promise.resolve();

        await selectRows(element, [all[0]]);
        await goToPage(element, 2);
        await selectRows(element, [all[2]]);

        expect(element.selectedCount).toBe(2);
        expect(element.outputSelectedRecords.map((r) => r.Id).sort()).toEqual([all[0].Id, all[2].Id].sort());
    });

    it("still deselects a row on the page the user is looking at", async () => {
        const all = records(4);
        const element = build({ records: all, rowLoading: "Paginate", recordsPerPage: 2 });
        await Promise.resolve();

        await selectRows(element, [all[0], all[1]]);
        expect(element.selectedCount).toBe(2);

        await selectRows(element, [all[1]]);
        expect(element.selectedCount).toBe(1);
        expect(element.outputSelectedRecords.map((r) => r.Id)).toEqual([all[1].Id]);
    });
});

describe("selection is restored when a page comes back into view", () => {
    function selectRows(element, rows) {
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(new CustomEvent("rowselection", { detail: { selectedRows: rows } }));
        return Promise.resolve();
    }

    function goToPage(element, page) {
        element.shadowRoot
            .querySelector("c-fgrid_pagination")
            .dispatchEvent(new CustomEvent("pagechange", { detail: { page } }));
        return Promise.resolve();
    }

    function tableSelection(element) {
        return element.shadowRoot.querySelector("c-fgrid_custom-datatable").selectedRows;
    }

    it("ticks the row again on returning to its page", async () => {
        // The state was already right; the checkbox was not. The datatable rebuilds
        // its selection when data changes, so it has to be handed the prop again.
        const all = records(4);
        const element = build({ records: all, rowLoading: "Paginate", recordsPerPage: 2 });
        await Promise.resolve();

        await selectRows(element, [all[0]]);
        await goToPage(element, 2);
        await selectRows(element, []);
        await goToPage(element, 1);

        expect(tableSelection(element)).toEqual([all[0].Id]);
    });

    it("hands the table only the keys it can see", async () => {
        const all = records(4);
        const element = build({ records: all, rowLoading: "Paginate", recordsPerPage: 2 });
        await Promise.resolve();

        await selectRows(element, [all[0]]);
        await goToPage(element, 2);

        // Still selected overall, but nothing on this page to tick.
        expect(element.selectedCount).toBe(1);
        expect(tableSelection(element)).toEqual([]);
    });
});

describe("maximum selection across pages", () => {
    // The datatable is handed only the keys for rows it can see, so its own cap counts
    // one page at a time — three on page one left three more available on page two.
    function selectRows(element, rows) {
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(new CustomEvent("rowselection", { detail: { selectedRows: rows } }));
        return Promise.resolve();
    }

    function goToPage(element, page) {
        element.shadowRoot
            .querySelector("c-fgrid_pagination")
            .dispatchEvent(new CustomEvent("pagechange", { detail: { page } }));
        return Promise.resolve();
    }

    function build_(props) {
        return build({
            records: records(6),
            selectionMode: "Multiple",
            rowLoading: "Paginate",
            recordsPerPage: 3,
            maxSelection: 3,
            ...props
        });
    }

    it("counts selections made on other pages", async () => {
        const all = records(6);
        const element = build_({});
        await Promise.resolve();

        await selectRows(element, [all[0], all[1], all[2]]);
        expect(element.selectedCount).toBe(3);

        await goToPage(element, 2);
        await selectRows(element, [all[3]]);

        expect(element.selectedCount).toBe(3);
        expect(element.outputSelectedRecords.map((r) => r.Id)).toEqual([all[0].Id, all[1].Id, all[2].Id]);
    });

    it("disables every unselected row once the maximum is reached, on any page", async () => {
        // The datatable greys the remaining checkboxes on the page it can see and
        // leaves them live everywhere else, so the ceiling has to be applied through
        // disabled-rows.
        const all = records(6);
        const element = build_({});
        await Promise.resolve();

        await selectRows(element, [all[0], all[1], all[2]]);
        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        expect(table.disabledRows).toEqual([]);

        await goToPage(element, 2);
        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").disabledRows).toEqual([
            all[3].Id,
            all[4].Id,
            all[5].Id
        ]);
    });

    it("re-enables them when a row is deselected", async () => {
        const all = records(6);
        const element = build_({});
        await Promise.resolve();

        await selectRows(element, [all[0], all[1], all[2]]);
        await selectRows(element, [all[0], all[1]]);

        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").disabledRows).toEqual([]);
    });

    it("says so as soon as the maximum is reached, not only when a click is refused", async () => {
        const all = records(6);
        const element = build_({});
        await Promise.resolve();

        await selectRows(element, [all[0], all[1], all[2]]);

        expect(element.shadowRoot.textContent).toContain("Maximum of 3 rows selected");
    });

    it("fills only the room that is left", async () => {
        const all = records(6);
        const element = build_({});
        await Promise.resolve();

        await selectRows(element, [all[0], all[1]]);
        await goToPage(element, 2);
        await selectRows(element, [all[3], all[4]]);

        // One slot left, so the first of the two newly ticked rows takes it.
        expect(element.selectedCount).toBe(3);
        expect(element.outputSelectedRecords.map((r) => r.Id)).toEqual([all[0].Id, all[1].Id, all[3].Id]);
    });

    it("clears the message once a selection succeeds", async () => {
        const all = records(6);
        const element = build_({});
        await Promise.resolve();

        await selectRows(element, [all[0], all[1], all[2]]);
        await goToPage(element, 2);
        await selectRows(element, [all[3]]);
        await goToPage(element, 1);
        await selectRows(element, [all[0]]);

        expect(element.shadowRoot.textContent).not.toContain("Maximum of 3 rows selected");
    });

    it("leaves an uncapped grid alone", async () => {
        const all = records(6);
        const element = build_({ maxSelection: undefined });
        await Promise.resolve();

        await selectRows(element, [all[0], all[1], all[2]]);
        await goToPage(element, 2);
        await selectRows(element, [all[3], all[4], all[5]]);

        expect(element.selectedCount).toBe(6);
    });
});

describe("wrapped line limit", () => {
    // SLDS 2 hardcodes the clamp: `.slds-line-clamp { -webkit-line-clamp: 3 }` in
    // slds-plus.css, with no var() to override. Confirmed in the inspector — the cell
    // carried `--lwc-lineClamp: 6` and nothing read it. So the count cannot be
    // honoured and the setting is a switch: three lines, or all of them.
    function linesFor(props) {
        const element = build({ records: records(1), ...props });
        return element.shadowRoot.querySelector("c-fgrid_custom-datatable").wrapTextMaxLines;
    }

    it("sends three when the limit is on, as a number", async () => {
        // The TYPE is the assertion. This passed for weeks against the string "3",
        // while `lightning-datatable` logged `The attribute "wrapTextMaxLines" value
        // passed in is incorrect. "wrapTextMaxLines" value should be an integer > 0`
        // on every single page load. Invisible here because the clamp still applied:
        // the class does not depend on the value surviving validation.
        expect(linesFor({ limitWrappedLines: true })).toBe(3);
        expect(typeof linesFor({ limitWrappedLines: true })).toBe("number");
    });

    it("sends nothing when it is off, so the class is never applied", async () => {
        expect(linesFor({})).toBeUndefined();
        expect(linesFor({ limitWrappedLines: false })).toBeUndefined();
    });

    it("does not try to override the SLDS hook, which cannot work", async () => {
        const element = build({ records: records(1), limitWrappedLines: true });
        const style = element.shadowRoot.querySelector("[class*='grid__wrapper']").style;
        expect(style.getPropertyValue("--slds-g-font-line-clamp")).toBe("");
    });
});

describe("View Only requires nothing", () => {
    // Flow keeps a property it was given, and the editor only stops SHOWING min/max
    // and Require when the mode changes — so a grid switched from Multiple to View only
    // was still demanding rows the user had no way to pick.
    it("ignores a leftover minimum", async () => {
        const element = build({ records: records(4), selectionMode: "None", minSelection: 2 });
        await Promise.resolve();

        expect(element.validate().isValid).toBe(true);
    });

    it("ignores a leftover Require from Single", async () => {
        const element = build({ records: records(4), selectionMode: "None", isRequired: true });
        await Promise.resolve();

        expect(element.validate().isValid).toBe(true);
    });

    it("shows no validation message either", async () => {
        const element = build({ records: records(4), selectionMode: "None", minSelection: 3 });
        await Promise.resolve();

        expect(element.shadowRoot.textContent).not.toContain("Select at least");
    });

    it("still enforces the minimum once selection is turned back on", async () => {
        const element = build({ records: records(4), selectionMode: "Multiple", minSelection: 2 });
        await Promise.resolve();

        expect(element.validate().isValid).toBe(false);
    });
});

describe("reverting an edit un-counts it", () => {
    // The comparison used to run against allKnownRecords, which already has pending
    // edits applied — so it asked "is this different from what I last typed" rather
    // than "different from what we started with". Putting the original value back
    // counted as another change and the record stayed flagged for good.
    function change(element, drafts) {
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(new CustomEvent("cellchange", { detail: { draftValues: drafts } }));
        return Promise.resolve();
    }

    it("drops the record when every field is back to its original value", async () => {
        const all = records(2);
        const element = build({ records: all, autoSaveEdits: true });
        await Promise.resolve();

        await change(element, [{ Id: all[0].Id, Name: "Changed" }]);
        expect(element.editedCount).toBe(1);

        await change(element, [{ Id: all[0].Id, Name: all[0].Name }]);
        expect(element.editedCount).toBe(0);
        expect(element.outputEditedRecords).toEqual([]);
    });

    it("keeps the fields that are still different", async () => {
        const all = records(2);
        const element = build({ records: all, autoSaveEdits: true });
        await Promise.resolve();

        await change(element, [{ Id: all[0].Id, Name: "Changed", Industry: "Banking" }]);
        await change(element, [{ Id: all[0].Id, Name: all[0].Name }]);

        expect(element.editedCount).toBe(1);
        const [edited] = element.outputEditedRecords;
        expect(edited.Industry).toBe("Banking");
        expect(edited.Name).toBe(all[0].Name);
    });

    it("works the same on the Save path, not just auto-save", async () => {
        const all = records(2);
        const element = build({ records: all });
        await Promise.resolve();
        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");

        table.dispatchEvent(new CustomEvent("save", { detail: { draftValues: [{ Id: all[0].Id, Name: "Changed" }] } }));
        await Promise.resolve();
        expect(element.editedCount).toBe(1);

        table.dispatchEvent(
            new CustomEvent("save", { detail: { draftValues: [{ Id: all[0].Id, Name: all[0].Name }] } })
        );
        await Promise.resolve();
        expect(element.editedCount).toBe(0);
    });

    it("still shows the reverted value in the grid", async () => {
        const all = records(2);
        const element = build({ records: all, autoSaveEdits: true });
        await Promise.resolve();

        await change(element, [{ Id: all[0].Id, Name: "Changed" }]);
        await change(element, [{ Id: all[0].Id, Name: all[0].Name }]);

        const row = element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .data.find((candidate) => candidate.Id === all[0].Id);
        expect(row.Name).toBe(all[0].Name);
    });
});

describe("change detection is scoped to the columns in use", () => {
    // The signature decides whether incoming data changed enough to discard unsaved
    // edits. Hashing every field a "store all fields" Get returned was
    // O(records x fields) with a sort per record, and it also threw away edits when a
    // field the grid never shows happened to change.
    function editFirst(element, all) {
        element.shadowRoot
            .querySelector("c-fgrid_custom-datatable")
            .dispatchEvent(new CustomEvent("save", { detail: { draftValues: [{ Id: all[0].Id, Name: "Edited" }] } }));
        return Promise.resolve();
    }

    it("keeps unsaved edits when an unshown field changes", async () => {
        const all = records(2).map((record) => ({ ...record, Rating: "Hot" }));
        const element = build({ records: all });
        await Promise.resolve();

        await editFirst(element, all);
        expect(element.editedCount).toBe(1);

        // Same rows, but a field the grid does not display has moved.
        element.records = all.map((record) => ({ ...record, Rating: "Cold" }));
        await Promise.resolve();

        expect(element.editedCount).toBe(1);
    });

    it("still discards them when a displayed field changes", async () => {
        const all = records(2);
        const element = build({ records: all });
        await Promise.resolve();

        await editFirst(element, all);
        expect(element.editedCount).toBe(1);

        element.records = all.map((record, index) => {
            return index === 1 ? { ...record, Industry: "Something else" } : record;
        });
        await Promise.resolve();

        expect(element.editedCount).toBe(0);
    });

    it("still discards them when the collection changes size", async () => {
        const all = records(3);
        const element = build({ records: all });
        await Promise.resolve();

        await editFirst(element, all);
        element.records = all.slice(0, 2);
        await Promise.resolve();

        expect(element.editedCount).toBe(0);
    });
});

describe("a user-defined object never describes an SObject", () => {
    // eslint-disable-next-line no-undef
    const metadata = require("@salesforce/apex/FlowGridController.getGridMetadata").default;

    it("withholds the object from the describe wire", async () => {
        // The editor maps the generic type to a placeholder so Flow Builder will
        // save the screen, which means objectApiName CAN be set here while there
        // is no real object. Describing it would ask Apex for the JSON's own keys
        // on an object that has never heard of them.
        build({
            isUserDefinedObject: true,
            objectApiName: "User",
            columnFields: "Id, Name, Amount",
            recordsJson: '[{"Id":"1","Name":"Acme","Amount":5000}]'
        });
        await Promise.resolve();

        expect(metadata.getLastConfig().objectApiName).toBeUndefined();
    });

    it("still describes the object for an ordinary record collection", async () => {
        build({ records: records(2) });
        await Promise.resolve();

        expect(metadata.getLastConfig().objectApiName).toBe("Account");
    });

    it("renders the JSON rows with the hand-typed columns", async () => {
        const element = build({
            isUserDefinedObject: true,
            objectApiName: "User",
            columnFields: "Id, Name, Amount",
            recordsJson: '[{"Id":"1","Name":"Acme","Amount":5000},{"Id":"2","Name":"Globex","Amount":2500}]'
        });
        await Promise.resolve();

        const table = element.shadowRoot.querySelector("c-fgrid_custom-datatable");
        expect(table.data).toHaveLength(2);
        expect(table.columns.map((c) => c.fieldName)).toEqual(["Id", "Name", "Amount"]);
        expect(table.data[0].Name).toBe("Acme");
    });
});

describe("picklist record types are fetched once each", () => {
    // eslint-disable-next-line no-undef
    const metadata = require("@salesforce/apex/FlowGridController.getGridMetadata").default;

    /** Metadata with one editable picklist column, so the fan-out has a reason to run. */
    function emitPicklistMetadata(element) {
        metadata.emit({
            objectInfo: { apiName: "Account", isAccessible: true },
            columns: [
                {
                    fieldPath: "Industry",
                    label: "Industry",
                    dataType: "picklist",
                    displayType: "PICKLIST",
                    isAccessible: true,
                    isEditable: true,
                    picklistOptions: [{ label: "Energy", value: "Energy" }]
                }
            ]
        });
        return Promise.resolve().then(() => element);
    }

    // A wire adapter takes one recordTypeId and a component cannot loop wires, so the
    // parent renders one invisible child per DISTINCT record type. The cost scales
    // with record types, not with rows.
    function fetchers(element) {
        return [...element.shadowRoot.querySelectorAll("c-fgrid_picklist-values")].map((el) => el.recordTypeId);
    }

    const withTypes = (ids) =>
        ids.map((recordTypeId, index) => ({
            Id: `001x${index}`,
            Name: `Account ${index}`,
            Industry: "Energy",
            RecordTypeId: recordTypeId
        }));

    it("fetches nothing when filtering is off and no column is dependent", async () => {
        const element = build({ records: records(3) });
        await emitPicklistMetadata(element);

        expect(fetchers(element)).toEqual([]);
    });

    it("fetches exactly one record type for Global", async () => {
        const element = build({
            records: records(3),
            picklistRecordTypeMode: "Global",
            recordTypeId: "012AAA"
        });
        await emitPicklistMetadata(element);

        expect(fetchers(element)).toEqual(["012AAA"]);
    });

    it("de-duplicates record types for Per Row", async () => {
        // Six records, two record types: two fetches, not six. The cost scales with
        // record types, not rows, which is what makes 2000 records affordable.
        const element = build({
            records: withTypes(["012A", "012B", "012A", "012B", "012A", "012B"]),
            picklistRecordTypeMode: "PerRow"
        });
        await emitPicklistMetadata(element);

        expect(fetchers(element).sort()).toEqual(["012A", "012B"]);
    });

    it("falls back to the master record type for a record without one", async () => {
        const element = build({
            records: withTypes(["012A", undefined]),
            picklistRecordTypeMode: "PerRow"
        });
        await emitPicklistMetadata(element);

        expect(fetchers(element).sort()).toEqual(["012000000000000AAA", "012A"]);
    });
});

describe("the removal cap explains itself", () => {
    function removeRow(element, row) {
        element.shadowRoot.querySelector("c-fgrid_custom-datatable").dispatchEvent(
            new CustomEvent("rowaction", {
                detail: { action: { name: "fgridRowAction" }, row }
            })
        );
        return Promise.resolve();
    }

    it("says how many can go at once, once the cap is hit", async () => {
        const all = records(5);
        const element = build({ records: all, rowActionType: "Remove", maxRemovedRows: 2 });
        await Promise.resolve();

        await removeRow(element, all[0]);
        await removeRow(element, all[1]);
        expect(element.shadowRoot.textContent).not.toContain("You can only remove");

        await removeRow(element, all[2]);
        expect(element.shadowRoot.textContent).toContain("You can only remove 2 rows at once.");
        expect(element.removedCount).toBe(2);
    });

    it("uses the singular for a cap of one", async () => {
        const all = records(3);
        const element = build({ records: all, rowActionType: "Remove", maxRemovedRows: 1 });
        await Promise.resolve();

        await removeRow(element, all[0]);
        await removeRow(element, all[1]);

        expect(element.shadowRoot.textContent).toContain("You can only remove 1 row at once.");
    });
});
