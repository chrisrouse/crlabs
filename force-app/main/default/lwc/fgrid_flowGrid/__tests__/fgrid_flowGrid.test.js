import { createElement } from "lwc";
import FgridFlowGrid from "c/fgrid_flowGrid";
import getRecordsByIds from "@salesforce/apex/FlowGridController.getRecordsByIds";

jest.mock(
    "@salesforce/apex/FlowGridController.getGridMetadata",
    () => ({ default: jest.fn(() => Promise.resolve({ objectInfo: {}, columns: [] })) }),
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

    async function runAction(element, flowReturns) {
        element.shadowRoot.querySelector("c-fgrid_custom-datatable").dispatchEvent(
            new CustomEvent("rowaction", {
                detail: { action: { name: "fgridRowAction" }, row: target }
            })
        );
        await Promise.resolve();
        const flow = element.shadowRoot.querySelector("lightning-flow");
        flow.dispatchEvent(
            new CustomEvent("statuschange", {
                detail: { status: "FINISHED", outputVariables: [{ name: "record", value: flowReturns }] }
            })
        );
        // Two turns: the status handler, then the awaited record re-read.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
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

describe("wrapped lines", () => {
    // Clamped in the component rather than with min/max on the input, because the
    // property editor routes a number through the kit's value input, which also
    // accepts a Flow resource — the value can arrive from a formula.
    function linesFor(props) {
        const element = build({ records: records(1), ...props });
        return element.shadowRoot.querySelector("c-fgrid_custom-datatable").wrapTextMaxLines;
    }

    it("passes a value inside the range through", async () => {
        expect(linesFor({ wrapTextMaxLines: 3 })).toBe(3);
    });

    it("clamps above the maximum", async () => {
        expect(linesFor({ wrapTextMaxLines: 99 })).toBe(10);
    });

    it("clamps a fraction down to a whole number of lines", async () => {
        expect(linesFor({ wrapTextMaxLines: 2.7 })).toBe(2);
    });

    it("leaves the attribute unset when nothing usable is given", async () => {
        // Unset means the datatable's own behaviour: wrap without truncating.
        for (const value of [undefined, null, 0, -4, "abc"]) {
            expect(linesFor({ wrapTextMaxLines: value })).toBeUndefined();
        }
    });

    it("wraps headers by column, following each column's own Wrap setting", async () => {
        const element = build({ records: records(1) });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_custom-datatable").wrapTableHeader).toBe("by-column");
    });
});
