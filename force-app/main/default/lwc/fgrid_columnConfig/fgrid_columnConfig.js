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
 * Two densities:
 *   compact  — read-only summary, for the narrow Flow Builder property panel
 *   full     — editable table, for the Grid Studio modal
 */
import { LightningElement, api } from "lwc";
import { parseFieldList, parseColumnConfig } from "c/fgrid_gridModel";

const ALIGNMENTS = [
    { label: "Default", value: "" },
    { label: "Left", value: "left" },
    { label: "Center", value: "center" },
    { label: "Right", value: "right" }
];

/** Attribute keys held per column, in display order. */
const SIMPLE_KEYS = ["label", "width", "align", "edit", "filter", "wrap", "flex"];
const ADVANCED_KEYS = ["icon", "scale", "type", "cellAttribs", "typeAttribs", "otherAttribs"];

export default class FgridColumnConfig extends LightningElement {
    /** JSON array of ordered field API paths, as the kit field picker persists it. */
    @api columnFields;

    /** JSON object of per-column attributes. */
    @api columnConfig;

    @api objectApiName;

    /** Read-only summary instead of the editable table. */
    @api compact = false;

    alignmentOptions = ALIGNMENTS;

    /* Placeholders live here rather than in the template: LWC parses `{` inside
       an attribute value as a template expression, so a literal JSON example
       cannot be written inline. */
    cellAttribsPlaceholder = '{"class": "slds-theme_shade"}';
    typeAttribsPlaceholder = '{"minimumFractionDigits": 2}';
    otherAttribsPlaceholder = '{"wrapTextMaxLines": 5}';

    /** Field paths whose Advanced block is open. */
    expandedFields = [];

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

    get rows() {
        const config = this.config;
        return this.fields.map((field, index) => {
            const attributes = config[field] || {};
            return {
                key: field,
                field,
                position: index + 1,
                label: attributes.label ?? "",
                width: attributes.width ?? null,
                align: attributes.align ?? "",
                edit: Boolean(attributes.edit),
                filter: Boolean(attributes.filter),
                wrap: Boolean(attributes.wrap),
                flex: Boolean(attributes.flex),
                icon: attributes.icon ?? "",
                scale: attributes.scale ?? null,
                type: attributes.type ?? "",
                cellAttribs: stringifyBlob(attributes.cellAttribs),
                typeAttribs: stringifyBlob(attributes.typeAttribs),
                otherAttribs: stringifyBlob(attributes.otherAttribs),
                isExpanded: this.expandedFields.includes(field),
                expandLabel: this.expandedFields.includes(field) ? "Hide advanced" : "Advanced",
                summary: summarize(attributes)
            };
        });
    }

    /* ------------------------------------------------------------------ *
     * Handlers
     * ------------------------------------------------------------------ */

    handleToggleAdvanced(event) {
        const field = event.currentTarget.dataset.field;
        this.expandedFields = this.expandedFields.includes(field)
            ? this.expandedFields.filter((name) => name !== field)
            : [...this.expandedFields, field];
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

    handleSelectChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        this.apply(field, attribute, event.detail.value || null);
    }

    handleIconChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        this.apply(field, attribute, event.detail.value || null);
    }

    /** Free-text JSON blobs. Invalid JSON is stored verbatim so the admin's
     *  in-progress typing is never discarded; validity is reported separately. */
    handleBlobChange(event) {
        const { field, attribute } = event.currentTarget.dataset;
        const raw = event.target.value;
        if (!raw || !raw.trim()) {
            this.apply(field, attribute, null);
            return;
        }
        try {
            this.apply(field, attribute, JSON.parse(raw));
            event.target.setCustomValidity("");
        } catch {
            event.target.setCustomValidity("Not valid JSON.");
        }
        event.target.reportValidity();
    }

    handleClearColumn(event) {
        const field = event.currentTarget.dataset.field;
        const next = { ...this.config };
        delete next[field];
        this.publish(next);
    }

    handleClearAll() {
        this.publish({});
    }

    /**
     * Writes one attribute. Empty attributes are dropped rather than stored as
     * null, and a column with no attributes left drops out entirely, so the
     * persisted JSON stays as small as what the admin actually configured.
     */
    apply(field, attribute, value) {
        const next = { ...this.config };
        const attributes = { ...(next[field] || {}) };

        if (value === null || value === "" || value === undefined) {
            delete attributes[attribute];
        } else {
            attributes[attribute] = value;
        }

        if (Object.keys(attributes).length) {
            next[field] = attributes;
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

function stringifyBlob(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return typeof value === "string" ? value : JSON.stringify(value);
}

/** One-line description of a column's configured attributes, for compact mode. */
function summarize(attributes) {
    const parts = [...SIMPLE_KEYS, ...ADVANCED_KEYS]
        .filter((key) => attributes[key] !== null && attributes[key] !== undefined && attributes[key] !== "")
        .map((key) => {
            const value = attributes[key];
            return value === true ? key : `${key}: ${typeof value === "object" ? "{…}" : value}`;
        });
    return parts.length ? parts.join(" · ") : "Defaults";
}
