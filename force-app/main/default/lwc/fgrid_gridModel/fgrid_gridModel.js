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
import {
    parseFormatRules,
    conditionFields,
    matchFormatRule,
    migrateColumnColors,
    colorSlotsFor,
    colorClassFor,
    normalizeHex
} from "c/fgrid_formatRules";

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
 *
 * A user-defined object has no object to describe, so its columns are typed by
 * hand as a comma-separated list instead of picked. No Salesforce field API path
 * can contain a comma, so splitting on one cannot corrupt a real single field.
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
        return splitFieldNames(raw);
    }
}

/** Splits a hand-typed field list, tolerating stray spaces and trailing commas. */
function splitFieldNames(raw) {
    return raw
        .split(",")
        .map((name) => name.trim())
        .filter(isNonEmptyString);
}

/**
 * Reads the `columnConfig` property into an attribute map.
 *
 * Also the one place saved colors are upgraded from the old named palette to
 * hex. The grid, the Studio preview and the column panel all read through
 * here, so an old config renders unchanged and is rewritten in the new shape
 * the next time the panel saves it.
 */
export function parseColumnConfig(raw) {
    return migrateConfig(readColumnConfig(raw));
}

function readColumnConfig(raw) {
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

function migrateConfig(config) {
    return Object.fromEntries(
        Object.entries(config).map(([field, attributes]) => [field, migrateColumnColors(attributes)])
    );
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

/** Row field holding the conditional-formatting class for one column. */
export const FORMAT_SUFFIX = "__fgridFormat";

/** Row fields a progress display reads: the 0-100 value, its label, its width. */
export const PROGRESS_SUFFIX = "__fgridProgress";

/** The displays that draw a gauge, whose color goes on the fill. */
const GAUGE_TYPES = ["fgridProgressBar", "fgridProgressRing", "fgridProgressCircle"];

/** 100% as a path rather than a <circle>, so the template has no branch. Two
 *  half-arcs, because an arc whose ends meet is not drawn at all. */
const FULL_RING_PATH = "M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0 Z";

/**
 * How far from the center the ring's progress head travels, in the head's own
 * viewBox. The head box is the ring plus 0.1875rem each side, so for diameter D
 * and that inset i the track's centerline is (D - i) / (D + 2i): 21/30 and 29/38.
 * lightning-progress-ring measures this with getComputedStyle; a cell template
 * cannot, and the two sizes are fixed, so it is worked out once here.
 */
const RING_HEAD_RADIUS = { medium: 0.7, large: 0.7632 };

/** The blueprint's variant icons, as lightning-progress-ring draws them. */
const RING_ICONS = {
    warning: {
        path: "M23.7 19.6L13.2 2.5c-.6-.9-1.8-.9-2.4 0L.3 19.6c-.7 1.1 0 2.6 1.1 2.6h21.2c1.1 0 1.8-1.5 1.1-2.6zM12 18.5c-.8 0-1.4-.6-1.4-1.4s.6-1.4 1.4-1.4 1.4.6 1.4 1.4-.6 1.4-1.4 1.4zm1.4-4.2c0 .3-.2.5-.5.5h-1.8c-.3 0-.5-.2-.5-.5v-6c0-.3.2-.5.5-.5h1.8c.3 0 .5.2.5.5v6z",
        className: "slds-icon_container slds-icon-utility-warning",
        label: "Warning"
    },
    expired: {
        path: "M12 .9C5.9.9.9 5.9.9 12s5 11.1 11.1 11.1 11.1-5 11.1-11.1S18.1.9 12 .9zM3.7 12c0-4.6 3.7-8.3 8.3-8.3 1.8 0 3.5.5 4.8 1.5L5.2 16.8c-1-1.3-1.5-3-1.5-4.8zm8.3 8.3c-1.8 0-3.5-.5-4.8-1.5L18.8 7.2c1 1.3 1.5 3 1.5 4.8 0 4.6-3.7 8.3-8.3 8.3z",
        className: "slds-icon_container slds-icon-utility-error",
        label: "Expired"
    },
    complete: {
        path: "M8.8 19.6L1.2 12c-.3-.3-.3-.8 0-1.1l1-1c.3-.3.8-.3 1 0L9 15.7c.1.2.5.2.6 0L20.9 4.4c.2-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L9.8 19.6c-.2.3-.7.3-1 0z",
        className: "slds-icon_container slds-icon-utility-success",
        label: "Complete"
    }
};

const round4 = (number) => Math.round(number * 10000) / 10000;

/**
 * The ring's arc for a 0-100 value: the path, and where it ends.
 *
 * SLDS gives `M 1 0 A 1 1 0 {isLong} 1 {cos} {sin} L 0 0`. Direction follows
 * lightning-progress-ring's source rather than a guess: fill uses sweep 0 and
 * negates y, drain uses sweep 1 and keeps it. The blueprint's rotate/flip then
 * starts both at 12 o'clock, fill clockwise. Drain at 88% gives the blueprint's
 * own "0.73 -0.68".
 */
export function ringArc(percent, drain) {
    const angle = 2 * Math.PI * (percent / 100);
    const x = round4(Math.cos(angle));
    const y = round4(Math.sin(angle) * (drain ? 1 : -1));
    if (percent >= 100) {
        return { path: FULL_RING_PATH, x, y };
    }
    const isLong = percent > 50 ? 1 : 0;
    const sweep = drain ? 1 : 0;
    return { path: `M 1 0 A 1 1 0 ${isLong} ${sweep} ${x} ${y} L 0 0`, x, y };
}

/** Row field holding a multi-picklist's value as an array, for the checkbox
 *  group, whose `value` is an array while the record stores a `;` string. */
export const PICKLIST_SELECTED_SUFFIX = "__fgridSelected";

/** Row field holding the option list a picklist cell offers, when it varies by row. */
export const PICKLIST_OPTIONS_SUFFIX = "__fgridOptions";

/** Row field marking a dependent picklist that has nothing to offer yet. */
export const PICKLIST_LOCKED_SUFFIX = "__fgridLocked";

/** Master record type, used when an object has none or record-type filtering is off. */
export const MASTER_RECORD_TYPE_ID = "012000000000000AAA";

/**
 * Options for one picklist, given a record type payload and a controlling value.
 *
 * Two filters, both out of the same UI API payload:
 *
 *   RECORD TYPE — `picklistFieldValues[field].values` is already narrowed to the
 *   record type the payload was fetched for, so holding the right payload IS the
 *   filtering.
 *
 *   DEPENDENCY — `validFor` lists indexes into `controllerValues`, which maps each
 *   controlling value to an index. A value is offered when its `validFor` contains the
 *   index of this row's controlling value. A dependent picklist whose controlling
 *   value is blank or unrecognised offers NOTHING, and an empty list is what locks the
 *   cell.
 *
 * Returns null when the payload cannot answer, so the caller falls back to the
 * describe values rather than showing an empty list it never intended.
 */
export function picklistValuesFor(fieldValues, controllerField, controllingValue) {
    if (!fieldValues || !Array.isArray(fieldValues.values)) {
        return null;
    }
    if (!controllerField) {
        return fieldValues.values.map((entry) => ({ label: entry.label, value: entry.value }));
    }

    const index = fieldValues.controllerValues?.[controllingValue];
    if (index === undefined || index === null) {
        return [];
    }
    return fieldValues.values
        .filter((entry) => Array.isArray(entry.validFor) && entry.validFor.includes(index))
        .map((entry) => ({ label: entry.label, value: entry.value }));
}

/**
 * Salesforce stores a Percent field as whole percent — 25 means 25% — while the
 * datatable's `percent` type multiplies by 100 to display. Left alone, a stored 25
 * renders as "2500%".
 *
 * So the value is divided on the way in and multiplied on the way back out, which is
 * what the component this replaces does. Exported so the runtime can reverse it when
 * an edit is saved.
 */
export const PERCENT_DISPLAY_DIVISOR = 100;

/** Converts a stored percent to the fraction the datatable renders. */
export function percentToFraction(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number / PERCENT_DISPLAY_DIVISOR : value;
}

/** Converts an edited fraction back to the whole percent the field stores. */
export function fractionToPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number * PERCENT_DISPLAY_DIVISOR : value;
}

/** Separator Salesforce uses inside a multi-select picklist value. */
export const MULTI_PICKLIST_SEPARATOR = ";";

/** Row field holding the text shown in a lookup cell — the parent record's name
 *  when it is available, otherwise the raw Id. */
export const LOOKUP_LABEL_SUFFIX = "__fgridLookupLabel";

/**
 * Datatable types that cannot wrap, per the component reference: wrapping is not
 * supported for row numbers, `action`, `boolean`, `button`, `button-icon` or
 * `date-local`. Setting wrapText on these does nothing, so it is not set.
 */
const WRAP_UNSUPPORTED_TYPES = new Set(["action", "boolean", "button", "button-icon", "date-local"]);

/**
 * Decides whether a column can be edited.
 *
 * Two gates, and the order matters: the config opts a column IN, and the describe
 * can always veto. A field Salesforce reports as non-editable — a record Id, a
 * formula, an auto-number, a compound Address, a polymorphic lookup — stays
 * read-only no matter what the column config says.
 */
function resolveEditable(attributes, describe, defaultEditable) {
    const requested = attributes.edit ?? (describe ? describe.isEditable && defaultEditable : defaultEditable);
    if (!requested) {
        return false;
    }
    return describe ? describe.isEditable !== false : true;
}

/** Consecutive pages shown around the current one before truncating. */
/**
 * Floor for a column's computed width, in pixels, passed to the datatable's
 * `min-column-width`.
 *
 * The datatable divides the available width between columns and clamps each at
 * this floor; once the floors no longer fit, it scrolls horizontally instead of
 * shrinking further. So columns still expand to fill a wide container -- the
 * floor only bites when there is not enough room -- which is why this needs no
 * `column-widths-mode` change to work.
 *
 * The platform's own default is 50px, which is narrow enough that a handful of
 * columns in a quick action or utility bar collapse to roughly one word each and
 * read as a rendering fault rather than as "this will not fit here".
 *
 * The trade is real: raising the floor makes a wide grid scroll horizontally in
 * cases that previously squeezed to fit. That is the intended outcome -- a
 * scrollbar is legible and a 50px column is not -- but it IS a behavior change,
 * so keep this as one number rather than spreading it across the templates.
 */
export const MIN_COLUMN_WIDTH = 100;

export const PAGE_WINDOW = 4;

/**
 * Page count at or below which every number is shown.
 *
 * Not a taste call. The widest truncated form is eight slots — first, ellipsis, four
 * window pages, ellipsis, last — so at eight pages or fewer, listing every page is
 * never wider. Truncating there would hide pages and save nothing.
 */
export const MAX_PAGES_WITHOUT_TRUNCATION = 8;

/** Page sizes the runtime selector offers. Deliberately stops at 100: 200 rows is
 *  the DOM cost scroll mode exists to avoid. An admin can still set 200 directly. */
export const ROWS_PER_PAGE_STEPS = [10, 25, 50, 100];

/**
 * Builds the page navigation: numbers plus ellipsis markers.
 *
 * Page 1 and the last page are always present, so the total is always readable and
 * either end is one click away.
 *
 * The window is EVEN, so it cannot center the current page. It leans one before and
 * two after — page 5 of 32 gives 4 5 6 7 — biasing toward where the user is heading.
 *
 * @param {number} current 1-based current page
 * @param {number} totalPages total page count
 * @returns {object[]} `{ key, isGap, page, isCurrent }` in render order
 */
export function paginationItems(current, totalPages) {
    const total = Math.max(1, Math.floor(Number(totalPages) || 1));
    const page = Math.min(total, Math.max(1, Math.floor(Number(current) || 1)));

    const pageItem = (value) => ({
        key: `page-${value}`,
        isGap: false,
        page: value,
        isCurrent: value === page
    });

    if (total <= MAX_PAGES_WITHOUT_TRUNCATION) {
        return Array.from({ length: total }, (_, i) => pageItem(i + 1));
    }

    // Clamped so the window never runs past either end.
    const start = Math.min(Math.max(page - 1, 1), total - PAGE_WINDOW + 1);
    const end = start + PAGE_WINDOW - 1;

    const items = [];
    if (start > 1) {
        items.push(pageItem(1));
        // Only a gap when something is actually skipped: at start === 2 the window
        // already follows page 1, and an ellipsis hiding nothing reads as a bug.
        if (start > 2) {
            items.push({ key: "gap-start", isGap: true });
        }
    }
    for (let value = start; value <= end; value += 1) {
        items.push(pageItem(value));
    }
    if (end < total) {
        if (end < total - 1) {
            items.push({ key: "gap-end", isGap: true });
        }
        items.push(pageItem(total));
    }
    return items;
}

/**
 * Page sizes to offer, given what the admin configured and the row cap.
 *
 * Two rules beyond the fixed steps. Options above `maxNumberOfRows` are dropped,
 * because every one of them would produce a single page and appear to do nothing.
 * And the admin's own `recordsPerPage` is inserted if it is not a step, so a
 * configured 15 is representable — otherwise the select would show blank or snap to
 * another value and silently change their page size on load.
 */
export function rowsPerPageOptions(configured, maxRows) {
    const capRaw = Number(maxRows);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : Infinity;

    const values = new Set(ROWS_PER_PAGE_STEPS.filter((step) => step <= cap));
    const current = Number(configured);
    if (Number.isFinite(current) && current > 0 && current <= cap) {
        values.add(current);
    }
    // A cap smaller than every step would otherwise leave nothing to choose from.
    if (!values.size) {
        values.add(Number.isFinite(cap) ? cap : ROWS_PER_PAGE_STEPS[0]);
    }
    return [...values].sort((a, b) => a - b).map((value) => ({ label: String(value), value: String(value) }));
}

/** Header-menu action name that opens the filter editor for a column. */
export const FILTER_ACTION_NAME = "fgridFilter";

/** Header-menu action that moves blank values to the top of a sort. */
export const BLANKS_FIRST_ACTION_NAME = "fgridBlanksFirst";

/** Name field assumed on a lookup's target object. Correct for the overwhelming
 *  majority; objects keyed on something else (CaseNumber, Subject) would need the
 *  target's own describe, which is not worth a describe call per lookup column. */
const LOOKUP_NAME_FIELD = "Name";

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
        openLinksInSameTab = false,
        allowNone = true,
        forceReadOnly = false,
        filterActions = false,
        readOnlyIcon = false,
        blanksFirstFields = [],
        /** True when picklist options can differ row to row, so they move to a row field. */
        perRowPicklists = false,
        dependentPicklistIcon = null,
        userTimeZone = null
    } = options;

    // Which slot each color occupies. The grid derives the same map to set the
    // custom properties, so the classes named here resolve to real colors.
    const colorSlots = colorSlotsFor(fields, config);

    return (fields || []).map((field, index) => {
        // Idempotent, so a config parseColumnConfig already upgraded passes
        // through untouched and one handed in raw still renders its colors.
        const attributes = migrateColumnColors(config?.[field] || {});
        const describe = describeByPath?.[field] || null;
        // What the admin configured, before the Studio preview's blanket read-only is
        // applied. The lock icon reads this so the preview shows the same locks the
        // runtime will.
        const configuredEditable = resolveEditable(attributes, describe, defaultEditable);

        const column = {
            label: attributes.label || describe?.label || defaultLabel(field),
            fieldName: field,
            // The field this column shows, kept even where `fieldName` is later
            // pointed at a synthetic row field (a link, a lookup label). The
            // Studio's preview reads it to drag a column by its field.
            fgridField: field,
            // Kept in the column list, so the column is still searched, still
            // carried on every row for rules and filters -- but not drawn.
            // Consumers hand the datatable `visibleColumns(columns)`.
            fgridHidden: attributes.hidden === true,
            type: attributes.type || describe?.dataType || inferType(field),
            // A field the describe says is unsortable can never be sorted, no
            // matter what the grid-level flags say.
            sortable: allowSort && !hideHeaderActions && describe?.isSortable !== false,
            // `edit` in a column's config OPTS IN; it cannot overrule the describe.
            //
            // It used to override outright, which is how a record Id ended up with a
            // working text box over an 18-character key, and how a Date column got an
            // edit pencil the datatable refuses to honor. Adding types to Apex's
            // NON_EDITABLE_TYPES only moved the DEFAULT, so an explicit tick still
            // produced a broken cell.
            //
            // The override existed because MULTIPICKLIST and REFERENCE were once in
            // that set and needed forcing past. Both have real editors now, so nothing
            // legitimately needs to overrule the describe any more.
            //
            // Absent a describe — a user-defined object, or the Studio preview before
            // Apex answers — the config is still trusted, because there is nothing to
            // check it against.
            // forceReadOnly is the Studio preview, which cannot edit anything. It is
            // applied HERE rather than inside resolveEditable so the read-only lock
            // below can still ask whether the column is configured as editable — the
            // preview used to put a lock on every column, including the ones an admin
            // had just ticked Edit on.
            editable: !forceReadOnly && configuredEditable,
            hideDefaultActions: Boolean(hideHeaderActions),
            // Distinct from fieldName, which a linked Name column rewrites to a
            // generated URL field. Also what keeps two columns on the SAME field
            // addressable independently, which the reference calls for.
            columnKey: `${field}__${index}`
        };

        // Picklist values travel to the custom edit cell; the datatable ignores
        // them for a text column.
        if (describe?.picklistOptions?.length) {
            column.fgridPicklistOptions = describe.picklistOptions;
        }

        // Filtering is entered from the column's own header menu, which is the one
        // per-column affordance lightning-datatable actually supports — there is no
        // header-icon API, and it costs no horizontal space, which matters in a
        // narrow Experience Cloud column.
        //
        // The menu item is deliberately stateless: what IS filtered is reported by
        // the pills above the table, so this label never has to change and
        // buildColumns stays free of runtime filter state.
        const actions = [];
        if (filterActions && attributes.filter === true && !hideHeaderActions) {
            actions.push({ label: "Filter…", name: FILTER_ACTION_NAME, iconName: "utility:filterList" });
        }
        // Offered on any sortable column, because it changes nothing until that
        // column is the one being sorted. `checked` is what draws the tick.
        if (column.sortable && !hideHeaderActions) {
            actions.push({
                label: "Show Blanks First",
                name: BLANKS_FIRST_ACTION_NAME,
                checked: blanksFirstFields.includes(field)
            });
        }
        if (actions.length) {
            column.actions = actions;
        }

        // A custom cell type ONLY when the column is editable. A read-only
        // picklist renders identically to text, so routing it through our own
        // template would add a rendering path for no visible gain.
        //
        // ACTIVE VALUES ONLY, and therefore one list per column rather than per row.
        //
        // A stored value no longer in the active list used to be injected into that
        // row's own options so it could be re-chosen. That is not how Salesforce
        // behaves: a record page offers the active values only, and once the user picks
        // a different one the inactive value is gone unless they cancel. Matching the
        // platform also removes the reason the list was addressed as a row field, so
        // the per-row option machinery went with it.
        if (column.editable && describe?.picklistOptions?.length) {
            const isMulti = describe.displayType === "MULTIPICKLIST";
            column.type = isMulti ? "fgridMultiPicklist" : "fgridPicklist";
            column.fgridIsMultiPicklist = isMulti;
            // --None-- is meaningless for a checkbox group, where clearing every
            // box already expresses "no value".
            column.fgridAllowNone = allowNone && !isMulti;
            const none = column.fgridAllowNone ? [{ label: "--None--", value: "" }] : [];
            column.fgridPicklistNone = none;
            column.fgridControllerField = describe.controllerField || null;

            // Options move to a ROW field only when they can differ between rows —
            // a record-type filter, or a dependency on another field's value. Without
            // either, one array on the column serves every row and costs nothing.
            const varies = perRowPicklists || Boolean(describe.controllerField);
            column.typeAttributes = {
                ...(column.typeAttributes || {}),
                options: varies
                    ? { fieldName: field + PICKLIST_OPTIONS_SUFFIX }
                    : [...none, ...describe.picklistOptions],
                selected: { fieldName: field + PICKLIST_SELECTED_SUFFIX },
                locked: { fieldName: field + PICKLIST_LOCKED_SUFFIX },
                lockedText: describe.controllerField ? `Set ${describe.controllerField} first` : null
            };
        }

        // A dependent picklist says so in its header, whether or not THIS surface can
        // edit it. Marking the column is a fact about the field; the Studio preview
        // forces every column read-only, so testing editability here would have shown
        // the mark at runtime and hidden it in the preview — the same split the
        // read-only lock had.
        if (describe?.controllerField && dependentPicklistIcon) {
            column.iconName = dependentPicklistIcon;
        }
        if (describe && describe.isAccessible === false) {
            column.fgridInaccessible = true;
            column.fgridError = describe.errorMessage || null;
        }

        // TIME always gets its own cell, unlike the picklist and long text cells which
        // only apply when editable. A read-only Time is NOT indistinguishable from
        // text: the datatable has no time type, so it would print `14:30:00.000Z`
        // verbatim. The cell's display template hands the value to
        // lightning-formatted-time, which needs no help from here.
        if (describe?.displayType === "TIME") {
            column.type = "fgridTime";
            column.fgridIsTime = true;
        }

        // Long text gets its own cell ONLY when editable, for the same reason
        // picklists do: read-only it is indistinguishable from text, and the point of
        // the custom type is the textarea editor rather than the display.
        if (column.editable && describe?.isLongText) {
            column.type = "fgridLongText";
            column.typeAttributes = {
                ...(column.typeAttributes || {}),
                // From the field's own describe, so the editor cannot accept more
                // than the field will store.
                maxLength: describe.length || null
            };
        }

        // Lookups get their own cell type so the parent's NAME can be shown while
        // the cell still stores and edits the Id. The two display options mirror
        // the standard datatable's: "Show record name" and "Link to record", both
        // on by default, both per column.
        if (describe?.displayType === "REFERENCE") {
            const showName = attributes.showName !== false;
            const linkToRecord = attributes.link !== false;
            column.type = "fgridLookup";
            // Null relationship means "display the Id", either because the admin
            // turned the name off or because the field has no relationship name.
            column.fgridLookupRelationship = showName ? describe.relationshipName || null : null;
            column.fgridLookupLink = linkToRecord;
            // Search, sort and filter run against the text the user can actually
            // see, not the stored Id. Without this, typing a visible account name
            // into the search box matches nothing.
            column.fgridTextField = field + LOOKUP_LABEL_SUFFIX;
            column.typeAttributes = {
                ...(column.typeAttributes || {}),
                label: { fieldName: field + LOOKUP_LABEL_SUFFIX },
                url: { fieldName: field + LINK_SUFFIX },
                link: linkToRecord,
                objectApiName: describe.referenceTo || null
            };
            // A record picker searches one object. Without a single target there is
            // nothing to search, so editing is refused even if the column config
            // asked for it — a polymorphic lookup would otherwise get an editor
            // that cannot work.
            if (!describe.referenceTo) {
                column.editable = false;
                column.fgridNotEditableReason = describe.isPolymorphic
                    ? "This lookup points at more than one object, so it cannot be edited in the grid."
                    : null;
            }
        }

        // Render the object's Name field as a link to the record — UNLESS the admin
        // made it editable.
        //
        // A link column's fieldName is rewritten to the generated URL field so the
        // anchor has an href, and the inline editor binds to fieldName. Linking an
        // editable Name column therefore put the record URL in the edit box: the user
        // saw "/001Ws000002NujxIAC" where the account name should have been, and
        // saving would have written that string over the name.
        //
        // Editing wins because it is the more deliberate setting. Linking the Name
        // field is on by default; ticking Edit on a column is something an admin does
        // on purpose. Tested against configuredEditable rather than column.editable so
        // the Studio preview, which forces every column read-only, still shows the
        // same choice the runtime will make.
        if (linkNameField && describe?.isNameField && !configuredEditable) {
            column.type = "url";
            column.fieldName = field + LINK_SUFFIX;
            column.fgridLinkFor = field;
            column.typeAttributes = {
                label: { fieldName: field },
                target: openLinksInSameTab ? "_self" : "_blank"
            };
        }

        // ALWAYS initialWidth, never fixedWidth. A width is a starting point that
        // still expands and contracts with the window or parent container; a
        // `fixedWidth` column is exact and refuses to reflow, which shows up as
        // horizontal overflow the moment the window narrows past the sum of the
        // pinned columns.
        //
        // This used to branch on a `flex` attribute — initialWidth when set,
        // fixedWidth when not — on a misreading of what Flex meant. It means "this
        // column has no width of its own, so share the space", which in this editor
        // is what an empty Width field already says. The attribute was redundant, and
        // the fixedWidth half was a regression: the original component never used
        // fixedWidth at all, so a width that had always been flexible became locked.
        // A stored `flex` value is now ignored.
        const width = Number(attributes.width);
        if (Number.isFinite(width) && width > 0) {
            column.initialWidth = width;
        }

        const cellAttributes = {};
        if (attributes.align) {
            cellAttributes.alignment = attributes.align;
        }
        // A CELL icon: drawn in every row of the column, beside the value.
        if (attributes.icon) {
            cellAttributes.iconName = attributes.icon;
        }
        // A HEADER icon, which is a different thing and a different property.
        // `hideLabel` swaps the header TEXT for that icon, and is documented as
        // only working paired with one -- on its own the text stays and
        // truncates, which is worse than either. So it is ignored without an
        // icon rather than written and silently doing nothing.
        if (attributes.headerIcon) {
            column.iconName = attributes.headerIcon;
            if (attributes.hideLabel) {
                column.hideLabel = true;
            }
        }
        // CONDITIONAL FORMATTING, cell half. Runs BEFORE the attribute bags are
        // attached below: when a column has no other cell attributes the bag is
        // empty and never attached at all, so a class written after that point
        // is silently dropped.
        //
        // Two modes, exclusive by design. Per column is one fixed class,
        // resolved here. Conditional needs a value per ROW, so the class name
        // is carried in a synthetic row field and pointed at with
        // `{ fieldName }` -- the same indirection the component we replace
        // uses, and what makes rules possible without a custom cell type for
        // every display.
        //
        // The rules, and the fields they TEST, are parked on the column:
        // buildRows is where a row exists to evaluate them against.
        // Each condition learns what kind of value it compares. The panel never
        // stored one, so every condition used to be read as text, and "less
        // than 30" became "contains 30": 20 did not match, 300 did.
        const formatRules = withConditionKinds(parseFormatRules(attributes.format), config, describeByPath);
        // A badged picklist draws its own span, so its color belongs on the
        // badge; coloring the cell would paint around it. The typeAttributes
        // half of that is set further down, where that bag exists.
        const isBadged =
            Boolean(attributes.badge) && (column.type === "fgridPicklist" || column.type === "fgridMultiPicklist");

        // A GAUGE takes its color on the fill, not the cell: our own template
        // draws it, so it is an inline style rather than a slot class, and
        // painting the cell behind the ring as well would be noise.
        if (GAUGE_TYPES.includes(column.type)) {
            column.fgridGaugeColor = attributes.colorMode === "column" ? normalizeHex(attributes.columnColor) : null;
            if (attributes.colorMode !== "column" && formatRules.length) {
                column.fgridFormatRules = formatRules;
                column.fgridFormatFields = conditionFields(formatRules);
                column.fgridGaugeRules = true;
            }
        } else if (attributes.colorMode === "column" && attributes.columnColor) {
            const columnClass = colorClassFor(
                { color: attributes.columnColor, textOnly: attributes.columnTextOnly },
                colorSlots
            );
            if (columnClass) {
                cellAttributes.class = columnClass;
            }
        } else if (formatRules.length) {
            // Each rule's class is resolved now, while the slots are in hand;
            // buildRows only has to pick the rule that matched.
            column.fgridFormatRules = formatRules.map((rule) => ({
                ...rule,
                fgridClass: colorClassFor(rule, colorSlots)
            }));
            column.fgridFormatKey = `${field}${FORMAT_SUFFIX}`;
            // A rule may test a column that is not displayed, so buildRows has
            // to carry those fields too or the rule silently never matches.
            column.fgridFormatFields = conditionFields(formatRules);
            column.fgridBadgeFormat = isBadged;
            if (!isBadged) {
                cellAttributes.class = { fieldName: column.fgridFormatKey };
            }
        }

        if (Object.keys(cellAttributes).length) {
            column.cellAttributes = cellAttributes;
        }

        // Merge onto whatever is already there: a link column set typeAttributes
        // above, and clobbering it would drop the link label and target.
        const hasTypeOverrides =
            isPlainObject(attributes.typeAttribs) && Object.keys(attributes.typeAttribs).length > 0;
        const typeAttributes = {
            ...(column.typeAttributes || {}),
            ...(hasTypeOverrides ? attributes.typeAttribs : {})
        };

        // ------------------------------ DATES ------------------------------
        //
        // `date` and `date-local` are both lightning-formatted-date-time, and the
        // difference is the whole reason a Date and a Datetime are typed apart:
        //   date-local  no timezone conversion, and it IGNORES typeAttributes
        //   date        converts to the running user's zone, and honors them
        //
        // A DATETIME needs the time shown. With no typeAttributes the component uses
        // a medium DATE format, so a Datetime rendered as just "Apr 18, 2024" and the
        // time was simply invisible. Defaults are supplied rather than forced, so an
        // admin's own typeAttribs still win.
        if (column.type === "date" && !hasTypeOverrides) {
            Object.assign(typeAttributes, {
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
            });
        }

        // Render in the user's SALESFORCE timezone, not their computer's. The two
        // disagree whenever a laptop clock differs from the user record — travel, or
        // simply never having changed it — and the cell would then be out by the
        // difference from every other date in the org. Stating the zone removes the
        // guess. Only ever a default: an explicit typeAttribs timeZone still wins.
        if (column.type === "date" && userTimeZone && !typeAttributes.timeZone) {
            typeAttributes.timeZone = userTimeZone;
        }

        // A Date column asked to format itself has to move to `date`, because
        // date-local ignores typeAttributes entirely — and plain `date` would then
        // convert a date-only value into the user's zone and can show the wrong day.
        // `timeZone: "UTC"` is exactly what the component reference prescribes for a
        // date-only value, so the day survives the switch.
        if (column.type === "date-local" && hasTypeOverrides) {
            column.type = "date";
            typeAttributes.timeZone = typeAttributes.timeZone || "UTC";
        }
        // DECIMALS. `minimumFractionDigits` and `maximumFractionDigits` are what
        // the datatable actually takes; the older `scale` was our own single
        // value that set both at once. Still read, so a saved config keeps
        // working -- the editor only writes the pair now, and `scale` fades out
        // as columns are re-edited. An explicit value wins over it, and both
        // win over the describe.
        const scale = firstNumber(attributes.scale, describe?.scale);
        const minDecimals = firstNumber(attributes.minDecimals, scale);
        const maxDecimals = firstNumber(attributes.maxDecimals, scale);
        if (minDecimals !== null) {
            typeAttributes.minimumFractionDigits = minDecimals;
        }
        if (maxDecimals !== null) {
            typeAttributes.maximumFractionDigits = maxDecimals;
        }
        const minIntegerDigits = firstNumber(attributes.minIntegerDigits);
        if (minIntegerDigits !== null) {
            typeAttributes.minimumIntegerDigits = minIntegerDigits;
        }
        // CURRENCY. Both are only meaningful on a currency column, and
        // `currencyCode` only in a multi-currency org -- the editor decides
        // whether to offer them. Passed straight through either way: a code
        // stored against a column that later stops being a currency is inert,
        // not an error.
        if (attributes.currencyCode) {
            typeAttributes.currencyCode = attributes.currencyCode;
        }
        if (attributes.currencyDisplayAs) {
            typeAttributes.currencyDisplayAs = attributes.currencyDisplayAs;
        }
        // Inline-edit granularity for currency, number and percent. Without it the
        // editor snaps to the default 0.01, which silently rounds a value needing
        // more precision.
        const step = firstNumber(attributes.step);
        if (step !== null) {
            typeAttributes.step = step;
        }
        // Picklist values drawn as SLDS badges rather than plain text. Handled
        // by our own cell template, so unlike a `cellAttributes.class` it is
        // immune to the row-hover repaint -- hover recolors the cell, never a
        // nested span. See repro/datatable-cell-colour/.
        // PROGRESS. The blueprint's classes are fixed per column, so they are
        // resolved once here; only the value, its label and the fill width
        // change per row, and those are carried as row fields below.
        //
        // The value is NOT converted to a fraction the way the datatable's
        // `percent` type needs. A Salesforce Percent field stores 25 for 25%,
        // which is already what a progress bar wants -- and the conversion in
        // buildRows is keyed on `type === "percent"`, so this display skips it
        // by construction. Worth knowing before renaming either type.
        if (column.type === "fgridProgressBar") {
            const thickness = attributes.progressThickness || "medium";
            const rounded = attributes.progressShape === "circular" ? " slds-progress-bar_circular" : "";
            typeAttributes.barClass = `slds-progress-bar slds-progress-bar_${thickness}${rounded}`;
            typeAttributes.fillClass = "slds-progress-bar__value";
            typeAttributes.showValue = attributes.showProgressValue !== false;

            const progressKey = `${field}${PROGRESS_SUFFIX}`;
            column.fgridProgressKey = progressKey;
            typeAttributes.progressValue = { fieldName: progressKey };
            typeAttributes.progressLabel = { fieldName: `${progressKey}Label` };
            typeAttributes.progressStyle = { fieldName: `${progressKey}Style` };
            // A gauge is a reading, not an input, and the type has no edit
            // template. Forcing it off here beats a pencil that does nothing.
            column.editable = false;
        }

        // RING and CIRCLE: one template, so the difference is which of these
        // are set. Everything that varies with the value -- the arc, the head,
        // and the complete state -- is a row field, filled in buildRows from
        // `column.fgridRing`. Same whole-percent value as the bar, same reason.
        if (column.type === "fgridProgressRing" || column.type === "fgridProgressCircle") {
            const isCircle = column.type === "fgridProgressCircle";
            const showValue = attributes.showProgressValue !== false;
            let ringClass = "slds-progress-ring";
            let size = "medium";
            let variant = "base";
            if (isCircle) {
                size = attributes.progressCircleSize || "medium";
                const thickness = attributes.progressCircleThickness || "medium";
                ringClass += ` fgridCircle fgridCircle_${size} fgridCircleThickness_${thickness}`;
            } else {
                size = attributes.progressRingSize === "large" ? "large" : "medium";
                variant = attributes.progressRingVariant || "base";
                if (size === "large") {
                    ringClass += " slds-progress-ring_large";
                }
                if (["active-step", "warning", "expired"].includes(variant)) {
                    ringClass += ` slds-progress-ring_${variant}`;
                }
            }
            column.fgridRing = {
                ringClass,
                variant,
                drain: attributes.progressDirection === "drain",
                hideIcon: Boolean(attributes.hideProgressIcon),
                // The head is the blueprint's, sized for its two rings. On a
                // resized circle it would be the wrong size, so it is left off.
                headRadius: isCircle ? null : RING_HEAD_RADIUS[size]
            };
            typeAttributes.valueInside = isCircle && showValue;
            typeAttributes.valueBeside = !isCircle && showValue;
            typeAttributes.caption = isCircle ? attributes.progressCircleLabel || "" : "";

            const progressKey = `${field}${PROGRESS_SUFFIX}`;
            column.fgridProgressKey = progressKey;
            typeAttributes.progressValue = { fieldName: progressKey };
            typeAttributes.progressLabel = { fieldName: `${progressKey}Label` };
            typeAttributes.ringPath = { fieldName: `${progressKey}Path` };
            typeAttributes.ringClass = { fieldName: `${progressKey}Class` };
            typeAttributes.iconPath = { fieldName: `${progressKey}IconPath` };
            typeAttributes.iconClass = { fieldName: `${progressKey}IconClass` };
            typeAttributes.iconLabel = { fieldName: `${progressKey}IconLabel` };
            typeAttributes.headVisible = { fieldName: `${progressKey}HeadVisible` };
            typeAttributes.headX = { fieldName: `${progressKey}HeadX` };
            typeAttributes.headY = { fieldName: `${progressKey}HeadY` };
            typeAttributes.fillStyle = { fieldName: `${progressKey}Fill` };
            column.editable = false;
        }

        // CONDITIONAL FORMATTING, badge half. `slds-badge` is composed with the
        // resolved class in buildRows, so the badge keeps looking like a badge
        // when a rule matches.
        if (isBadged) {
            typeAttributes.badge = true;
            typeAttributes.badgeClass = column.fgridBadgeFormat ? { fieldName: column.fgridFormatKey } : "slds-badge";
        }
        // Auto-links URLs found inside a plain text cell.
        if (attributes.linkify) {
            typeAttributes.linkify = true;
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

        // WRAPPING, resolved last because the type is still being decided above: a
        // Name column becomes `url`, a picklist or lookup becomes a custom type.
        //
        // On by default. Clipping hides data behind an ellipsis and reads worse, and
        // the datatable still offers Wrap text / Clip text in the header menu so a
        // user can override per column at runtime. Stored as an opt-OUT, so the
        // config only carries `wrap: false` where an admin actually wanted clipping.
        if (!WRAP_UNSUPPORTED_TYPES.has(column.type)) {
            column.wrapText = attributes.wrap !== false;
        }

        // A lock on a read-only column, but only worth showing on a grid where
        // something else IS editable — otherwise every column wears one.
        if (readOnlyIcon && !configuredEditable) {
            column.displayReadOnlyIcon = true;
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
export function buildRows(records, columns, keyField = "Id", picklistContext = null) {
    if (!Array.isArray(records)) {
        return [];
    }
    const paths = (columns || []).map((column) => column.fgridLinkFor || column.fieldName).filter(Boolean);
    // Columns with conditional formatting, and every field their conditions
    // read. A rule may test a column that is not displayed -- color Amount by
    // Status with Status hidden -- and without carrying it the row has no
    // Status and the rule silently never matches.
    const formatColumns = (columns || []).filter((column) => column.fgridFormatRules?.length);
    const progressColumns = (columns || []).filter((column) => column.fgridProgressKey);
    const formatPaths = [...new Set(formatColumns.flatMap((column) => column.fgridFormatFields || []))];
    // The multi-select always needs its stored `A;B` string split into the array the
    // checkbox group binds to.
    const multiPicklistColumns = (columns || []).filter((column) => column.type === "fgridMultiPicklist");

    // Picklist columns whose options were moved to a row field, because a record type
    // or a controlling field can change them from row to row.
    const perRowPicklistColumns = (columns || []).filter(
        (column) =>
            (column.type === "fgridPicklist" || column.type === "fgridMultiPicklist") &&
            column.typeAttributes?.options?.fieldName
    );
    // One list per (record type, field, controlling value), not per row. Three record
    // types and eight controlling values is a couple of dozen arrays built once, and
    // every row that matches points at the SAME array — which keeps the datatable from
    // treating each row as changed on re-render.
    const optionCache = new Map();
    const lookupColumns = (columns || []).filter((column) => column.type === "fgridLookup");
    const percentColumns = (columns || []).filter((column) => column.type === "percent");

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
        formatPaths.forEach((path) => {
            if (row[path] === undefined) {
                row[path] = resolvePath(record, path) ?? null;
            }
        });

        (columns || []).forEach((column) => {
            if (column.fgridLinkFor && row.Id) {
                row[column.fgridLinkFor + LINK_SUFFIX] = `/${row.Id}`;
            }
        });

        percentColumns.forEach((column) => {
            const value = row[column.fieldName];
            if (value !== null && value !== undefined && value !== "") {
                row[column.fieldName] = percentToFraction(value);
            }
        });

        lookupColumns.forEach((column) => {
            const id = row[column.fieldName];
            // The parent's name is read straight off the record when the Flow
            // queried the relationship. Flow's "automatically store all fields"
            // covers direct fields only, so it is often absent — hence the Id
            // fallback rather than an empty cell.
            const name = column.fgridLookupRelationship
                ? resolvePath(record, `${column.fgridLookupRelationship}.${LOOKUP_NAME_FIELD}`)
                : null;
            row[column.fieldName + LOOKUP_LABEL_SUFFIX] = name ?? id ?? "";
            row[column.fieldName + LINK_SUFFIX] = column.fgridLookupLink && id ? `/${id}` : null;
        });

        multiPicklistColumns.forEach((column) => {
            row[column.fieldName + PICKLIST_SELECTED_SUFFIX] = splitMultiPicklist(row[column.fieldName]);
        });

        perRowPicklistColumns.forEach((column) => {
            const controller = column.fgridControllerField;
            // Read from the RECORD, not the row: RecordTypeId and a controlling field
            // are usually not displayed columns, so the projected row has neither.
            const recordTypeId = picklistContext?.recordTypeFor?.(record) || MASTER_RECORD_TYPE_ID;
            // An unsaved draft for the controlling field wins over the stored value:
            // a record page narrows the dependent picklist the moment the controlling
            // one is chosen, not when it is saved.
            const pending = controller ? picklistContext?.controllingValueFor?.(record, controller) : undefined;
            const controllingValue = controller
                ? pending === undefined
                    ? resolvePath(record, controller)
                    : pending
                : null;

            const cacheKey = `${recordTypeId}|${column.fieldName}|${controllingValue ?? ""}`;
            if (!optionCache.has(cacheKey)) {
                const fieldValues = picklistContext?.valuesFor?.(recordTypeId, column.fieldName) || null;
                const resolved = picklistValuesFor(fieldValues, controller, controllingValue);
                // null means the payload could not answer — no record type fetched, or
                // the field missing from it — so fall back to the describe values
                // rather than showing an empty list nobody asked for.
                const base = resolved === null ? column.fgridPicklistOptions || [] : resolved;
                const none = column.fgridPicklistNone || [];
                // --None-- is omitted from an EMPTY dependent list: offering only
                // --None-- reads as a working picklist, when the truth is that the
                // controlling field has not been set.
                optionCache.set(cacheKey, base.length ? [...none, ...base] : []);
            }
            const resolvedOptions = optionCache.get(cacheKey);
            row[column.fieldName + PICKLIST_OPTIONS_SUFFIX] = resolvedOptions;
            // Nothing to offer means the controlling field has not been set. Salesforce
            // shows an empty dropdown and leaves the user guessing; the cell is
            // disabled instead, which says the same thing without the guessing.
            row[column.fieldName + PICKLIST_LOCKED_SUFFIX] = resolvedOptions.length === 0;
        });

        progressColumns.forEach((column) => {
            const percent = gaugePercent(row[column.fieldName]);
            const rounded = Math.round(percent);
            row[column.fgridProgressKey] = rounded;
            row[`${column.fgridProgressKey}Label`] = `${rounded}%`;
            // The column's own color; a matching rule replaces it further down.
            writeGaugeFill(row, column, column.fgridGaugeColor);

            const ring = column.fgridRing;
            if (!ring) {
                return;
            }
            const key = column.fgridProgressKey;
            const arc = ringArc(percent, ring.drain);
            // Complete is the one variant state that depends on the value.
            // Hiding the icon drops it too: without the check, the complete
            // style is a solid green disc that reads as nothing in particular.
            const isComplete = ring.variant === "base-autocomplete" && rounded === 100 && !ring.hideIcon;
            let icon = null;
            if (isComplete) {
                icon = RING_ICONS.complete;
            } else if (!ring.hideIcon) {
                icon = RING_ICONS[ring.variant] || null;
            }
            row[`${key}Path`] = arc.path;
            row[`${key}Class`] = isComplete ? `${ring.ringClass} slds-progress-ring_complete` : ring.ringClass;
            row[`${key}IconPath`] = icon?.path || "";
            row[`${key}IconClass`] = icon?.className || "";
            row[`${key}IconLabel`] = icon?.label || "";
            row[`${key}HeadVisible`] = ring.headRadius !== null && percent > 0 && percent < 100;
            row[`${key}HeadX`] = ring.headRadius === null ? 0 : round4(arc.x * ring.headRadius);
            row[`${key}HeadY`] = ring.headRadius === null ? 0 : round4(arc.y * ring.headRadius);
        });

        // LAST, because a rule reads the row and everything above is still
        // filling it -- a percent has to be converted and a lookup labelled
        // before a condition can be asked about either.
        formatColumns.forEach((column) => {
            const matched = matchFormatRule(column.fgridFormatRules, row, matchesFilter);
            if (column.fgridGaugeRules) {
                writeGaugeFill(row, column, matched?.color || column.fgridGaugeColor);
                return;
            }
            // Empty string, not null: the datatable writes the resolved value
            // straight into `class`, and a null there renders the literal
            // "null" as a class name.
            const resolved = matched?.fgridClass || "";
            row[column.fgridFormatKey] = column.fgridBadgeFormat ? `slds-badge ${resolved}`.trim() : resolved;
        });

        return row;
    });
}

/**
 * A gauge's value, 0-100. Clamped as well as validated, matching what
 * lightning-progress-bar documents for its own value, so an out-of-range
 * number cannot draw a fill wider than the track.
 */
function gaugePercent(value) {
    const raw = Number(value);
    return Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
}

/**
 * Writes a gauge's fill for one row: the bar's width and background, or the
 * ring's `fill`. No color leaves the blueprint's own. The color has been
 * through normalizeHex, so only a hex can reach the style.
 */
function writeGaugeFill(row, column, color) {
    const key = column.fgridProgressKey;
    const hex = normalizeHex(color);
    if (column.fgridRing) {
        row[`${key}Fill`] = hex ? `fill: ${hex}` : "";
        return;
    }
    const width = `width: ${gaugePercent(row[column.fieldName])}%`;
    row[`${key}Style`] = hex ? `${width}; background: ${hex}` : width;
}

/**
 * The columns the datatable should draw: all but the Hidden ones.
 *
 * Hidden columns stay in what buildColumns returns, because rows, search and
 * formatting rules read the full list; only the datatable's copy leaves them
 * out. Returns the same array when nothing is hidden, so a caller that
 * memoizes on identity is not handed a new one for nothing.
 */
export function visibleColumns(columns) {
    const list = columns || [];
    return list.some((column) => column.fgridHidden) ? list.filter((column) => !column.fgridHidden) : list;
}

/**
 * Splits a stored multi-select picklist value into the array a checkbox group
 * expects.
 */
export function splitMultiPicklist(value) {
    return String(value ?? "")
        .split(MULTI_PICKLIST_SEPARATOR)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

/** Joins selected values back into the form Salesforce stores. */
export function joinMultiPicklist(values) {
    return Array.isArray(values) ? values.join(MULTI_PICKLIST_SEPARATOR) : (values ?? "");
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
export function sortRows(rows, fieldName, direction = "asc", blanksFirst = false) {
    if (!Array.isArray(rows) || !fieldName) {
        return rows || [];
    }
    const factor = direction === "desc" ? -1 : 1;

    return [...rows].sort((left, right) => {
        const a = normalizeForSort(left?.[fieldName]);
        const b = normalizeForSort(right?.[fieldName]);

        // Blanks are grouped, not sorted: they go to one end regardless of
        // direction, so reversing the sort does not scatter them through the middle.
        const aBlank = a === null || a === "";
        const bBlank = b === null || b === "";
        if (aBlank && bBlank) {
            return 0;
        }
        if (aBlank) {
            return blanksFirst ? -1 : 1;
        }
        if (bBlank) {
            return blanksFirst ? 1 : -1;
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

function normalizeForSort(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    // ALWAYS case-insensitive. Comparing raw strings compares character codes, which
    // puts every capitalized value ahead of every lowercase one — "Zebra" before
    // "acme". That was once a setting; no end-user reason to want it was found, so
    // the sort simply does the readable thing.
    return String(value).toLowerCase();
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
export function searchRows(rows, columns, term, caseSensitive = false, eachWord = true) {
    const needle = String(term ?? "").trim();
    if (!Array.isArray(rows) || !needle) {
        return rows || [];
    }
    const paths = searchablePaths(columns);
    const normalize = (value) => (caseSensitive ? String(value) : String(value).toLowerCase());

    const textsOf = (row) =>
        paths.map((path) => {
            const value = row?.[path];
            return value === null || value === undefined ? "" : normalize(value);
        });

    // PHRASE mode. The whole term must appear within a single column. Stricter, and
    // structurally unable to match a value split across two fields — which is why
    // it is not the default. Kept for the case where a column legitimately holds
    // multi-word text and the admin wants an exact run of characters.
    if (!eachWord) {
        const target = normalize(needle);
        return rows.filter((row) => textsOf(row).some((text) => text.includes(target)));
    }

    // WORD mode, the default. EVERY word must appear in AT LEAST ONE searchable
    // field, in any column and in any order. Contact names are the reason: with
    // FirstName and LastName as separate columns, "Chris Smith" is in no single
    // field, so phrase matching finds nothing. A single Full Name column still
    // matches, because both words are found within that one field.
    //
    // A single-word search is identical in both modes. The tradeoff of word mode is
    // that words may match across different columns, so "Chris Smith" also matches
    // a row whose FirstName is Chris and whose Company is "Smith Ltd" — normal for
    // a search box, and the filter row still offers per-column precision.
    const tokens = needle.split(/\s+/).filter(Boolean).map(normalize);

    return rows.filter((row) => {
        const texts = textsOf(row);
        return tokens.every((token) => texts.some((text) => text.includes(token)));
    });
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
    const active = Object.entries(filters).filter(([, filter]) => isFilterActive(filter));
    if (!active.length) {
        return rows;
    }

    return rows.filter((row) => active.every(([path, filter]) => matchesFilter(row?.[path], filter, caseSensitive)));
}

/** Filter shapes, one per family of field type. */
export const FILTER_KIND = {
    TEXT: "text",
    PICKLIST: "picklist",
    DATE: "date",
    NUMBER: "number",
    BOOLEAN: "boolean"
};

/**
 * Filter operators, named the way list views and report builder name them so an
 * admin recognises them.
 *
 * `NO_VALUE_OPERATORS` are complete on their own — blankness checks, and the
 * relative date ranges — so the editor hides its value control for them.
 */
export const FILTER_OPERATOR = {
    EQUALS: "equals",
    NOT_EQUALS: "notEquals",
    CONTAINS: "contains",
    NOT_CONTAINS: "notContains",
    STARTS_WITH: "startsWith",
    LESS: "lessThan",
    GREATER: "greaterThan",
    LESS_EQUAL: "lessOrEqual",
    GREATER_EQUAL: "greaterOrEqual",
    TODAY: "today",
    THIS_WEEK: "thisWeek",
    LAST_30: "last30",
    THIS_YEAR: "thisYear",
    BLANK: "isBlank",
    NOT_BLANK: "isNotBlank"
};

const BLANK_OPERATORS = [
    { label: "is blank", value: FILTER_OPERATOR.BLANK },
    { label: "is not blank", value: FILTER_OPERATOR.NOT_BLANK }
];

const COMPARISON_OPERATORS = [
    { label: "equals", value: FILTER_OPERATOR.EQUALS },
    { label: "not equal to", value: FILTER_OPERATOR.NOT_EQUALS },
    { label: "less than", value: FILTER_OPERATOR.LESS },
    { label: "greater than", value: FILTER_OPERATOR.GREATER },
    { label: "less or equal", value: FILTER_OPERATOR.LESS_EQUAL },
    { label: "greater or equal", value: FILTER_OPERATOR.GREATER_EQUAL }
];

/** Relative ranges, expressed as operators rather than a separate control. */
const RELATIVE_DATE_OPERATORS = [
    { label: "is today", value: FILTER_OPERATOR.TODAY },
    { label: "is this week", value: FILTER_OPERATOR.THIS_WEEK },
    { label: "is in the last 30 days", value: FILTER_OPERATOR.LAST_30 },
    { label: "is this year", value: FILTER_OPERATOR.THIS_YEAR }
];

const OPERATORS_BY_KIND = {
    [FILTER_KIND.TEXT]: [
        { label: "equals", value: FILTER_OPERATOR.EQUALS },
        { label: "not equal to", value: FILTER_OPERATOR.NOT_EQUALS },
        { label: "contains", value: FILTER_OPERATOR.CONTAINS },
        { label: "does not contain", value: FILTER_OPERATOR.NOT_CONTAINS },
        { label: "starts with", value: FILTER_OPERATOR.STARTS_WITH },
        ...BLANK_OPERATORS
    ],
    [FILTER_KIND.PICKLIST]: [
        { label: "is one of", value: FILTER_OPERATOR.EQUALS },
        { label: "is none of", value: FILTER_OPERATOR.NOT_EQUALS },
        ...BLANK_OPERATORS
    ],
    [FILTER_KIND.NUMBER]: [...COMPARISON_OPERATORS, ...BLANK_OPERATORS],
    [FILTER_KIND.DATE]: [...COMPARISON_OPERATORS, ...RELATIVE_DATE_OPERATORS, ...BLANK_OPERATORS],
    // A Salesforce checkbox is never null, so blankness has no meaning here — an
    // "is blank" that could never match would be worse than its absence.
    [FILTER_KIND.BOOLEAN]: [{ label: "equals", value: FILTER_OPERATOR.EQUALS }]
};

/** Operators that are complete without a value, so the editor hides its input. */
export const NO_VALUE_OPERATORS = new Set([
    FILTER_OPERATOR.BLANK,
    FILTER_OPERATOR.NOT_BLANK,
    FILTER_OPERATOR.TODAY,
    FILTER_OPERATOR.THIS_WEEK,
    FILTER_OPERATOR.LAST_30,
    FILTER_OPERATOR.THIS_YEAR
]);

/** Operators offered for a filter kind, as combobox options. */
export function operatorsFor(kind) {
    return OPERATORS_BY_KIND[kind] || OPERATORS_BY_KIND[FILTER_KIND.TEXT];
}

/** Human label for one operator, for the pill summary. */
export function operatorLabel(kind, operator) {
    return operatorsFor(kind).find((option) => option.value === operator)?.label || operator;
}

/** Default operator when a filter is first created for a kind. */
export function defaultOperatorFor(kind) {
    if (kind === FILTER_KIND.TEXT) {
        return FILTER_OPERATOR.CONTAINS;
    }
    return FILTER_OPERATOR.EQUALS;
}

/**
 * Chooses the filter shape for a built column.
 *
 * Driven by the datatable type rather than the raw describe, so a column whose
 * type was overridden in its config filters the way it renders.
 */
export function filterKindFor(column) {
    const type = column?.type;
    if (type === "fgridPicklist" || type === "fgridMultiPicklist" || column?.fgridPicklistOptions?.length) {
        return FILTER_KIND.PICKLIST;
    }
    if (type === "date" || type === "date-local") {
        return FILTER_KIND.DATE;
    }
    if (type === "currency" || type === "number" || type === "percent") {
        return FILTER_KIND.NUMBER;
    }
    if (type === "boolean") {
        return FILTER_KIND.BOOLEAN;
    }
    // text, email, phone, url and lookups all filter as text.
    return FILTER_KIND.TEXT;
}

/**
 * Rules with each condition made comparable: its `kind` filled in from the
 * field it tests, and its value in the shape that kind's matcher reads.
 *
 * The kind is the same inference the column panel uses to choose which
 * operators to offer, so a condition compares the way its operator list
 * promised. A gauge compares as the number it draws. A kind already stored is
 * kept.
 *
 * The value needs converting because the panel stores every condition's value
 * as one string. A picklist matcher reads a `values` list, and a checkbox
 * matcher reads a boolean, where the string "false" would count as true.
 */
function withConditionKinds(rules, config, describeByPath) {
    return rules.map((rule) => ({
        ...rule,
        conditions: (rule.conditions || []).map((condition) => {
            if (!condition || condition.kind) {
                return condition;
            }
            const kind = conditionKindFor(condition.field, config, describeByPath);
            if (kind === FILTER_KIND.PICKLIST && !Array.isArray(condition.values)) {
                return {
                    ...condition,
                    kind,
                    values: isPresent(condition.value) ? [String(condition.value).trim()] : []
                };
            }
            if (kind === FILTER_KIND.BOOLEAN && typeof condition.value !== "boolean") {
                return { ...condition, kind, value: String(condition.value).trim().toLowerCase() === "true" };
            }
            return { ...condition, kind };
        })
    }));
}

function conditionKindFor(field, config, describeByPath) {
    const describe = describeByPath?.[field];
    const type = describe?.dataType || config?.[field]?.type || inferType(field);
    return GAUGE_TYPES.includes(type) ? FILTER_KIND.NUMBER : filterKindFor({ fieldName: field, ...describe, type });
}

/**
 * Whether a filter would narrow anything.
 *
 * A plain string is accepted as a text filter so a value saved before filters
 * carried operators still works.
 */
export function isFilterActive(filter) {
    if (typeof filter === "string") {
        return filter.trim() !== "";
    }
    if (!filter || typeof filter !== "object" || !filter.operator) {
        return false;
    }
    if (NO_VALUE_OPERATORS.has(filter.operator)) {
        return true;
    }
    if (filter.kind === FILTER_KIND.PICKLIST) {
        return Array.isArray(filter.values) && filter.values.length > 0;
    }
    if (filter.kind === FILTER_KIND.BOOLEAN) {
        return filter.value === true || filter.value === false;
    }
    return isPresent(filter.value);
}

/**
 * One-line description of a filter, for the pill above the table.
 *
 * Reporting what is filtered is half the feature: a filter set from a column
 * header menu is otherwise invisible once the menu closes.
 */
export function describeFilter(label, filter) {
    const spec = normalizeFilter(filter);
    if (!spec) {
        return label;
    }
    const operator = operatorLabel(spec.kind, spec.operator);
    if (NO_VALUE_OPERATORS.has(spec.operator)) {
        return `${label} ${operator}`;
    }
    if (spec.kind === FILTER_KIND.PICKLIST) {
        const values = Array.isArray(spec.values) ? spec.values : [];
        // Naming every value makes a long pill; past three, count instead.
        const shown = values.length > 3 ? `${values.length} values` : values.join(", ");
        return `${label} ${operator} ${shown}`;
    }
    if (spec.kind === FILTER_KIND.BOOLEAN) {
        return `${label} ${operator} ${spec.value ? "True" : "False"}`;
    }
    return `${label} ${operator} ${spec.value}`;
}

/** Accepts the pre-operator string shape as a `contains` text filter. */
function normalizeFilter(filter) {
    if (typeof filter === "string") {
        return { kind: FILTER_KIND.TEXT, operator: FILTER_OPERATOR.CONTAINS, value: filter };
    }
    return filter && typeof filter === "object" && filter.operator ? filter : null;
}

function isPresent(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
}

/**
 * Does one value satisfy one filter spec?
 *
 * Exported because conditional formatting asks exactly the same question of a
 * row that the filter row asks: same operators, same per-kind semantics, same
 * treatment of blanks. `c/fgrid_formatRules` reuses it rather than growing a
 * second, drifting copy.
 */
export function matchesFilter(raw, filter, caseSensitive) {
    const spec = normalizeFilter(filter);
    if (!spec) {
        return true;
    }

    // Blankness is asked of the stored value directly, before any type handling:
    // every kind agrees on what empty means.
    const isBlankValue = raw === null || raw === undefined || String(raw).trim() === "";
    if (spec.operator === FILTER_OPERATOR.BLANK) {
        return isBlankValue;
    }
    if (spec.operator === FILTER_OPERATOR.NOT_BLANK) {
        return !isBlankValue;
    }
    // Every other operator asks something of a value, so a blank row cannot match.
    if (isBlankValue) {
        return false;
    }

    switch (spec.kind) {
        case FILTER_KIND.PICKLIST:
            return matchesPicklistFilter(raw, spec);
        case FILTER_KIND.DATE:
            return matchesDateFilter(raw, spec);
        case FILTER_KIND.NUMBER:
            return matchesNumberFilter(raw, spec);
        case FILTER_KIND.BOOLEAN:
            return Boolean(raw) === Boolean(spec.value);
        default:
            return matchesTextFilter(raw, spec, caseSensitive);
    }
}

function matchesTextFilter(raw, spec, caseSensitive) {
    const fold = (value) => (caseSensitive ? String(value) : String(value).toLowerCase());
    const value = fold(raw);
    const term = fold(spec.value).trim();

    switch (spec.operator) {
        case FILTER_OPERATOR.EQUALS:
            return value === term;
        case FILTER_OPERATOR.NOT_EQUALS:
            return value !== term;
        case FILTER_OPERATOR.NOT_CONTAINS:
            return !value.includes(term);
        case FILTER_OPERATOR.STARTS_WITH:
            return value.startsWith(term);
        default:
            return value.includes(term);
    }
}

/**
 * Selected values combine with OR, which is what "is one of" means: picking two
 * industries shows both.
 *
 * A multi-select picklist stores several values in one field, so the stored value
 * is split before comparing — a row holding "Hot;Warm" matches a filter on "Warm".
 */
function matchesPicklistFilter(raw, spec) {
    const wanted = new Set(spec.values || []);
    const held = splitMultiPicklist(raw);
    const hit = held.some((value) => wanted.has(value));
    return spec.operator === FILTER_OPERATOR.NOT_EQUALS ? !hit : hit;
}

/**
 * Compared on the date part only, so a Datetime late in the day still counts as
 * that day. A raw string comparison would push it into the next one.
 *
 * Relative operators carry the range they resolved to when the admin chose them —
 * see `resolveDatePreset` — which keeps this function pure.
 */
function matchesDateFilter(raw, spec) {
    const value = datePart(raw);
    if (!value) {
        return false;
    }

    if (NO_VALUE_OPERATORS.has(spec.operator)) {
        return (
            (!isPresent(spec.from) || value >= datePart(spec.from)) &&
            (!isPresent(spec.to) || value <= datePart(spec.to))
        );
    }

    const target = datePart(spec.value);
    switch (spec.operator) {
        case FILTER_OPERATOR.NOT_EQUALS:
            return value !== target;
        case FILTER_OPERATOR.LESS:
            return value < target;
        case FILTER_OPERATOR.GREATER:
            return value > target;
        case FILTER_OPERATOR.LESS_EQUAL:
            return value <= target;
        case FILTER_OPERATOR.GREATER_EQUAL:
            return value >= target;
        default:
            return value === target;
    }
}

/** Leading `YYYY-MM-DD` of an ISO date or datetime, which sorts lexically. */
function datePart(value) {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, 10) : "";
}

/** Relative date choices, offered as operators. */
export const DATE_PRESETS = [
    { label: "Today", value: FILTER_OPERATOR.TODAY },
    { label: "This week", value: FILTER_OPERATOR.THIS_WEEK },
    { label: "Last 30 days", value: FILTER_OPERATOR.LAST_30 },
    { label: "This year", value: FILTER_OPERATOR.THIS_YEAR }
];

/**
 * Turns a relative operator into the concrete `{ from, to }` it means today.
 *
 * Resolved when the admin picks it rather than at match time, so `filterRows`
 * stays a pure function of its arguments — no hidden dependency on the clock, and
 * the range cannot shift under them mid-session.
 *
 * `today` is injected so this is testable without freezing time.
 */
export function resolveDatePreset(preset, today = new Date()) {
    const iso = (date) => date.toISOString().slice(0, 10);
    const shifted = (days) => {
        const copy = new Date(today.getTime());
        copy.setDate(copy.getDate() + days);
        return copy;
    };

    switch (preset) {
        case FILTER_OPERATOR.TODAY:
            return { from: iso(today), to: iso(today) };
        case FILTER_OPERATOR.THIS_WEEK: {
            // Week starts Sunday, matching Salesforce's own default.
            return { from: iso(shifted(-today.getDay())), to: iso(shifted(6 - today.getDay())) };
        }
        case FILTER_OPERATOR.LAST_30:
            return { from: iso(shifted(-29)), to: iso(today) };
        case FILTER_OPERATOR.THIS_YEAR:
            return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` };
        default:
            return { from: null, to: null };
    }
}

function matchesNumberFilter(raw, spec) {
    const value = Number(raw);
    const target = Number(spec.value);
    if (Number.isNaN(value) || Number.isNaN(target)) {
        return false;
    }
    switch (spec.operator) {
        case FILTER_OPERATOR.NOT_EQUALS:
            return value !== target;
        case FILTER_OPERATOR.LESS:
            return value < target;
        case FILTER_OPERATOR.GREATER:
            return value > target;
        case FILTER_OPERATOR.LESS_EQUAL:
            return value <= target;
        case FILTER_OPERATOR.GREATER_EQUAL:
            return value >= target;
        default:
            return value === target;
    }
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

const FLOW_LABEL = "Run Flow";

/**
 * Icon each action type falls back to.
 *
 * Exported so the property editor can show the same value as a placeholder. Kept
 * here rather than in the schema because this is where it is actually applied,
 * and two copies would drift.
 */
export const ROW_ACTION_DEFAULT_ICONS = {
    Remove: "utility:delete",
    Flow: "utility:flow"
};

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
    const defaultIconName = ROW_ACTION_DEFAULT_ICONS[isRemove ? "Remove" : "Flow"];
    const column =
        display === "Button"
            ? {
                  type: "button",
                  fieldName: ROW_ACTION_NAME,
                  /* EMPTY ON PURPOSE. `label` is documented as required and as what
                     assistive tech reads, so this was tried as `defaultLabelText` plus
                     `hideLabel: true`. `hideLabel` only works PAIRED WITH `iconName` --
                     it swaps the text for an icon -- so on its own the text stayed and
                     truncated to "Ru..." in a 60px column, which is worse than blank.
                     The action is described on every cell through `typeAttributes.title`
                     and `alternativeText`; only the header is unlabeled. */
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
                  /* EMPTY ON PURPOSE. `label` is documented as required and as what
                     assistive tech reads, so this was tried as `defaultLabelText` plus
                     `hideLabel: true`. `hideLabel` only works PAIRED WITH `iconName` --
                     it swaps the text for an icon -- so on its own the text stayed and
                     truncated to "Ru..." in a 60px column, which is worse than blank.
                     The action is described on every cell through `typeAttributes.title`
                     and `alternativeText`; only the header is unlabeled. */
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
                      // `iconClass`, NOT `class`, and an SLDS class rather than one of
                      // ours -- see colorClass.
                      iconClass: rowActionIconClass(actionType, color)
                  }
              };

    if (String(position).toLowerCase() === "left") {
        base.unshift(column);
    } else {
        base.push(column);
    }
    return base;
}

/**
 * The SLDS icon class a row action will actually ship with.
 *
 * EXPORTED SO THE EDITOR CAN SHOW THE SAME THING. The property panel previews the
 * chosen icon next to the picker, and that preview has to be tinted by the same
 * rule the grid uses -- including the Remove-defaults-to-red fallback, which is
 * not stored anywhere and so cannot be read off the values map. Two copies of this
 * would drift, exactly as ROW_ACTION_DEFAULT_ICONS notes for the icon itself.
 */
export function rowActionIconClass(actionType, color) {
    const isRemove = String(actionType || "") === "Remove";
    // Spelled "Black" rather than left null so this matches DEFAULTS_FROM in the
    // schema exactly. Both sides then name the same color for an unset action,
    // and the panel cannot preview one thing while the grid renders another.
    return colorClass(color || (isRemove ? "Red" : "Black"));
}

/**
 * Maps the configured color to an SLDS icon utility class.
 *
 * SLDS'S CLASSES, NOT OURS, AND THAT IS THE WHOLE POINT. This used to return
 * `fgrid-action_red` and friends, declared in a stylesheet of ours. The class lands
 * on an element `lightning-primitive-cell-factory` renders -- a grandchild of the
 * datatable -- so no stylesheet of ours can select it. Declaring the rules in the
 * grid's CSS failed, and moving them into the datatable subclass's CSS failed too;
 * measured in a running org, the configured color never applied in either place.
 *
 * These classes are defined in `salesforce-lightning-design-system.min.css`, which
 * is global, so the selector matches wherever the element lives. They set the same
 * custom property our own rules did, to the same values:
 *
 *     .slds-icon-text-error   --slds-c-icon-color-foreground: #ea001e
 *     .slds-icon-text-success --slds-c-icon-color-foreground: #2e844a
 *
 * Black has no SLDS equivalent. `slds-icon-text-default` is the neutral gray the
 * datatable already uses, so choosing Black now renders as the default rather than
 * the #181818 it nominally promised. The option is kept because saved flows store
 * it; the alternative was renaming a stored value.
 */
function colorClass(color) {
    switch (String(color || "").toLowerCase()) {
        case "green":
            return "slds-icon-text-success";
        case "black":
            return "slds-icon-text-default";
        case "red":
            return "slds-icon-text-error";
        default:
            return undefined;
    }
}

/** Field paths worth searching: real data columns, not generated link URLs. */
/**
 * Row fields the search box looks at.
 *
 * `fgridTextField` wins where a column displays something other than what it
 * stores — a lookup shows the parent's name over an Id — so a search matches the
 * text on screen. `fgridLinkFor` does the same job for a linked Name column, whose
 * own fieldName holds a generated URL.
 */
function searchablePaths(columns) {
    return (columns || [])
        .filter((column) => column.fieldName !== ROW_ACTION_NAME)
        .map((column) => column.fgridTextField || column.fgridLinkFor || column.fieldName)
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
