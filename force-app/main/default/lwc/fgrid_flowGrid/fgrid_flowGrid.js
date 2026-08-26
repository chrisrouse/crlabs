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
 * outputs, sorting, search, per-column filters, pagination, row actions (remove
 * and launch-a-flow), required validation, header and counts, row cap, the
 * user-defined-object JSON source, and inline editing — standard types plus
 * picklist, multi-select picklist and lookup cells via `c/fgrid_customDatatable`.
 *
 * NOT YET: `recordTypeId` and `showAllPicklistValues` are accepted and inert, so
 * an editable picklist offers every active value regardless of record type.
 */
import { LightningElement, api, wire } from "lwc";
import { FlowAttributeChangeEvent, FlowNavigationNextEvent } from "lightning/flowSupport";
import getGridMetadata from "@salesforce/apex/FlowGridController.getGridMetadata";
import runFlow from "@salesforce/apex/FlowGridController.runFlow";
import getRecordsByIds from "@salesforce/apex/FlowGridController.getRecordsByIds";
import getFlowVariables from "@salesforce/apex/FlowGridController.getFlowVariables";
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
    joinMultiPicklist,
    filterKindFor,
    isFilterActive,
    describeFilter,
    FILTER_ACTION_NAME,
    PICKLIST_OPTIONS_SUFFIX,
    PICKLIST_SELECTED_SUFFIX,
    ROW_ACTION_NAME
} from "c/fgrid_gridModel";

export default class FgridFlowGrid extends LightningElement {
    // ----- Data source -----
    @api objectApiName;
    @api keyField = "Id";
    @api isUserDefinedObject = false;
    @api recordsJson;
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
    @api hideBorder = false;
    @api allowOverflow = false;

    // ----- Selection -----
    @api selectionMode = "Multiple";
    @api isRequired = false;
    @api hideClearSelectionButton = false;

    // ----- Search, filter, sort -----
    @api showSearchBar = false;
    /* Inverted: Flow Builder drops a false Boolean, so the persistable state is
       "whole phrase" and word mode is the absence of it. See the meta.xml note. */
    @api searchWholePhrase = false;
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
    @api rowActionPosition = "Left";
    @api rowActionLabel;
    @api rowActionIcon;
    @api rowActionColor;
    @api rowActionButtonLabel;
    @api rowActionButtonIcon;
    @api rowActionButtonIconPosition = "Left";
    @api rowActionButtonVariant = "neutral";
    @api maxRemovedRows;

    // ----- Flow row action -----
    @api rowActionFlowApiName;
    @api rowActionFlowLaunchMode;
    @api rowActionFlowRecordVariable;
    @api rowActionFlowIdVariable;
    @api rowActionFlowModalHeader = "Edit Record";
    @api rowActionFlowModalSize = "Medium";

    // ----- Links and formatting -----
    @api hideNameFieldLink = false;
    @api openLinkInSameTab = false;
    @api suppressCurrencyConversion = false;

    // ----- Picklist editing -----
    @api recordTypeId;
    @api showAllPicklistValues = false;
    @api hideNoneOption = false;

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
    /** Field patches applied by the row-action flow, keyed by keyField. */
    _editsByKey = {};
    /** Records the flow returned whose key was not already in the grid. */
    _addedRecords = [];
    /** The record currently open in the row-action flow modal. */
    _flowRecord = null;
    _isFlowOpen = false;
    _isRunningFlow = false;
    _flowError = null;
    _flowVariables = [];
    _flowInputs = [];
    /** Content signature of the last incoming collection. Null until first set,
     *  so the initial assignment is not treated as a change. */
    _recordsSignature = null;
    _preSelectedRecords;
    _preSelectedRecordsJson;
    /** Pending inline edits the datatable is showing in its Cancel/Save bar. */
    _draftValues = [];
    /** Signature of the last applied preselection, so a user who deselects
     *  everything does not get it silently restored. */
    _preSelectionSignature = null;
    /** Field path whose filter editor is open, or null. */
    _filterEditorPath = null;

    /* Reactive, so a preselection recomputed upstream reaches the grid. Both
       accessors funnel into applyPreSelection, which decides whether the value
       actually changed. */
    @api
    get preSelectedRecords() {
        return this._preSelectedRecords;
    }
    set preSelectedRecords(value) {
        this._preSelectedRecords = value;
        this.applyPreSelection();
    }

