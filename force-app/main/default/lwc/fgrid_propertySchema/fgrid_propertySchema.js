/**
 * Single definition of Flow Grid's configuration surface.
 *
 * Both the narrow Flow Builder property panel and the wide Grid Studio modal
 * render from this list, through `c/fgrid_propertyControls`. Defining a control
 * once is what keeps the two surfaces from drifting apart.
 *
 * Every `property` here must exist in fgrid_flowGrid.js-meta.xml. `columnConfig`
 * and `objectApiName` are deliberately absent: the first has its own grid, the
 * second is a mirror the editor maintains, never something an admin edits.
 */

/** Control types `fgrid_propertyControls` knows how to render. */
export const CONTROL = {
    CHECKBOX: "checkbox",
    SELECT: "select",
    TEXT: "text",
    NUMBER: "number",
    ICON: "icon",
    RESOURCE: "resource",
    FIELD: "field",
    FIELDS: "fields",
    /** Flow picker. Needs Apex to read a flow's variables, so it is a component
     *  rather than a plain input, but it participates in declaration order like
     *  any other control. */
    FLOW: "flow"
};

/** Flow `valueDataType` each control type writes. */
export const DATA_TYPE_FOR = {
    [CONTROL.CHECKBOX]: "Boolean",
    [CONTROL.SELECT]: "String",
    [CONTROL.ICON]: "String",
    [CONTROL.FIELD]: "String",
    [CONTROL.FIELDS]: "String",
    [CONTROL.RESOURCE]: "reference"
    // TEXT and NUMBER take their data type from the picker's event, because the
    // admin may supply either a literal or a Flow reference.
};

export const SELECTION_MODES = [
    { label: "Multiple (checkboxes)", value: "Multiple" },
    { label: "Single (radio buttons)", value: "Single" },
    { label: "None (read only)", value: "None" }
];

const ROW_ACTION_TYPES = [
    { label: "None", value: "None" },
    { label: "Remove row", value: "Remove" },
    { label: "Run a flow", value: "Flow" }
];

const MODAL_SIZES = [
    { label: "Small", value: "Small" },
    { label: "Medium", value: "Medium" },
    { label: "Large", value: "Large" }
];

const ROW_ACTION_DISPLAYS = [
    { label: "Icon", value: "Icon" },
    { label: "Button", value: "Button" }
];

const SIDES = [
    { label: "Left", value: "Left" },
    { label: "Right", value: "Right" }
];

const ACTION_COLORS = [
    { label: "Red", value: "Red" },
    { label: "Green", value: "Green" },
    { label: "Black", value: "Black" }
];

const BUTTON_VARIANTS = [
    { label: "Neutral", value: "neutral" },
    { label: "Brand", value: "brand" },
    { label: "Destructive", value: "destructive" },
    { label: "Success", value: "success" },
    { label: "Inverse", value: "inverse" }
];

/**
 * Properties the editor writes but no declarative control owns.
 *
 * `objectApiName` mirrors the generic type mapping; `columnConfig` has its own
 * grid; the four flow properties are set by `c/fgrid_flowActionConfig`, which
 * needs Apex to read a flow's variables. They still have to appear in the
 * editor's value map, or the components that own them receive nothing.
 */
export const EDITOR_MANAGED_PROPERTIES = [
    "objectApiName",
    "columnConfig",
    "rowActionFlowLaunchMode",
    "rowActionFlowRecordVariable",
    "rowActionFlowIdVariable"
];

/** Values Flow Grid assumes when an admin has not set the property. */
export const DEFAULTS = {
    keyField: "Id",
    selectionMode: "Multiple",
    showBorder: true,
    showNameFieldLink: true,
    allowNoneToBeChosen: true,
    rowActionType: "None",
    rowActionDisplay: "Icon",
    rowActionPosition: "Left",
    rowActionColor: "Red",
    rowActionButtonIconPosition: "Left",
    rowActionButtonVariant: "neutral",
    rowActionFlowModalHeader: "Edit Record",
    rowActionFlowModalSize: "Medium"
};

/**
 * Named visibility predicates. Descriptors reference these by key rather than
 * holding functions, so a descriptor stays comparable and testable.
 */
