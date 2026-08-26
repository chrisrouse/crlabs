import { createElement } from "lwc";
import FgridFlowGridEditor from "c/fgrid_flowGridEditor";

const BUILDER_CONTEXT = {
    variables: [
        { name: "accountList", dataType: "SObject", objectType: "Account", isCollection: true },
        { name: "contactList", dataType: "SObject", objectType: "Contact", isCollection: true }
    ]
};

function build({ inputVariables = [], genericTypeMappings = [] } = {}) {
    const element = createElement("c-fgrid_flow-grid-editor", { is: FgridFlowGridEditor });
    element.builderContext = BUILDER_CONTEXT;
    element.inputVariables = inputVariables;
    element.genericTypeMappings = genericTypeMappings;
    document.body.appendChild(element);
    return element;
}

function captureEvents(element) {
    const events = { input: [], generic: [] };
    element.addEventListener("configuration_editor_input_value_changed", (e) => events.input.push(e.detail));
    element.addEventListener("configuration_editor_generic_type_mapping_changed", (e) => events.generic.push(e.detail));
    return events;
}

/** Simulates a control change arriving from either surface. */
function changeProperty(element, detail) {
    const controls = element.shadowRoot.querySelector("c-fgrid_property-controls");
    controls.dispatchEvent(new CustomEvent("propertychange", { detail }));
}

function sections(element) {
    return [...element.shadowRoot.querySelectorAll("lightning-accordion-section")].map((s) => s.name);
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("panel layout", () => {
    it("renders one accordion section per schema section", async () => {
        const element = build();
        await Promise.resolve();

        expect(sections(element)).toEqual([
            "source",
            "columns",
            "display",
            "selection",
            "find",
            "pagination",
            "editing",
            "rowaction",
            "formatting",
            "picklists"
        ]);
    });

    it("renders a controls component for every section", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelectorAll("c-fgrid_property-controls")).toHaveLength(10);
    });

    it("offers a Grid Studio launcher and keeps it closed initially", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".editor__studio-button")).not.toBeNull();
        expect(element.shadowRoot.querySelector("c-fgrid_flow-grid-studio")).toBeNull();
    });
});

describe("Grid Studio", () => {
    it("opens on click and receives the current configuration", async () => {
        const element = build({
            inputVariables: [{ name: "columnFields", value: '["Name"]', valueDataType: "String" }],
            genericTypeMappings: [{ typeName: "T", typeValue: "Account" }]
        });
        await Promise.resolve();

        element.shadowRoot.querySelector(".editor__studio-button").click();
        await Promise.resolve();

        const studio = element.shadowRoot.querySelector("c-fgrid_flow-grid-studio");
        expect(studio).not.toBeNull();
        expect(studio.objectApiName).toBe("Account");
        expect(studio.values.columnFields).toBe('["Name"]');
        expect(studio.sections).toHaveLength(10);
    });

    it("closes on the close event", async () => {
        const element = build();
        await Promise.resolve();
        element.shadowRoot.querySelector(".editor__studio-button").click();
        await Promise.resolve();

        element.shadowRoot.querySelector("c-fgrid_flow-grid-studio").dispatchEvent(new CustomEvent("close"));
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_flow-grid-studio")).toBeNull();
    });

    it("relays a column config change from the studio to Flow Builder", async () => {
        const element = build({
            inputVariables: [{ name: "columnFields", value: '["Name"]', valueDataType: "String" }],
            genericTypeMappings: [{ typeName: "T", typeValue: "Account" }]
        });
        await Promise.resolve();
        element.shadowRoot.querySelector(".editor__studio-button").click();
        await Promise.resolve();
        const events = captureEvents(element);

        element.shadowRoot
            .querySelector("c-fgrid_flow-grid-studio")
            .dispatchEvent(new CustomEvent("columnconfigchange", { detail: { value: '{"Name":{"width":200}}' } }));
        await Promise.resolve();

        expect(events.input).toEqual([
            { name: "columnConfig", newValue: '{"Name":{"width":200}}', newValueDataType: "String" }
        ]);
    });
});

