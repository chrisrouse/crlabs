/**
 * Which display types a column may use, and which attributes that type implies.
 *
 * The column panel used to offer every attribute for every column: decimals and
 * step on a text column, "show the record name" on a number, and a free-text
 * box for the type. This is the model that lets the panel show only what
 * applies -- see column-attributes-c.html, deleted with the other design
 * mockups; it is in git history at eba68e8f.
 *
 * Two questions, both answered from the field's describe:
 *
 *   typeOptionsFor(displayType)   what can this field be shown AS?
 *   attributeGroupFor(type)       what settings does that display imply?
 *
 * The first is about sensible RE-DISPLAY, not about what is technically
 * renderable. A Date/Time can reasonably be shown as a date, or as text; it
 * cannot be shown as a currency, and offering that is how an admin ends up
 * with a broken column and no idea why. Text is always available, because any
 * value can be printed.
 *
 * With NO describe -- a user-defined object, where there is no field to
 * inspect -- every type is offered. Nothing can be ruled out, and refusing to
 * guess is better than guessing wrong.
 */

/** Everything the grid can render, including our eight custom cell types. */
export const COLUMN_TYPES = [
    { label: "Text", value: "text" },
    { label: "Long Text", value: "fgridLongText" },
    { label: "Number", value: "number" },
    { label: "Currency", value: "currency" },
    { label: "Percent", value: "percent" },
    { label: "Progress Bar", value: "fgridProgressBar" },
    { label: "Progress Ring", value: "fgridProgressRing" },
    { label: "Progress Circle", value: "fgridProgressCircle" },
    { label: "Date", value: "date-local" },
    { label: "Date/Time", value: "date" },
    { label: "Time", value: "fgridTime" },
    { label: "Checkbox", value: "boolean" },
    { label: "Email", value: "email" },
    { label: "Phone", value: "phone" },
    { label: "URL", value: "url" },
    { label: "Picklist", value: "fgridPicklist" },
    { label: "Multi-Select Picklist", value: "fgridMultiPicklist" },
    { label: "Lookup", value: "fgridLookup" }
];

/**
 * Sensible displays per Salesforce DisplayType.
 *
 * Read as "a field of this type may be shown as any of these". The first entry
 * is the natural one and is what the describe would have chosen anyway.
 */
const TYPES_FOR_DISPLAY_TYPE = {
    // Currency shows as currency. Re-displaying it as a Number drops the
    // symbol, as a Percent is meaningless, and as Text loses locale formatting
    // -- three ways to make the column worse and none to make it better.
    CURRENCY: ["currency"],
    DOUBLE: ["number", "currency", "percent", "text"],
    INTEGER: ["number", "currency", "percent", "text"],
    LONG: ["number", "currency", "percent", "text"],
    // A percent is the one field that can genuinely be a gauge. Progress Bar
    // renders the SLDS blueprint in our own markup rather than wrapping
    // lightning-progress-bar, which has no slots -- there is nowhere in it to
    // put a value, and its `variant` cannot carry a theme. Ring and Circle do
    // the same with the ring blueprint.
    PERCENT: ["percent", "fgridProgressBar", "fgridProgressRing", "fgridProgressCircle", "number", "text"],

    DATE: ["date-local", "date", "text"],
    DATETIME: ["date", "date-local", "text"],
    TIME: ["fgridTime", "text"],

    BOOLEAN: ["boolean", "text"],
    EMAIL: ["email", "text"],
    PHONE: ["phone", "text"],
    URL: ["url", "text"],

    // No Text here, unlike every other family. Our picklist DISPLAY template is
    // already a plain span -- read-only it is identical to a text cell -- so a
    // Text option would offer the same rendering twice while quietly costing
    // the picklist editor. Picklist or Badge is the whole choice.
    //
    // Single versus multi is the FIELD's business, not the admin's: a
    // multi-select field gets the multi type and never offers the single one.
    PICKLIST: ["fgridPicklist"],
    MULTIPICKLIST: ["fgridMultiPicklist"],
    REFERENCE: ["fgridLookup", "text"],

    TEXTAREA: ["fgridLongText", "text"],
    // A plain text field often holds an address, a reference number or a URL,
    // so the contact types stay on offer. Numeric ones do not: a String that
    // happens to contain digits is not a number, and formatting it as one
    // invites a column that renders NaN.
    STRING: ["text", "fgridLongText", "email", "phone", "url"],
    ENCRYPTEDSTRING: ["text"],
    ID: ["text"]
};

