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
    // Passed as a string: the reference says the attribute "accepts a string value
    // representing a number", and its markup example is wrap-text-max-lines="3".
    function linesFor(props) {
        const element = build({ records: records(1), ...props });
        return element.shadowRoot.querySelector("c-fgrid_custom-datatable").wrapTextMaxLines;
    }

    it("passes the requested count, as a string", async () => {
        expect(linesFor({ wrapTextMaxLines: 1 })).toBe("1");
        expect(linesFor({ wrapTextMaxLines: 5 })).toBe("5");
    });

    it("accepts a value that arrives as a string from Flow", async () => {
        expect(linesFor({ wrapTextMaxLines: "4" })).toBe("4");
    });

    it("clamps to the supported range", async () => {
        expect(linesFor({ wrapTextMaxLines: 99 })).toBe("10");
        expect(linesFor({ wrapTextMaxLines: 2.7 })).toBe("2");
    });

    it("leaves the attribute unset when nothing usable is given", async () => {
        for (const value of [undefined, null, 0, -4, "abc"]) {
            expect(linesFor({ wrapTextMaxLines: value })).toBeUndefined();
        }
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

describe("the wrapped-line limit reaches SLDS 2", () => {
    // The datatable sets --lwc-lineClamp from wrap-text-max-lines, but SLDS 2's
    // .slds-line-clamp reads --slds-g-font-line-clamp, pinned to 3 at :where(html).
    // Confirmed in the inspector: the cell carried --lwc-lineClamp: 6 while the
    // computed clamp resolved to 3 from slds-plus.css.
    function wrapperStyle(props) {
        const element = build({ records: records(1), ...props });
        return element.shadowRoot.querySelector("[class*='grid__wrapper']").style;
    }

    it("sets the SLDS hook to the requested count", async () => {
        const style = wrapperStyle({ wrapTextMaxLines: 6 });
        expect(style.getPropertyValue("--slds-g-font-line-clamp")).toBe("6");
    });

    it("sets the datatable's own variable too, for an SLDS 1 org", async () => {
        const style = wrapperStyle({ wrapTextMaxLines: 6 });
        expect(style.getPropertyValue("--lwc-lineClamp")).toBe("6");
    });

    it("sets neither when there is no limit, so wrapping stays unlimited", async () => {
        const style = wrapperStyle({});
        expect(style.getPropertyValue("--slds-g-font-line-clamp")).toBe("");
        expect(style.getPropertyValue("--lwc-lineClamp")).toBe("");
    });

    it("still sets the height", async () => {
        expect(wrapperStyle({ wrapTextMaxLines: 2, tableHeight: "20rem" }).height).toBe("20rem");
    });
});
