/**
 * Per-column attribute editor.
 *
 * Replaces the 13 parallel `ColID:value,...` delimited strings of the component
 * Flow Grid supersedes (columnAlignments, columnEdits, columnFilters, columnIcons,
 * columnLabels, columnScales, columnTypes, columnWidths, columnWraps, columnFlexes,
 * columnCellAttribs, columnTypeAttribs, columnOtherAttribs) with one JSON object
 * keyed by field API path.
 *
 * Keying by API path rather than column index means reordering columns cannot
 * scramble their attributes — a real defect class in the index-based design.
 *
 * LAYOUT — treatment C, chosen 2026-09-26. See
 * flowgrid/design/column-attributes-c.html. A scannable grid with an inline
 * drawer, and one rule deciding which is which:
 *
 *   if you would want to COMPARE it across columns, it is in the grid row;
 *   if it only makes sense for one column, it is in the drawer.
 *
 * So the grid holds order, label, width, alignment and the flags. The drawer
 * holds the type, everything that type implies, conditional formatting, and the
 * raw JSON escape hatches. Without that rule, two editing surfaces becomes no
 * idea where anything is.
 *
 * The drawer is TYPE-AWARE: decimals do not appear on a text column and a
 * currency code does not appear on an Integer. That is `c/fgrid_columnTypes`,
 * which also decides what a field may be re-displayed as, so a Date/Time is
 * never offered Currency.
 *
 * Two densities:
 *   compact  — read-only summary, for the narrow Flow Builder property panel
 *   full     — a list of columns and one column drilled in, for the Grid
 *              Studio's inspector
 */
import { LightningElement, api, track } from "lwc";
import { parseFieldList, parseColumnConfig, filterKindFor, operatorsFor, defaultOperatorFor } from "c/fgrid_gridModel";
import {
    typeOptionsFor,
    attributeGroupFor,
    displayValueFor,
    resolveDisplay,
    isProgress,
    COLUMN_TYPES,
    ATTRIBUTE_GROUP,
    CURRENCY_DISPLAYS,
    PROGRESS_THICKNESS,
    PROGRESS_SHAPES,
    PROGRESS_RING_VARIANTS,
    PROGRESS_RING_SIZES,
    PROGRESS_CIRCLE_SIZES,
    PROGRESS_CIRCLE_THICKNESS,
    PROGRESS_DIRECTIONS
} from "c/fgrid_columnTypes";
import { DEFAULT_RULE_COLOR, FORMAT_LOGIC, FORMAT_LOGIC_OPTIONS, parseFormatRules } from "c/fgrid_formatRules";

const ALIGNMENTS = [
    { label: "Default", value: "" },
    { label: "Left", value: "left" },
    { label: "Center", value: "center" },
    { label: "Right", value: "right" }
];

/**
 * How a column is colored. Per column and Conditional are deliberately
 * exclusive: a column-wide color and a per-cell rule fighting over the same
 * cell has no sensible answer, and "which one won" is not a question an admin
 * should have to ask.
 */
const COLOR_MODES = [
    { label: "None", value: "none" },
    { label: "Per column — one color for every cell", value: "column" },
    { label: "Conditional — a color per cell, by rule", value: "conditional" }
];

const EMPHASIS_OPTIONS = [
    { label: "None", value: "" },
    { label: "Bold", value: "bold" },
    { label: "ALL CAPS", value: "caps" },
    { label: "Bold and caps", value: "boldCaps" }
];

/** Where each gauge puts its value, for the Show the value help text. */
const SHOW_VALUE_HELP = {
    fgridProgressBar: "Displays the percentage above the right end of the bar.",
    fgridProgressRing: "Displays the percentage beside the ring.",
    fgridProgressCircle: "Displays the percentage, and the label if set, inside the circle."
};