export const VISIBILITY = {
    sobjectSource: (v) => !v.isUserDefinedObject,
    userDefinedSource: (v) => Boolean(v.isUserDefinedObject),
    serialized: (v) => Boolean(v.isUserDefinedObject) && Boolean(v.isSerializedRecordData),
    hasObject: (v) => Boolean(v.objectApiName),
    headerShown: (v) => Boolean(v.showHeader),
    selectable: (v) => v.selectionMode !== "None",
    singleSelect: (v) => v.selectionMode === "Single",
    paginated: (v) => Boolean(v.showPagination),
    // Named explicitly rather than "not None", so a configuration left over from
    // the removed Standard action does not show sub-options for an action that no
    // longer exists.
    hasRowAction: (v) => v.rowActionType === "Remove" || v.rowActionType === "Flow",
    iconAction: (v) => VISIBILITY.hasRowAction(v) && v.rowActionDisplay === "Icon",
    buttonAction: (v) => VISIBILITY.hasRowAction(v) && v.rowActionDisplay === "Button",
    removeAction: (v) => v.rowActionType === "Remove",
    flowAction: (v) => v.rowActionType === "Flow",
    /**
     * Everything below the flow picker waits until a flow is chosen, so the
     * section reads top-down instead of showing options for an action that has
     * not been pointed at anything yet.
     */
    flowConfigured: (v) => v.rowActionType !== "Flow" || Boolean(v.rowActionFlowApiName),
    /** Modal options only mean something for a flow that renders screens. */
    screenFlowAction: (v) =>
        v.rowActionType === "Flow" && Boolean(v.rowActionFlowApiName) && v.rowActionFlowLaunchMode !== "Headless"
};

/** Named predicates that grey a control out instead of hiding it. */
export const DISABLED = {
    bottomBarHidden: (v) => Boolean(v.suppressBottomBar),
    nameFieldNotLinked: (v) => !v.showNameFieldLink
};

