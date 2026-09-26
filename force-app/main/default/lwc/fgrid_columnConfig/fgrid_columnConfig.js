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
 *   full     — grid plus drawer, for the Grid Studio modal
 */
import { LightningElement, api, track } from "lwc";
import { parseFieldList, parseColumnConfig, filterKindFor, operatorsFor, defaultOperatorFor } from "c/fgrid_gridModel";
import { typeOptionsFor, attributeGroupFor, ATTRIBUTE_GROUP, CURRENCY_DISPLAYS } from "c/fgrid_columnTypes";
import {
    FORMAT_STYLES,
    TEXT_ONLY_STYLES,
    FORMAT_LOGIC,
    FORMAT_LOGIC_OPTIONS,
    parseFormatRules
} from "c/fgrid_formatRules";

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
    { label: "Per column — one style for every cell", value: "column" },
    { label: "Conditional — a style per cell, by rule", value: "conditional" }
];

const EMPHASIS_OPTIONS = [
    { label: "None", value: "" },
    { label: "Bold", value: "bold" },
    { label: "ALL CAPS", value: "caps" },
    { label: "Bold and caps", value: "boldCaps" }
];

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

    /** The one open drawer. Single panel by decision: two open drawers in a
     *  modal is more scrolling than context. */
    @track openField = null;

    alignmentOptions = ALIGNMENTS;
    colorModeOptions = COLOR_MODES;
    emphasisOptions = EMPHASIS_OPTIONS;
    logicOptions = FORMAT_LOGIC_OPTIONS;
    currencyDisplayOptions = CURRENCY_DISPLAYS;

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

            return {
                key: field,
                field,
                position: index + 1,
                label: attributes.label ?? "",
                width: attributes.width ?? null,
                align: attributes.align ?? "",
                edit: Boolean(attributes.edit),
                filter: Boolean(attributes.filter),
                // Sorting is on unless turned off, like wrapping: the stored
                // value is the opt-out, so a saved config carries only what an
                // admin actually changed.
                sort: attributes.sort !== false,
                wrap: attributes.wrap !== false,

                isOpen,
                toggleLabel: isOpen ? "Close" : "Settings",
                ruleCount: rules.length,
                ruleCountLabel: rules.length === 1 ? "1 rule" : `${rules.length} rules`,
                hasRules: rules.length > 0,

                // ----- drawer -----
                type,
                typeOptions: typeOptionsFor(describe?.displayType),
                isNumberGroup: group === ATTRIBUTE_GROUP.NUMBER || group === ATTRIBUTE_GROUP.CURRENCY,
                isCurrencyGroup: group === ATTRIBUTE_GROUP.CURRENCY,
                isTextGroup: group === ATTRIBUTE_GROUP.TEXT,
                isPicklistGroup: group === ATTRIBUTE_GROUP.PICKLIST,
                isLookupGroup: group === ATTRIBUTE_GROUP.LOOKUP,
                showCurrencyCode: group === ATTRIBUTE_GROUP.CURRENCY && this.multiCurrency,
                currencyOptions: this.currencyOptions,

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
                icon: attributes.icon ?? "",
                headerIcon: attributes.headerIcon ?? "",
                hasHeaderIcon: Boolean(attributes.headerIcon),
                hideLabel: Boolean(attributes.hideLabel),
                badge: Boolean(attributes.badge),

                colorMode,
                isPerColumnColor: colorMode === "column",
                isConditionalColor: colorMode === "conditional",
                columnStyle: attributes.columnStyle ?? "",
                columnTextOnly: Boolean(attributes.columnTextOnly),
                columnEmphasis: attributes.emphasis ?? "",
                styleOptions: FORMAT_STYLES,
                textOnlyStyleOptions: TEXT_ONLY_STYLES,
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
                style: rule.style ?? "",
                textOnly: Boolean(rule.textOnly),
                emphasis: rule.emphasis ?? "",
                icon: rule.icon ?? "",
                logic: rule.logic || FORMAT_LOGIC.ALL,
                customLogic: rule.customLogic ?? "",
                showCustomLogic: (rule.logic || FORMAT_LOGIC.ALL) === FORMAT_LOGIC.CUSTOM,
                showConditions: (rule.logic || FORMAT_LOGIC.ALL) !== FORMAT_LOGIC.ALWAYS,
                summary: this.summarize(rule),
                isFirst: ruleIndex === 0,
                isLast: ruleIndex === rules.length - 1,
                styleOptions: rule.textOnly ? TEXT_ONLY_STYLES : FORMAT_STYLES,
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
        const style = FORMAT_STYLES.find((option) => option.value === rule.style)?.label || "No style";
        if ((rule.logic || FORMAT_LOGIC.ALL) === FORMAT_LOGIC.ALWAYS) {
            return `Always → ${style}`;
        }
        const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
        if (!conditions.length) {
            return `Always → ${style}`;
        }
        const first = conditions[0];
        const more = conditions.length > 1 ? ` +${conditions.length - 1}` : "";
        return `${this.labelFor(first.field)} ${first.operator ?? ""} ${first.value ?? ""}${more} → ${style}`.trim();
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

    handleToggleDrawer(event) {
        const field = event.currentTarget.dataset.field;
        this.openField = this.openField === field ? null : field;
    }

    handleTextChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        this.apply(field, attribute, event.target.value || null);
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
        const next = event.detail.value || null;
        const attributes = { ...(this.config[field] || {}) };
        const wasNumeric = attributeGroupFor(attributes.type || "text");
        const isNumeric = attributeGroupFor(next || "text");

        if (wasNumeric !== isNumeric) {
            ["minDecimals", "maxDecimals", "minIntegerDigits", "currencyCode", "currencyDisplayAs", "step"].forEach(
                (key) => delete attributes[key]
            );
        }
        if (next) {
            attributes.type = next;
        } else {
            delete attributes.type;
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
            delete attributes.columnStyle;
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
        rules.push({
            style: "error",
            logic: FORMAT_LOGIC.ALL,
            conditions: [{ field, operator: defaultOperatorFor(this.kindFor(field)), value: "" }]
        });
        this.applyRules(field, rules);
    }

    handleDeleteRule(event) {
        const { field, ruleIndex } = event.currentTarget.dataset;
        const rules = [...parseFormatRules(this.config[field]?.format)];
        rules.splice(Number(ruleIndex), 1);
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
