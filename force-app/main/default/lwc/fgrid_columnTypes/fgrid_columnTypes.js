/**
 * Which display types a column may use, and which attributes that type implies.
 *
 * The column panel used to offer every attribute for every column: decimals and
 * step on a text column, "show the record name" on a number, and a free-text
 * box for the type. This is the model that lets the panel show only what
 * applies -- see flowgrid/design/column-attributes-c.html.
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

/** Everything the grid can render, including our five custom cell types. */
export const COLUMN_TYPES = [
    { label: "Text", value: "text" },
    { label: "Long Text", value: "fgridLongText" },
    { label: "Number", value: "number" },
    { label: "Currency", value: "currency" },
    { label: "Percent", value: "percent" },
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
    CURRENCY: ["currency", "number", "percent", "text"],
    DOUBLE: ["number", "currency", "percent", "text"],
    INTEGER: ["number", "currency", "percent", "text"],
    LONG: ["number", "currency", "percent", "text"],
    PERCENT: ["percent", "number", "text"],

    DATE: ["date-local", "date", "text"],
    DATETIME: ["date", "date-local", "text"],
    TIME: ["fgridTime", "text"],

    BOOLEAN: ["boolean", "text"],
    EMAIL: ["email", "text"],
    PHONE: ["phone", "text"],
    URL: ["url", "text"],

    PICKLIST: ["fgridPicklist", "text"],
    MULTIPICKLIST: ["fgridMultiPicklist", "text"],
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
export function typeOptionsFor(displayType) {
    const allowed = TYPES_FOR_DISPLAY_TYPE[String(displayType || "").toUpperCase()];
    if (!allowed) {
        return [...COLUMN_TYPES];
    }
    // Ordered by the map, not by COLUMN_TYPES, so the natural display is first.
    return allowed.map((value) => COLUMN_TYPES.find((type) => type.value === value)).filter(Boolean);
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
