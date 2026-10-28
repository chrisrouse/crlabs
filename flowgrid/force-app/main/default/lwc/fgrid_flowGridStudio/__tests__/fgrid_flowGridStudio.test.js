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

/** The inspector tab with the given label. */
function tab(element, label) {
    return [...element.shadowRoot.querySelectorAll("lightning-tab")].find((candidate) => candidate.label === label);
}

/** What the tabset reports when the admin picks a tab. */
async function selectTab(element, label) {
    tab(element, label).dispatchEvent(new CustomEvent("active"));
    await flushPromises();
}

/** The inspector's active tab: Table or Columns. */
const activeTab = (element) => element.shadowRoot.querySelector(".studio__inspector lightning-tabset").activeTabValue;

/** The left panel's active tab: Fields or Data. */
const activeLeftTab = (element) => element.shadowRoot.querySelector(".studio__palette lightning-tabset").activeTabValue;

const tabLabels = (element, pane) =>
    [...element.shadowRoot.querySelectorAll(`${pane} lightning-tab`)].map((t) => t.label);

function datatable(element) {
    return element.shadowRoot.querySelector("c-fgrid_custom-datatable");
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("layout", () => {
    it("renders fields and data left, the preview, and Table and Columns right", async () => {
        const element = build();
        await flushPromises();

        expect(element.shadowRoot.querySelector(".studio__palette")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".studio__preview")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".studio__inspector")).not.toBeNull();
        expect(tabLabels(element, ".studio__palette")).toEqual(["Fields", "Data"]);
        expect(tabLabels(element, ".studio__inspector")).toEqual(["Table", "Columns"]);
        // Flow Builder's own panel, at its own default size.
        const panel = element.shadowRoot.querySelector(".studio__inspector").classList;
        expect(panel).toContain("slds-panel_docked-right");
        expect(panel).toContain("slds-size_medium");
    });

    it("shows every section on exactly one tab", async () => {
        const element = build();
        await flushPromises();
        const count = () => element.shadowRoot.querySelectorAll("c-fgrid_property-controls").length;
        // Both panes render at once, so count Data with Table, then Columns
        // alone once Data is out of view.
        await selectTab(element, "Data");
        await selectTab(element, "Table");
        const dataAndTable = count();
        await selectTab(element, "Fields");
        await selectTab(element, "Columns");
        const columnsOnly = count();
        expect(dataAndTable + columnsOnly).toBe(SECTIONS.length);
    });

    it("opens on Columns when there are columns, and hosts the column list there", async () => {
        const element = build();
        await flushPromises();

        expect(activeTab(element)).toBe("columns");
        const list = element.shadowRoot.querySelector(".studio__inspector c-fgrid_column-config");
        expect(list).not.toBeNull();
        // Full density, not the panel's compact summary.
        expect(list.compact).toBeFalsy();
    });

    it("opens the left panel on Data until there is an object, then on Fields", async () => {
        const element = build();
        await flushPromises();
        expect(activeLeftTab(element)).toBe("fields");

        const empty = createElement("c-fgrid_flow-grid-studio", { is: FgridFlowGridStudio });
        empty.sections = SECTIONS;
        empty.values = {};
        document.body.appendChild(empty);
        await flushPromises();
        expect(activeLeftTab(empty)).toBe("data");
    });

    it("relays a reordered column list as the Columns property", async () => {
        const element = build();
        const notified = [];
        element.notifyPropertyChange = (detail) => notified.push(detail);
        await flushPromises();

        element.shadowRoot
            .querySelector("c-fgrid_column-config")
            .dispatchEvent(new CustomEvent("columnfieldschange", { detail: { value: '["AnnualRevenue","Name"]' } }));
        expect(notified[0]).toMatchObject({ property: "columnFields", value: '["AnnualRevenue","Name"]' });
        // And the preview's headers are the draggable kind, with no resizing to fight it.
        expect(datatable(element).reorderableColumns).toBe(true);
    });

    it("relays a field clicked in the palette as the Columns property", async () => {
        const element = build();
        const notified = [];
        element.notifyPropertyChange = (detail) => notified.push(detail);
        await flushPromises();

        element.shadowRoot
            .querySelector("c-fgrid_field-palette")
            .dispatchEvent(new CustomEvent("columnfieldschange", { detail: { value: '["Name"]' } }));
        expect(notified).toEqual([{ property: "columnFields", value: '["Name"]', dataType: "String", resource: null }]);
    });

    it("resizes like Flow Builder's panel, medium to x-large and back", async () => {
        const element = build();
        await flushPromises();
        const expand = element.shadowRoot.querySelector(".inspector__expand");
        const panel = () => element.shadowRoot.querySelector(".studio__inspector").classList;

        expect(expand.iconName).toBe("utility:expand_alt");
        expand.click();
        await flushPromises();
        expect(panel()).toContain("slds-size_x-large");
        expect(expand.iconName).toBe("utility:contract_alt");

        expand.click();
        await flushPromises();
        expect(panel()).toContain("slds-size_medium");
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

        await selectTab(element, "Columns");
        expect(element.shadowRoot.querySelector("c-fgrid_column-config")).toBeNull();
        expect(element.shadowRoot.querySelector(".inspector__columns").textContent).toContain("Data tab");
    });

    it("lists errors above the tabs, each linked to the tab that fixes it", async () => {
        const element = build();
        element.validationErrors = [
            { key: "recordsPerPage", errorString: "Records Per Page must be between 1 and 200." },
            { key: "somethingUnknown", errorString: "Something else." }
        ];
        await flushPromises();

        const errors = element.shadowRoot.querySelector(".inspector__errors");
        expect(errors.textContent).toContain("Records Per Page must be between 1 and 200.");
        const links = [...errors.querySelectorAll(".inspector__error-link")];
        // An error the schema cannot place stays listed, unlinked.
        expect(links).toHaveLength(1);
        expect(links[0].textContent.trim()).toBe("Table › Pagination");
        // Flow Builder's own indicator, on the tab that fixes it only.
        expect(tab(element, "Table").showErrorIndicator).toBe(true);
        expect(tab(element, "Columns").showErrorIndicator).toBe(false);

        links[0].click();
        await flushPromises();
        expect(activeTab(element)).toBe("table");
    });

    it("links a Data error to the left panel's Data tab", async () => {
        const element = build();
        element.validationErrors = [{ key: "records", errorString: "Records is required." }];
        await flushPromises();

        const link = element.shadowRoot.querySelector(".inspector__error-link");
        expect(link.textContent.trim()).toBe("Data › Data Source");
        expect(tab(element, "Data").showErrorIndicator).toBe(true);
        link.click();
        await flushPromises();
        expect(activeLeftTab(element)).toBe("data");
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

describe("dragging a field into the preview", () => {
    const TYPE = "application/x-fgrid-field";

    function drag(type, field, clientX) {
        const event = new CustomEvent(type, { bubbles: true, cancelable: true });
        event.clientX = clientX;
        event.dataTransfer = { types: [TYPE, "text/plain"], getData: () => field, dropEffect: "" };
        return event;
    }

    /** Two field columns, 0-100 and 100-200, after a 40px row-number cell. */
    async function setup(values = {}) {
        const element = build(values);
        const notified = [];
        element.notifyPropertyChange = (detail) => notified.push(detail);
        await flushPromises();
        const table = datatable(element);
        Object.defineProperty(table, "getColumnEdges", {
            value: () => [
                { left: -40, right: 0 },
                { left: 0, right: 100 },
                { left: 100, right: 200 }
            ]
        });
        return { element, notified, preview: element.shadowRoot.querySelector(".preview") };
    }

    it("inserts the field between the columns it is dropped between", async () => {
        const { element, notified, preview } = await setup();
        preview.dispatchEvent(drag("dragover", "Industry", 60));
        await flushPromises();
        // Right of the first column's middle, so after it.
        expect(element.shadowRoot.querySelector(".preview__drop")).not.toBeNull();
        expect(preview.classList).toContain("preview_dropping");

        preview.dispatchEvent(drag("drop", "Industry", 60));
        expect(notified[0].value).toBe('["Name","Industry","AnnualRevenue"]');
        await flushPromises();
        expect(element.shadowRoot.querySelector(".preview__drop")).toBeNull();
    });

    it("moves a field already in the grid rather than adding it twice", async () => {
        const { notified, preview } = await setup();
        preview.dispatchEvent(drag("dragover", "AnnualRevenue", 10));
        preview.dispatchEvent(drag("drop", "AnnualRevenue", 10));
        expect(notified[0].value).toBe('["AnnualRevenue","Name"]');
    });

    it("leaves a Hidden column out of the preview, and drops around it", async () => {
        // Name, then a Hidden Industry, then AnnualRevenue. The preview draws two
        // columns, so a drop before the second one lands before AnnualRevenue.
        const { element, notified, preview } = await setup({
            columnFields: '["Name","Industry","AnnualRevenue"]',
            columnConfig: JSON.stringify({ Industry: { hidden: true } })
        });
        expect(datatable(element).columns.map((column) => column.fieldName)).toEqual(["Name", "AnnualRevenue"]);

        preview.dispatchEvent(drag("dragover", "Phone", 110));
        preview.dispatchEvent(drag("drop", "Phone", 110));
        expect(JSON.parse(notified[0].value)).toEqual(["Name", "Industry", "Phone", "AnnualRevenue"]);
    });

    it("ignores anything dragged in that is not a field", async () => {
        const { notified, preview } = await setup();
        const file = new CustomEvent("drop", { bubbles: true, cancelable: true });
        file.dataTransfer = { types: ["Files"], getData: () => "" };
        preview.dispatchEvent(file);
        expect(notified).toEqual([]);
    });
});
