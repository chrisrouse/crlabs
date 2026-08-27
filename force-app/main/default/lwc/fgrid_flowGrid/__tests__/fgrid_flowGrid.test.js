import { createElement } from "lwc";
import FgridFlowGrid from "c/fgrid_flowGrid";

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

        const open = build({ records: records(10), allowOverflow: true });
        expect(open.shadowRoot.querySelector("[class*='grid__wrapper']").style.overflow).toBe("");
    });
});
