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
 *
 * LABEL CASE — every `label`, including section labels and option labels, is Title
 * Case. Capitalise each word EXCEPT articles (a, an, the), coordinating conjunctions
 * (and, or, nor, but) and prepositions of three letters or fewer (in, at, on, to, of,
 * by, up, per, via, for, off, as). Longer prepositions are capitalised: "Above",
 * "Without", "Instead". The first word is always capitalised whatever it is.
 *
 *   Show a Header Above the Grid        Records per Page
 *   Load as You Scroll                  Use a User-Defined Object Instead of ...
 *
 * The same applies to `label="..."` in fgrid_flowGrid.js-meta.xml, which is what an
 * admin sees if they ever reach a property outside this editor. Help text and
 * descriptions are ordinary sentences and are NOT title-cased.
 */

import { ROW_ACTION_DEFAULT_ICONS } from "c/fgrid_gridModel";

/** Control types `fgrid_propertyControls` knows how to render. */
export const CONTROL = {
    CHECKBOX: "checkbox",
    SELECT: "select",
    /** Radio group. Same value shape as SELECT; use it when the options are few and
     *  the choice steers the rest of a section, so all of them stay readable. */
    RADIO: "radio",
    /** A plain whole number. Unlike NUMBER it does NOT go through the kit's value
     *  input, so it cannot take a Flow resource — use it where only a literal makes
     *  sense and a bound formula would be meaningless. Honours `min` and `minFrom`. */
    INTEGER: "integer",
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
    [CONTROL.RESOURCE]: "reference",
    // "Number", NOT "Integer". Flow's value data types are String, Number, Boolean,
    // Date, DateTime and reference; "Integer" is a PROPERTY type in js-meta.xml and
    // not one of them. Sending it made Flow Builder fail to build the element at all:
    // "can't access property 1, Object.entries(...).find(...) is undefined" from
    // builder_platform_interaction:elementFactory, on save. The kit's own number input
    // sends "Number", which is the path that has always worked.
    [CONTROL.INTEGER]: "Number"
    // TEXT and NUMBER take their data type from the picker's event, because the
    // admin may supply either a literal or a Flow reference.
};

export const SELECTION_MODES = [
    { label: "Multiple", value: "Multiple" },
    { label: "Single", value: "Single" },
    { label: "View Only", value: "None" }
];

/** How a single selection is presented, and therefore whether it can be undone. */
export const SINGLE_SELECT_CONTROLS = [
    { label: "Radio Button", value: "Radio" },
    { label: "Checkbox", value: "Checkbox" }
];

const ROW_ACTION_TYPES = [
    { label: "None", value: "None" },
    { label: "Remove Row", value: "Remove" },
    { label: "Run a Flow", value: "Flow" }
];

/**
 * Row loading strategies. There is no "render everything" option: the standard
 * datatable has no such mode, and it was the old default — which is what made a
 * 300-record grid render 300 rows of DOM before it could be touched.
 */
const ROW_LOADING_MODES = [
    { label: "Load as You Scroll", value: "Scroll" },
    { label: "Paginate", value: "Paginate" }
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
    rowLoading: "Scroll",
    selectionMode: "Multiple",
    singleSelectControl: "Radio",
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
    multiSelect: (v) => v.selectionMode === "Multiple",
    paginated: (v) => v.rowLoading === "Paginate",
    searchable: (v) => Boolean(v.showSearchBar),
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
    headerActionsHidden: (v) => Boolean(v.hideHeaderActions),
    editsAutoSave: (v) => Boolean(v.autoSaveEdits),
    nameFieldNotLinked: (v) => Boolean(v.hideNameFieldLink)
};

/**
 * Named placeholder resolvers, following the same pattern as VISIBILITY: a
 * descriptor references one by key so it stays comparable and testable.
 */
export const PLACEHOLDERS = {
    /** Shows the icon the chosen action type will actually fall back to. */
    rowActionIcon: (v) => ROW_ACTION_DEFAULT_ICONS[v.rowActionType] || null
};

