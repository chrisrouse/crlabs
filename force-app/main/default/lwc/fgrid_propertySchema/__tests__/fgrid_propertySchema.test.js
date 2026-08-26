import {
    SECTIONS,
    DEFAULTS,
    resolveSection,
    schemaProperties,
    CONTROL,
    EDITOR_MANAGED_PROPERTIES
} from "c/fgrid_propertySchema";

function section(name) {
    return SECTIONS.find((s) => s.name === name);
}

function visible(name, values) {
    return resolveSection(section(name), values).map((c) => c.property);
}

describe("schema integrity", () => {
    it("declares no duplicate properties", () => {
        const names = schemaProperties();
        expect(new Set(names).size).toBe(names.length);
    });

    it("gives every control a known type and a label", () => {
        const types = new Set(Object.values(CONTROL));
        SECTIONS.flatMap((s) => s.controls).forEach((control) => {
            expect(types.has(control.type)).toBe(true);
            expect(control.label).toBeTruthy();
        });
    });

    it("does not expose the editor-managed properties as controls", () => {
        // objectApiName is a mirror the editor maintains; columnConfig has its own grid.
        expect(schemaProperties()).not.toContain("objectApiName");
        expect(schemaProperties()).not.toContain("columnConfig");
    });

    it("references only defined predicates", () => {
        const controls = SECTIONS.flatMap((s) => s.controls);
        controls.forEach((control) => {
            (control.when || []).forEach((key) => {
                expect(resolveSection({ controls: [{ ...control, when: [key] }] }, {})).toBeInstanceOf(Array);
            });
        });
    });

    it("defaults only properties the editor actually writes", () => {
        const known = new Set([...schemaProperties(), ...EDITOR_MANAGED_PROPERTIES]);
        Object.keys(DEFAULTS).forEach((name) => expect(known.has(name)).toBe(true));
    });

    it("keeps editor-managed properties out of the declarative controls", () => {
        // Each of these is owned by a dedicated component, so a control for it
        // would fight that component for the same value.
        const controls = new Set(schemaProperties());
        EDITOR_MANAGED_PROPERTIES.forEach((name) => expect(controls.has(name)).toBe(false));
    });
});

describe("data source visibility", () => {
    it("shows record pickers for an SObject source", () => {
        expect(visible("source", { objectApiName: "Account" })).toEqual([
            "isUserDefinedObject",
            "records",
            "preSelectedRecords",
            "keyField"
        ]);
    });

    it("withholds the key field until an object is known", () => {
        expect(visible("source", {})).not.toContain("keyField");
    });

    it("swaps to JSON inputs for a user-defined source", () => {
        expect(visible("source", { isUserDefinedObject: true })).toEqual([
            "isUserDefinedObject",
            "recordsJson",
            "preSelectedRecordsJson",
            "isSerializedRecordData"
        ]);
    });

    it("reveals serialized data only when both flags are on", () => {
        expect(visible("source", { isSerializedRecordData: true })).not.toContain("serializedRecordData");
        expect(visible("source", { isUserDefinedObject: true, isSerializedRecordData: true })).toContain(
            "serializedRecordData"
        );
    });
});

describe("conditional sections", () => {
    it("hides the column picker until an object is known", () => {
        expect(visible("columns", {})).toEqual([]);
        expect(visible("columns", { objectApiName: "Account" })).toEqual(["columnFields"]);
    });

    it("shows header details only when the header is on", () => {
        expect(visible("display", {})).not.toContain("tableLabel");
        expect(visible("display", { showHeader: true })).toContain("tableIcon");
    });

    it("hides selection options when nothing is selectable", () => {
        expect(visible("selection", { selectionMode: "None" })).toEqual(["selectionMode"]);
    });

    it("offers Clear Selection only for single-row selection", () => {
        expect(visible("selection", { selectionMode: "Multiple" })).not.toContain("hideClearSelectionButton");
        expect(visible("selection", { selectionMode: "Single" })).toContain("hideClearSelectionButton");
    });

    it("shows page settings only when pagination is on", () => {
        expect(visible("pagination", {})).toEqual(["showPagination", "maxNumberOfRows"]);
        expect(visible("pagination", { showPagination: true })).toContain("recordsPerPage");
    });
});

