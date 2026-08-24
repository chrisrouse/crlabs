/**
 * Turns Flow Grid's saved configuration into `lightning-datatable` column
 * definitions, plus synthetic rows for the Grid Studio preview.
 *
 * `buildColumns` is shared on purpose: the Grid Studio preview uses it now, and
 * the Phase 5 runtime component will use the same function, so the preview cannot
 * drift from what the grid actually renders.
 *
 * `buildSampleRows` exists only because Apex is deferred. It infers a type from
 * the field's API name because no describe is available yet. The inference is a
 * preview convenience, never a runtime behavior — Phase 5 replaces it with real
 * field metadata. See TYPE_HINTS for exactly what it guesses.
 */

/** Ordered name-pattern to datatable-type guesses. First match wins. */
const TYPE_HINTS = [
    [/(^|_)id$|^id$/i, "text"],
    [/email/i, "email"],
    [/phone|fax|mobile/i, "phone"],
    [/website|url|link/i, "url"],
    [/percent/i, "percent"],
    [/amount|revenue|price|cost|total|salary|value$/i, "currency"],
    [/datetime|createddate|lastmodifieddate/i, "date"],
    [/date$|_date/i, "date"],
    [/^is[A-Z_]|^has[A-Z_]|active$|deleted$|flag$/i, "boolean"],
    [/count$|number|quantity|qty|score|rating|employees/i, "number"]
];

const SAMPLE_TEXT = [
    "Acme Corporation",
    "Globex",
    "Initech",
    "Umbrella Group",
    "Stark Industries",
    "Wayne Enterprises"
];
const SAMPLE_PICK = ["Technology", "Manufacturing", "Healthcare", "Retail", "Energy", "Education"];

/**
 * Reads the `columnFields` property into an ordered list of field API paths.
 *
 * The kit's field picker persists multiple fields as a JSON array inside a String
 * but a single field as the bare API name, so both shapes are valid input. Any
 * non-empty string that is not JSON is therefore one field, not an error.
 */
export function parseFieldList(raw) {
    if (Array.isArray(raw)) {
        return raw.filter(isNonEmptyString);
    }
    if (!isNonEmptyString(raw)) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter(isNonEmptyString);
        }
        return isNonEmptyString(parsed) ? [parsed] : [];
    } catch {
        return [raw];
    }
}

/** Reads the `columnConfig` property into an attribute map. */
export function parseColumnConfig(raw) {
    if (isPlainObject(raw)) {
        return raw;
    }
    if (!isNonEmptyString(raw)) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

/** Best-effort datatable type for a field path, absent real metadata. */
export function inferType(fieldPath, override) {
    if (override) {
        return override;
    }
    const leaf = String(fieldPath || "")
        .split(".")
        .pop();
    const hit = TYPE_HINTS.find(([pattern]) => pattern.test(leaf));
    return hit ? hit[1] : "text";
}

/** Humanizes `AnnualRevenue` / `Owner.Alias` into a readable default label. */
export function defaultLabel(fieldPath) {
    const leaf = String(fieldPath || "")
        .split(".")
        .pop()
        .replace(/__c$/i, "")
        .replace(/_/g, " ");
    return leaf
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Builds `lightning-datatable` columns.
 *
 * @param {string[]} fields ordered field API paths
 * @param {object} config per-field attribute map from the columnConfig property
 * @param {object} options grid-level flags that affect every column
 * @returns {object[]} datatable column definitions
 */
export function buildColumns(fields, config = {}, options = {}) {
    const { hideHeaderActions = false, allowSort = true, defaultEditable = false } = options;

    return (fields || []).map((field) => {
        const attributes = config?.[field] || {};
        const column = {
            label: attributes.label || defaultLabel(field),
            fieldName: field,
            type: inferType(field, attributes.type),
            sortable: allowSort && !hideHeaderActions,
            editable: attributes.edit ?? defaultEditable,
            wrapText: Boolean(attributes.wrap),
            hideDefaultActions: Boolean(hideHeaderActions)
        };

        if (Number.isFinite(Number(attributes.width)) && attributes.width) {
            column.initialWidth = Number(attributes.width);
        }

        const cellAttributes = {};
        if (attributes.align) {
            cellAttributes.alignment = attributes.align;
        }
        if (attributes.icon) {
            cellAttributes.iconName = attributes.icon;
        }
        if (Object.keys(cellAttributes).length) {
            column.cellAttributes = cellAttributes;
        }

        const typeAttributes = { ...(isPlainObject(attributes.typeAttribs) ? attributes.typeAttribs : {}) };
        if (Number.isFinite(Number(attributes.scale)) && attributes.scale !== null && attributes.scale !== "") {
            typeAttributes.minimumFractionDigits = Number(attributes.scale);
            typeAttributes.maximumFractionDigits = Number(attributes.scale);
        }
        if (Object.keys(typeAttributes).length) {
            column.typeAttributes = typeAttributes;
        }

        if (isPlainObject(attributes.otherAttribs)) {
            Object.assign(column, attributes.otherAttribs);
        }
        if (isPlainObject(attributes.cellAttribs)) {
            column.cellAttributes = { ...(column.cellAttributes || {}), ...attributes.cellAttribs };
        }

        return column;
    });
}

/**
 * Synthetic rows for the preview. Values are deliberately recognizable as fake.
 *
 * @param {string[]} fields ordered field API paths
 * @param {object} config per-field attribute map, for type overrides
 * @param {number} count how many rows to fabricate
 * @param {string} keyField property each row must carry a unique value for
 */
export function buildSampleRows(fields, config = {}, count = 6, keyField = "Id") {
    const rows = [];
    for (let index = 0; index < count; index += 1) {
        const row = { [keyField]: `sample-${index + 1}` };
        (fields || []).forEach((field) => {
            row[field] = sampleValue(inferType(field, config?.[field]?.type), field, index);
        });
        rows.push(row);
    }
    return rows;
}

function sampleValue(type, field, index) {
    switch (type) {
        case "currency":
            return (index + 1) * 12500.5;
        case "number":
            return (index + 1) * 7;
        case "percent":
            return ((index + 1) * 11) / 100;
        case "boolean":
            return index % 2 === 0;
        case "date":
            // Fixed base date: the preview must not change between renders.
            return new Date(Date.UTC(2026, 0, 1 + index * 9)).toISOString();
        case "email":
            return `contact${index + 1}@example.com`;
        case "phone":
            return `(555) 010-${String(1000 + index).slice(-4)}`;
        case "url":
            return `https://example.com/${index + 1}`;
        default:
            return /industry|type|status|stage|category|rating/i.test(field)
                ? SAMPLE_PICK[index % SAMPLE_PICK.length]
                : SAMPLE_TEXT[index % SAMPLE_TEXT.length];
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