export const SECTIONS = [
    {
        name: "source",
        label: "Data Source",
        controls: [
            {
                property: "isUserDefinedObject",
                type: CONTROL.CHECKBOX,
                label: "Use a User-Defined Object Instead of Salesforce Records",
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
                help: "Record collection to display. Choosing this sets the grid's object and resets the column selection. If this collection changes while the screen is open — because something upstream recalculated it — the grid reloads from the new data and any unsaved inline edits are discarded."
            },
            {
                property: "preSelectedRecords",
                type: CONTROL.RESOURCE,
                label: "Pre-Selected Records",
                acceptedTypes: "SObject",
                collection: "only",
                when: ["sobjectSource"],
                help: "Records to show as already selected. Reapplied whenever this collection changes, replacing whatever the user had selected. Leave it unset to let the user's selection stand; set it to an empty collection to clear the selection."
            },
            {
                property: "disabledRecords",
                type: CONTROL.RESOURCE,
                label: "Disabled Records",
                acceptedTypes: "SObject",
                collection: "only",
                when: ["sobjectSource"],
                help: "Records the user cannot select or edit. They still appear, greyed, so it is clear why a row is unavailable rather than it simply being missing. Build the collection in the Flow — for example every record whose Status is Pending. Matched to rows by the key field."
            },
            {
                property: "recordsJson",
                type: CONTROL.TEXT,
                label: "Records (JSON)",
                required: true,
                when: ["userDefinedSource"],
                help: "Text variable holding a serialized collection of objects. If this value changes while the screen is open, the grid reloads from the new data and any unsaved inline edits are discarded."
            },
            {
                property: "preSelectedRecordsJson",
                type: CONTROL.TEXT,
                label: "Pre-Selected Records (JSON)",
                when: ["userDefinedSource"],
                help: "Serialized collection of the rows to show as already selected. Reapplied whenever this value changes, replacing whatever the user had selected."
            },
            {
                property: "disabledRecordsJson",
                type: CONTROL.TEXT,
                label: "Disabled Records (JSON)",
                when: ["userDefinedSource"],
                help: "Serialized collection of the rows the user cannot select or edit. Matched to rows by the key field."
            },
            {
                property: "isSerializedRecordData",
                type: CONTROL.CHECKBOX,
                label: "Records Arrive Pre-Serialized",
                when: ["userDefinedSource"]
            },
            {
                property: "serializedRecordData",
                type: CONTROL.TEXT,
                label: "Serialized Record Data",
                when: ["serialized"]
            }
        ]
    },
    {
        name: "rows",
        label: "Configure Rows",
        controls: [
            {
                property: "selectionMode",
                type: CONTROL.RADIO,
                label: "Row Selection Mode",
                options: SELECTION_MODES
            },
            {
                property: "minSelection",
                type: CONTROL.INTEGER,
                label: "Minimum Selection",
                when: ["multiSelect"],
                inline: true,
                min: 0
            },
            {
                property: "maxSelection",
                type: CONTROL.INTEGER,
                label: "Maximum Selection",
                when: ["multiSelect"],
                inline: true,
                // Never below the minimum: a maximum under it can never be satisfied.
                min: 1,
                minFrom: "minSelection"
            },
            {
                // Single only. For Multiple, a Minimum of 1 says the same thing, and
                // two controls meaning one thing is how a panel gets confusing.
                property: "isRequired",
                type: CONTROL.CHECKBOX,
                label: "Require User to Make a Selection",
                when: ["singleSelect"]
            },
            {
                property: "singleSelectControl",
                type: CONTROL.RADIO,
                label: "Row Selector Type",
                options: SINGLE_SELECT_CONTROLS,
                when: ["singleSelect"],
                help: "Checkbox allows users to deselect a row"
            },
            {
                property: "keyField",
                type: CONTROL.FIELD,
                label: "Unique Identifier",
                when: ["sobjectSource", "hasObject"],
                help: "Field that uniquely identifies each row. Normally Id."
            }
        ]
    },
    {
        name: "columns",
        label: "Configure Columns",
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
            { property: "showHeader", type: CONTROL.CHECKBOX, label: "Show a Header Above the Grid" },
            { property: "tableLabel", type: CONTROL.TEXT, label: "Header Label", when: ["headerShown"] },
            { property: "tableIcon", type: CONTROL.ICON, label: "Header Icon", when: ["headerShown"] },
            {
                property: "showRecordCount",
                type: CONTROL.CHECKBOX,
                label: "Show the Record Count in the Header",
                when: ["headerShown"]
            },
            {
                property: "showSelectedCount",
                type: CONTROL.CHECKBOX,
                label: "Show the Selected Count in the Header",
                when: ["headerShown"]
            },
            { property: "showRowNumbers", type: CONTROL.CHECKBOX, label: "Show Row Numbers" },
            {
                property: "limitWrappedLines",
                type: CONTROL.CHECKBOX,
                label: "Limit Wrapped Text to Three Lines",
                help: "Three is the only clamp available — SLDS hardcodes it, so a count cannot be honoured. Off, a wrapped cell shows every line."
            },
            {
                property: "showReadOnlyIcon",
                type: CONTROL.CHECKBOX,
                label: "Show a Lock on Read-Only Columns",
                help: "Only worth turning on when some columns are editable, or every column wears a lock."
            },
            {
                property: "tableHeight",
                type: CONTROL.TEXT,
                label: "Grid Height",
                placeholder: "30rem",
                help: "CSS height, for example 30rem or calc(50vh - 100px). Leave blank to fit all rows."
            }
        ]
    },
    {
        name: "find",
        label: "Search, Filter & Sort",
        controls: [
            { property: "showSearchBar", type: CONTROL.CHECKBOX, label: "Show a Search Bar" },
            {
                property: "searchWholePhrase",
                type: CONTROL.CHECKBOX,
                label: "Limit Search to a Single Column",
                when: ["searchable"],
                help: "Off (the default): every word typed must appear somewhere in the row, in any column and in any order — so a full name is found even when first and last name are separate columns. On: the whole phrase must appear within a single column, which is stricter but cannot match a value split across two fields."
            },
            {
                property: "hideHeaderActions",
                type: CONTROL.CHECKBOX,
                label: "Hide Column Header Actions",
                help: "Removes sort, wrap/clip text, and filter from every column header."
            },
            {
                // Reached only through a column header menu, so hiding the header
                // actions leaves it with nothing to govern.
                property: "matchCaseOnFilters",
                type: CONTROL.CHECKBOX,
                label: "Match Case on Column Filters",
                disabledWhen: ["headerActionsHidden"],
                help: 'Off, a filter for "acme" also matches "Acme". Unavailable while column header actions are hidden, because there is no filter to apply it to.'
            }
        ]
    },
    {
        name: "pagination",
        label: "Pagination",
        controls: [
            {
                property: "rowLoading",
                type: CONTROL.SELECT,
                label: "Row Loading",
                options: ROW_LOADING_MODES,
                help: "Load as you scroll renders a batch of rows and grows as the user scrolls, which keeps a large collection responsive. Paginate shows a fixed page size with First/Previous/Next/Last. Either way the grid needs a height — 30rem is used when none is set."
            },
            { property: "recordsPerPage", type: CONTROL.NUMBER, label: "Records per Page", when: ["paginated"] },
            {
                property: "showRowsPerPage",
                type: CONTROL.CHECKBOX,
                label: "Let Users Change the Page Size",
                when: ["paginated"],
                help: "Adds a Rows per page picker to the pagination footer, offering 10, 25, 50 and 100. Options above the maximum row count are left out, since each would produce a single page, and the page size you set here is always included even if it is not one of those steps."
            },
            {
                property: "maxNumberOfRows",
                type: CONTROL.NUMBER,
                label: "Maximum Records to Display",
                help: "Leave blank for no limit."
            }
        ]
    },
    {
        name: "editing",
        label: "Inline Editing",
        controls: [
            {
                property: "autoSaveEdits",
                type: CONTROL.CHECKBOX,
                label: "Hide the Cancel/Save Buttons",
                help: "Each edit applies as soon as the user leaves the cell, so nothing is ever pending for Cancel or Save to act on. There is no undo."
            },
            {
                property: "navigateNextOnSave",
                type: CONTROL.CHECKBOX,
                label: "Go to the Next Flow Element on Save",
                disabledWhen: ["editsAutoSave"],
                help: "Unavailable while edits save themselves, because there is no Save to react to."
            }
        ]
    },
    {
        name: "rowaction",
        label: "Row Action",
        controls: [
            { property: "rowActionType", type: CONTROL.SELECT, label: "Row Action", options: ROW_ACTION_TYPES },
            {
                property: "rowActionFlowApiName",
                type: CONTROL.FLOW,
                label: "Flow to Launch",
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
                label: "Action Column Position",
                options: SIDES,
                when: ["hasRowAction", "flowConfigured"]
            },
            {
                property: "rowActionLabel",
                type: CONTROL.TEXT,
                label: "Hover Text",
                when: ["iconAction", "flowConfigured"]
            },
            {
                property: "rowActionIcon",
                type: CONTROL.ICON,
                label: "Action Icon",
                placeholderFrom: "rowActionIcon",
                when: ["iconAction", "flowConfigured"]
            },
            {
                property: "rowActionColor",
                type: CONTROL.SELECT,
                label: "Icon Color",
                options: ACTION_COLORS,
                when: ["iconAction", "flowConfigured"]
            },
            {
                property: "rowActionButtonLabel",
                type: CONTROL.TEXT,
                label: "Button Label",
                required: true,
                when: ["buttonAction", "flowConfigured"]
            },
            {
                property: "rowActionButtonIcon",
                type: CONTROL.ICON,
                label: "Button Icon (Optional)",
                when: ["buttonAction", "flowConfigured"]
            },
            {
                property: "rowActionButtonIconPosition",
                type: CONTROL.SELECT,
                label: "Button Icon Position",
                options: SIDES,
                when: ["buttonAction", "flowConfigured"]
            },
            {
                property: "rowActionButtonVariant",
                type: CONTROL.SELECT,
                label: "Button Variant",
                options: BUTTON_VARIANTS,
                when: ["buttonAction", "flowConfigured"]
            },
            {
                property: "maxRemovedRows",
                type: CONTROL.NUMBER,
                label: "Maximum Rows That Can Be Removed",
                when: ["removeAction", "flowConfigured"],
                help: "Leave blank for no limit."
            },
            {
                property: "rowActionFlowSavesChanges",
                type: CONTROL.CHECKBOX,
                label: "The Launched Flow Saves Its Own Changes",
                when: ["flowAction", "flowConfigured"],
                help:
                    "Check this when the flow performs its own DML. The grid then compares each change " +
                    "against the record as re-read from the database and reports only what is still " +
                    "unsaved through Edited Records, so the calling flow does not save it twice."
            },
            {
                property: "rowActionFlowModalHeader",
                type: CONTROL.TEXT,
                label: "Modal Header",
                when: ["screenFlowAction"]
            },
            {
                property: "rowActionFlowModalSize",
                type: CONTROL.SELECT,
                label: "Modal Size",
                options: MODAL_SIZES,
                when: ["screenFlowAction"]
            }
        ]
    },
    {
        name: "formatting",
        label: "Links & Formatting",
        controls: [
            {
                property: "hideNameFieldLink",
                type: CONTROL.CHECKBOX,
                label: "Do Not Link the Name Field",
                help: "A Name column with Edit ticked is never linked, whatever this says: a link and a text editor cannot share the cell, and editing wins."
            },
            {
                property: "openLinkInSameTab",
                type: CONTROL.CHECKBOX,
                label: "Open Links in the Same Tab",
                disabledWhen: ["nameFieldNotLinked"]
            },
            {
                property: "suppressCurrencyConversion",
                type: CONTROL.CHECKBOX,
                label: "Do Not Convert Currency Values",
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
                label: "Show Every Picklist Value",
                help: "Ignores record-type filtering on editable picklist columns."
            },
            { property: "hideNoneOption", type: CONTROL.CHECKBOX, label: "Hide --None-- in Editable Picklists" }
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
            placeholder: control.placeholderFrom
                ? (PLACEHOLDERS[control.placeholderFrom]?.(values) ?? control.placeholder ?? null)
                : (control.placeholder ?? null),
            disabled: Boolean(control.disabledWhen) && allPass(DISABLED, control.disabledWhen, values),
            // Controls marked `inline` share a row with the next one; everything else
            // takes the full width.
            cssClass: control.inline ? "control control_inline" : "control",
            // `minFrom` reads the floor off another property, so Maximum selection
            // cannot be set below Minimum selection. Falls back to the control's own
            // `min` when that property is blank.
            min: control.minFrom
                ? Math.max(Number(control.min ?? 0), Number(values[control.minFrom]) || Number(control.min ?? 0))
                : (control.min ?? null),
            isCheckbox: control.type === CONTROL.CHECKBOX,
            isSelect: control.type === CONTROL.SELECT,
            isRadio: control.type === CONTROL.RADIO,
            isInteger: control.type === CONTROL.INTEGER,
            isText: control.type === CONTROL.TEXT,
            isNumber: control.type === CONTROL.NUMBER,
            isIcon: control.type === CONTROL.ICON,
            isResource: control.type === CONTROL.RESOURCE,
            isField: control.type === CONTROL.FIELD,
            isFields: control.type === CONTROL.FIELDS,
            isFlow: control.type === CONTROL.FLOW
        }));
}