describe("row action visibility", () => {
    it("shows nothing but the type when there is no action", () => {
        expect(visible("rowaction", { rowActionType: "None" })).toEqual(["rowActionType"]);
    });

    it("shows icon properties for the icon display", () => {
        const shown = visible("rowaction", { rowActionType: "Remove", rowActionDisplay: "Icon" });
        expect(shown).toContain("rowActionIcon");
        expect(shown).toContain("rowActionColor");
        expect(shown).not.toContain("rowActionButtonLabel");
    });

    it("shows button properties for the button display", () => {
        const shown = visible("rowaction", { rowActionType: "Remove", rowActionDisplay: "Button" });
        expect(shown).toContain("rowActionButtonLabel");
        expect(shown).toContain("rowActionButtonVariant");
        expect(shown).not.toContain("rowActionIcon");
    });

    it("offers only None, Remove and Flow", () => {
        const [type] = SECTIONS.find((s) => s.name === "rowaction").controls;
        expect(type.property).toBe("rowActionType");
        expect(type.options.map((o) => o.value)).toEqual(["None", "Remove", "Flow"]);
    });

    it("shows nothing for a saved Standard action", () => {
        // Standard only reported the clicked row, which the selected-record
        // outputs already do. A configuration left over from it must not surface
        // options for an action that no longer exists.
        expect(visible("rowaction", { rowActionType: "Standard", rowActionDisplay: "Icon" })).toEqual([
            "rowActionType"
        ]);
    });

    it("shows the removal cap only for the remove action", () => {
        expect(visible("rowaction", { rowActionType: "Standard", rowActionDisplay: "Icon" })).not.toContain(
            "maxRemovedRows"
        );
        expect(visible("rowaction", { rowActionType: "Remove", rowActionDisplay: "Icon" })).toContain("maxRemovedRows");
    });
});

describe("disabled state", () => {
    it("greys Navigate Next while the bottom bar is hidden", () => {
        const [, navigate] = resolveSection(section("editing"), { suppressBottomBar: true });
        expect(navigate.property).toBe("navigateNextOnSave");
        expect(navigate.disabled).toBe(true);
    });

    it("greys same-tab links when the name field is not linked", () => {
        // Stored negatively: hideNameFieldLink true IS "not linked".
        const [, sameTab] = resolveSection(section("formatting"), { hideNameFieldLink: true });
        expect(sameTab.property).toBe("openLinkInSameTab");
        expect(sameTab.disabled).toBe(true);
    });

    it("leaves controls enabled by default", () => {
        resolveSection(section("find"), {}).forEach((control) => expect(control.disabled).toBe(false));
    });
});

describe("control stamping", () => {
    it("marks exactly one type flag per control", () => {
        resolveSection(section("source"), { objectApiName: "Account" }).forEach((control) => {
            const flags = [
                control.isCheckbox,
                control.isSelect,
                control.isText,
                control.isNumber,
                control.isIcon,
                control.isResource,
                control.isField,
                control.isFields
            ].filter(Boolean);
            expect(flags).toHaveLength(1);
        });
    });

    it("carries the current value onto each control", () => {
        const [userDefined] = resolveSection(section("source"), { isUserDefinedObject: true });
        expect(userDefined.value).toBe(true);
    });
});

describe("dynamic placeholders", () => {
    it("shows the icon each action type actually falls back to", () => {
        // rowActionFlowApiName is required for the Flow case: every control below
        // the flow picker waits until a flow is chosen.
        const icon = (type) =>
            resolveSection(section("rowaction"), {
                rowActionType: type,
                rowActionDisplay: "Icon",
                rowActionFlowApiName: "SomeFlow"
            }).find((c) => c.property === "rowActionIcon").placeholder;

        // The placeholder is resolved from the same map the runtime applies, so a
        // hint cannot promise an icon the grid will not use.
        expect(icon("Remove")).toBe("utility:delete");
        expect(icon("Flow")).toBe("utility:flow");
    });

    it("leaves static placeholders alone", () => {
        const height = resolveSection(section("display"), {}).find((c) => c.property === "tableHeight");
        expect(height.placeholder).toBe("30rem");
    });

    it("returns null where no placeholder is declared", () => {
        const tableIcon = resolveSection(section("display"), { showHeader: true }).find(
            (c) => c.property === "tableIcon"
        );
        expect(tableIcon.placeholder).toBeNull();
    });
});