/** The flags All Columns sets, in the order the column's own checkboxes use. */
const BULK_FLAGS = [
    { flag: "edit", label: "Editable", icon: "utility:edit" },
    { flag: "filter", label: "Filterable", icon: "utility:filterList" },
    { flag: "sort", label: "Sortable", icon: "utility:sort" },
    { flag: "wrap", label: "Wrap Text", icon: "utility:threedots" }
];

/** The list's E/F/S/W chips: on or off, with a title a screen reader reads. */
function chipsFor(flags) {
    const names = { edit: "Editable", filter: "Filterable", sort: "Sortable", wrap: "Wrap" };
    return Object.fromEntries(
        Object.entries(flags).flatMap(([flag, on]) => [
            [`${flag}ChipClass`, on ? "chip chip_on" : "chip"],
            [`${flag}ChipTitle`, `${names[flag]}: ${on ? "on" : "off"}`]
        ])
    );
}

export default class FgridColumnConfig extends LightningElement {
    /** JSON array of ordered field API paths, as the kit field picker persists it. */
    @api columnFields;

    /** JSON object of per-column attributes. */
    @api columnConfig;

    @api objectApiName;

    /** Describe facts keyed by field path. Drives which display types a column
     *  may use and which settings its type implies. Absent in compact mode,
     *  which renders a count only, and absent for a user-defined object, where
     *  everything is offered because nothing can be ruled out. */
    @api describeByPath;

    /** Read-only summary instead of the editable grid. */
    @api compact = false;

    /** True when the org is multi-currency. Supplied by the parent, which asks
     *  Apex — `UserInfo.isMultiCurrencyOrganization()`. A currency code picker
     *  in a single-currency org configures nothing. */
    @api multiCurrency = false;

    /** The org's ACTIVE currencies, when it has more than one. */
    @api
    get currencyCodes() {
        return this._currencyCodes;
    }
    set currencyCodes(value) {
        this._currencyCodes = Array.isArray(value) ? value : [];
    }

    _currencyCodes = [];

    /** The column drilled into, or null for the list. One at a time: the
     *  inspector is 24rem wide, and two columns' settings do not fit in it. */
    @track openField = null;

    /** The one rule being edited, as its key. Every rule open at once is a long
     *  scroll at inspector width. */
    openRuleKey = null;

    isBulkOpen = false;

    alignmentOptions = ALIGNMENTS;
    colorModeOptions = COLOR_MODES;
    emphasisOptions = EMPHASIS_OPTIONS;
    logicOptions = FORMAT_LOGIC_OPTIONS;
    currencyDisplayOptions = CURRENCY_DISPLAYS;
    progressThicknessOptions = PROGRESS_THICKNESS;
    progressShapeOptions = PROGRESS_SHAPES;
    progressRingVariantOptions = PROGRESS_RING_VARIANTS;
    progressRingSizeOptions = PROGRESS_RING_SIZES;
    progressCircleSizeOptions = PROGRESS_CIRCLE_SIZES;
    progressCircleThicknessOptions = PROGRESS_CIRCLE_THICKNESS;
    progressDirectionOptions = PROGRESS_DIRECTIONS;

    /* ------------------------------------------------------------------ *
     * Derived model
     * ------------------------------------------------------------------ */

    get fields() {
        return parseFieldList(this.columnFields);
    }

    get config() {
        return parseColumnConfig(this.columnConfig);
    }

    get hasFields() {
        return this.fields.length > 0;
    }

    get countLabel() {
        const count = this.fields.length;
        return count === 1 ? "1 column" : `${count} columns`;
    }

    /** Every field, for the condition field picker: a rule may test any column. */
    get fieldOptions() {
        return this.fields.map((field) => ({ label: this.labelFor(field), value: field }));
    }