    @api
    get preSelectedRecordsJson() {
        return this._preSelectedRecordsJson;
    }
    set preSelectedRecordsJson(value) {
        this._preSelectedRecordsJson = value;
        this.applyPreSelection();
    }

    @api
    get records() {
        return this._records;
    }
    set records(value) {
        const next = Array.isArray(value) ? value : [];
        // Upstream data is authoritative: a genuine change to the incoming
        // collection discards unsaved inline edits and reapplies the
        // preselection. Compared by CONTENT, never by array identity — Flow
        // reassigns collection arrays on virtually every re-render, so keying off
        // identity would throw away a user's half-finished edit whenever anything
        // else on the screen moved.
        const signature = recordSignature(next);
        const changed = this._recordsSignature !== null && this._recordsSignature !== signature;
        this._recordsSignature = signature;
        this._records = next;
        if (changed) {
            this.discardUnsavedEdits();
        }
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
     * Variables the configured row-action flow actually declares.
     *
     * The mapping properties carry platform defaults of `record` and `recordId`
     * that cannot be removed — an immutable flow version references them, and
     * Salesforce refuses to drop a default that is in use. So rather than trust
     * the configured names, the runtime checks them against the flow and sends
     * only variables that exist. A flow declaring neither used to be handed both
     * and fail with "the input variable doesn't exist in the active version".
     *
     * This also covers a variable being edited out of a flow after the row action
     * was configured.
     */
    @wire(getFlowVariables, { flowApiName: "$rowActionFlowApiName" })
    wiredFlowVariables({ data }) {
        this._flowVariables = data || [];
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

    /**
     * The grid's live working collection.
     *
     * This is what replaces the "Reactive Record Collection" helper the previous
     * component needed: the grid seeds from its input and then owns the current
     * state itself, applying flow edits, upserted additions, and removals.
     */
    /**
     * Every record the grid knows about, edits applied, including removed ones.
     *
     * Removed rows stay reachable here so an actioned row can still be reported
     * after it has been taken out of the grid.
     */
    get allKnownRecords() {
        const all = this._addedRecords.length ? [...this.sourceRecords, ...this._addedRecords] : this.sourceRecords;
        return all.map((record) => {
            const patch = this._editsByKey[record?.[this.keyField]];
            return patch ? { ...record, ...patch } : record;
        });
    }

    get remainingRecords() {
        if (!this._removedKeys.length) {
            return this.allKnownRecords;
        }
        const removed = new Set(this._removedKeys);
        return this.allKnownRecords.filter((record) => !removed.has(record?.[this.keyField]));
    }

    /**
     * Records whose values a row action actually changed.
     *
     * `_editsByKey` only holds fields that genuinely differed, so a flow that
     * hands back an untouched record does not appear here. The difference between
     * this and `actionedRecords` is exactly "touched" versus "changed".
     */
    get editedRecords() {
        const keys = new Set(Object.keys(this._editsByKey));
        return keys.size ? this.allKnownRecords.filter((record) => keys.has(String(record?.[this.keyField]))) : [];
    }

    get columns() {
        const columns = buildColumns(this._columnPaths, this._columnConfig, {
            hideHeaderActions: this.hideHeaderActions,
            describeByPath: this.describeByPath,
            // A user-defined object has no record id, so there is nothing to
            // link to.
            linkNameField: this.isNameFieldLinked && !this.isUserDefinedObject,
            openLinksInSameTab: this.openLinkInSameTab,
            allowNone: this.isNoneAllowed,
            // Only the runtime offers filtering. The Studio preview shows layout and
            // cannot filter, so a header action there would do nothing.
            filterActions: true
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
        let rows = searchRows(this.cappedRows, columns, this._searchTerm, this.matchCaseOnFilters, this.isSearchByWord);
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
        return !this.hideBorder;
    }

    get isNameFieldLinked() {
        return !this.hideNameFieldLink;
    }

    /** Default ON: matching each word separately is what finds a name split across
     *  First Name and Last Name, which is the common case. */
    get isSearchByWord() {
        return !this.searchWholePhrase;
    }

    get isNoneAllowed() {
        return !this.hideNoneOption;
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

    /**
     * Whether the toolbar row has anything in it.
     *
     * Note this makes Clear Selection reachable with the header switched off. It
     * was previously nested inside the header markup, so its own conditions could
     * all be met and the button still never rendered.
     */
    get showToolbar() {
        return Boolean(this.showHeader) || Boolean(this.showSearchBar) || this.showClearSelection;
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

    /**
     * Columns the admin marked filterable, each with the control it needs.
     *
     * A picklist filter offers the field's own values, so the options come from the
     * same describe the editable cell uses.
     */
    get filterColumns() {
        return this.columns
            .filter((column) => column.fieldName !== ROW_ACTION_NAME)
            .map((column) => ({
                // THREE distinct keys, and they really are different things:
                //   fieldName — what the datatable calls the column, and therefore
                //               what `onheaderaction` reports. A linked Name column
                //               reports the generated `Name__fgridUrl`.
                //   configKey — where the column's attributes are stored, always the
                //               real field path.
                //   path      — the row field matching runs against: a lookup's
                //               displayed name, not its stored Id.
                // Conflating any two of them breaks a different column type.
                fieldName: column.fieldName,
                configKey: column.fgridLinkFor || column.fieldName,
                path: column.fgridTextField || column.fgridLinkFor || column.fieldName,
                label: column.label,
                kind: filterKindFor(column),
                options: (column.fgridPicklistOptions || []).map((option) => ({
                    label: option.label,
                    value: option.value
                }))
            }))
            .filter((entry) => this._columnConfig?.[entry.configKey]?.filter === true);
    }

    /** Filters that would actually narrow anything. */
    get activeFilterCount() {
        return Object.values(this._filters).filter((filter) => isFilterActive(filter)).length;
    }

    /**
     * One pill per active filter, above the table.
     *
     * This is how a filter set from a column header menu stays visible after the
     * menu closes — without it the grid silently hides rows with nothing on screen
     * to explain why. Pills wrap onto further lines rather than growing sideways,
     * which is what makes this workable in a narrow Experience Cloud column.
     */
    get filterPills() {
        const byPath = new Map(this.filterColumns.map((column) => [column.path, column]));
        return Object.entries(this._filters)
            .filter(([, filter]) => isFilterActive(filter))
            .map(([path, filter]) => ({
                path,
                label: describeFilter(byPath.get(path)?.label || path, filter)
            }));
    }

    /** Column descriptor whose filter editor is open. */
    get filterEditorColumn() {
        return this.filterColumns.find((column) => column.path === this._filterEditorPath) || null;
    }

    get isFilterEditorOpen() {
        return Boolean(this.filterEditorColumn);
    }

    get filterEditorFilter() {
        return this._filterEditorPath ? this._filters[this._filterEditorPath] || null : null;
    }

    get hasActiveFilters() {
        return this.activeFilterCount > 0;
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

    /* ----- row action flow ----- */

    get isFlowOpen() {
        return this._isFlowOpen;
    }

    get flowApiName() {
        return this.rowActionFlowApiName;
    }

    get flowModalHeader() {
        return this.rowActionFlowModalHeader || "Edit Record";
    }

    get flowModalClass() {
        const size = String(this.rowActionFlowModalSize || "Medium").toLowerCase();
        const modifier =
            size === "small" ? "slds-modal_small" : size === "large" ? "slds-modal_large" : "slds-modal_medium";
        return `slds-modal slds-fade-in-open ${modifier}`;
    }

    /**
     * Input variables for the launched flow.
     *
     * Both the record and its Id are offered because edit flows come in both
     * shapes: some take an SObject variable, others just take recordId and
     * re-query. Either name can be left blank to omit it.
     */
    /**
     * Input variables for the launched flow.
     *
     * Only what the admin explicitly mapped is sent. These used to default to
     * `record` and `recordId`, which meant a flow declaring neither was handed
     * both and failed with "the input variable does not exist in the active
     * version of the flow".
     */
    /** Names of input variables the configured flow declares. */
    get declaredInputNames() {
        return new Set(this._flowVariables.filter((variable) => variable?.isInput).map((variable) => variable.apiName));
    }

    /** True when the flow declares an input by this name. */
    acceptsInput(name) {
        // Before the variable list arrives, trust the configuration rather than
        // dropping inputs and launching the flow with nothing.
        return Boolean(name) && (!this._flowVariables.length || this.declaredInputNames.has(name));
    }

    /**
     * Names configured but not declared by the flow.
     *
     * Variable names are typed, so a typo is the likely failure. Reporting the
     * dropped name beats both alternatives: sending it fails the whole interview,
     * and dropping it silently leaves the flow running with nothing and no clue
     * why.
     */
    get unmatchedInputNames() {
        if (!this._flowVariables.length) {
            return [];
        }
        const declared = this.declaredInputNames;
        return [this.rowActionFlowRecordVariable, this.rowActionFlowIdVariable]
            .filter((name) => name && !declared.has(name))
            .filter((name, index, all) => all.indexOf(name) === index);
    }

    get hasUnmatchedInputNames() {
        return this.unmatchedInputNames.length > 0;
    }

    get unmatchedInputMessage() {
        const names = this.unmatchedInputNames;
        if (!names.length) {
            return null;
        }
        const list = names.join(", ");
        return `${this.rowActionFlowApiName} does not declare ${names.length === 1 ? "an input variable" : "input variables"} named ${list}, so ${names.length === 1 ? "it was" : "they were"} not sent. Check the name in the row action settings.`;
    }

    /**
     * Input variables handed to `lightning-flow`.
     *
     * Deliberately a stored field rather than a computed getter. `lightning-flow`
     * treats a new `flowInputVariables` identity as a reason to restart the
     * interview, and a getter returns a fresh array on every render — so any
     * re-render while the modal was open restarted the flow, including the
     * re-render caused by publishing outputs when it finished.
     */
    get flowInputVariables() {
        return this._flowInputs;
    }

    /** Builds the input list once, when the flow is opened. */
    buildFlowInputs(record) {
        const variables = [];
        if (!record) {
            return variables;
        }
        if (this.acceptsInput(this.rowActionFlowRecordVariable)) {
            variables.push({
                name: this.rowActionFlowRecordVariable,
                type: "SObject",
                value: record
            });
        }
        const id = record.Id || record[this.keyField];
        if (id && this.acceptsInput(this.rowActionFlowIdVariable)) {
            variables.push({ name: this.rowActionFlowIdVariable, type: "String", value: id });
        }
        return variables;
    }

    get flowError() {
        return this._flowError;
    }

    get hasFlowError() {
        return Boolean(this._flowError);
    }

    get isRunningFlow() {
        return this._isRunningFlow;
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

    /**
     * Opens the filter editor for the column whose header menu was used.
     *
     * `onheaderaction` reports the column by its datatable fieldName, which is not
     * always what the filter is keyed on — a lookup filters on its displayed name,
     * a linked Name column on its underlying value — so the path is resolved
     * through the same descriptor list the pills use.
     */
    handleHeaderAction(event) {
        const { action, columnDefinition } = event.detail;
        if (action?.name !== FILTER_ACTION_NAME) {
            return;
        }
        // Match on the datatable's own fieldName, which is what this event reports.
        // A linked Name column reports the generated `Name__fgridUrl`, which equals
        // neither its config key nor its match path — comparing against those left
        // the most prominent column in a grid unable to open its own filter.
        const name = columnDefinition?.fieldName;
        const column = this.filterColumns.find((candidate) => candidate.fieldName === name);
        this._filterEditorPath = column?.path || null;
    }

    handleFilterEditorClose() {
        this._filterEditorPath = null;
    }

    handleFilterSave(event) {
        this.applyFilter(event.detail.path, event.detail.filter);
        this._filterEditorPath = null;
    }

    handleFilterRemove(event) {
        this.applyFilter(event.detail.path, null);
        this._filterEditorPath = null;
    }

    /** Reopens a pill's editor, so a filter can be corrected rather than redone. */
    handleEditPill(event) {
        this._filterEditorPath = event.currentTarget.dataset.path;
    }

    handleRemovePill(event) {
        this.applyFilter(event.currentTarget.dataset.path, null);
    }

    /**
     * Stores one column's whole filter, whatever its shape.
     *
     * The panel owns the shape per kind, so this does not need to know whether the
     * payload is text, a value list, or a range. A null filter is removed outright
     * rather than left as an inert entry, which keeps the active count honest.
     */
    applyFilter(path, filter) {
        const next = { ...this._filters };
        if (filter === null || filter === undefined) {
            delete next[path];
        } else {
            next[path] = filter;
        }
        this._filters = next;
        // Row one of the old page may no longer exist.
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
     * removed and remaining collections.
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

        if (this.rowActionType === "Flow") {
            // Whether this row counts as actioned depends on what the flow
            // reports, so recording it waits for completion.
            this.openRowActionFlow(record);
            return;
        }

        if (this.rowActionType !== "Remove") {
            return;
        }

        // maxRemovedRows of 0 or blank means no limit.
        const cap = Number(this.maxRemovedRows);
        if (Number.isFinite(cap) && cap > 0 && this._removedKeys.length >= cap) {
            // Nothing was removed, so nothing was actioned.
            this._removalBlockedMessage = `You can remove at most ${cap} ${cap === 1 ? "row" : "rows"}.`;
            return;
        }
        this._removalBlockedMessage = null;
        this.publishActioned(record);
        this._removedKeys = [...this._removedKeys, key];
        // A removed row cannot stay selected, and the current page may no longer
        // exist once the result set shrinks.
        this._selectedKeys = this._selectedKeys.filter((selected) => selected !== key);
        this.publishRemoval();
        this.publishSelection();
    }

    get isHeadlessFlowAction() {
        return this.rowActionFlowLaunchMode === "Headless";
    }

    /**
     * Launches the configured flow for a row.
     *
     * A screen flow renders in a modal. An autolaunched flow has no screens, so
     * showing a modal would mean an empty box: it runs server-side instead and
     * its outputs are folded straight back in.
     */
    openRowActionFlow(record) {
        if (!this.rowActionFlowApiName) {
            this._flowError = "No flow is configured for this row action.";
            return;
        }
        this._flowError = null;
        this._flowRecord = { ...record };
        this._flowInputs = this.buildFlowInputs(this._flowRecord);

        if (this.isHeadlessFlowAction) {
            this.runHeadlessFlow(record);
            return;
        }
        this._isFlowOpen = true;
    }

    /** Runs an autolaunched flow and applies whatever it returns. */
    async runHeadlessFlow(record) {
        this._isRunningFlow = true;
        try {
            const outputs = await runFlow({
                flowApiName: this.rowActionFlowApiName,
                objectApiName: this.objectApiName,
                recordJson: JSON.stringify(record),
                recordVariable: this.acceptsInput(this.rowActionFlowRecordVariable)
                    ? this.rowActionFlowRecordVariable
                    : null,
                idVariable: this.acceptsInput(this.rowActionFlowIdVariable) ? this.rowActionFlowIdVariable : null,
                recordId: record?.Id || record?.[this.keyField]
            });

            // Apex returns a name-keyed map; the shared handler works on the
            // {name, value} shape lightning-flow emits.
            const asVariables = Object.entries(outputs || {}).map(([name, value]) => ({ name, value }));
            await this.applyFlowResult(record, asVariables);
        } catch (error) {
            this._flowError = error?.body?.message || "The flow did not run.";
        } finally {
            this._isRunningFlow = false;
            this._flowRecord = null;
        }
    }

    handleCloseFlow() {
        this._isFlowOpen = false;
        this._flowRecord = null;
        this._flowInputs = [];
    }

    /**
     * Reads the launched flow's result and folds it back into the grid.
     *
     * This is the half that replaces the Get First Record / Upsert Record By Key
     * chain: the grid already knows which row was clicked, so it can match the
     * returned data by key itself.
     */
    handleFlowStatusChange(event) {
        const detail = event.detail || {};
        // `lightning-flow` reports this as `status`, not `flowStatus`. Reading the
        // wrong key meant this handler returned early every time, so the modal was
        // never unmounted and the component restarted its interview — which also
        // discarded the edits. Both the component this replaces and the BasePack's
        // fsc_modalFlow read `status`; `flowStatus` is a fallback in case a future
        // API version renames it.
        const flowStatus = detail.status ?? detail.flowStatus;
        const outputVariables = detail.outputVariables;

        if (flowStatus === "ERROR") {
            this._flowError = "The flow did not complete. Nothing was changed.";
            this.handleCloseFlow();
            return;
        }
        if (flowStatus !== "FINISHED" && flowStatus !== "FINISHED_SCREEN") {
            return;
        }

        // Unmount before folding the result in. `lightning-flow` restarts its
        // interview once finished if it is still on the page, so closing has to
        // happen first and must not be reachable only after other work.
        const record = this._flowRecord;
        this.handleCloseFlow();
        this.applyFlowResult(record, outputVariables);
    }

    /**
     * Folds a completed flow's result back into the grid.
     *
     * Shared by both launch paths so a screen flow and an autolaunched flow are
     * handled identically once they have finished.
     */
    async applyFlowResult(record, outputVariables) {
        // Reported on every completion, whether or not the flow changed the row:
        // a flow that only creates related records still worked on this one.
        this.publishActioned(record);

        const patch = this.readFlowResult(outputVariables);
        if (patch) {
            this.upsertRecord(patch);
        }
        await this.reconcileRow(record, Boolean(patch));
    }

    /**
     * Re-reads the actioned row from the database and reconciles the grid.
     *
     * One query, three outcomes:
     *   gone                       - the flow deleted it, so remove the row and
     *                                report it through Removed Records
     *   returned, flow gave nothing - the flow changed the record without handing
     *                                it back, which is what happens when only the
     *                                Id was passed and the flow did its own DML.
     *                                The fetched values are the refresh.
     *   returned, flow gave a patch - trust the patch and ignore the fetch. The
     *                                patch may be an unsaved edit, and the
     *                                database would overwrite it with stale values.
     *
     * @param record the row the action ran on
     * @param hadPatch whether the flow returned usable data
     */
    async reconcileRow(record, hadPatch) {
        const id = record?.Id || record?.[this.keyField];
        if (this.isUserDefinedObject || !this.objectApiName || !id) {
            return;
        }

        let fetched;
        try {
            fetched = await getRecordsByIds({
                objectApiName: this.objectApiName,
                fieldPaths: this._columnPaths,
                recordIds: [String(id)]
            });
        } catch {
            // Not being able to re-read is never a reason to drop or rewrite a row.
            return;
        }

        const current = Array.isArray(fetched) ? fetched[0] : null;
        if (current) {
            if (!hadPatch) {
                this.upsertRecord({ ...current, [this.keyField]: record[this.keyField] });
            }
            return;
        }

        const key = record?.[this.keyField];
        if (key === undefined || key === null || this._removedKeys.some((seen) => String(seen) === String(key))) {
            return;
        }
        this._removedKeys = [...this._removedKeys, key];
        this._selectedKeys = this._selectedKeys.filter((selected) => String(selected) !== String(key));
        this._flowError = "That record no longer exists, so the row was removed from the grid.";
        this.publishRemoval();
        this.publishSelection();
    }

    /**
     * Extracts the changed data from the flow's outputs.
     *
     * Accepts either shape, because edit flows are written both ways:
     *   - a whole record in the configured output variable, or
     *   - individual field values named after the grid's columns
     *
     * @returns {object|null} a record-shaped patch, or null when nothing usable
     *          came back
     */
    readFlowResult(outputVariables) {
        const outputs = Array.isArray(outputVariables) ? outputVariables : [];
        if (!outputs.length) {
            return null;
        }

        // The launched flow returns the edited record in the same variable it was
        // handed, which is how a Flow SObject variable marked for input and output
        // behaves.
        const recordName = this.rowActionFlowRecordVariable;
        const recordOutput = outputs.find(
            (output) => recordName && output?.name === recordName && output?.value && typeof output.value === "object"
        );
        if (recordOutput) {
            return Array.isArray(recordOutput.value) ? recordOutput.value[0] || null : recordOutput.value;
        }

        // Fall back to field-level outputs whose names match displayed columns.
        const byLowerName = new Map(this._columnPaths.map((path) => [path.toLowerCase(), path]));
        const patch = {};
        outputs.forEach((output) => {
            const path = byLowerName.get(String(output?.name || "").toLowerCase());
            if (path && output.value !== undefined) {
                patch[path] = output.value;
            }
        });
        if (!Object.keys(patch).length) {
            return null;
        }
        // Carry the key so the patch can be matched to its row.
        return { ...patch, [this.keyField]: this._flowRecord?.[this.keyField] };
    }

    /**
     * Upserts a record into the working collection, matched on keyField.
     *
     * Update when the key is already present, insert when it is not, which is
     * what "upsert by key" meant in the helper component this replaces.
     */
    upsertRecord(record) {
        const key = record?.[this.keyField] ?? this._flowRecord?.[this.keyField];
        if (key === undefined || key === null || key === "") {
            this._flowError = `The flow returned a record with no ${this.keyField}, so it could not be matched to a row.`;
            return;
        }

        const existing = this.allKnownRecords.find((candidate) => candidate?.[this.keyField] === key);
        if (!existing) {
            this._addedRecords = [...this._addedRecords, { ...record, [this.keyField]: key }];
        } else {
            // Keep only fields whose value genuinely differs, so a flow that
            // returns the record untouched does not register as an edit.
            const changed = {};
            Object.keys(record).forEach((field) => {
                // `attributes` is the SObject envelope Flow and Apex attach; it is
                // not a field and would otherwise register as an edit every time.
                if (field === this.keyField || field === "attributes") {
                    return;
                }
                if (!sameValue(existing[field], record[field])) {
                    changed[field] = record[field];
                }
            });
            if (Object.keys(changed).length) {
                this._editsByKey = {
                    ...this._editsByKey,
                    [key]: { ...(this._editsByKey[key] || {}), ...changed }
                };
            }
        }

        this.publishEdits();
        this.publishRemoval();
        this.publishSelection();
    }

    /* ------------------------------------------------------------------ *
     * Inline editing
     * ------------------------------------------------------------------ */

    /** Pending edits, handed back to the datatable so it can show its bar. */
    get draftValues() {
        return this._draftValues;
    }

    /**
     * Tracks in-progress edits so the datatable's Cancel/Save bar stays visible.
     *
     * The datatable would manage its own drafts if `draft-values` were never
     * bound, but then there is no way to clear them after a save — the bar would
     * sit there implying unsaved work that has already been applied.
     */
    handleCellChange(event) {
        this._draftValues = event.detail?.draftValues || [];
    }

    /**
     * Commits inline edits into the grid's working collection.
     *
     * Each draft arrives as `{ [keyField]: key, Field: value }`, which is the same
     * shape a row-action flow hands back, so `upsertRecord` does the work — it
     * already keeps only fields that genuinely differ and publishes the outputs.
     *
     * Nothing is written to the database here. Flow Grid never performs DML; the
     * calling flow commits `outputEditedRecords` if it wants the change persisted.
     */
    handleInlineSave(event) {
        const drafts = event.detail?.draftValues || [];
        drafts.forEach((draft) => {
            const key = draft?.[this.keyField];
            if (key !== null && key !== undefined && key !== "") {
                this.upsertRecord(this.normalizeDraft(draft));
            }
        });
        // Clearing drafts dismisses the bar; the edits now live in _editsByKey and
        // are rendered through allKnownRecords.
        this._draftValues = [];

        if (this.navigateNextOnSave) {
            this.dispatchEvent(new FlowNavigationNextEvent());
        }
    }

    /** Discards pending edits without touching the working collection. */
    handleInlineCancel() {
        this._draftValues = [];
    }

    /**
     * Converts a draft into the shape the record stores.
     *
     * A multi-select picklist is edited with a checkbox group, whose value is an
     * array, while Salesforce stores the field as a `;`-delimited string. Writing
     * the array straight through would put an array into a text field and make
     * every subsequent comparison report a change.
     *
     * Also drops the synthetic option-list and selected-array fields, which exist
     * only to feed the edit cell and are not fields on the record.
     */
    normalizeDraft(draft) {
        const multiFields = new Set(
            this.columns.filter((column) => column.fgridIsMultiPicklist).map((column) => column.fieldName)
        );
        const normalized = {};
        Object.keys(draft).forEach((field) => {
            if (field.endsWith(PICKLIST_OPTIONS_SUFFIX) || field.endsWith(PICKLIST_SELECTED_SUFFIX)) {
                return;
            }
            normalized[field] = multiFields.has(field) ? joinMultiPicklist(draft[field]) : draft[field];
        });
        return normalized;
    }

    handleSort(event) {
        const { fieldName, sortDirection } = event.detail;
        // Sort on what the column shows, not on what it stores. A link column would
        // otherwise order rows by record id via its generated URL, and a lookup by
        // the parent's Id rather than the parent's name.
        const column = this.columns.find((candidate) => candidate.fieldName === fieldName);
        this._sortField = column?.fgridTextField || column?.fgridLinkFor || fieldName;
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

    /**
     * Applies `preSelectedRecords` to the grid, reactively.
     *
     * Upstream is authoritative: when the incoming preselection genuinely
     * changes, it replaces whatever the user had selected. Between real changes
     * the user's own selection is left alone.
     *
     * The guard is a content signature, not "is anything selected". The earlier
     * `if (this._selectedKeys.length) return` meant a user who deselected
     * everything had the preselection silently restored the next time the
     * collection was reassigned — their deliberate "select nothing" was
     * indistinguishable from "not seeded yet".
     *
     * Unset and empty differ. `undefined`/`null` means the flow has no opinion,
     * so the selection is untouched; `[]` is a deliberate instruction to
     * deselect everything.
     */
    applyPreSelection() {
        const source = this.isUserDefinedObject
            ? parseRecordJson(this.preSelectedRecordsJson)
            : this.preSelectedRecords;
        if (!Array.isArray(source)) {
            return;
        }

        const keys = source.map((record) => record?.[this.keyField]).filter(Boolean);
        const signature = keys.join("~");
        if (this._preSelectionSignature === signature) {
            return;
        }
        this._preSelectionSignature = signature;
        this._selectedKeys = keys;
        this.publishSelection();
    }

    /**
     * Drops unsaved inline edits, because the incoming collection changed.
     *
     * Only the unsaved overlay goes. Removals and additions are the grid's own
     * committed state, not pending user input, so they survive.
     *
     * Silent by design: the behaviour is documented in the Records property's
     * help text rather than announced with a banner the user cannot act on.
     */
    discardUnsavedEdits() {
        const hadEdits = Object.keys(this._editsByKey).length > 0;
        this._draftValues = [];
        if (!hadEdits) {
            return;
        }
        this._editsByKey = {};
        this.publishEdits();
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

    /**
     * Publishes the record the most recent row action was performed on.
     *
     * Deliberately publishes a NEW object each time rather than the record
     * reference. This output is the hook for the pop-up-screen-flow pattern: a
     * sibling component on the same screen watches it and launches a subflow for
     * the actioned record. Flow only propagates a reactive output when it sees a
     * change, so re-publishing the same reference after the user actions the same
     * row twice would silently do nothing the second time. The component this
     * replaces spreads the row for the same reason.
     *
     * The source record is published rather than the flattened datatable row, so
     * the output carries only real fields — the flattened row also holds the
     * generated link URLs, which are not fields on the object.
     */
    /**
     * Reports the row the most recent action ran on.
     *
     * Publishes a new object each time rather than the record reference: this
     * output is the hook for a sibling component reacting to a row action, and
     * Flow only propagates a reactive output when it sees a change, so reusing
     * the reference would silently do nothing on a repeat action.
     */
    publishActioned(record) {
        const snapshot = { ...record };
        this.publish("outputActionedRecord", this.isUserDefinedObject ? null : snapshot);
        this.publish("outputActionedRecordJson", JSON.stringify(snapshot));
    }

    /** Publishes the edited-records outputs. */
    publishEdits() {
        const edited = this.editedRecords;
        this.publish("outputEditedRecords", this.isUserDefinedObject ? [] : edited);
        this.publish("outputEditedRecordsJson", edited.length ? JSON.stringify(edited) : null);
        this.publish("editedCount", edited.length);
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
 * Compares two field values the way an admin would judge "did this change".
 *
 * Blank forms are treated as equivalent: a flow that clears a field may return
 * an empty string where the record held null, and reporting that as an edit
 * would be noise. Objects are compared structurally.
 */
function sameValue(before, after) {
    const blank = (value) => value === null || value === undefined || value === "";
    if (blank(before) && blank(after)) {
        return true;
    }
    if (blank(before) !== blank(after)) {
        return false;
    }
    if (typeof before === "object" || typeof after === "object") {
        return JSON.stringify(before) === JSON.stringify(after);
    }
    return String(before) === String(after);
}

/**
 * Builds a content fingerprint for an incoming record collection.
 *
 * Exists so "the collection changed" can be judged by VALUE rather than by array
 * identity. Flow hands over a freshly-built array on virtually every re-render,
 * so an identity check would report a change constantly — and the consequence of
 * a false positive here is discarding a user's unsaved inline edits.
 *
 * Field names are sorted so a differently-ordered but identical record does not
 * read as a change, and `attributes` — the SObject envelope Apex and Flow attach
 * — is excluded for the same reason it is excluded from edit detection.
 */
function recordSignature(records) {
    if (!Array.isArray(records) || !records.length) {
        return "0";
    }
    const parts = records.map((record) => {
        if (!record || typeof record !== "object") {
            return String(record);
        }
        return Object.keys(record)
            .filter((field) => field !== "attributes")
            .sort()
            .map((field) => `${field}=${signatureValue(record[field])}`)
            .join(",");
    });
    return `${records.length}:${parts.join("~")}`;
}

/** Renders one field value for a signature, collapsing blank forms. */
function signatureValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
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
