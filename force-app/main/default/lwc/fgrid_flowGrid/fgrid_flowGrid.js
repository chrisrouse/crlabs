/**
 * Flow Grid — runtime screen component.
 *
 * Renders the record collection a Flow supplies, using real field metadata from
 * `FlowGridController.getGridMetadata` and the two JSON configuration properties
 * the property editor writes: `columnFields` (ordered paths) and `columnConfig`
 * (per-column attributes keyed by path).
 *
 * Column derivation is shared with the Grid Studio preview through
 * `c/fgrid_gridModel`, so what an admin previews is what runs.
 *
 * IMPLEMENTED: display, real labels and types, record links, selection and its
 * outputs, column sorting, required validation, header and counts, row cap.
 * NOT YET: search, column filters, pagination, inline editing, row actions, and
 * the user-defined-object JSON source. Those properties exist in the contract
 * and are accepted, but do nothing yet.
 */
import { LightningElement, api, wire } from "lwc";
import { FlowAttributeChangeEvent } from "lightning/flowSupport";
import getGridMetadata from "@salesforce/apex/FlowGridController.getGridMetadata";
import { buildColumns, buildRows, sortRows, parseFieldList, parseColumnConfig } from "c/fgrid_gridModel";

export default class FgridFlowGrid extends LightningElement {
    // ----- Data source -----
    @api objectApiName;
    @api preSelectedRecords;
    @api keyField = "Id";
    @api isUserDefinedObject = false;
    @api recordsJson;
    @api preSelectedRecordsJson;
    @api isSerializedRecordData = false;
    @api serializedRecordData;

    // ----- Table display -----
    @api showHeader = false;
    @api tableLabel;
    @api tableIcon;
    @api showRecordCount = false;
    @api showSelectedCount = false;
    @api showRowNumbers = false;
    @api tableHeight;
    @api showBorder;
    @api allowOverflow = false;

    // ----- Selection -----
    @api selectionMode = "Multiple";
    @api isRequired = false;
    @api hideClearSelectionButton = false;

    // ----- Search, filter, sort -----
    @api showSearchBar = false;
    @api hideHeaderActions = false;
    @api matchCaseOnFilters = false;
    @api caseInsensitiveSort = false;

    // ----- Pagination -----
    @api showPagination = false;
    @api recordsPerPage;
    @api showFirstLastButtons = false;
    @api maxNumberOfRows;

    // ----- Inline editing -----
    @api suppressBottomBar = false;
    @api navigateNextOnSave = false;

    // ----- Row action -----
    @api rowActionType = "None";
    @api rowActionDisplay = "Icon";
    @api rowActionPosition = "Right";
    @api rowActionLabel;
    @api rowActionIcon;
    @api rowActionColor;
    @api rowActionButtonLabel;
    @api rowActionButtonIcon;
    @api rowActionButtonIconPosition = "Left";
    @api rowActionButtonVariant = "neutral";
    @api maxRemovedRows;

    // ----- Links and formatting -----
    @api showNameFieldLink;
    @api openLinkInSameTab = false;
    @api suppressCurrencyConversion = false;

    // ----- Picklist editing -----
    @api recordTypeId;
    @api showAllPicklistValues = false;
    @api allowNoneToBeChosen;

    @api flowRuntimeApiVersion;

    // ----- Outputs -----
    @api outputSelectedRecords = [];
    @api outputSelectedRecord;
    @api outputEditedRecords = [];
    @api outputRemovedRecords = [];
    @api outputRemainingRecords = [];
    @api outputActionedRecord;
    @api outputSelectedRecordsJson;
    @api outputEditedRecordsJson;
    @api outputRemovedRecordsJson;
    @api outputRemainingRecordsJson;
    @api outputActionedRecordJson;
    @api selectedCount = 0;
    @api editedCount = 0;
    @api removedCount = 0;
    @api selectedRowKey;
    @api sortedBy;
    @api sortDirection;

    /* ------------------------------------------------------------------ *
     * Reactive inputs
     * ------------------------------------------------------------------ */