describe("optimistic values", () => {
    it("shows a change immediately, before Flow Builder republishes", async () => {
        const element = build();
        await Promise.resolve();

        changeProperty(element, { property: "tableLabel", value: "Accounts", dataType: "String" });
        await Promise.resolve();

        // inputVariables is untouched; the value must still be visible.
        expect(element.shadowRoot.querySelector("c-fgrid_property-controls").values.tableLabel).toBe("Accounts");
    });

    it("defers to Flow Builder once it republishes inputVariables", async () => {
        const element = build();
        await Promise.resolve();
        changeProperty(element, { property: "tableLabel", value: "Local", dataType: "String" });
        await Promise.resolve();

        element.inputVariables = [{ name: "tableLabel", value: "Authoritative", valueDataType: "String" }];
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_property-controls").values.tableLabel).toBe("Authoritative");
    });

    it("falls back to the schema default when a value is cleared", async () => {
        const element = build({
            inputVariables: [{ name: "selectionMode", value: "Single", valueDataType: "String" }]
        });
        await Promise.resolve();

        changeProperty(element, { property: "selectionMode", value: null, dataType: "String" });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_property-controls").values.selectionMode).toBe("Multiple");
    });

    it("applies declared defaults with nothing saved", async () => {
        const element = build();
        await Promise.resolve();

        const { values } = element.shadowRoot.querySelector("c-fgrid_property-controls");
        expect(values.selectionMode).toBe("Multiple");
        expect(values.rowActionType).toBe("None");
        // The defaults-on booleans are stored negatively, so "nothing saved" means
        // the negative is absent, and the positive control reads as checked.
        expect(values.hideBorder).toBeFalsy();
        expect(values.hideNameFieldLink).toBeFalsy();
        expect(values.keyField).toBe("Id");
    });

    it("resolves record properties in {!reference} form for the kit picker", async () => {
        const element = build({
            inputVariables: [{ name: "records", value: "accountList", valueDataType: "reference" }]
        });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_property-controls").values.records).toBe("{!accountList}");
    });
});

describe("record collection change", () => {
    it("moves the generic mapping and clears everything scoped to the old object", async () => {
        const element = build({
            inputVariables: [
                { name: "records", value: "accountList", valueDataType: "reference" },
                { name: "columnFields", value: '["Name","Industry"]', valueDataType: "String" },
                { name: "columnConfig", value: '{"Name":{"width":200}}', valueDataType: "String" }
            ],
            genericTypeMappings: [{ typeName: "T", typeValue: "Account" }]
        });
        await Promise.resolve();
        const events = captureEvents(element);

        changeProperty(element, {
            property: "records",
            value: "{!contactList}",
            dataType: "reference",
            resource: { objectType: "Contact" }
        });
        await Promise.resolve();

        expect(events.generic).toEqual([{ typeName: "T", typeValue: "Contact" }]);

        const byName = Object.fromEntries(events.input.map((d) => [d.name, d]));
        expect(byName.objectApiName.newValue).toBe("Contact");
        expect(byName.records.newValue).toBe("{!contactList}");
        expect(byName.columnFields.newValue).toBeNull();
        expect(byName.columnConfig.newValue).toBeNull();
        expect(byName.keyField.newValue).toBe("Id");
    });

    it("reflects the new object immediately for the field pickers", async () => {
        const element = build({
            inputVariables: [{ name: "records", value: "accountList", valueDataType: "reference" }],
            genericTypeMappings: [{ typeName: "T", typeValue: "Account" }]
        });
        await Promise.resolve();

        changeProperty(element, {
            property: "records",
            value: "{!contactList}",
            dataType: "reference",
            resource: { objectType: "Contact" }
        });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_property-controls").objectApiName).toBe("Contact");
    });
});