    get rows() {
        const config = this.config;
        return this.fields.map((field, index) => {
            const attributes = config[field] || {};
            const describe = this.describeByPath?.[field];
            const type = attributes.type || describe?.dataType || "text";
            const group = attributeGroupFor(type);
            const rules = parseFormatRules(attributes.format);
            const colorMode = attributes.colorMode || (rules.length ? "conditional" : "none");
            const isOpen = this.openField === field;
            const typeOptions = typeOptionsFor(describe?.displayType);
            const display = displayValueFor(type, attributes.badge);
            const flags = {
                edit: Boolean(attributes.edit),
                filter: Boolean(attributes.filter),
                sort: attributes.sort !== false,
                wrap: attributes.wrap !== false
            };

            return {
                key: field,
                field,
                position: index + 1,
                label: attributes.label ?? "",
                width: attributes.width ?? null,
                align: attributes.align ?? "",
                // Sorting and wrapping are on unless turned off: the stored value
                // is the opt-out, so a saved config carries only what an admin
                // actually changed.
                ...flags,

                isOpen,
                isFirstColumn: index === 0,
                isLastColumn: index === this.fields.length - 1,

                // ----- list -----
                displayLabel: attributes.label || describe?.label || field,
                // The column's own options first (they carry Badge), then the
                // full list: the options are what it may BECOME, and do not
                // always include what it is now.
                typeLabel:
                    typeOptions.find((option) => option.value === display)?.label ||
                    COLUMN_TYPES.find((option) => option.value === display)?.label ||
                    display,
                ...chipsFor(flags),
                ruleCount: rules.length,
                ruleCountLabel: rules.length === 1 ? "1 rule" : `${rules.length} rules`,
                hasRules: rules.length > 0,

                // ----- drawer -----
                type,
                display,
                typeOptions,
                isNumberGroup: group === ATTRIBUTE_GROUP.NUMBER || group === ATTRIBUTE_GROUP.CURRENCY,
                isCurrencyGroup: group === ATTRIBUTE_GROUP.CURRENCY,
                // A plain number can want a variable number of decimals -- a
                // rate reading 1.5 or 1.25. Money cannot: $1,234.5 is wrong.
                // So currency gets ONE control and the pair stays for numbers.
                isPlainNumberGroup: group === ATTRIBUTE_GROUP.NUMBER,
                isProgressGroup: group === ATTRIBUTE_GROUP.PROGRESS,
                isNotGauge: group !== ATTRIBUTE_GROUP.PROGRESS,
                // Three gauges share the group, and each offers a different
                // subset of it.
                isProgressBar: type === "fgridProgressBar",
                isProgressRing: type === "fgridProgressRing",
                isProgressCircle: type === "fgridProgressCircle",
                hasProgressDirection: type === "fgridProgressRing" || type === "fgridProgressCircle",
                showProgressValueHelp: SHOW_VALUE_HELP[type],
                isTextGroup: group === ATTRIBUTE_GROUP.TEXT,
                isPicklistGroup: group === ATTRIBUTE_GROUP.PICKLIST,
                isLookupGroup: group === ATTRIBUTE_GROUP.LOOKUP,
                showCurrencyCode: group === ATTRIBUTE_GROUP.CURRENCY && this.multiCurrency,
                currencyOptions: this.currencyOptions,

                // One value for currency, written to both bounds. Reads the
                // legacy `scale` too, so nothing saved before needs migrating.
                decimals: attributes.minDecimals ?? attributes.maxDecimals ?? attributes.scale ?? null,
                // The FIELD's own decimal places, straight off the describe, as
                // the ceiling. Showing more than the field stores invents
                // precision -- a 2-place field rendered to 5 reads $1.20000,
                // which claims an accuracy the data does not have.
                fieldScale: describe?.scale ?? null,
                decimalsHelp: decimalsHelpFor(describe?.scale),
                minDecimals: attributes.minDecimals ?? attributes.scale ?? null,
                maxDecimals: attributes.maxDecimals ?? attributes.scale ?? null,
                minIntegerDigits: attributes.minIntegerDigits ?? null,
                currencyCode: attributes.currencyCode ?? "",
                currencyDisplayAs: attributes.currencyDisplayAs ?? "",
                step: attributes.step ?? null,
                linkify: Boolean(attributes.linkify),
                showName: attributes.showName !== false,
                link: attributes.link !== false,
                isPolymorphic: Boolean(describe?.isPolymorphic),
                progressThickness: attributes.progressThickness ?? "medium",
                progressShape: attributes.progressShape ?? "",
                showProgressValue: attributes.showProgressValue !== false,
                progressRingVariant: attributes.progressRingVariant ?? "base",
                progressRingSize: attributes.progressRingSize ?? "medium",
                progressCircleSize: attributes.progressCircleSize ?? "medium",
                progressCircleThickness: attributes.progressCircleThickness ?? "medium",
                progressDirection: attributes.progressDirection ?? "fill",
                hideProgressIcon: Boolean(attributes.hideProgressIcon),
                progressCircleLabel: attributes.progressCircleLabel ?? "",
                icon: attributes.icon ?? "",
                headerIcon: attributes.headerIcon ?? "",
                hasHeaderIcon: Boolean(attributes.headerIcon),
                hideLabel: Boolean(attributes.hideLabel),

                colorMode,
                isPerColumnColor: colorMode === "column",
                isConditionalColor: colorMode === "conditional",
                columnColor: attributes.columnColor ?? "",
                columnTextOnly: Boolean(attributes.columnTextOnly),
                columnEmphasis: attributes.emphasis ?? "",
                rules: this.describeRules(field, rules)
            };
        });
    }

