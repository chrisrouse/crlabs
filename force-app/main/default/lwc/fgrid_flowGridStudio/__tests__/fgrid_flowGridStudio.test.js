import { createElement } from "lwc";
import FgridFlowGridStudio from "c/fgrid_flowGridStudio";
import { SECTIONS } from "c/fgrid_propertySchema";
import { MIN_COLUMN_WIDTH } from "c/fgrid_gridModel";

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
        await flushPromises();

        expect(element.shadowRoot.querySelector(".studio__controls")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".studio__preview")).not.toBeNull();
        expect(element.shadowRoot.querySelectorAll("c-fgrid_property-controls")).toHaveLength(SECTIONS.length);
    });

    it("hosts the column attribute grid in the wide pane", async () => {
        const element = build();
        await flushPromises();

        const grid = element.shadowRoot.querySelector(".studio__columns c-fgrid_column-config");
        expect(grid).not.toBeNull();
        // Full density, not the panel's compact summary.
        expect(grid.compact).toBeFalsy();
    });

    it("prompts instead of previewing when no columns are chosen", async () => {
        const element = build({ columnFields: null });
        await flushPromises();

        expect(datatable(element)).toBeNull();
        expect(element.shadowRoot.querySelector(".preview__empty")).not.toBeNull();
    });

    it("labels the preview data as fabricated when no records come back", async () => {
        const element = build();
        await flushPromises();

        expect(element.shadowRoot.querySelector(".preview__banner").textContent).toContain("fabricated");
    });
});

describe("kit picker popovers stay attached", () => {
    /**
     * Counts only the events the watcher produces, by their target.
     *
     * jsdom does NOT enforce the shadow boundary that causes the bug in a browser,
     * so a raw count on `window` also sees unrelated scroll events. Only the
     * re-dispatched one is targeted at `window` itself.
     */
    function countForwarded() {
        const seen = [];
        const listener = (event) => {
            if (event.target === window) {
                seen.push(true);
            }
        };
        window.addEventListener("scroll", listener, true);
        return { seen, stop: () => window.removeEventListener("scroll", listener, true) };
    }

    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

    /** jsdom reports a zero rect for everything, so the movement has to be faked. */
    function moveProbe(element, top) {
        const probe = element.shadowRoot.querySelector("c-fgrid_property-controls");
        probe.getBoundingClientRect = () => ({ left: 0, top, width: 300, height: 100 });
        return probe;
    }

    it("tells the kit to recompute when the probe rect moves", async () => {
        // The pickers reposition from a capture-phase `scroll` listener on `window`,
        // which cannot see a scroll inside a shadow root -- neither our panes nor
        // Flow Builder's property panel. Watching the rect covers both, and anything
        // else that moves the anchor.
        const element = build();
        await flushPromises();

        moveProbe(element, 100);
        await nextFrame();
        const counter = countForwarded();

        moveProbe(element, 140);
        await nextFrame();
        await nextFrame();
        counter.stop();

        expect(counter.seen.length).toBeGreaterThan(0);
    });

    it("stays quiet while nothing moves", async () => {
        // An idle popover must cost one rect read per frame and no DOM writes.
        const element = build();
        await flushPromises();

        moveProbe(element, 100);
        await nextFrame();
        const counter = countForwarded();

        await nextFrame();
        await nextFrame();
        counter.stop();

        expect(counter.seen).toEqual([]);
    });

    it("stops watching once the modal is destroyed", async () => {
        const element = build();
        await flushPromises();
        moveProbe(element, 100);
        await nextFrame();

        document.body.removeChild(element);
        await Promise.resolve();
        const counter = countForwarded();

        await nextFrame();
        await nextFrame();
        counter.stop();

        expect(counter.seen).toEqual([]);
    });
});