describe("validate()", () => {
    it("requires records and columns when nothing is configured", async () => {
        const element = build();
        await Promise.resolve();

        const keys = element.validate().map((e) => e.key);
        expect(keys).toContain("records");
        expect(keys).toContain("columnFields");
    });

    it("requires the JSON source instead of records in user-defined mode", async () => {
        const element = build({
            inputVariables: [{ name: "isUserDefinedObject", value: true, valueDataType: "Boolean" }]
        });
        await Promise.resolve();

        const keys = element.validate().map((e) => e.key);
        expect(keys).toContain("recordsJson");
        expect(keys).not.toContain("records");
    });

    it("passes once records and columns are set", async () => {
        const element = build({
            inputVariables: [
                { name: "records", value: "accountList", valueDataType: "reference" },
                { name: "columnFields", value: '["Name"]', valueDataType: "String" }
            ],
            genericTypeMappings: [{ typeName: "T", typeValue: "Account" }]
        });
        await Promise.resolve();

        expect(element.validate()).toEqual([]);
    });

    it("bounds records per page when pagination is on", async () => {
        const element = build({
            inputVariables: [
                { name: "records", value: "accountList", valueDataType: "reference" },
                { name: "columnFields", value: '["Name"]', valueDataType: "String" },
                { name: "showPagination", value: true, valueDataType: "Boolean" },
                { name: "recordsPerPage", value: 5000, valueDataType: "Number" }
            ],
            genericTypeMappings: [{ typeName: "T", typeValue: "Account" }]
        });
        await Promise.resolve();

        expect(element.validate().map((e) => e.key)).toContain("recordsPerPage");
    });

    it("does not range check a Flow reference for records per page", async () => {
        const element = build({
            inputVariables: [
                { name: "records", value: "accountList", valueDataType: "reference" },
                { name: "columnFields", value: '["Name"]', valueDataType: "String" },
                { name: "showPagination", value: true, valueDataType: "Boolean" },
                { name: "recordsPerPage", value: "pageSize", valueDataType: "reference" }
            ],
            genericTypeMappings: [{ typeName: "T", typeValue: "Account" }]
        });
        await Promise.resolve();

        expect(element.validate().map((e) => e.key)).not.toContain("recordsPerPage");
    });

    it("requires a button label when the row action is a button", async () => {
        const element = build({
            inputVariables: [
                { name: "records", value: "accountList", valueDataType: "reference" },
                { name: "columnFields", value: '["Name"]', valueDataType: "String" },
                { name: "rowActionType", value: "Standard", valueDataType: "String" },
                { name: "rowActionDisplay", value: "Button", valueDataType: "String" }
            ],
            genericTypeMappings: [{ typeName: "T", typeValue: "Account" }]
        });
        await Promise.resolve();

        expect(element.validate().map((e) => e.key)).toContain("rowActionButtonLabel");
    });
});

describe("escaping Flow Builder's stacking context", () => {
    it("elevates the editor host while the Studio is open and releases it after", async () => {
        const element = build();
        await Promise.resolve();
        expect(element.style.zIndex).toBe("");

        element.shadowRoot.querySelector(".editor__studio-button").click();
        await Promise.resolve();
        expect(element.style.position).toBe("relative");
        expect(Number(element.style.zIndex)).toBeGreaterThan(99999);

        element.shadowRoot.querySelector("c-fgrid_flow-grid-studio").dispatchEvent(new CustomEvent("close"));
        await Promise.resolve();
        expect(element.style.position).toBe("");
        expect(element.style.zIndex).toBe("");
    });
});

describe("booleans that must default on", () => {
    // Flow Builder does not persist a false Boolean input parameter — verified by
    // reading a saved flow's inputParameters, where every stored Boolean was true
    // and no false existed. So a defaults-on setting is stored NEGATIVELY and the
    // editor inverts it for display. These tests pin that round trip.
    const INVERTED = ["hideBorder", "hideNameFieldLink", "hideNoneOption", "searchWholePhrase"];

    it.each(INVERTED)("reads %s as unset when nothing is saved", async (property) => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_property-controls").values[property]).toBeFalsy();
    });

    it.each(INVERTED)("keeps %s true after Flow Builder republishes without it", async (property) => {
        const element = build();
        await Promise.resolve();

        // Turning the feature OFF writes the negative as true, which is the value
        // Flow Builder actually stores.
        changeProperty(element, { property, value: true, dataType: "Boolean" });
        await Promise.resolve();

        element.inputVariables = [{ name: "tableLabel", value: "Accounts", valueDataType: "String" }];
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_property-controls").values[property]).toBe(true);
    });

    it("still lets Flow Builder win once it publishes the property itself", async () => {
        const element = build();
        await Promise.resolve();

        changeProperty(element, { property: "hideBorder", value: true, dataType: "Boolean" });
        await Promise.resolve();

        element.inputVariables = [{ name: "hideBorder", value: false, valueDataType: "Boolean" }];
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("c-fgrid_property-controls").values.hideBorder).toBe(false);
    });
});