    get currencyOptions() {
        return this._currencyCodes.map((code) => ({ label: code, value: code }));
    }

    /**
     * Turns stored rules into something a template can render.
     *
     * Every index the handlers need is baked in, because LWC templates cannot
     * compute one, and the operator list per condition depends on the field it
     * tests rather than on the column being formatted.
     */
    describeRules(field, rules) {
        return rules.map((rule, ruleIndex) => {
            const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
            return {
                key: `${field}#${ruleIndex}`,
                ruleIndex,
                position: ruleIndex + 1,
                color: rule.color ?? "",
                textOnly: Boolean(rule.textOnly),
                emphasis: rule.emphasis ?? "",
                icon: rule.icon ?? "",
                logic: rule.logic || FORMAT_LOGIC.ALL,
                customLogic: rule.customLogic ?? "",
                showCustomLogic: (rule.logic || FORMAT_LOGIC.ALL) === FORMAT_LOGIC.CUSTOM,
                showConditions: (rule.logic || FORMAT_LOGIC.ALL) !== FORMAT_LOGIC.ALWAYS,
                summary: this.summarize(rule),
                isOpen: this.openRuleKey === `${field}#${ruleIndex}`,
                toggleLabel: this.openRuleKey === `${field}#${ruleIndex}` ? "Done" : "Edit",
                isFirst: ruleIndex === 0,
                isLast: ruleIndex === rules.length - 1,
                conditions: conditions.map((condition, conditionIndex) => ({
                    key: `${field}#${ruleIndex}#${conditionIndex}`,
                    ruleIndex,
                    conditionIndex,
                    position: conditionIndex + 1,
                    field: condition.field ?? "",
                    operator: condition.operator ?? "",
                    value: condition.value ?? "",
                    operatorOptions: operatorsFor(this.kindFor(condition.field))
                }))
            };
        });
    }

    /** One line naming what the rule does, for the collapsed header. */
    summarize(rule) {
        // The hex itself: a picked color has no name, and the rule's own
        // swatch sits right below the summary.
        const outcome = rule.textOnly ? `text ${rule.color}` : rule.color || "no color";
        if ((rule.logic || FORMAT_LOGIC.ALL) === FORMAT_LOGIC.ALWAYS) {
            return `Always → ${outcome}`;
        }
        const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
        if (!conditions.length) {
            return `Always → ${outcome}`;
        }
        const first = conditions[0];
        const more = conditions.length > 1 ? ` +${conditions.length - 1}` : "";
        return `${this.labelFor(first.field)} ${first.operator ?? ""} ${first.value ?? ""}${more} → ${outcome}`.trim();
    }