export const SECTIONS = [
    {
        name: "source",
        label: "Data Source",
        controls: [
            {
                property: "isUserDefinedObject",
                type: CONTROL.CHECKBOX,
                label: "Use a user-defined object instead of Salesforce records",
                help: "Turn this on when the grid is fed serialized JSON rather than a record collection."
            },
            {
                property: "records",
                type: CONTROL.RESOURCE,
                label: "Records",
                required: true,
                acceptedTypes: "SObject",
                collection: "only",
                when: ["sobjectSource"],
                help: "Record collection to display. Choosing this sets the grid's object and resets the column selection."
            },
            {
                property: "preSelectedRecords",
                type: CONTROL.RESOURCE,
                label: "Pre-selected records",
                acceptedTypes: "SObject",
                collection: "only",
                when: ["sobjectSource"],
                help: "Records to show as already selected when the screen loads."
            },
            {
                property: "keyField",
                type: CONTROL.FIELD,
                label: "Key field",
                when: ["sobjectSource", "hasObject"],
                help: "Unique identifier for each row. Normally Id."
            },
            {
                property: "recordsJson",
                type: CONTROL.TEXT,
                label: "Records (JSON)",
                required: true,
                when: ["userDefinedSource"],
                help: "Text variable holding a serialized collection of objects."
            },
            {
                property: "preSelectedRecordsJson",
                type: CONTROL.TEXT,
                label: "Pre-selected records (JSON)",
                when: ["userDefinedSource"]
            },
            {
                property: "isSerializedRecordData",
                type: CONTROL.CHECKBOX,
                label: "Records arrive pre-serialized",
                when: ["userDefinedSource"]
            },
            {
                property: "serializedRecordData",
                type: CONTROL.TEXT,
                label: "Serialized record data",
                when: ["serialized"]
            }
        ]
    },
    {
        name: "columns",
        label: "Columns",
        // The per-column attribute grid renders after these controls.
        hasColumnGrid: true,
        controls: [
            {
                property: "columnFields",
                type: CONTROL.FIELDS,
                label: "Columns",
                required: true,
                when: ["hasObject"],
                help: "Pick the fields to show, in the order they should appear. Drag to reorder."
            }
        ]
    },
    {
        name: "display",
        label: "Table Display",
        controls: [
            { property: "showHeader", type: CONTROL.CHECKBOX, label: "Show a header above the grid" },
            { property: "tableLabel", type: CONTROL.TEXT, label: "Header label", when: ["headerShown"] },
            { property: "tableIcon", type: CONTROL.ICON, label: "Header icon", when: ["headerShown"] },
            {
                property: "showRecordCount",
                type: CONTROL.CHECKBOX,
                label: "Show the record count in the header",
                when: ["headerShown"]
            },
            {
                property: "showSelectedCount",
                type: CONTROL.CHECKBOX,
                label: "Show the selected count in the header",
                when: ["headerShown"]
            },
            { property: "showRowNumbers", type: CONTROL.CHECKBOX, label: "Show row numbers" },
            { property: "showBorder", type: CONTROL.CHECKBOX, label: "Show a border around the grid" },
            {
                property: "allowOverflow",
                type: CONTROL.CHECKBOX,
                label: "Allow content to overflow the grid",
                help: "Needed when an editable picklist or lookup would otherwise be clipped."
            },
            {
                property: "tableHeight",
                type: CONTROL.TEXT,
                label: "Grid height",
                placeholder: "30rem",
                help: "CSS height, for example 30rem or calc(50vh - 100px). Leave blank to fit all rows."
            }
        ]
    },
    {
        name: "selection",
        label: "Selection",
        controls: [
            { property: "selectionMode", type: CONTROL.SELECT, label: "Selection mode", options: SELECTION_MODES },
            {
                property: "isRequired",
                type: CONTROL.CHECKBOX,
                label: "Require at least one selected row",
                when: ["selectable"]
            },
            {
                property: "hideClearSelectionButton",
                type: CONTROL.CHECKBOX,
                label: "Hide the Clear Selection button",
                when: ["singleSelect"]
            }
        ]
    },
    {
        name: "find",
        label: "Search, Filter & Sort",
        controls: [
            { property: "showSearchBar", type: CONTROL.CHECKBOX, label: "Show a search bar" },
            {
                property: "hideHeaderActions",
                type: CONTROL.CHECKBOX,
                label: "Hide column header actions",
                help: "Removes sort, wrap/clip text, and filter from every column header."
            },
            { property: "matchCaseOnFilters", type: CONTROL.CHECKBOX, label: "Match case on column filters" },
            { property: "caseInsensitiveSort", type: CONTROL.CHECKBOX, label: "Sort without regard to case" }
        ]
    },
    {
        name: "pagination",
        label: "Pagination",
        controls: [
            { property: "showPagination", type: CONTROL.CHECKBOX, label: "Paginate the grid" },
            { property: "recordsPerPage", type: CONTROL.NUMBER, label: "Records per page", when: ["paginated"] },
            {
                property: "showFirstLastButtons",
                type: CONTROL.CHECKBOX,
                label: "Show First and Last buttons",
                when: ["paginated"]
            },
            {
                property: "maxNumberOfRows",
                type: CONTROL.NUMBER,
                label: "Maximum records to display",
                help: "Leave blank for no limit."
            }
        ]
    },
    {
        name: "editing",
        label: "Inline Editing",
        controls: [
            {
                property: "suppressBottomBar",
                type: CONTROL.CHECKBOX,
                label: "Hide the Cancel/Save bar",
                help: "Edits apply as soon as the user leaves the cell instead of on Save."
            },
            {
                property: "navigateNextOnSave",
                type: CONTROL.CHECKBOX,
                label: "Go to the next Flow element on Save",
                disabledWhen: ["bottomBarHidden"],
                help: "Unavailable while the Cancel/Save bar is hidden, because there is no Save to react to."
            }
        ]
    },
    {
        name: "rowaction",
        label: "Row Action",
        controls: [
            { property: "rowActionType", type: CONTROL.SELECT, label: "Row action", options: ROW_ACTION_TYPES },
            {
                property: "rowActionFlowApiName",
                type: CONTROL.FLOW,
                label: "Flow to launch",
                required: true,
                when: ["flowAction"],
                help: "Select an active flow to edit the selected row."
            },
            {
                property: "rowActionDisplay",
                type: CONTROL.SELECT,
                label: "Display as",
                options: ROW_ACTION_DISPLAYS,
                when: ["hasRowAction", "flowConfigured"]
            },
            {
                property: "rowActionPosition",
                type: CONTROL.SELECT,
                label: "Action column position",
                options: SIDES,
                when: ["hasRowAction", "flowConfigured"]
            },
            {
                property: "rowActionLabel",
                type: CONTROL.TEXT,
                label: "Hover text",
                when: ["iconAction", "flowConfigured"]
            },
            {
                property: "rowActionIcon",
                type: CONTROL.ICON,
                label: "Action icon",
                when: ["iconAction", "flowConfigured"]
            },
            {
                property: "rowActionColor",
                type: CONTROL.SELECT,
                label: "Icon color",
                options: ACTION_COLORS,
                when: ["iconAction", "flowConfigured"]
            },
            {
                property: "rowActionButtonLabel",
                type: CONTROL.TEXT,
                label: "Button label",
                required: true,
                when: ["buttonAction", "flowConfigured"]
            },
            {
                property: "rowActionButtonIcon",
                type: CONTROL.ICON,
                label: "Button icon (optional)",
                when: ["buttonAction", "flowConfigured"]
            },
            {
                property: "rowActionButtonIconPosition",
                type: CONTROL.SELECT,
                label: "Button icon position",
                options: SIDES,
                when: ["buttonAction", "flowConfigured"]
            },
            {
                property: "rowActionButtonVariant",
                type: CONTROL.SELECT,
                label: "Button variant",
                options: BUTTON_VARIANTS,
                when: ["buttonAction", "flowConfigured"]
            },
            {
                property: "maxRemovedRows",
                type: CONTROL.NUMBER,
                label: "Maximum rows that can be removed",
                when: ["removeAction", "flowConfigured"],
                help: "Leave blank for no limit."
            },
            {
                property: "rowActionFlowModalHeader",
                type: CONTROL.TEXT,
                label: "Modal header",
                when: ["screenFlowAction"]
            },
            {
                property: "rowActionFlowModalSize",
                type: CONTROL.SELECT,
                label: "Modal size",
                options: MODAL_SIZES,
                when: ["screenFlowAction"]
            }
        ]
    },
    {
        name: "formatting",
        label: "Links & Formatting",
        controls: [
            { property: "showNameFieldLink", type: CONTROL.CHECKBOX, label: "Link the Name field to its record" },
            {
                property: "openLinkInSameTab",
                type: CONTROL.CHECKBOX,
                label: "Open links in the same tab",
                disabledWhen: ["nameFieldNotLinked"]
            },
            {
                property: "suppressCurrencyConversion",
                type: CONTROL.CHECKBOX,
                label: "Do not convert currency values",
                help: "Only relevant in a multi-currency org."
            }
        ]
    },
    {
        name: "picklists",
        label: "Picklist Editing",
        controls: [
            {
                property: "recordTypeId",
                type: CONTROL.TEXT,
                label: "Record Type Id",
                help: "Limits editable picklists to the values available for this record type."
            },
            {
                property: "showAllPicklistValues",
                type: CONTROL.CHECKBOX,
                label: "Show every picklist value",
                help: "Ignores record-type filtering on editable picklist columns."
            },
            { property: "allowNoneToBeChosen", type: CONTROL.CHECKBOX, label: "Offer --None-- in editable picklists" }
        ]
    }
];

