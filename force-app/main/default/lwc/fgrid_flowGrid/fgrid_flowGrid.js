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
 * The row pipeline runs in a fixed order, which is what makes the counts read
 * correctly: source -> minus removed -> cap -> search -> filter -> sort -> page.
 * The cap (maxNumberOfRows) sits before search and filter on purpose: it is a
 * ceiling on what the grid will handle, not a ceiling on results.
 *
 * IMPLEMENTED: display, real labels and types, record links, selection and its
 * outputs, sorting, search, per-column filters, pagination, row actions
 * (standard and remove), required validation, header and counts, row cap, and
 * the user-defined-object JSON source.
 * NOT YET: inline editing and its Cancel/Save bar. `suppressBottomBar` and
 * `navigateNextOnSave` are accepted and inert until then.
 */
import { LightningElement, api, wire } from "lwc";
import { FlowAttributeChangeEvent } from "lightning/flowSupport";
import getGridMetadata from "@salesforce/apex/FlowGridController.getGridMetadata";
import {
    buildColumns,
    buildRows,
    sortRows,
    searchRows,
    filterRows,
    paginate,
    withRowActionColumn,
    parseFieldList,
    parseColumnConfig,
    ROW_ACTION_NAME
} from "c/fgrid_gridModel";

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
    _searchTerm = "";
    /** Per-column filter text, keyed by field path. */
    _filters = {};
    _page = 1;
    /** Keys of rows the user removed with the Remove row action. */
    _removedKeys = [];
    _removalBlockedMessage = null;

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

    /**
     * The records to display, from whichever source is configured.
     *
     * In user-defined mode the Flow supplies serialized JSON instead of a record
     * collection, so there is no SObject and no describe; column types come from
     * columnConfig or the name-based guess.
     */
    get sourceRecords() {
        if (!this.isUserDefinedObject) {
            return this._records;
        }
        const raw =
            this.isSerializedRecordData && this.serializedRecordData ? this.serializedRecordData : this.recordsJson;
        return parseRecordJson(raw);
    }

    /** Records still in the grid, i.e. excluding any the user removed. */
    get remainingRecords() {
        if (!this._removedKeys.length) {
            return this.sourceRecords;
        }
        const removed = new Set(this._removedKeys);
        return this.sourceRecords.filter((record) => !removed.has(record?.[this.keyField]));
    }

    get columns() {
        const columns = buildColumns(this._columnPaths, this._columnConfig, {
            hideHeaderActions: this.hideHeaderActions,
            describeByPath: this.describeByPath,
            // A user-defined object has no record id, so there is nothing to
            // link to.
            linkNameField: this.isNameFieldLinked && !this.isUserDefinedObject,
            openLinksInSameTab: this.openLinkInSameTab
        });

        return withRowActionColumn(columns, {
            actionType: this.rowActionType,
            display: this.rowActionDisplay,
            position: this.rowActionPosition,
            label: this.rowActionLabel,
            iconName: this.rowActionIcon,
            color: this.rowActionColor,
            buttonLabel: this.rowActionButtonLabel,
            buttonIcon: this.rowActionButtonIcon,
            buttonIconPosition: this.rowActionButtonIconPosition,
            buttonVariant: this.rowActionButtonVariant
        });
    }

    /** Every row available after removals and the display cap. */
    get cappedRows() {
        const rows = buildRows(this.remainingRecords, this.columns, this.keyField);
        const cap = Number(this.maxNumberOfRows);
        return Number.isFinite(cap) && cap > 0 ? rows.slice(0, cap) : rows;
    }

    /** Rows surviving search and per-column filters, then sorted. */
    get matchedRows() {
        const columns = this.columns;
        let rows = searchRows(this.cappedRows, columns, this._searchTerm, this.matchCaseOnFilters);
        rows = filterRows(rows, this._filters, this.matchCaseOnFilters);
        if (this._sortField) {
            rows = sortRows(rows, this._sortField, this._sortDirection, this.caseInsensitiveSort);
        }
        return rows;
    }

    /** Page state for the current result set. */
    get pageState() {
        if (!this.showPagination) {
            const rows = this.matchedRows;
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
        return paginate(this.matchedRows, this._page, this.recordsPerPage);
    }

    /** The rows actually handed to the datatable. */
    get rows() {
        return this.pageState.rows;
    }

    get hasRows() {
        return this.rows.length > 0;
    }

    /** True when rows exist but search or filters hid them all. */
    get isFilteredEmpty() {
        return !this.hasRows && this.cappedRows.length > 0;
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

    /* ----- search and filters ----- */

    get searchTerm() {
        return this._searchTerm;
    }

    /** Columns the admin marked filterable, as filter-row inputs. */
    get filterInputs() {
        return this.columns
            .filter((column) => column.fieldName !== ROW_ACTION_NAME)
            .map((column) => ({
                key: column.fieldName,
                path: column.fgridLinkFor || column.fieldName,
                label: column.label
            }))
            .filter((entry) => this._columnConfig?.[entry.path]?.filter === true)
            .map((entry) => ({ ...entry, value: this._filters[entry.path] || "" }));
    }

    get hasFilterInputs() {
        return this.filterInputs.length > 0;
    }

    get hasActiveFilters() {
        return Object.values(this._filters).some((value) => String(value ?? "").trim() !== "");
    }

    get showFilterBar() {
        return this.hasFilterInputs && !this.hideHeaderActions;
    }

    /* ----- pagination ----- */

    get showPaginationBar() {
        return this.showPagination && this.matchedRows.length > 0;
    }

    get pageSummary() {
        const state = this.pageState;
        return `${state.firstRow}-${state.lastRow} of ${state.totalRows}`;
    }

    get isFirstPage() {
        return this.pageState.isFirstPage;
    }

    get isLastPage() {
        return this.pageState.isLastPage;
    }

    /* ----- row removal ----- */

    get removalBlockedMessage() {
        return this._removalBlockedMessage;
    }

    get hasRemovalBlockedMessage() {
        return Boolean(this._removalBlockedMessage);
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

    handleSearch(event) {
        this._searchTerm = event.target.value || "";
        this._page = 1;
    }

    handleFilterChange(event) {
        const path = event.target.dataset.path;
        const value = event.target.value || "";
        this._filters = { ...this._filters, [path]: value };
        this._page = 1;
    }

    handleClearFilters() {
        this._filters = {};
        this._searchTerm = "";
        this._page = 1;
    }

    handleFirstPage() {
        this._page = 1;
    }

    handlePreviousPage() {
        this._page = Math.max(1, this.pageState.page - 1);
    }

    handleNextPage() {
        this._page = Math.min(this.pageState.totalPages, this.pageState.page + 1);
    }

    handleLastPage() {
        this._page = this.pageState.totalPages;
    }

    /**
     * Row action. `Remove` takes the row out of the grid and republishes the
     * removed and remaining collections; `Standard` just reports the row.
     */
    handleRowAction(event) {
        if (event.detail.action?.name !== ROW_ACTION_NAME) {
            return;
        }
        const key = event.detail.row?.[this.keyField];
        const record = this.sourceRecords.find((candidate) => candidate?.[this.keyField] === key);
        if (!record) {
            return;
        }

        this.publishActioned(record);

        if (this.rowActionType !== "Remove") {
            return;
        }

        const cap = Number(this.maxRemovedRows);
        if (Number.isFinite(cap) && cap > 0 && this._removedKeys.length >= cap) {
            this._removalBlockedMessage = `You can remove at most ${cap} ${cap === 1 ? "row" : "rows"}.`;
            return;
        }
        this._removalBlockedMessage = null;
        this._removedKeys = [...this._removedKeys, key];
        // A removed row cannot stay selected, and the current page may no longer
        // exist once the result set shrinks.
        this._selectedKeys = this._selectedKeys.filter((selected) => selected !== key);
        this.publishRemoval();
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
        if (this._selectedKeys.length) {
            return;
        }
        const source = this.isUserDefinedObject
            ? parseRecordJson(this.preSelectedRecordsJson)
            : this.preSelectedRecords;
        if (!Array.isArray(source) || !source.length) {
            return;
        }
        const keys = source.map((record) => record?.[this.keyField]).filter(Boolean);
        if (keys.length) {
            this._selectedKeys = keys;
            this.publishSelection();
        }
    }

    /** Publishes every selection-derived output in one pass. */
    publishSelection() {
        const keys = new Set(this._selectedKeys);
        const selected = this.remainingRecords.filter((record) => keys.has(record?.[this.keyField]));

        this.publish("outputSelectedRecords", this.isUserDefinedObject ? [] : selected);
        this.publish("outputSelectedRecord", !this.isUserDefinedObject && selected.length === 1 ? selected[0] : null);
        this.publish("outputSelectedRecordsJson", selected.length ? JSON.stringify(selected) : null);
        this.publish("selectedCount", selected.length);
        this.publish("selectedRowKey", selected.length === 1 ? selected[0]?.[this.keyField] : null);
    }

    /** Publishes the most recent row-action record. */
    publishActioned(record) {
        this.publish("outputActionedRecord", this.isUserDefinedObject ? null : record);
        this.publish("outputActionedRecordJson", JSON.stringify(record));
    }

    /** Publishes both sides of the removal split. */
    publishRemoval() {
        const removed = new Set(this._removedKeys);
        const removedRecords = this.sourceRecords.filter((record) => removed.has(record?.[this.keyField]));
        const remaining = this.remainingRecords;

        this.publish("outputRemovedRecords", this.isUserDefinedObject ? [] : removedRecords);
        this.publish("outputRemainingRecords", this.isUserDefinedObject ? [] : remaining);
        this.publish("outputRemovedRecordsJson", removedRecords.length ? JSON.stringify(removedRecords) : null);
        this.publish("outputRemainingRecordsJson", remaining.length ? JSON.stringify(remaining) : null);
        this.publish("removedCount", removedRecords.length);
    }

    /** Assigns a Flow output and mirrors it locally so getters stay in step. */
    publish(name, value) {
        this[name] = value;
        this.dispatchEvent(new FlowAttributeChangeEvent(name, value));
    }
}

/**
 * Reads a serialized record collection supplied by a Flow.
 *
 * Returns an empty list rather than throwing: a malformed string is an admin
 * configuration problem, and the empty state reports it better than a crash.
 */
function parseRecordJson(raw) {
    if (Array.isArray(raw)) {
        return raw;
    }
    if (typeof raw !== "string" || !raw.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return parsed && typeof parsed === "object" ? [parsed] : [];
    } catch {
        return [];
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
