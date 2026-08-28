/**
 * Filter editor for one column, opened from that column's header menu.
 *
 * Modelled on the list view and report builder filter popover, minus the Field
 * picker: the column you opened the menu on IS the field, so this asks only for an
 * Operator and a Value. One control fewer, which matters at Experience Cloud
 * widths.
 *
 * A modal rather than a popover anchored to the header. `lightning-datatable` has
 * no anchor to hang one on, and hand-positioning inside a scrolling table lands in
 * the same stacking-context trap already documented for Grid Studio. A modal also
 * degrades better when the column is narrow.
 *
 * Operators come from `c/fgrid_gridModel`, which also decides which of them need
 * no value at all — blankness checks and the relative date ranges. For those the
 * value control is hidden rather than disabled, because there is nothing to say.
 *
 * This component owns no filter state. It edits a copy and emits the result, so
 * the grid stays the single owner of what is filtered.
 */
import { LightningElement, api } from "lwc";
import {
    FILTER_KIND,
    FILTER_OPERATOR,
    NO_VALUE_OPERATORS,
    operatorsFor,
    defaultOperatorFor,
    resolveDatePreset
} from "c/fgrid_gridModel";

const BOOLEAN_OPTIONS = [
    { label: "True", value: "true" },
    { label: "False", value: "false" }
];

export default class FgridFilterEditor extends LightningElement {
    /** The column being filtered: `{ path, label, kind, options }`. */
    @api column;

    /** Mirrors the grid's Match Case setting, so the popup can say so. */
    @api matchCase = false;

    /** Existing filter for that column, if any. */
    @api
    get filter() {
        return this._filter;
    }
    set filter(value) {
        this._filter = value || null;
        this.draft = this.toDraft(value);
    }

    _filter = null;
    draft = {};

    booleanOptions = BOOLEAN_OPTIONS;

    /** Working copy, so Cancel genuinely cancels. */
    toDraft(filter) {
        const kind = this.column?.kind || FILTER_KIND.TEXT;
        if (!filter || typeof filter !== "object") {
            return {
                operator: defaultOperatorFor(kind),
                // A checkbox filter starts at False rather than empty. The combobox
                // has no blank option, so it already SHOWS False — leaving the draft
                // empty meant Apply was disabled while False was on screen, and
                // choosing False fired no change event because it was already
                // selected. True was reachable, False was not.
                value: kind === FILTER_KIND.BOOLEAN ? false : typeof filter === "string" ? filter : "",
                values: []
            };
        }
        return {
            operator: filter.operator || defaultOperatorFor(kind),
            value: filter.value ?? "",
            values: Array.isArray(filter.values) ? [...filter.values] : []
        };
    }

    /* ------------------------------------------------------------------ *
     * Derived
     * ------------------------------------------------------------------ */

    get heading() {
        return `Filter by ${this.column?.label || "column"}`;
    }

    get operatorOptions() {
        return operatorsFor(this.column?.kind);
    }

    get needsValue() {
        return !NO_VALUE_OPERATORS.has(this.draft.operator);
    }

    get isText() {
        return this.needsValue && this.column?.kind === FILTER_KIND.TEXT;
    }

    get isPicklist() {
        return this.needsValue && this.column?.kind === FILTER_KIND.PICKLIST;
    }

    get isNumber() {
        return this.needsValue && this.column?.kind === FILTER_KIND.NUMBER;
    }

    get isDate() {
        return this.needsValue && this.column?.kind === FILTER_KIND.DATE;
    }

    get isBoolean() {
        return this.needsValue && this.column?.kind === FILTER_KIND.BOOLEAN;
    }

    get booleanValue() {
        return this.draft.value === true || this.draft.value === "true" ? "true" : "false";
    }

    get picklistOptions() {
        return this.column?.options || [];
    }

    /** Apply is refused rather than silently saving a filter that matches nothing. */
    get isApplyDisabled() {
        if (!this.needsValue) {
            return false;
        }
        if (this.column?.kind === FILTER_KIND.PICKLIST) {
            return this.draft.values.length === 0;
        }
        // A checkbox always holds a usable value — False is a filter, not an empty
        // one — so there is nothing to withhold Apply for.
        if (this.column?.kind === FILTER_KIND.BOOLEAN) {
            return false;
        }
        return String(this.draft.value ?? "").trim() === "";
    }

    get canRemove() {
        return Boolean(this._filter);
    }

    /* ------------------------------------------------------------------ *
     * Handlers
     * ------------------------------------------------------------------ */

    handleOperator(event) {
        this.draft = { ...this.draft, operator: event.detail.value };
    }

    handleValue(event) {
        this.draft = { ...this.draft, value: event.target.value };
    }

    handlePicklistValues(event) {
        this.draft = { ...this.draft, values: event.detail.value || [] };
    }

    handleBoolean(event) {
        this.draft = { ...this.draft, value: event.detail.value === "true" };
    }

    handleKeyDown(event) {
        if (event.key === "Escape") {
            this.handleCancel();
        }
    }

    handleApply() {
        const kind = this.column?.kind || FILTER_KIND.TEXT;
        const filter = { kind, operator: this.draft.operator };

        if (NO_VALUE_OPERATORS.has(this.draft.operator)) {
            // A relative date carries the range it resolved to right now, so
            // matching never has to consult the clock. See resolveDatePreset.
            if (this.draft.operator !== FILTER_OPERATOR.BLANK && this.draft.operator !== FILTER_OPERATOR.NOT_BLANK) {
                Object.assign(filter, resolveDatePreset(this.draft.operator));
            }
        } else if (kind === FILTER_KIND.PICKLIST) {
            filter.values = this.draft.values;
        } else if (kind === FILTER_KIND.BOOLEAN) {
            filter.value = this.draft.value === true || this.draft.value === "true";
        } else {
            filter.value = this.draft.value;
        }

        this.dispatchEvent(new CustomEvent("filtersave", { detail: { path: this.column?.path, filter } }));
    }

    handleRemove() {
        this.dispatchEvent(new CustomEvent("filterremove", { detail: { path: this.column?.path } }));
    }

    handleCancel() {
        this.dispatchEvent(new CustomEvent("filterclose"));
    }
}