    labelFor(field) {
        return this.config[field]?.label || this.describeByPath?.[field]?.label || field;
    }

    kindFor(field) {
        const describe = this.describeByPath?.[field];
        return filterKindFor({ fieldName: field, type: describe?.dataType, ...describe });
    }

    /* ------------------------------------------------------------------ *
     * Handlers — grid
     * ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ *
     * List and detail
     * ------------------------------------------------------------------ */

    get isListView() {
        return !this.openField || !this.fields.includes(this.openField);
    }

    /** The open column as a list of one, so its markup keeps a `row` binding. */
    get selectedRows() {
        return this.rows.filter((row) => row.isOpen);
    }

    handleOpenColumn(event) {
        this.openField = event.currentTarget.dataset.field;
        this.openRuleKey = null;
        this.isBulkOpen = false;
    }

    handleBackToList() {
        this.openField = null;
        this.openRuleKey = null;
    }

    /** Previous and next without going back: most of what the old table's
     *  side-by-side rows were good for. */
    handleStepColumn(event) {
        const step = Number(event.currentTarget.dataset.direction);
        const next = this.fields[this.fields.indexOf(this.openField) + step];
        if (next) {
            this.openField = next;
            this.openRuleKey = null;
        }
    }

    handleToggleRule(event) {
        const { ruleKey } = event.currentTarget.dataset;
        this.openRuleKey = this.openRuleKey === ruleKey ? null : ruleKey;
    }

    /* ------------------------------------------------------------------ *
     * All Columns
     * ------------------------------------------------------------------ */

    get bulkExpanded() {
        return String(this.isBulkOpen);
    }

    /**
     * Each flag's state across the columns that can take it.
     *
     * "All", "some" or "none", with a count, so the admin knows what a click
     * will do: on for every column, unless every column already has it. A
     * column that can never take the flag -- Edit on a gauge, or on a field
     * Salesforce reports as read-only -- is left out of the count and named,
     * rather than switched on to no effect.
     */
    get bulkItems() {
        const rows = this.rows;
        return BULK_FLAGS.map(({ flag, label, icon }) => {
            const eligible = rows.filter((row) => flag !== "edit" || this.canEdit(row.field));
            const on = eligible.filter((row) => row[flag]).length;
            const isAll = eligible.length > 0 && on === eligible.length;
            const skipped = rows.length - eligible.length;
            const action = isAll ? "Turn off for all columns" : "Turn on for all columns";
            const count = `on for ${on} of ${eligible.length}`;
            return {
                flag,
                label,
                icon,
                isAll,
                ariaChecked: isAll ? "true" : on === 0 ? "false" : "mixed",
                countLabel: `${on}/${eligible.length}`,
                countClass: isAll ? "bulk__count bulk__count_all" : "bulk__count",
                // The sentence the compact count stands for, for the tooltip and
                // for a screen reader.
                description: `${label}: ${action}. Currently ${count}${skipped ? `; ${skipped} can't be edited` : ""}.`
            };
        });
    }

    /** Edit can only ever apply where the grid would honor it. */
    canEdit(field) {
        const attributes = this.config[field] || {};
        const describe = this.describeByPath?.[field];
        const type = attributes.type || describe?.dataType || "text";
        return describe?.isEditable !== false && !isProgress(type);
    }

    handleToggleBulk() {
        this.isBulkOpen = !this.isBulkOpen;
    }