    _records = [];
    _columnPaths = [];
    _columnConfig = {};
    _selectedKeys = [];
    _metadata;
    _metadataError;
    _sortField;
    _sortDirection = "asc";
    _touched = false;

    @api
    get records() {
        return this._records;
    }
    set records(value) {
        this._records = Array.isArray(value) ? value : [];
        this.applyPreSelection();
    }

    /** Ordered field paths. Also the reactive key for the Apex describe call. */
    @api
    get columnFields() {
        return this._columnFieldsRaw;
    }
    set columnFields(value) {
        this._columnFieldsRaw = value;
        this._columnPaths = parseFieldList(value);
    }

    @api
    get columnConfig() {
        return this._columnConfigRaw;
    }
    set columnConfig(value) {
        this._columnConfigRaw = value;
        this._columnConfig = parseColumnConfig(value);
    }

    /**
     * Real field metadata. Cacheable, so repeated interviews on the same object
     * and columns cost one server call.
     */
    @wire(getGridMetadata, { objectApiName: "$objectApiName", fieldPaths: "$_columnPaths" })
    wiredMetadata({ data, error }) {
        if (data) {
            this._metadata = data;
            this._metadataError = undefined;
        } else if (error) {
            this._metadata = undefined;
            this._metadataError = reduceError(error);
        }
    }

    /* ------------------------------------------------------------------ *
     * Derived state
     * ------------------------------------------------------------------ */

    /** Describe keyed by field path, for buildColumns. */
    get describeByPath() {
        const columns = this._metadata?.columns;
        if (!columns) {
            return null;
        }
        return columns.reduce((map, column) => {
            map[column.fieldPath] = column;
            return map;
        }, {});
    }

    get columns() {
        return buildColumns(this._columnPaths, this._columnConfig, {
            hideHeaderActions: this.hideHeaderActions,
            describeByPath: this.describeByPath,
            linkNameField: this.isNameFieldLinked,
            openLinksInSameTab: this.openLinkInSameTab
        });
    }

    /** Rows, capped and sorted. */
    get rows() {
        const columns = this.columns;
        let rows = buildRows(this._records, columns, this.keyField);

        if (this._sortField) {
            rows = sortRows(rows, this._sortField, this._sortDirection, this.caseInsensitiveSort);
        }

        const cap = Number(this.maxNumberOfRows);
        return Number.isFinite(cap) && cap > 0 ? rows.slice(0, cap) : rows;
    }

    get hasRows() {
        return this.rows.length > 0;
    }

    get hasColumns() {
        return this._columnPaths.length > 0;
    }

    /** Columns the running user cannot read, surfaced rather than left blank. */
    get inaccessibleColumns() {
        return this.columns
            .filter((column) => column.fgridInaccessible)
            .map((column) => column.fgridError || `${column.fieldName} is not accessible.`);
    }

    get hasInaccessibleColumns() {
        return this.inaccessibleColumns.length > 0;
    }

    get hasError() {
        return Boolean(this._metadataError);
    }

    get errorMessage() {
        return this._metadataError;
    }

    /* True-defaulting booleans: undefined means the admin never touched it. */

    get isBordered() {
        return this.showBorder !== false;
    }

    get isNameFieldLinked() {
        return this.showNameFieldLink !== false;
    }

    get isNoneAllowed() {
        return this.allowNoneToBeChosen !== false;
    }

    /* ----- selection ----- */

    get isSelectable() {
        return this.selectionMode !== "None";
    }

    get hideCheckboxColumn() {
        return !this.isSelectable;
    }

    get maxRowSelection() {
        return this.selectionMode === "Single" ? 1 : undefined;
    }

    get selectedRowKeys() {
        return this._selectedKeys;
    }

    get showClearSelection() {
        return this.isSelectable && !this.hideClearSelectionButton && this._selectedKeys.length > 0;
    }

    /* ----- header ----- */

    get headerLabel() {
        return this.tableLabel || this._metadata?.objectInfo?.pluralLabel || "Records";
    }

    get headerIcon() {
        return this.tableIcon || this._metadata?.objectInfo?.iconName;
    }

    get hasHeaderIcon() {
        return Boolean(this.headerIcon);
    }

