/**
 * The Grid Studio's field list: every field the grid's records carry, one
 * click to add it as a column or take it away.
 *
 * Informed by Avonni's builder, which lists an object's fields beside the
 * preview, and laid out like Flow Builder's own Fields palette. Smarter than
 * either in one way: when the records come from a Get Records that chose
 * specific fields, only those are offered, because a column on any other
 * field fails at run time. See c/fgrid_recordSource.
 *
 * Emits `columnfieldschange` with `detail.value` as the JSON array the
 * `columnFields` property stores, or null when the last column is removed.
 */
import { LightningElement, api, wire } from "lwc";
import { getObjectInfo } from "lightning/uiObjectInfoApi";
import { parseFieldList } from "c/fgrid_gridModel";
import { retrievedFields } from "c/fgrid_recordSource";

/** What a dragged field carries. c/fgrid_flowGridStudio reads the same type. */
const FIELD_DRAG_TYPE = "application/x-fgrid-field";

/** A utility icon per field type, as Flow Builder's palette marks its rows. */
const ICON_FOR_TYPE = {
    Boolean: "utility:check",
    Currency: "utility:number_input",
    Date: "utility:date_input",
    DateTime: "utility:date_time",
    Double: "utility:number_input",
    Email: "utility:email",
    Int: "utility:number_input",
    Long: "utility:number_input",
    MultiPicklist: "utility:multi_picklist",
    Percent: "utility:number_input",
    Phone: "utility:call",
    Picklist: "utility:picklist_type",
    Reference: "utility:record_lookup",
    Time: "utility:clock",
    Url: "utility:link"
};

export default class FgridFieldPalette extends LightningElement {
    @api objectApiName;
    @api recordsValue;
    @api builderContext;
    @api columnFields;

    searchTerm = "";
    objectInfo;
    loadError;

    @wire(getObjectInfo, { objectApiName: "$objectApiName" })
    wiredObjectInfo({ data, error }) {
        this.objectInfo = data;
        this.loadError = error;
    }

    get source() {
        return retrievedFields(this.recordsValue, this.builderContext);
    }

    get selected() {
        return parseFieldList(this.columnFields);
    }

    get hasObject() {
        return Boolean(this.objectApiName);
    }

    get isLoading() {
        return this.hasObject && !this.objectInfo && !this.loadError;
    }

    get objectLabel() {
        return this.objectInfo?.label || this.objectApiName;
    }

    get sourceLabel() {
        return this.source.sourceLabel;
    }

    /** Every field when the source stores all of them, else the queried few. */
    get scopeLabel() {
        const { fields } = this.source;
        if (!fields) {
            return "All fields";
        }
        return fields.length === 1 ? "1 field retrieved" : `${fields.length} fields retrieved`;
    }

    get isRestricted() {
        return Boolean(this.source.fields);
    }

    /** The fields on offer: the object's, narrowed to what the source queries. */
    get available() {
        const all = Object.values(this.objectInfo?.fields || {});
        const allowed = this.source.fields ? new Set(this.source.fields) : null;
        return all
            .filter((field) => !allowed || allowed.has(field.apiName))
            .sort((a, b) => (a.label || a.apiName).localeCompare(b.label || b.apiName));
    }

    get fields() {
        const selected = new Set(this.selected);
        const term = this.searchTerm.trim().toLowerCase();
        return this.available
            .filter(
                (field) =>
                    !term ||
                    (field.label || "").toLowerCase().includes(term) ||
                    field.apiName.toLowerCase().includes(term)
            )
            .map((field) => {
                const inUse = selected.has(field.apiName);
                return {
                    apiName: field.apiName,
                    label: field.label || field.apiName,
                    icon: ICON_FOR_TYPE[field.dataType] || "utility:text",
                    inUse,
                    pressed: String(inUse),
                    title: `${inUse ? "Remove" : "Add"} ${field.label || field.apiName} ${inUse ? "from" : "as"} a column`,
                    rowClass: inUse ? "palette__row palette__row_in-use" : "palette__row"
                };
            });
    }

    get hasFields() {
        return this.fields.length > 0;
    }

    /**
     * Columns already chosen that the records will not carry.
     *
     * The grid shows the records exactly as Flow hands them and fetches
     * nothing extra, so such a column renders empty. Two ways in:
     *   - a field the Get Records did not choose, and
     *   - any relationship path, such as Owner.Name: a Get Records never
     *     returns parent fields, even when it stores all fields.
     * Only judged for a Get Records. Records built some other way, by an Apex
     * action for one, may well carry parent fields.
     */
    get missingColumns() {
        const { fields, fromGetRecords } = this.source;
        if (!fromGetRecords) {
            return [];
        }
        const retrieved = fields ? new Set(fields) : null;
        return this.selected.filter((path) => path.includes(".") || (retrieved && !retrieved.has(path)));
    }

    get hasMissingColumns() {
        return this.missingColumns.length > 0;
    }

    get missingMessage() {
        const names = this.missingColumns.join(", ");
        const count = this.missingColumns.length;
        const it = count === 1 ? "it" : "them";
        return `${count === 1 ? "1 column is" : `${count} columns are`} not retrieved by ${this.sourceLabel}, so ${count === 1 ? "it" : "they"} will be empty when the flow runs: ${names}. Add ${it} to the Get Records, or remove ${it} here. Fields from a related record are never retrieved by a Get Records.`;
    }

    /** Carries the field to the preview, which drops it between two columns. */
    handleDragStart(event) {
        const { field } = event.currentTarget.dataset;
        event.dataTransfer.setData(FIELD_DRAG_TYPE, field);
        event.dataTransfer.setData("text/plain", field);
        event.dataTransfer.effectAllowed = "copyMove";
    }

    handleSearch(event) {
        this.searchTerm = event.target.value || "";
    }

    /** Adds to the end, where a new column lands in the grid, or takes it out. */
    handleToggle(event) {
        const { field } = event.currentTarget.dataset;
        const current = this.selected;
        const next = current.includes(field) ? current.filter((path) => path !== field) : [...current, field];
        this.dispatchEvent(
            new CustomEvent("columnfieldschange", { detail: { value: next.length ? JSON.stringify(next) : null } })
        );
    }
}
