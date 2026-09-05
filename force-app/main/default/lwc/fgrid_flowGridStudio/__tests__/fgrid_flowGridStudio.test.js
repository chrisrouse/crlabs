import { createElement } from "lwc";
import FgridFlowGridStudio from "c/fgrid_flowGridStudio";
import { SECTIONS } from "c/fgrid_propertySchema";

// The Studio loads real describe and a record sample for its preview. Mocked to
// empty so these tests stay deterministic and exercise the fabricated-row
// fallback; the live path is verified in the org.
jest.mock(
    "@salesforce/apex/FlowGridController.getGridMetadata",
    () => ({ default: jest.fn(() => Promise.resolve({ objectInfo: {}, columns: [] })) }),
    { virtual: true }
);
jest.mock(
    "@salesforce/apex/FlowGridController.getPreviewRecords",
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);

/** Lets the Studio's preview fetch settle before assertions. */
function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

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
    return element.shadowRoot.querySelector("c-fgrid_custom-datatable");
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

    it("labels the preview data as fabricated when no records come back", async () => {
        const element = build();
        await flushPromises();

        expect(element.shadowRoot.querySelector(".preview__banner").textContent).toContain("fabricated");
    });
});

describe("settings pane", () => {
    function toggle(element) {
        return element.shadowRoot.querySelector(".preview__chrome lightning-button-icon");
    }

    it("starts expanded", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".studio__controls")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".studio__content_collapsed")).toBeNull();
        expect(toggle(element).iconName).toBe("utility:chevronleft");
        expect(toggle(element).title).toBe("Hide the Settings Pane");
    });

    it("collapses to give the preview the full width, and comes back", async () => {
        const element = build();
        await Promise.resolve();

        toggle(element).click();
        await Promise.resolve();

        // The pane is hidden by a class on the flex container rather than removed
        // from the template: the controls keep their state while out of sight.
        expect(element.shadowRoot.querySelector(".studio__content_collapsed")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".studio__controls")).not.toBeNull();
        expect(toggle(element).iconName).toBe("utility:chevronright");
        expect(toggle(element).title).toBe("Show the Settings Pane");

        toggle(element).click();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".studio__content_collapsed")).toBeNull();
        expect(toggle(element).iconName).toBe("utility:chevronleft");
    });

    it("reports its state to assistive tech as a string", async () => {
        const element = build();
        await Promise.resolve();
        expect(toggle(element).getAttribute("aria-expanded")).toBe("true");

        toggle(element).click();
        await Promise.resolve();

        expect(toggle(element).getAttribute("aria-expanded")).toBe("false");
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
        // A starting width that still reflows, never a locked fixedWidth.
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
        const element = build({ rowLoading: "Paginate", recordsPerPage: 2, maxNumberOfRows: 4 });
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
        const element = build({ rowLoading: "Paginate", recordsPerPage: 5 });
        await Promise.resolve();
        expect(element.shadowRoot.querySelectorAll(".preview__pagination lightning-button")).toHaveLength(2);

        const withEnds = build({ rowLoading: "Paginate", recordsPerPage: 5, showFirstLastButtons: true });
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
    // A modal's events do not reach the component that opened it -- they bubble to
    // a root outside it -- so relays are callbacks passed in through open(). These
    // assert the callback fires AND that no event escapes, because an event would
    // silently go nowhere in Flow Builder while still passing an event-based test.
    it("forwards a property change through the callback, not an event", async () => {
        const element = build();
        await Promise.resolve();
        const relayed = [];
        const escaped = [];
        element.notifyPropertyChange = (detail) => relayed.push(detail);
        element.addEventListener("propertychange", (e) => escaped.push(e.detail));

        element.shadowRoot
            .querySelector("c-fgrid_property-controls")
            .dispatchEvent(new CustomEvent("propertychange", { detail: { property: "tableLabel", value: "X" } }));

        expect(relayed).toEqual([{ property: "tableLabel", value: "X" }]);
        expect(escaped).toEqual([]);
    });

    it("forwards a column config change through the callback", async () => {
        const element = build();
        await Promise.resolve();
        const relayed = [];
        const escaped = [];
        element.notifyColumnConfigChange = (detail) => relayed.push(detail.value);
        element.addEventListener("columnconfigchange", (e) => escaped.push(e.detail));

        element.shadowRoot
            .querySelector("c-fgrid_column-config")
            .dispatchEvent(new CustomEvent("columnconfigchange", { detail: { value: "{}" } }));

        expect(relayed).toEqual(["{}"]);
        expect(escaped).toEqual([]);
    });

    it("hands itself to the editor on open, so validation and pushes can reach it", async () => {
        const element = createElement("c-fgrid_flow-grid-studio", { is: FgridFlowGridStudio });
        element.sections = SECTIONS;
        element.values = { ...BASE_VALUES };
        const ready = [];
        element.notifyReady = (studio) => ready.push(studio);
        document.body.appendChild(element);
        await Promise.resolve();

        expect(ready).toHaveLength(1);
        expect(typeof ready[0].collectValidity).toBe("function");
    });

    it("resolves its own open() promise on close, rather than eventing to the editor", async () => {
        // End to end through the platform contract: open() mounts it and hands back
        // a promise, and this.close() is what resolves it. The editor no longer
        // listens for a close event, so an event here would leave the modal stuck.
        const escaped = [];
        const opened = FgridFlowGridStudio.open({
            size: "large",
            sections: SECTIONS,
            values: { ...BASE_VALUES },
            objectApiName: "Account"
        });
        await flushPromises();

        // A document query is the point: the platform mounts a modal outside the
        // opener's tree, which is exactly what stops the canvas painting over it.
        // eslint-disable-next-line @lwc/lwc/no-document-query
        const host = document.querySelector("c-lightning-modal-stub");
        expect(host).not.toBeNull();
        host.addEventListener("close", () => escaped.push(true));
        host.shadowRoot.querySelector("lightning-modal-footer lightning-button").click();

        await expect(opened).resolves.toBeUndefined();
        expect(escaped).toEqual([]);
    });
});