/**
 * The display types this field may be shown as, ready for a picklist.
 *
 * An unknown or absent DisplayType returns everything, which is the
 * user-defined-object case.
 */
/**
 * Badge is a DISPLAY, not a data type.
 *
 * It appears in the same list as the real types because that is how an admin
 * thinks about it — "show this as a badge" sits beside "show this as text" —
 * and because a badged picklist is still an editable picklist: the custom type
 * keeps its `picklistEdit` template whatever the badge flag says. Modelling it
 * as a separate checkbox leaked the implementation into the UI.
 *
 * It composes down to a real type plus a flag; see `resolveDisplay`.
 */
export const BADGE_DISPLAY = "badge";

/**
 * Badge does NOT make the column read-only.
 *
 * Avonni's badge type is read-only; ours is not, because the badge is only a
 * display and `fgridPicklist` keeps its `picklistEdit` template either way. A
 * badged picklist marked editable still edits as a picklist, which is the
 * better behavior and costs nothing to keep.
 */

/** Only our own picklist templates can draw a badge today. Plain text uses the
 *  datatable's built-in type, which has no template of ours to put one in. */
/** Displays that render a gauge, and so cannot be edited. */
export function isProgress(type) {
    return type === "fgridProgressBar" || type === "fgridProgressRing" || type === "fgridProgressCircle";
}

export function supportsBadge(type) {
    return type === "fgridPicklist" || type === "fgridMultiPicklist";
}

/**
 * The display types this field may be shown as, ready for a picklist.
 *
 * An unknown or absent DisplayType returns everything, which is the
 * user-defined-object case.
 */
export function typeOptionsFor(displayType) {
    const allowed = TYPES_FOR_DISPLAY_TYPE[String(displayType || "").toUpperCase()];
    const options = allowed
        ? // Ordered by the map, not by COLUMN_TYPES, so the natural display is first.
          allowed.map((value) => COLUMN_TYPES.find((type) => type.value === value)).filter(Boolean)
        : [...COLUMN_TYPES];

    // Badge sits directly after the display it decorates, so the two read as
    // alternatives rather than as unrelated entries.
    const natural = options.findIndex((option) => supportsBadge(option.value));
    if (natural >= 0) {
        options.splice(natural + 1, 0, { label: "Badge", value: BADGE_DISPLAY });
    }
    return options;
}

/** The list value for a stored type and badge flag. */
export function displayValueFor(type, badge) {
    return badge && supportsBadge(type) ? BADGE_DISPLAY : type;
}

/**
 * Splits a chosen display back into the type and flag that get stored.
 *
 * Badge needs the field's natural type to land on — single or multi-select —
 * which is why the describe comes in rather than being inferred from the
 * previous value.
 */
export function resolveDisplay(value, displayType) {
    if (value !== BADGE_DISPLAY) {
        return { type: value || null, badge: false };
    }
    const natural = typeOptionsFor(displayType).find((option) => supportsBadge(option.value));
    return { type: natural?.value || "fgridPicklist", badge: true };
}

/** True when the field is free to be re-displayed as something else. */
export function canChangeType(displayType) {
    return typeOptionsFor(displayType).length > 1;
}

/** Families of type-specific settings the panel renders. */
export const ATTRIBUTE_GROUP = {
    NUMBER: "number",
    CURRENCY: "currency",
    TEXT: "text",
    DATE: "date",
    PICKLIST: "picklist",
    LOOKUP: "lookup",
    PROGRESS: "progress",
    NONE: "none"
};

