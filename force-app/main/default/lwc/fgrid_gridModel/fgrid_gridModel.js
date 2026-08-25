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
 * Suffix for the synthetic row property holding a record link URL.
 *
 * `lightning-datatable` renders a link with type `url`, which needs the URL in
 * the row rather than derived at render time. `buildRows` populates it.
 */
export const LINK_SUFFIX = "__fgridUrl";

/**
 * Builds `lightning-datatable` columns.
 *
 * Precedence for every column fact is: the admin's explicit `columnConfig`
 * override, then real field metadata from Apex, then a guess from the field's
 * API name. That ordering is what lets one function serve both the Grid Studio
 * preview (no Apex at design time) and the runtime (full describe).
 *
 * @param {string[]} fields ordered field API paths
 * @param {object} config per-field attribute map from the columnConfig property
 * @param {object} options grid-level flags, plus `describeByPath` from
 *        FlowGridController.getGridMetadata when available
 * @returns {object[]} datatable column definitions
 */
export function buildColumns(fields, config = {}, options = {}) {
    const {
        hideHeaderActions = false,
        allowSort = true,
        defaultEditable = false,
        describeByPath = null,
        linkNameField = false,
        openLinksInSameTab = false
    } = options;

    return (fields || []).map((field) => {
        const attributes = config?.[field] || {};
        const describe = describeByPath?.[field] || null;

        const column = {
            label: attributes.label || describe?.label || defaultLabel(field),
            fieldName: field,
            type: attributes.type || describe?.dataType || inferType(field),
            // A field the describe says is unsortable can never be sorted, no
            // matter what the grid-level flags say.
            sortable: allowSort && !hideHeaderActions && describe?.isSortable !== false,
            editable: attributes.edit ?? (describe ? describe.isEditable && defaultEditable : defaultEditable),
            wrapText: Boolean(attributes.wrap),
            hideDefaultActions: Boolean(hideHeaderActions)
        };

        // Picklist values travel to the custom edit cell; the datatable ignores
        // them for a text column.
        if (describe?.picklistOptions?.length) {
            column.fgridPicklistOptions = describe.picklistOptions;
        }
        if (describe && describe.isAccessible === false) {
            column.fgridInaccessible = true;
            column.fgridError = describe.errorMessage || null;
        }

        // Render the object's Name field as a link to the record.
        if (linkNameField && describe?.isNameField) {
            column.type = "url";
            column.fieldName = field + LINK_SUFFIX;
            column.fgridLinkFor = field;
            column.typeAttributes = {
                label: { fieldName: field },
                target: openLinksInSameTab ? "_self" : "_blank"
            };
        }

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

        // Merge onto whatever is already there: a link column set typeAttributes
        // above, and clobbering it would drop the link label and target.
        const typeAttributes = {
            ...(column.typeAttributes || {}),
            ...(isPlainObject(attributes.typeAttribs) ? attributes.typeAttribs : {})
        };
        const scale = firstNumber(attributes.scale, describe?.scale);
        if (scale !== null) {
            typeAttributes.minimumFractionDigits = scale;
            typeAttributes.maximumFractionDigits = scale;
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
 * Flattens real records into datatable rows.
 *
 * `lightning-datatable` looks a column's `fieldName` up directly on the row, so
 * it cannot traverse `Owner.Alias`. Relationship paths are resolved here and
 * stored under the dotted path as a literal key.
 *
 * NOTE: a relationship value only exists if the Flow actually queried it. Flow's
 * "automatically store all fields" covers direct fields only, so a related
 * column will be blank unless the Get Records element selected it explicitly.
 *
 * @param {object[]} records records as the Flow supplied them
 * @param {object[]} columns output of `buildColumns`, for link and path info
 * @param {string} keyField unique row identifier property
 * @returns {object[]} flat rows safe to hand to `lightning-datatable`
 */
export function buildRows(records, columns, keyField = "Id") {
    if (!Array.isArray(records)) {
        return [];
    }
    const paths = (columns || []).map((column) => column.fgridLinkFor || column.fieldName).filter(Boolean);

    return records.map((record, index) => {
        const row = {};
        // Always carry the key, even when it is not a displayed column.
        row[keyField] = resolvePath(record, keyField) ?? `row-${index}`;
        if (record?.Id !== undefined) {
            row.Id = record.Id;
        }

        paths.forEach((path) => {
            row[path] = resolvePath(record, path) ?? null;
        });

        (columns || []).forEach((column) => {
            if (column.fgridLinkFor && row.Id) {
                row[column.fgridLinkFor + LINK_SUFFIX] = `/${row.Id}`;
            }
        });

        return row;
    });
}

/**
 * Sorts rows by one column, leaving the input untouched.
 *
 * Blank values always sort last regardless of direction, which is what a user
 * expects from a column of mostly-populated data.
 *
 * @param {object[]} rows rows from `buildRows`
 * @param {string} fieldName row property to sort on
 * @param {string} direction `asc` or `desc`
 * @param {boolean} caseInsensitive compare text without regard to case
 */
export function sortRows(rows, fieldName, direction = "asc", caseInsensitive = false) {
    if (!Array.isArray(rows) || !fieldName) {
        return rows || [];
    }
    const factor = direction === "desc" ? -1 : 1;

    return [...rows].sort((left, right) => {
        const a = normalizeForSort(left?.[fieldName], caseInsensitive);
        const b = normalizeForSort(right?.[fieldName], caseInsensitive);

        const aBlank = a === null || a === "";
        const bBlank = b === null || b === "";
        if (aBlank && bBlank) {
            return 0;
        }
        if (aBlank) {
            return 1;
        }
        if (bBlank) {
            return -1;
        }
        if (a === b) {
            return 0;
        }
        return (a < b ? -1 : 1) * factor;
    });
}

/** Walks a dotted path through a record, tolerating missing links. */
function resolvePath(record, path) {
    if (!record || !path) {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(record, path)) {
        return record[path];
    }
    return String(path)
        .split(".")
        .reduce((node, segment) => (node === null || node === undefined ? null : node[segment]), record);
}

function normalizeForSort(value, caseInsensitive) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    const text = String(value);
    return caseInsensitive ? text.toLowerCase() : text;
}

/** First of the supplied values that is a finite number, else null. */
function firstNumber(...candidates) {
    for (const candidate of candidates) {
        if (candidate === null || candidate === undefined || candidate === "") {
            continue;
        }
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
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

/* ==================================================================== *
 * Row pipeline
 *
 * Applied in this order, which is what makes the counts behave sensibly:
 *   source -> minus removed -> cap -> search -> filter -> sort -> page
 *
 * The cap (maxNumberOfRows) sits before search and filter deliberately: it is a
 * ceiling on what the grid will handle at all, not a ceiling on results.
 * ==================================================================== */

/**
 * Narrows rows to those matching a free-text term across every visible column.
 *
 * @param {object[]} rows rows from buildRows
 * @param {object[]} columns output of buildColumns, for which values to search
 * @param {string} term text to look for
 * @param {boolean} caseSensitive compare without lowering case
 */
export function searchRows(rows, columns, term, caseSensitive = false) {
    const needle = String(term ?? "").trim();
    if (!Array.isArray(rows) || !needle) {
        return rows || [];
    }
    const target = caseSensitive ? needle : needle.toLowerCase();
    const paths = searchablePaths(columns);

    return rows.filter((row) =>
        paths.some((path) => {
            const value = row?.[path];
            if (value === null || value === undefined) {
                return false;
            }
            const text = caseSensitive ? String(value) : String(value).toLowerCase();
            return text.includes(target);
        })
    );
}

/**
 * Narrows rows by per-column filter text. Every non-empty filter must match,
 * so filters combine with AND.
 *
 * @param {object[]} rows rows from buildRows
 * @param {object} filters map of field path to filter text
 * @param {boolean} caseSensitive compare without lowering case
 */
export function filterRows(rows, filters, caseSensitive = false) {
    if (!Array.isArray(rows) || !filters) {
        return rows || [];
    }
    const active = Object.entries(filters).filter(([, value]) => String(value ?? "").trim() !== "");
    if (!active.length) {
        return rows;
    }

    return rows.filter((row) =>
        active.every(([path, filterValue]) => {
            const raw = row?.[path];
            if (raw === null || raw === undefined) {
                return false;
            }
            const value = caseSensitive ? String(raw) : String(raw).toLowerCase();
            const term = caseSensitive ? String(filterValue).trim() : String(filterValue).trim().toLowerCase();
            return value.includes(term);
        })
    );
}

/**
 * Slices rows into one page and reports the surrounding page state.
 *
 * @param {object[]} rows rows to paginate
 * @param {number} page requested 1-based page number
 * @param {number} perPage rows per page
 * @returns {{rows: object[], page: number, totalPages: number, totalRows: number,
 *            firstRow: number, lastRow: number, isFirstPage: boolean,
 *            isLastPage: boolean}}
 */
export function paginate(rows, page = 1, perPage = 10) {
    const all = Array.isArray(rows) ? rows : [];
    const size = Number(perPage);
    if (!Number.isFinite(size) || size < 1) {
        return onePage(all);
    }

    const totalPages = Math.max(1, Math.ceil(all.length / size));
    // Clamp rather than trusting the caller: deleting or filtering rows can
    // strand the current page past the end.
    const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
    const start = (current - 1) * size;
    const slice = all.slice(start, start + size);

    return {
        rows: slice,
        page: current,
        totalPages,
        totalRows: all.length,
        firstRow: all.length ? start + 1 : 0,
        lastRow: start + slice.length,
        isFirstPage: current === 1,
        isLastPage: current === totalPages
    };
}

/** Name carried on the row-action column and echoed back by onrowaction. */
export const ROW_ACTION_NAME = "fgridRowAction";

/* Row-action defaults, matching the conventions of the component Flow Grid
   replaces so an admin's expectations carry over. */
const REMOVE_LABEL = "Remove Row";
const REMOVE_ICON = "utility:delete";
const FLOW_LABEL = "Run Flow";
const FLOW_ICON = "utility:flow";

/**
 * Adds the row-action column to a column set.
 *
 * @param {object[]} columns columns from buildColumns
 * @param {object} options row-action configuration from the component
 * @returns {object[]} a new column list; the input is untouched
 */
export function withRowActionColumn(columns, options = {}) {
    const {
        actionType = "None",
        display = "Icon",
        position = "Left",
        label,
        iconName,
        color,
        buttonLabel,
        buttonIcon,
        buttonIconPosition = "Left",
        buttonVariant = "neutral"
    } = options;

    const base = Array.isArray(columns) ? [...columns] : [];
    // Remove and Flow are the only actions. Anything else, including a saved
    // configuration from the removed Standard action, gets no column: a button
    // that reports the clicked row duplicated what row selection already
    // provides through the selected-record outputs.
    const isRemove = actionType === "Remove";
    const isFlow = actionType === "Flow";
    if (!isRemove && !isFlow) {
        return base;
    }

    const defaultLabelText = isRemove ? REMOVE_LABEL : FLOW_LABEL;
    const defaultIconName = isRemove ? REMOVE_ICON : FLOW_ICON;
    // Removal reads as destructive, so it defaults to red even when nothing is
    // stored. A contract-level default cannot express this: it would colour the
    // flow action red too.
    const effectiveColor = color || (isRemove ? "Red" : null);
    const column =
        display === "Button"
            ? {
                  type: "button",
                  fieldName: ROW_ACTION_NAME,
                  label: "",
                  hideDefaultActions: true,
                  typeAttributes: {
                      name: ROW_ACTION_NAME,
                      label: buttonLabel || defaultLabelText,
                      variant: buttonVariant,
                      iconName: buttonIcon || undefined,
                      iconPosition: String(buttonIconPosition).toLowerCase()
                  }
              }
            : {
                  type: "button-icon",
                  fieldName: ROW_ACTION_NAME,
                  label: "",
                  fixedWidth: 60,
                  hideDefaultActions: true,
                  cellAttributes: { alignment: "center" },
                  typeAttributes: {
                      name: ROW_ACTION_NAME,
                      iconName: iconName || defaultIconName,
                      title: label || defaultLabelText,
                      alternativeText: label || defaultLabelText,
                      variant: "bare",
                      class: colorClass(effectiveColor)
                  }
              };

    if (String(position).toLowerCase() === "left") {
        base.unshift(column);
    } else {
        base.push(column);
    }
    return base;
}

/** Maps the configured colour name to a class the component's CSS defines. */
function colorClass(color) {
    switch (String(color || "").toLowerCase()) {
        case "green":
            return "fgrid-action_green";
        case "black":
            return "fgrid-action_black";
        case "red":
            return "fgrid-action_red";
        default:
            return undefined;
    }
}

/** Field paths worth searching: real data columns, not generated link URLs. */
function searchablePaths(columns) {
    return (columns || [])
        .filter((column) => column.fieldName !== ROW_ACTION_NAME)
        .map((column) => column.fgridLinkFor || column.fieldName)
        .filter(Boolean);
}

function onePage(rows) {
    return {
        rows,
        page: 1,
        totalPages: 1,
        totalRows: rows.length,
        firstRow: rows.length ? 1 : 0,
        lastRow: rows.length,
        isFirstPage: true,
        isLastPage: true
    };
}