/** Every property name the schema drives, for tests and validation. */
export function schemaProperties() {
    return SECTIONS.flatMap((section) => section.controls.map((control) => control.property));
}

/** True when every named predicate in `keys` passes for `values`. */
function allPass(registry, keys, values) {
    if (!keys || !keys.length) {
        return false;
    }
    return keys.every((key) => {
        const predicate = registry[key];
        return predicate ? predicate(values) : false;
    });
}

/**
 * Resolves one section's controls against the current configuration, returning
 * only what should render, each stamped with the per-type booleans a template
 * needs (LWC cannot switch on a value in markup).
 */
export function resolveSection(section, values) {
    return section.controls
        .filter((control) => !control.when || allPass(VISIBILITY, control.when, values))
        .map((control) => ({
            ...control,
            key: control.property,
            value: values[control.property] ?? null,
            disabled: Boolean(control.disabledWhen) && allPass(DISABLED, control.disabledWhen, values),
            isCheckbox: control.type === CONTROL.CHECKBOX,
            isSelect: control.type === CONTROL.SELECT,
            isText: control.type === CONTROL.TEXT,
            isNumber: control.type === CONTROL.NUMBER,
            isIcon: control.type === CONTROL.ICON,
            isResource: control.type === CONTROL.RESOURCE,
            isField: control.type === CONTROL.FIELD,
            isFields: control.type === CONTROL.FIELDS,
            isFlow: control.type === CONTROL.FLOW
        }));
}