describe("settings pane", () => {
    function toggle(element) {
        return element.shadowRoot.querySelector(".preview__chrome lightning-button-icon");
    }

    it("starts expanded", async () => {
        const element = build();
        await flushPromises();

        expect(element.shadowRoot.querySelector(".studio__controls")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".studio__content_collapsed")).toBeNull();
        expect(toggle(element).iconName).toBe("utility:chevronleft");
        expect(toggle(element).title).toBe("Hide the Settings Pane");
    });

    it("collapses to give the preview the full width, and comes back", async () => {
        const element = build();
        await flushPromises();

        toggle(element).click();
        await flushPromises();

        // The pane is hidden by a class on the flex container rather than removed
        // from the template: the controls keep their state while out of sight.
        expect(element.shadowRoot.querySelector(".studio__content_collapsed")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".studio__controls")).not.toBeNull();
        expect(toggle(element).iconName).toBe("utility:chevronright");
        expect(toggle(element).title).toBe("Show the Settings Pane");

        toggle(element).click();
        await flushPromises();

        expect(element.shadowRoot.querySelector(".studio__content_collapsed")).toBeNull();
        expect(toggle(element).iconName).toBe("utility:chevronleft");
    });

    it("reports its state to assistive tech as a string", async () => {
        const element = build();
        await flushPromises();
        expect(toggle(element).getAttribute("aria-expanded")).toBe("true");

        toggle(element).click();
        await flushPromises();

        expect(toggle(element).getAttribute("aria-expanded")).toBe("false");
    });
});

describe("first render", () => {
    it("holds the table back until the first sample resolves, then renders it once", async () => {
        // The datatable fixes its column widths on the render that creates it and
        // does not revisit them. Rendering it with fabricated rows while the modal
        // was still animating in produced short columns that snapped wider when the
        // real records forced a second render.
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".preview__grid lightning-spinner")).not.toBeNull();
        expect(datatable(element)).toBeNull();

        await flushPromises();

        expect(element.shadowRoot.querySelector(".preview__grid lightning-spinner")).toBeNull();
        expect(datatable(element)).not.toBeNull();
    });

    it("keeps the table on screen for a later refetch instead of flickering", async () => {
        // Only the first load is gated. By the time an admin changes the object or a
        // column the pane measures correctly, so blanking the table would be a
        // regression in responsiveness for no benefit.
        const element = build();
        await flushPromises();
        expect(datatable(element)).not.toBeNull();

        element.objectApiName = "Contact";
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".preview__grid lightning-spinner")).toBeNull();
        expect(datatable(element)).not.toBeNull();
    });
});

describe("preview reflects configuration", () => {
    it("builds a column per selected field, in order", async () => {
        const element = build();
        await flushPromises();

        expect(datatable(element).columns.map((c) => c.fieldName)).toEqual(["Name", "AnnualRevenue"]);
    });

    it("applies per-column attributes", async () => {
        const element = build({ columnConfig: '{"Name":{"label":"Account","width":220,"align":"right"}}' });
        await flushPromises();

        const [column] = datatable(element).columns;
        expect(column.label).toBe("Account");
        // A starting width that still reflows, never a locked fixedWidth.
        expect(column.initialWidth).toBe(220);
        expect(column.cellAttributes.alignment).toBe("right");
    });

    it("hides the checkbox column for selection mode None", async () => {
        const element = build({ selectionMode: "None" });
        await flushPromises();

        expect(datatable(element).hideCheckboxColumn).toBe(true);
    });

    it("limits selection to one row for Single", async () => {
        const element = build({ selectionMode: "Single" });
        await flushPromises();

        expect(datatable(element).maxRowSelection).toBe(1);
    });

    it("caps rows at the smaller of page size and maximum", async () => {
        const element = build({ rowLoading: "Paginate", recordsPerPage: 2, maxNumberOfRows: 4 });
        await flushPromises();

        expect(datatable(element).data).toHaveLength(2);
    });

    it("renders header chrome only when the header is enabled", async () => {
        const off = build();
        await flushPromises();
        expect(off.shadowRoot.querySelector(".preview__header")).toBeNull();

        const on = build({ showHeader: true, tableLabel: "Accounts", showRecordCount: true });
        await flushPromises();
        expect(on.shadowRoot.querySelector(".preview__header").textContent).toContain("Accounts");
        expect(on.shadowRoot.querySelector(".preview__header").textContent).toContain("items");
    });

    it("gives the toolbar title block the class its shrink rules hang off", async () => {
        // It was a bare <div> and so picked up none of the flex rules the runtime
        // grid's equivalent has always had, which made the preview's toolbar
        // collide at narrow widths worse than the runtime it is meant to predict.
        // Layout itself is not assertable here -- jsdom does no layout -- so this
        // pins the hook the CSS needs.
        const element = build({ showHeader: true, tableLabel: "Accounts", showRecordCount: true });
        await flushPromises();

        const title = element.shadowRoot.querySelector(".preview__header .preview__header-text");
        expect(title).not.toBeNull();
        expect(title.textContent).toContain("Accounts");
    });

    it("shows pagination chrome, with First/Last only when configured", async () => {
        const element = build({ rowLoading: "Paginate", recordsPerPage: 5 });
        await flushPromises();
        expect(element.shadowRoot.querySelectorAll(".preview__pagination lightning-button")).toHaveLength(2);

        const withEnds = build({ rowLoading: "Paginate", recordsPerPage: 5, showFirstLastButtons: true });
        await flushPromises();
        expect(withEnds.shadowRoot.querySelectorAll(".preview__pagination lightning-button")).toHaveLength(4);
    });

    it("applies the configured grid height", async () => {
        const element = build({ tableHeight: "30rem" });
        await flushPromises();

        expect(element.shadowRoot.querySelector(".preview__grid").style.height).toBe("30rem");
    });

    it("describes a configured row action", async () => {
        const element = build({ rowActionType: "Remove", rowActionDisplay: "Icon", rowActionPosition: "Left" });
        await flushPromises();

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
        await flushPromises();
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
        await flushPromises();
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
        await flushPromises();

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
        await flushPromises();

        const header = element.shadowRoot.querySelector("lightning-modal-header");
        expect(header).not.toBeNull();
        expect(header.label).toBe("Grid Studio");
        expect(element.shadowRoot.querySelector("lightning-modal-body")).not.toBeNull();
        expect(element.shadowRoot.querySelector("lightning-modal-footer")).not.toBeNull();
    });

    it("hand-rolls no modal chrome of its own", async () => {
        const element = build();
        await flushPromises();

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
        await flushPromises();

        expect(element.shadowRoot.querySelector("c-fgrid_column-config")).toBeNull();
        expect(element.shadowRoot.querySelector(".studio__columns").textContent).toContain("Data Source");
    });
});