/**
 * Which block of settings a display type implies.
 *
 * Currency is its own group rather than a flag on NUMBER: it adds a code and a
 * display mode that mean nothing for a plain number, and the panel should not
 * render an inert currency picker beside an Integer.
 */
export function attributeGroupFor(type) {
    switch (type) {
        case "currency":
            return ATTRIBUTE_GROUP.CURRENCY;
        case "number":
        case "percent":
            return ATTRIBUTE_GROUP.NUMBER;
        case "text":
        case "fgridLongText":
            return ATTRIBUTE_GROUP.TEXT;
        case "date":
        case "date-local":
            return ATTRIBUTE_GROUP.DATE;
        case "fgridPicklist":
        case "fgridMultiPicklist":
            return ATTRIBUTE_GROUP.PICKLIST;
        case "fgridLookup":
            return ATTRIBUTE_GROUP.LOOKUP;
        case "fgridProgressBar":
        case "fgridProgressRing":
        case "fgridProgressCircle":
            return ATTRIBUTE_GROUP.PROGRESS;
        default:
            return ATTRIBUTE_GROUP.NONE;
    }
}

/** True when decimals and step apply — the three numeric displays. */
export function isNumeric(type) {
    const group = attributeGroupFor(type);
    return group === ATTRIBUTE_GROUP.NUMBER || group === ATTRIBUTE_GROUP.CURRENCY;
}

/**
 * How a currency is written.
 *
 * Values are `lightning-formatted-number`'s own, passed straight through as the
 * `currencyDisplayAs` type attribute.
 */
export const CURRENCY_DISPLAYS = [
    { label: "Symbol — $1,234.00", value: "symbol" },
    { label: "Code — USD 1,234.00", value: "code" },
    { label: "Name — 1,234.00 US dollars", value: "name" }
];

/**
 * Bar thickness, which is the SLDS blueprint's own size scale.
 *
 * For a BAR, size and thickness are the same thing: the width is the cell's,
 * so the only dimension left is height. Ring and circle will need them apart.
 */
export const PROGRESS_THICKNESS = [
    { label: "X-Small", value: "x-small" },
    { label: "Small", value: "small" },
    { label: "Medium", value: "medium" },
    { label: "Large", value: "large" }
];

/** Square ends or rounded, matching the blueprint's `_circular` modifier. */
export const PROGRESS_SHAPES = [
    { label: "Square", value: "" },
    { label: "Rounded", value: "circular" }
];

/** `lightning-progress-ring`'s variants, so the names are familiar. The last
 *  is `base-autocomplete`: base until 100%, then the green check. */
export const PROGRESS_RING_VARIANTS = [
    { label: "Base", value: "base" },
    { label: "Active Step", value: "active-step" },
    { label: "Warning", value: "warning" },
    { label: "Expired", value: "expired" },
    { label: "Base, Complete at 100%", value: "base-autocomplete" }
];

/** The ring blueprint has exactly two sizes. */
export const PROGRESS_RING_SIZES = [
    { label: "Medium", value: "medium" },
    { label: "Large", value: "large" }
];

/** Circle diameter, 2rem to 5rem. Smaller than Avonni's steps, which are
 *  sized for a page rather than a grid row. */
export const PROGRESS_CIRCLE_SIZES = [
    { label: "X-Small", value: "x-small" },
    { label: "Small", value: "small" },
    { label: "Medium", value: "medium" },
    { label: "Large", value: "large" },
    { label: "X-Large", value: "x-large" }
];

/** Circle track thickness, as a share of the diameter. */
export const PROGRESS_CIRCLE_THICKNESS = PROGRESS_CIRCLE_SIZES;

/** Which way the arc runs from 12 o'clock. */
export const PROGRESS_DIRECTIONS = [
    { label: "Fill (Clockwise)", value: "fill" },
    { label: "Drain (Counterclockwise)", value: "drain" }
];