describe("modal chrome belongs to the platform", () => {
    // The hand-rolled slds-modal markup is what let the Flow Builder canvas paint
    // over this component: it rendered inside the property panel's transformed
    // ancestors. These guard against it creeping back rather than testing SLDS.
    it("composes the lightning-modal helper components", async () => {
        const element = build();
        await Promise.resolve();

        const header = element.shadowRoot.querySelector("lightning-modal-header");
        expect(header).not.toBeNull();
        expect(header.label).toBe("Grid Studio");
        expect(element.shadowRoot.querySelector("lightning-modal-body")).not.toBeNull();
        expect(element.shadowRoot.querySelector("lightning-modal-footer")).not.toBeNull();
    });

    it("hand-rolls no modal chrome of its own", async () => {
        const element = build();
        await Promise.resolve();

        // Each of these was part of the arrangement that bled. The close button and
        // the backdrop wash are the platform's now, and the width override that
        // escaped SLDS's `large` cap is unnecessary: SLDS 2 sizes are
        // viewport-relative, and `large` measured at 89% against the old 92%.
        expect(element.shadowRoot.querySelector("section.slds-modal")).toBeNull();
        expect(element.shadowRoot.querySelector(".slds-modal__container")).toBeNull();
        expect(element.shadowRoot.querySelector(".slds-backdrop")).toBeNull();
        expect(element.shadowRoot.querySelector(".studio__close")).toBeNull();
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

describe("nested filter dialog", () => {
    /** Opens the filter dialog the way the preview's column header does. */
    async function openFilter(element) {
        datatable(element).dispatchEvent(
            new CustomEvent("headeraction", {
                detail: { action: { name: "fgridFilter" }, columnDefinition: { fieldName: "Name" } }
            })
        );
        await Promise.resolve();
        return element.shadowRoot.querySelector("c-fgrid_filter-editor");
    }

    it("opens without laying a second dim over the platform backdrop", async () => {
        // Three dims compounded to near black: Flow Builder's, the platform modal's,
        // and this dialog's own. Only the middle one should be visible in here.
        const element = build({ columnConfig: JSON.stringify({ Name: { filter: true } }) });
        await flushPromises();

        const filter = await openFilter(element);
        expect(filter).not.toBeNull();
        expect(filter.suppressBackdrop).toBe(true);
    });
});

describe("no longer fights Flow Builder's stacking context", () => {
    it("is opened as a platform modal", () => {
        // Extending LightningModal is the fix: the platform renders it in its own
        // overlay container, outside the transformed ancestors that scoped every
        // z-index attempt to the property panel.
        expect(typeof FgridFlowGridStudio.open).toBe("function");
    });

    it("does not elevate its own host", async () => {
        // Host elevation via the kit's setPopoverHostActive was attempt two of
        // three and never worked. Reintroducing it here would be cargo cult.
        const element = build();
        await Promise.resolve();

        expect(element.style.position).toBe("");
        expect(element.style.zIndex).toBe("");
    });
});