    get headerCounts() {
        const parts = [];
        if (this.showRecordCount) {
            const total = this.rows.length;
            parts.push(`${total} ${total === 1 ? "item" : "items"}`);
        }
        if (this.showSelectedCount) {
            parts.push(`${this._selectedKeys.length} selected`);
        }
        return parts.join(" • ");
    }

    get hasHeaderCounts() {
        return Boolean(this.headerCounts);
    }

    /* ----- layout ----- */

    get wrapperClass() {
        const classes = ["grid__wrapper"];
        if (this.isBordered) {
            classes.push("grid__wrapper_bordered");
        }
        if (this.allowOverflow) {
            classes.push("grid__wrapper_overflow");
        }
        return classes.join(" ");
    }

    get wrapperStyle() {
        return this.tableHeight ? `height: ${this.tableHeight}; overflow: auto;` : "";
    }

    /** Shown once the user has interacted and a required selection is missing. */
    get validationMessage() {
        return this._touched && this.isRequired && this._selectedKeys.length === 0
            ? "Select at least one row to continue."
            : null;
    }

    get hasValidationMessage() {
        return Boolean(this.validationMessage);
    }

    /* ------------------------------------------------------------------ *
     * Handlers
     * ------------------------------------------------------------------ */

    handleRowSelection(event) {
        this._touched = true;
        const selected = event.detail.selectedRows || [];
        this._selectedKeys = selected.map((row) => row[this.keyField]);
        this.publishSelection();
    }

    handleClearSelection() {
        this._selectedKeys = [];
        this.publishSelection();
    }

    handleSort(event) {
        const { fieldName, sortDirection } = event.detail;
        // A link column sorts on the underlying value, not on the generated URL,
        // which would order rows by record id.
        const column = this.columns.find((candidate) => candidate.fieldName === fieldName);
        this._sortField = column?.fgridLinkFor || fieldName;
        this._sortDirection = sortDirection;
        // sortedBy stays the datatable's own fieldName so the arrow lands on the
        // column the user clicked.
        this.publish("sortedBy", fieldName);
        this.publish("sortDirection", sortDirection);
    }

    /* ------------------------------------------------------------------ *
     * Flow contract
     * ------------------------------------------------------------------ */

    /**
     * Flow calls this before advancing the screen.
     *
     * @returns {{isValid: boolean, errorMessage: string}} Flow validation result
     */
    @api
    validate() {
        if (this.isRequired && this._selectedKeys.length === 0) {
            this._touched = true;
            return { isValid: false, errorMessage: "Select at least one row to continue." };
        }
        return { isValid: true };
    }

    /** Seeds the selection from preSelectedRecords once records arrive. */
    applyPreSelection() {
        if (this._selectedKeys.length || !Array.isArray(this.preSelectedRecords)) {
            return;
        }
        const keys = this.preSelectedRecords.map((record) => record?.[this.keyField]).filter(Boolean);
        if (keys.length) {
            this._selectedKeys = keys;
            this.publishSelection();
        }
    }

    /** Publishes every selection-derived output in one pass. */
    publishSelection() {
        const keys = new Set(this._selectedKeys);
        const selected = this._records.filter((record) => keys.has(record?.[this.keyField]));

        this.publish("outputSelectedRecords", selected);
        this.publish("outputSelectedRecord", selected.length === 1 ? selected[0] : null);
        this.publish("outputSelectedRecordsJson", selected.length ? JSON.stringify(selected) : null);
        this.publish("selectedCount", selected.length);
        this.publish("selectedRowKey", selected.length === 1 ? selected[0]?.[this.keyField] : null);
    }

    /** Assigns a Flow output and mirrors it locally so getters stay in step. */
    publish(name, value) {
        this[name] = value;
        this.dispatchEvent(new FlowAttributeChangeEvent(name, value));
    }
}

/** Flattens an Apex or wire error into one readable sentence. */
function reduceError(error) {
    if (!error) {
        return null;
    }
    if (Array.isArray(error.body)) {
        return error.body.map((entry) => entry.message).join(", ");
    }
    return error.body?.message || error.message || "Unable to load field information.";
}
