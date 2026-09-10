import {
    SECTIONS,
    DEFAULTS,
    resolveSection,
    schemaProperties,
    CONTROL,
    EDITOR_MANAGED_PROPERTIES,
    DATA_TYPE_FOR,
    parseDimension,
    formatDimension
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

    it("hands the grid height to the panel already split into a number and a unit", () => {
        // The control renders two inputs, so the split has to happen here rather
        // than in the panel: a free-text CSS box was what let "30 rem" and half a
        // calc() into the property in the first place.
        const height = (values) =>
            resolveSection(section("display"), { showHeader: true, ...values }).find(
                (c) => c.property === "tableHeight"
            );

        expect(height({ tableHeight: "24px" }).dimension).toEqual({ number: 24, unit: "px" });
        expect(height({}).dimension).toEqual({ number: null, unit: "rem" });
    });

    it("defaults only properties the editor actually writes", () => {
        const known = new Set([...schemaProperties(), ...EDITOR_MANAGED_PROPERTIES]);
        Object.keys(DEFAULTS).forEach((name) => expect(known.has(name)).toBe(true));
    });

    it("seeds the row-action messages, whose blank state means something else", () => {
        // A default in the component's `@api` initialiser only affects the RUNTIME.
        // This map is what fills the editor's fields, and omitting these three
        // showed the admin empty boxes whose own help text says a blank hides the
        // message -- so the panel implied "no toast" while the component would have
        // shown one. Any property where blank is a MEANINGFUL setting has to be
        // seeded here or the editor misrepresents it.
        expect(DEFAULTS.rowActionFlowSuccessMessage).toBeTruthy();
        expect(DEFAULTS.rowActionFlowErrorMessage).toBeTruthy();
        expect(DEFAULTS.rowActionFlowDeleteMessage).toBeTruthy();
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
            "disabledRecords"
        ]);
    });

    it("keeps the unique identifier in Selection, not in the data source", () => {
        // It names the field a row is identified by, which is what selection is keyed
        // on, so it belongs beside the selection mode rather than beside the pickers.
        expect(visible("source", { objectApiName: "Account" })).not.toContain("keyField");
        expect(visible("rows", { objectApiName: "Account" })).toContain("keyField");
    });

    it("withholds the unique identifier until an object is known", () => {
        expect(visible("rows", {})).not.toContain("keyField");
    });

    it("swaps to JSON inputs for a user-defined source", () => {
        expect(visible("source", { isUserDefinedObject: true })).toEqual([
            "isUserDefinedObject",
            "recordsJson",
            "preSelectedRecordsJson",
            "disabledRecordsJson",
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
        expect(visible("rows", { selectionMode: "None" })).toEqual(["selectionMode"]);
    });

    it("offers min and max only for Multiple", () => {
        const multiple = visible("rows", { selectionMode: "Multiple" });
        expect(multiple).toContain("minSelection");
        expect(multiple).toContain("maxSelection");
        expect(visible("rows", { selectionMode: "Single" })).not.toContain("minSelection");
    });

    it("offers the required switch and the control choice only for Single", () => {
        // For Multiple, a Minimum of 1 says the same thing as Require, and two
        // controls meaning one thing is how a panel gets confusing.
        const single = visible("rows", { selectionMode: "Single" });
        expect(single).toContain("isRequired");
        expect(single).toContain("singleSelectControl");
        expect(visible("rows", { selectionMode: "Multiple" })).not.toContain("isRequired");
    });

    it("shows page settings only when pagination is on", () => {
        expect(visible("pagination", {})).toEqual(["rowLoading", "maxNumberOfRows"]);
        // Page size and First/Last only mean something in Paginate mode.
        expect(visible("pagination", { rowLoading: "Paginate" })).toContain("recordsPerPage");
        expect(visible("pagination", { rowLoading: "Scroll" })).not.toContain("recordsPerPage");
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

    it("returns null where no placeholder is declared", () => {
        const tableIcon = resolveSection(section("display"), { showHeader: true }).find(
            (c) => c.property === "tableIcon"
        );
        expect(tableIcon.placeholder).toBeNull();
    });
});

describe("control presentation", () => {
    it("renders the selection mode as a radio group", () => {
        // Few options, and the choice steers the rest of the section, so all three
        // stay readable instead of hiding behind a closed combobox.
        const mode = resolveSection(section("rows"), {}).find((c) => c.property === "selectionMode");
        expect(mode.isRadio).toBe(true);
        expect(mode.isSelect).toBe(false);
    });

    it("pairs minimum and maximum selection on one line", () => {
        const controls = resolveSection(section("rows"), { selectionMode: "Multiple" });
        const min = controls.find((c) => c.property === "minSelection");
        const max = controls.find((c) => c.property === "maxSelection");

        expect(min.cssClass).toContain("control_inline");
        expect(max.cssClass).toContain("control_inline");
    });

    it("leaves an unpaired control on its own line", () => {
        const mode = resolveSection(section("rows"), {}).find((c) => c.property === "selectionMode");
        expect(mode.cssClass).toBe("control");
    });
});

describe("integer controls", () => {
    function selection(values) {
        return resolveSection(section("rows"), values);
    }

    it("uses a plain integer input, not the resource-capable one", () => {
        // A Flow reference here could not be checked against the minimum, and a
        // formula for "how many rows may I pick" is not a thing anyone wants.
        const min = selection({ selectionMode: "Multiple" }).find((c) => c.property === "minSelection");
        expect(min.isInteger).toBe(true);
        expect(min.isNumber).toBe(false);
    });

    it("carries no help text on either field", () => {
        const controls = selection({ selectionMode: "Multiple" });
        expect(controls.find((c) => c.property === "minSelection").help).toBeUndefined();
        expect(controls.find((c) => c.property === "maxSelection").help).toBeUndefined();
    });

    it("floors the minimum at zero", () => {
        expect(selection({ selectionMode: "Multiple" }).find((c) => c.property === "minSelection").min).toBe(0);
    });

    it("never lets the maximum fall below the minimum", () => {
        const withMin = selection({ selectionMode: "Multiple", minSelection: 4 });
        expect(withMin.find((c) => c.property === "maxSelection").min).toBe(4);
    });

    it("falls back to one when no minimum is set", () => {
        // A maximum of 0 would mean the user may select nothing at all.
        for (const values of [{ selectionMode: "Multiple" }, { selectionMode: "Multiple", minSelection: null }]) {
            expect(resolveSection(section("rows"), values).find((c) => c.property === "maxSelection").min).toBe(1);
        }
    });
});

describe("integer values are typed for Flow", () => {
    it("sends Number, never Integer", () => {
        // Flow's value data types are String, Number, Boolean, Date, DateTime and
        // reference. "Integer" is a property type in js-meta.xml and not one of them:
        // sending it made Flow Builder fail to build the element on save.
        expect(DATA_TYPE_FOR[CONTROL.INTEGER]).toBe("Number");
        expect(Object.values(DATA_TYPE_FOR)).not.toContain("Integer");
    });
});

describe("the wrapped line limit is a switch", () => {
    it("offers a checkbox, because a count cannot be honoured", () => {
        const controls = resolveSection(section("display"), {});
        expect(controls.find((c) => c.property === "limitWrappedLines").isCheckbox).toBe(true);
        // The deprecated property is unread and must not reappear in the editor.
        expect(controls.find((c) => c.property === "wrapTextMaxLines")).toBeUndefined();
    });
});

describe("dimensions", () => {
    it("reads a stored length back into its two fields", () => {
        expect(parseDimension("30rem")).toEqual({ number: 30, unit: "rem" });
        expect(parseDimension(" 12.5 PX ")).toEqual({ number: 12.5, unit: "px" });
    });

    it("shows an empty number for anything it cannot split", () => {
        // calc() was supported before this control existed, so a saved flow can
        // still hold one. It surfaces as a blank field rather than as a broken
        // number, and is only overwritten once the admin types something.
        ["calc(100vh - 4rem)", "", null, undefined, "30", "auto"].forEach((value) =>
            expect(parseDimension(value)).toEqual({ number: null, unit: "rem" })
        );
    });

    it("composes the pair back into one CSS length", () => {
        expect(formatDimension(30, "rem")).toBe("30rem");
        expect(formatDimension("24", "px")).toBe("24px");
    });

    it("clears the property when the number is cleared", () => {
        // Blank has a meaning of its own here -- fit the rows -- so an empty
        // number field must not become "0rem" or a bare unit.
        [null, undefined, ""].forEach((value) => expect(formatDimension(value, "rem")).toBeNull());
    });
});
