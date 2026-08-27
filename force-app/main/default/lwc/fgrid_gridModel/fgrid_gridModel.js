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

/** Row field holding the option list for an editable picklist cell. */
export const PICKLIST_OPTIONS_SUFFIX = "__fgridOptions";

/** Row field holding a multi-picklist's value as an array, for the checkbox
 *  group, whose `value` is an array while the record stores a `;` string. */
export const PICKLIST_SELECTED_SUFFIX = "__fgridSelected";

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

/** Row field holding a Time value trimmed to HH:mm for display. */
export const TIME_DISPLAY_SUFFIX = "__fgridTimeDisplay";

/**
 * Trims a Time value to `HH:mm` so the cell shows "7:00 AM", not "7:00:00 AM".
 *
 * `lightning-formatted-time` renders whatever precision it is handed and exposes
 * no attributes to control the format — it accepts `HH:mm`, `HH:mm:ss` and
 * `HH:mm:ss.SSS` and formats to the user's locale. Apex serializes a Time field
 * with milliseconds, hence the seconds on screen. Trimming the input is therefore
 * the only lever, and it keeps the locale formatting the component does well.
 *
 * The trim is display-only: the row's real field keeps full precision, so an
 * inline edit still starts from the stored value rather than a rounded one.
 * Seconds are truncated rather than rounded, matching how the platform shows a
 * Time elsewhere.
 */
export function timeWithoutSeconds(value) {
    if (typeof value !== "string") {
        return value ?? null;
    }
    const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value;
}

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
function resolveEditable(attributes, describe, defaultEditable, forceReadOnly) {
    if (forceReadOnly) {
        return false;
    }
    const requested = attributes.edit ?? (describe ? describe.isEditable && defaultEditable : defaultEditable);
    if (!requested) {
        return false;
    }
    return describe ? describe.isEditable !== false : true;
}

