import { createElement } from "lwc";
import FgridFlowGridStudio from "c/fgrid_flowGridStudio";
import { SECTIONS } from "c/fgrid_propertySchema";

const BASE_VALUES = {
    columnFields: '["Name","AnnualRevenue"]',
    columnConfig: null,
    keyField: "Id",
    selectionMode: "Multiple"
};

function build(values = {}) {
    const element = createElement("c-fgrid_flow-grid-studio", { is: FgridFlowGridStudio });
    element.sections = SECTIONS;
    element.values = { ...BASE_VALUES, ...values };
    element.objectApiName = "Account";
    document.body.appendChild(element);
    return element;
}

function datatable(element) {
    return element.shadowRoot.querySelector("lightning-datatable");
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("layout", () => {
    it("renders both panes and a control block per section", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".studio__controls")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".studio__preview")).not.toBeNull();
        expect(element.shadowRoot.querySelectorAll("c-fgrid_property-controls")).toHaveLength(SECTIONS.length);
    });

    it("hosts the column attribute grid in the wide pane", async () => {
        const element = build();
        await Promise.resolve();

        const grid = element.shadowRoot.querySelector(".studio__columns c-fgrid_column-config");
        expect(grid).not.toBeNull();
        // Full density, not the panel's compact summary.
        expect(grid.compact).toBeFalsy();
    });

    it("prompts instead of previewing when no columns are chosen", async () => {
        const element = build({ columnFields: null });
        await Promise.resolve();

        expect(datatable(element)).toBeNull();
        expect(element.shadowRoot.querySelector(".preview__empty")).not.toBeNull();
    });

    it("labels the preview data as fabricated", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".preview__banner").textContent).toContain("fabricated");
    });
});

describe("preview reflects configuration", () => {
    it("builds a column per selected field, in order", async () => {
        const element = build();
        await Promise.resolve();

        expect(datatable(element).columns.map((c) => c.fieldName)).toEqual(["Name", "AnnualRevenue"]);
    });

    it("applies per-column attributes", async () => {
        const element = build({ columnConfig: '{"Name":{"label":"Account","width":220,"align":"right"}}' });
        await Promise.resolve();

        const [column] = datatable(element).columns;
        expect(column.label).toBe("Account");
        expect(column.initialWidth).toBe(220);
        expect(column.cellAttributes.alignment).toBe("right");
    });

    it("hides the checkbox column for selection mode None", async () => {
        const element = build({ selectionMode: "None" });
        await Promise.resolve();

        expect(datatable(element).hideCheckboxColumn).toBe(true);
    });

    it("limits selection to one row for Single", async () => {
        const element = build({ selectionMode: "Single" });
        await Promise.resolve();

        expect(datatable(element).maxRowSelection).toBe(1);
    });

    it("caps rows at the smaller of page size and maximum", async () => {
        const element = build({ showPagination: true, recordsPerPage: 2, maxNumberOfRows: 4 });
        await Promise.resolve();

        expect(datatable(element).data).toHaveLength(2);
    });

    it("renders header chrome only when the header is enabled", async () => {
        const off = build();
        await Promise.resolve();
        expect(off.shadowRoot.querySelector(".preview__header")).toBeNull();

        const on = build({ showHeader: true, tableLabel: "Accounts", showRecordCount: true });
        await Promise.resolve();
        expect(on.shadowRoot.querySelector(".preview__header").textContent).toContain("Accounts");
        expect(on.shadowRoot.querySelector(".preview__header").textContent).toContain("items");
    });

    it("shows pagination chrome, with First/Last only when configured", async () => {
        const element = build({ showPagination: true, recordsPerPage: 5 });
        await Promise.resolve();
        expect(element.shadowRoot.querySelectorAll(".preview__pagination lightning-button")).toHaveLength(2);

        const withEnds = build({ showPagination: true, recordsPerPage: 5, showFirstLastButtons: true });
        await Promise.resolve();
        expect(withEnds.shadowRoot.querySelectorAll(".preview__pagination lightning-button")).toHaveLength(4);
    });

    it("applies the configured grid height", async () => {
        const element = build({ tableHeight: "30rem" });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".preview__grid").style.height).toBe("30rem");
    });

    it("describes a configured row action", async () => {
        const element = build({ rowActionType: "Remove", rowActionDisplay: "Icon", rowActionPosition: "Left" });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".preview__note").textContent).toContain("on the left");
    });
});