describe("preview size", () => {
    function selector(element) {
        return element.shadowRoot.querySelector(".preview__size");
    }

    function frame(element) {
        return element.shadowRoot.querySelector(".preview__frame");
    }

    it("starts at large, unconstrained", async () => {
        // Large is not pinned to a viewport fraction: the preview already sits in a
        // large modal, so a fraction would make the default narrower than its pane.
        const element = build();
        await flushPromises();

        expect(selector(element).value).toBe("large");
        expect(selector(element).options.map((option) => option.value)).toEqual(["large", "medium", "small"]);
        expect(frame(element).style.maxWidth).toBe("");
    });

    it("narrows the frame to simulate a smaller container", async () => {
        const element = build();
        await flushPromises();

        selector(element).dispatchEvent(new CustomEvent("change", { detail: { value: "small" } }));
        await flushPromises();

        expect(frame(element).style.maxWidth).toBe("20rem");

        selector(element).dispatchEvent(new CustomEvent("change", { detail: { value: "medium" } }));
        await flushPromises();

        expect(frame(element).style.maxWidth).toBe("40rem");
    });

    it("floors column widths exactly as the runtime grid does", async () => {
        // The whole point of Medium and Small is showing how the grid will look in a
        // narrower container, so the preview must degrade by the same rule. A floor
        // that applied here but not at runtime would make the preview flatter it.
        const element = build();
        await flushPromises();

        expect(datatable(element).minColumnWidth).toBe(MIN_COLUMN_WIDTH);

        selector(element).dispatchEvent(new CustomEvent("change", { detail: { value: "small" } }));
        await flushPromises();

        expect(datatable(element).minColumnWidth).toBe(MIN_COLUMN_WIDTH);
    });

    it("frames the grid chrome too, not just the table", async () => {
        // The toolbar, filter pills and pagination are all part of what an admin
        // needs to see reflow, so the frame wraps the whole simulated grid.
        const element = build({ showHeader: true, tableLabel: "Accounts" });
        await flushPromises();

        expect(frame(element).querySelector("c-fgrid_custom-datatable")).not.toBeNull();
        expect(frame(element).querySelector(".preview__header")).not.toBeNull();
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
        await flushPromises();
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
        await flushPromises();

        expect(element.style.position).toBe("");
        expect(element.style.zIndex).toBe("");
    });
});