/** Consecutive pages shown around the current one before truncating. */
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
 * The window is EVEN, so it cannot centre the current page. It leans one before and
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
        userTimeZone = null
    } = options;

    return (fields || []).map((field, index) => {
        const attributes = config?.[field] || {};
        const describe = describeByPath?.[field] || null;

        const column = {
            label: attributes.label || describe?.label || defaultLabel(field),
            fieldName: field,
            type: attributes.type || describe?.dataType || inferType(field),
            // A field the describe says is unsortable can never be sorted, no
            // matter what the grid-level flags say.
            sortable: allowSort && !hideHeaderActions && describe?.isSortable !== false,
            // `edit` in a column's config OPTS IN; it cannot overrule the describe.
            //
            // It used to override outright, which is how a record Id ended up with a
            // working text box over an 18-character key, and how a Date column got an
            // edit pencil the datatable refuses to honour. Adding types to Apex's
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
            editable: resolveEditable(attributes, describe, defaultEditable, forceReadOnly),
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
        if (filterActions && attributes.filter === true && !hideHeaderActions) {
            column.actions = [{ label: "Filter…", name: FILTER_ACTION_NAME, iconName: "utility:filterList" }];
        }

        // A custom cell type ONLY when the column is editable. A read-only
        // picklist renders identically to text, so routing it through our own
        // template would add a rendering path for no visible gain.
        //
        // The option list is addressed as a ROW field rather than passed inline,
        // because a row whose stored value is no longer a valid option needs that
        // value added to its own list — see picklistCellOptions. Rows with
        // in-range values all share one array instance, so this costs nothing
        // except where a stale value actually exists.
        if (column.editable && describe?.picklistOptions?.length) {
            const isMulti = describe.displayType === "MULTIPICKLIST";
            column.type = isMulti ? "fgridMultiPicklist" : "fgridPicklist";
            column.fgridIsMultiPicklist = isMulti;
            // --None-- is meaningless for a checkbox group, where clearing every
            // box already expresses "no value".
            column.fgridAllowNone = allowNone && !isMulti;
            column.typeAttributes = {
                ...(column.typeAttributes || {}),
                options: { fieldName: field + PICKLIST_OPTIONS_SUFFIX },
                selected: { fieldName: field + PICKLIST_SELECTED_SUFFIX }
            };
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
            // Display reads the trimmed field; `value` stays the real one so the
            // editor and every draft still work off full precision.
            column.typeAttributes = {
                ...(column.typeAttributes || {}),
                display: { fieldName: field + TIME_DISPLAY_SUFFIX }
            };
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

        // `flex` finally does something. The reference distinguishes two width
        // properties, and this is the difference the checkbox was always describing:
        //   initialWidth — a starting width the user can then drag
        //   fixedWidth   — an exact width that cannot be resized, and which
        //                  overrides initialWidth
        // So a width with Flex on is a starting point; without it, it is locked.
        const width = Number(attributes.width);
        if (Number.isFinite(width) && width > 0) {
            if (attributes.flex) {
                column.initialWidth = width;
            } else {
                column.fixedWidth = width;
            }
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
        //   date        converts to the running user's zone, and honours them
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
        const scale = firstNumber(attributes.scale, describe?.scale);
        if (scale !== null) {
            typeAttributes.minimumFractionDigits = scale;
            typeAttributes.maximumFractionDigits = scale;
        }
        // Inline-edit granularity for currency, number and percent. Without it the
        // editor snaps to the default 0.01, which silently rounds a value needing
        // more precision.
        const step = firstNumber(attributes.step);
        if (step !== null) {
            typeAttributes.step = step;
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
        if (readOnlyIcon && !column.editable) {
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
export function buildRows(records, columns, keyField = "Id") {
    if (!Array.isArray(records)) {
        return [];
    }
    const paths = (columns || []).map((column) => column.fgridLinkFor || column.fieldName).filter(Boolean);
    // The known-value set and the --None-- entry are per COLUMN, not per row. Built
    // once here rather than inside picklistCellOptions, which runs for every row of
    // every picklist column — 300 rows across two picklists was allocating 600 Sets
    // to answer the same question.
    const picklistColumns = (columns || [])
        .filter((column) => column.type === "fgridPicklist" || column.type === "fgridMultiPicklist")
        .map((column) => ({
            column,
            options: column.fgridPicklistOptions || [],
            known: new Set((column.fgridPicklistOptions || []).map((option) => option.value)),
            none: column.fgridAllowNone ? [{ label: "--None--", value: "" }] : []
        }));
    const lookupColumns = (columns || []).filter((column) => column.type === "fgridLookup");
    const percentColumns = (columns || []).filter((column) => column.type === "percent");
    const timeColumns = (columns || []).filter((column) => column.type === "fgridTime");

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

        percentColumns.forEach((column) => {
            const value = row[column.fieldName];
            if (value !== null && value !== undefined && value !== "") {
                row[column.fieldName] = percentToFraction(value);
            }
        });

        timeColumns.forEach((column) => {
            row[column.fieldName + TIME_DISPLAY_SUFFIX] = timeWithoutSeconds(row[column.fieldName]);
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

        picklistColumns.forEach((entry) => {
            const value = row[entry.column.fieldName];
            row[entry.column.fieldName + PICKLIST_OPTIONS_SUFFIX] = picklistCellOptions(entry, value);
            if (entry.column.fgridIsMultiPicklist) {
                row[entry.column.fieldName + PICKLIST_SELECTED_SUFFIX] = splitMultiPicklist(value);
            }
        });

        return row;
    });
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
 * Option list for one picklist cell, including any value the record already
 * holds that is no longer offered.
 *
 * A stored value can fall outside the active list — the value was deactivated,
 * or it is not valid for the row's record type. Without this, opening the editor
 * on such a row shows nothing selected, and saving silently overwrites real data
 * with whatever the user picked or with nothing at all.
 *
 * The in-range case returns the column's own array by reference, so every row
 * shares one instance and only genuinely stale rows allocate.
 */
function picklistCellOptions(entry, value) {
    const { column, options, known, none } = entry;
    const current = column.fgridIsMultiPicklist
        ? splitMultiPicklist(value)
        : [value].filter((held) => held !== null && held !== undefined && held !== "");

    const missing = current.filter((held) => !known.has(held));

    if (!missing.length && !none.length) {
        return options;
    }
    // Label is the raw stored value: inventing a decorated label here would show
    // the user text that is not what gets saved.
    return [...none, ...missing.map((held) => ({ label: held, value: held })), ...options];
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

function matchesFilter(raw, filter, caseSensitive) {
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