describe("relays", () => {
    it("forwards a property change without handling it", async () => {
        const element = build();
        await Promise.resolve();
        const relayed = [];
        element.addEventListener("propertychange", (e) => relayed.push(e.detail));

        element.shadowRoot
            .querySelector("c-fgrid_property-controls")
            .dispatchEvent(new CustomEvent("propertychange", { detail: { property: "tableLabel", value: "X" } }));

        expect(relayed).toEqual([{ property: "tableLabel", value: "X" }]);
    });

    it("forwards a column config change", async () => {
        const element = build();
        await Promise.resolve();
        const relayed = [];
        element.addEventListener("columnconfigchange", (e) => relayed.push(e.detail.value));

        element.shadowRoot
            .querySelector("c-fgrid_column-config")
            .dispatchEvent(new CustomEvent("columnconfigchange", { detail: { value: "{}" } }));

        expect(relayed).toEqual(["{}"]);
    });

    it("closes on the footer button and on Escape", async () => {
        const element = build();
        await Promise.resolve();
        const closes = [];
        element.addEventListener("close", () => closes.push(true));

        element.shadowRoot.querySelector(".slds-modal__footer lightning-button").click();
        element.shadowRoot
            .querySelector("section")
            .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(closes).toHaveLength(2);
    });
});

describe("modal chrome", () => {
    it("adds no SLDS backdrop layer of its own", async () => {
        const element = build();
        await Promise.resolve();

        // slds-backdrop is full strength and stacks on Flow Builder's own 0.8
        // dim. The light wash on .studio replaces it. Removing the dim entirely
        // was tried and looked worse, so this only guards the SLDS class.
        expect(element.shadowRoot.querySelectorAll(".slds-backdrop")).toHaveLength(0);
        const modal = element.shadowRoot.querySelector("section.slds-modal");
        expect(modal).not.toBeNull();
        expect(modal.classList.contains("slds-backdrop")).toBe(false);
    });

    it("keeps the close button inside the header with a visible dark icon", async () => {
        const element = build();
        await Promise.resolve();

        const close = element.shadowRoot.querySelector(".studio__header .studio__close");
        expect(close).not.toBeNull();
        // slds-modal__close positions the button outside the white container over
        // the backdrop, which requires an inverse icon; at 92vw that lands over
        // the header and a white icon vanishes.
        expect(close.classList.contains("slds-modal__close")).toBe(false);
        expect(close.variant).toBe("bare");
        expect(close.alternativeText).toBe("Close Grid Studio");
    });

    it("closes from the header button", async () => {
        const element = build();
        await Promise.resolve();
        const closes = [];
        element.addEventListener("close", () => closes.push(true));

        element.shadowRoot.querySelector(".studio__close").click();

        expect(closes).toHaveLength(1);
    });

    it("hides the column grid until an object is known", async () => {
        const element = createElement("c-fgrid_flow-grid-studio", { is: FgridFlowGridStudio });
        element.sections = SECTIONS;
        element.values = {};
        document.body.appendChild(element);
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_column-config")).toBeNull();
        expect(element.shadowRoot.querySelector(".studio__columns").textContent).toContain("Data Source");
    });
});

describe("escaping Flow Builder's stacking context", () => {
    // Flow Builder's transformed ancestors scope any inner z-index to the
    // property panel. Elevating the host is the kit's remedy, and the kit's
    // pickers rely on the same helper.
    it("elevates its host while open", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.style.position).toBe("relative");
        expect(Number(element.style.zIndex)).toBeGreaterThan(99999);
    });

    it("releases the elevation when closed", async () => {
        const element = build();
        await Promise.resolve();
        document.body.removeChild(element);
        await Promise.resolve();

        expect(element.style.position).toBe("");
        expect(element.style.zIndex).toBe("");
    });
});