    /** Stays open, so several flags can be set in a row. */
    handleBulkItem(event) {
        const { flag } = event.currentTarget.dataset;
        const item = this.bulkItems.find((candidate) => candidate.flag === flag);
        const turnOn = !item.isAll;
        const next = { ...this.config };
        this.fields.forEach((field) => {
            if (flag === "edit" && !this.canEdit(field)) {
                return;
            }
            const attributes = { ...(next[field] || {}) };
            // The same values the column's own checkbox writes: Edit and Filter
            // store an opt-in, Sort and Wrap default on and store the opt-out.
            if (flag === "edit" || flag === "filter") {
                if (turnOn) {
                    attributes[flag] = true;
                } else {
                    delete attributes[flag];
                }
            } else if (turnOn) {
                delete attributes[flag];
            } else {
                attributes[flag] = false;
            }
            if (Object.keys(attributes).length) {
                next[field] = attributes;
            } else {
                delete next[field];
            }
        });
        this.publish(next);
    }

    handleBulkFocusOut(event) {
        const menu = this.template.querySelector(".bulk");
        if (!event.relatedTarget || !menu?.contains(event.relatedTarget)) {
            this.isBulkOpen = false;
        }
    }

    handleBulkKeydown(event) {
        if (event.key === "Escape" && this.isBulkOpen) {
            event.stopPropagation();
            this.isBulkOpen = false;
            this.template.querySelector(".bulk__button")?.focus();
        }
    }

    handleTextChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        this.apply(field, attribute, event.target.value || null);
    }

    /**
     * Currency's single Decimal places, written to BOTH fraction bounds.
     *
     * Equal bounds is what "always show N decimals" means: $1,234.50 rather
     * than $1,234.5. Rounding is the platform's -- Intl rounds rather than
     * truncates, so a value stored to five places shows as two correctly
     * without anything from us.
     */
    handleDecimalsChange(event) {
        const { field } = event.currentTarget.dataset;
        const raw = event.target.value;
        const attributes = { ...(this.config[field] || {}) };

        if (raw === "" || raw === null || raw === undefined) {
            delete attributes.minDecimals;
            delete attributes.maxDecimals;
        } else {
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) {
                return;
            }
            // `min` and `max` on the input are advisory -- a typed or pasted
            // value still arrives -- so the clamp is applied here too. Never
            // below zero, and never more places than the field actually
            // stores, which would invent precision the data does not have.
            const ceiling = this.describeByPath?.[field]?.scale;
            const clamped = Math.max(0, Number.isFinite(ceiling) ? Math.min(parsed, ceiling) : parsed);
            attributes.minDecimals = clamped;
            attributes.maxDecimals = clamped;
        }
        // The legacy single value would otherwise win back on the next read.
        delete attributes.scale;
        this.replace(field, attributes);
    }

    handleNumberChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        const raw = event.target.value;
        if (raw === "" || raw === null || raw === undefined) {
            this.apply(field, attribute, null);
            return;
        }
        const parsed = Number(raw);
        this.apply(field, attribute, Number.isFinite(parsed) ? parsed : null);
    }

    handleCheckboxChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        this.apply(field, attribute, event.target.checked ? true : null);
    }

    /**
     * Persists a column flag that defaults ON — wrap, sort, and the two lookup
     * display options.
     *
     * The inverse of `handleCheckboxChange`: `false` is stored and `true` clears the
     * key, so the saved config carries only explicit opt-outs rather than a
     * redundant `true` on every column.
     */
    handleDefaultOnFlagChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        this.apply(field, attribute, event.target.checked ? null : false);
    }

    handleSelectChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        this.apply(field, attribute, event.detail.value || null);
    }

    handleIconChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        this.apply(field, attribute, event.detail.value || null);
    }

    /**
     * Changing the type invalidates the settings that belonged to the old one.
     *
     * A currency code left behind on a column now shown as text is inert rather
     * than wrong, but it reappears if the admin switches back and looks like a
     * setting they never made. Clearing is the honest option, and it matches
     * what changing the record collection's object already does to columns.
     */
    handleTypeChange(event) {
        const { field } = event.currentTarget.dataset;
        const attributes = { ...(this.config[field] || {}) };
        // Badge is a display in the same list, so the chosen value splits into
        // a real type and a flag rather than being stored as written.
        const { type: next, badge } = resolveDisplay(event.detail.value, this.describeByPath?.[field]?.displayType);
        const wasGroup = attributeGroupFor(attributes.type || "text");
        const isGroup = attributeGroupFor(next || "text");

        if (wasGroup !== isGroup) {
            ["minDecimals", "maxDecimals", "minIntegerDigits", "currencyCode", "currencyDisplayAs", "step"].forEach(
                (key) => delete attributes[key]
            );
        }
        if (next) {
            attributes.type = next;
        } else {
            delete attributes.type;
        }
        if (badge) {
            attributes.badge = true;
        } else {
            delete attributes.badge;
        }
        this.replace(field, attributes);
    }

    /* ------------------------------------------------------------------ *
     * Handlers — color and rules
     * ------------------------------------------------------------------ */

    /** Switching mode drops the other mode's settings, because they are
     *  exclusive and leaving both stored invites "which one won". */
    handleColorModeChange(event) {
        const { field } = event.currentTarget.dataset;
        const mode = event.detail.value;
        const attributes = { ...(this.config[field] || {}) };

        attributes.colorMode = mode === "none" ? undefined : mode;
        if (mode !== "column") {
            delete attributes.columnColor;
            delete attributes.columnTextOnly;
        }
        if (mode !== "conditional") {
            delete attributes.format;
        }
        if (attributes.colorMode === undefined) {
            delete attributes.colorMode;
        }
        this.replace(field, attributes);
    }

    handleAddRule(event) {
        const { field } = event.currentTarget.dataset;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        this.openRuleKey = `${field}#${rules.length}`;
        rules.push({
            color: DEFAULT_RULE_COLOR,
            logic: FORMAT_LOGIC.ALL,
            conditions: [{ field, operator: defaultOperatorFor(this.kindFor(field)), value: "" }]
        });
        this.applyRules(field, rules);
    }

    handleDeleteRule(event) {
        const { field, ruleIndex } = event.currentTarget.dataset;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        rules.splice(Number(ruleIndex), 1);
        this.openRuleKey = null;
        this.applyRules(field, rules);
    }

    /** Order is the model: rules are checked top down and the first match wins. */
    handleMoveRule(event) {
        const { field, ruleIndex, direction } = event.currentTarget.dataset;
        const from = Number(ruleIndex);
        const to = direction === "up" ? from - 1 : from + 1;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        if (to < 0 || to >= rules.length) {
            return;
        }
        [rules[from], rules[to]] = [rules[to], rules[from]];
        // The open rule moves with its card.
        if (this.openRuleKey === `${field}#${from}`) {
            this.openRuleKey = `${field}#${to}`;
        } else if (this.openRuleKey === `${field}#${to}`) {
            this.openRuleKey = `${field}#${from}`;
        }
        this.applyRules(field, rules);
    }

    /** The column-wide color: every cell, or a gauge's fill. */
    handleColumnColorChange(event) {
        const { field } = event.currentTarget.dataset;
        this.apply(field, "columnColor", event.detail.value);
    }

    handleRuleColorChange(event) {
        const { field, ruleIndex } = event.currentTarget.dataset;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        rules[Number(ruleIndex)] = { ...rules[Number(ruleIndex)], color: event.detail.value };
        this.applyRules(field, rules);
    }

    handleRuleChange(event) {
        const { field, ruleIndex, attribute } = event.currentTarget.dataset;
        const raw = event.detail?.value ?? event.target.value;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        const rule = { ...rules[Number(ruleIndex)] };

        if (attribute === "textOnly") {
            rule.textOnly = event.target.checked || undefined;
        } else if (raw) {
            rule[attribute] = raw;
        } else {
            delete rule[attribute];
        }
        rules[Number(ruleIndex)] = rule;
        this.applyRules(field, rules);
    }

    handleAddCondition(event) {
        const { field, ruleIndex } = event.currentTarget.dataset;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        const rule = { ...rules[Number(ruleIndex)] };
        rule.conditions = [
            ...(rule.conditions || []),
            { field, operator: defaultOperatorFor(this.kindFor(field)), value: "" }
        ];
        rules[Number(ruleIndex)] = rule;
        this.applyRules(field, rules);
    }

    handleDeleteCondition(event) {
        const { field, ruleIndex, conditionIndex } = event.currentTarget.dataset;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        const rule = { ...rules[Number(ruleIndex)] };
        rule.conditions = [...(rule.conditions || [])];
        rule.conditions.splice(Number(conditionIndex), 1);
        rules[Number(ruleIndex)] = rule;
        this.applyRules(field, rules);
    }

    handleConditionChange(event) {
        const { field, ruleIndex, conditionIndex, attribute } = event.currentTarget.dataset;
        const raw = event.detail?.value ?? event.target.value;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        const rule = { ...rules[Number(ruleIndex)] };
        rule.conditions = [...(rule.conditions || [])];
        const condition = { ...rule.conditions[Number(conditionIndex)], [attribute]: raw };

        // Changing the tested field can invalidate the operator: "greater than"
        // is not on offer for a picklist. Reset rather than persist one the
        // field cannot use.
        if (attribute === "field") {
            const allowed = operatorsFor(this.kindFor(raw)).map((option) => option.value);
            if (!allowed.includes(condition.operator)) {
                condition.operator = defaultOperatorFor(this.kindFor(raw));
            }
        }
        rule.conditions[Number(conditionIndex)] = condition;
        rules[Number(ruleIndex)] = rule;
        this.applyRules(field, rules);
    }

    applyRules(field, rules) {
        const attributes = { ...(this.config[field] || {}) };
        if (rules.length) {
            attributes.format = rules;
            attributes.colorMode = "conditional";
        } else {
            delete attributes.format;
        }
        this.replace(field, attributes);
    }

    /* ------------------------------------------------------------------ *
     * Persistence
     * ------------------------------------------------------------------ */

    handleClearColumn(event) {
        const field = event.currentTarget.dataset.field;
        const next = { ...this.config };
        delete next[field];
        this.publish(next);
    }

    handleClearAll() {
        this.openField = null;
        this.publish({});
    }

    /**
     * Writes one attribute. Empty attributes are dropped rather than stored as
     * null, and a column with no attributes left drops out entirely, so the
     * persisted JSON stays as small as what the admin actually configured.
     */
    apply(field, attribute, value) {
        const attributes = { ...(this.config[field] || {}) };

        if (value === null || value === "" || value === undefined) {
            delete attributes[attribute];
        } else {
            attributes[attribute] = value;
        }
        this.replace(field, attributes);
    }

    /** Writes a whole attribute bag for one column, dropping it when empty. */
    replace(field, attributes) {
        const next = { ...this.config };
        const cleaned = Object.fromEntries(
            Object.entries(attributes).filter(([, value]) => value !== null && value !== undefined && value !== "")
        );
        if (Object.keys(cleaned).length) {
            next[field] = cleaned;
        } else {
            delete next[field];
        }
        this.publish(next);
    }

    publish(config) {
        // Only keep entries for columns that are still selected.
        const selected = new Set(this.fields);
        const pruned = Object.fromEntries(Object.entries(config).filter(([field]) => selected.has(field)));
        const value = Object.keys(pruned).length ? JSON.stringify(pruned) : null;
        this.dispatchEvent(new CustomEvent("columnconfigchange", { detail: { value } }));
    }
}

/** Help text naming the field's own precision, so the ceiling is not a mystery. */
function decimalsHelpFor(scale) {
    const rounds = "A value stored to more places is rounded, not cut off: 123.4567 shown to 2 places reads 123.46.";
    if (scale === null || scale === undefined) {
        return rounds;
    }
    return `This field stores ${scale} decimal place${scale === 1 ? "" : "s"}, so that is the most it can show. ${rounds}`;
}
