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
    fractionToPercent,
    filterKindFor,
    isFilterActive,
    describeFilter,
    FILTER_ACTION_NAME,
    BLANKS_FIRST_ACTION_NAME,
    PICKLIST_OPTIONS_SUFFIX,
    PICKLIST_SELECTED_SUFFIX,
    ROW_ACTION_NAME
} from "c/fgrid_gridModel";

/**
 * Rows rendered per batch in scroll mode, and the amount each `loadmore` adds.
 *
 * The records are already in memory — a Flow hands over the whole collection — so
 * this is a RENDERING window, not a fetch size. Growing the window is what keeps the
 * DOM small; there is nothing to load from the server.
 */
const SCROLL_BATCH_SIZE = 50;

/** Applied when no grid height is set, because infinite scrolling needs a scroll
 *  boundary to exist before `loadmore` will ever fire. */
const DEFAULT_TABLE_HEIGHT = "30rem";

/** Range a wrapped cell's line count is held to. */
const WRAPPED_LINES_MIN = 1;
const WRAPPED_LINES_MAX = 10;

export default class FgridFlowGrid extends LightningElement {
    // ----- Data source -----
    @api objectApiName;
    @api keyField = "Id";
    @api isUserDefinedObject = false;
    @api recordsJson;
    /* No accessor needed, unlike preSelectedRecords: this is not user-mutable, so
       there is no local selection for an incoming value to fight over. The getter
       below simply reads whatever the Flow currently supplies. */
    @api disabledRecords;
    @api disabledRecordsJson;
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
    @api wrapTextMaxLines;
    @api showReadOnlyIcon = false;

    // ----- Selection -----
    @api selectionMode = "Multiple";
    /**
     * Commit each edit as the user leaves the cell, instead of on Save.
     *
     * The Cancel and Save buttons then never appear — not because they are hidden,
     * but because nothing is ever pending for them to act on. The bottom bar itself
     * stays available, which is where table-level errors surface.
     */
    @api autoSaveEdits = false;
    @api isRequired = false;
    @api minSelection;
    @api maxSelection;
    @api singleSelectControl = "Radio";

    // ----- Search, filter, sort -----
    @api showSearchBar = false;
    /* Inverted: Flow Builder drops a false Boolean, so the persistable state is
       "whole phrase" and word mode is the absence of it. See the meta.xml note. */
    @api searchWholePhrase = false;
    @api hideHeaderActions = false;
    @api matchCaseOnFilters = false;

    // ----- Row loading and paging -----
    /** Scroll | Paginate. Default resolved in `rowLoadingMode`, not here. */
    @api rowLoading;
    /** Deprecated, superseded by rowLoading. Still declared because the contract
     *  cannot drop a property a flow references, but no longer read. */
    @api showPagination = false;
    @api recordsPerPage;
    /** Deprecated: the truncated navigation always shows page 1 and the last page,
     *  so explicit First/Last buttons are redundant. Kept only because the contract
     *  cannot drop a property a flow references. */
    @api showFirstLastButtons = false;
    /** Lets the user change page size at runtime. Off by default, so a screen sized
     *  around a fixed page size stays that way. */
    @api showRowsPerPage = false;
    @api maxNumberOfRows;

    // ----- Inline editing -----
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
    /** The launched flow does its own DML, so its changes are not pending. */
    @api rowActionFlowSavesChanges = false;
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
    @api outputActionedRecordIds;
    @api outputActionedRecordJson;

    @api selectedCount = 0;
    @api editedCount = 0;
    @api removedCount = 0;
    @api selectedRowKey;
    @api sortedBy;
    @api sortDirection;

    /**
     * Returns a cached derived value, recomputing only when a dependency changes.
     *
     * Dependencies are compared by identity, which works because every mutable
     * piece of state here is replaced rather than mutated — `_filters`,
     * `_editsByKey`, `_removedKeys` and friends are all reassigned to new objects.
     * A dependency list that misses an input would serve a stale value, so each
     * call site lists them explicitly rather than relying on a coarser key.
     */
    memoized(name, deps, compute) {
        const cached = this._memo[name];
        if (cached && cached.deps.length === deps.length && cached.deps.every((dep, i) => dep === deps[i])) {
            return cached.value;
        }
        const value = compute();
        this._memo[name] = { deps, value };
        return value;
    }

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

    /** Column the table draws its sort arrow on; see tableSortedBy. */
    _tableSortedBy = null;

    /** Fields whose sort puts blanks at the top, toggled from the header menu. */
    _blanksFirst = [];
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

    /**
     * Values confirmed to be in the database already, applied for display only.
     *
     * A row-action flow that does its own DML has already saved its change, so the
     * change is not pending and must not appear in Edited Records — otherwise the
     * calling flow saves it a second time. But the cell still has to SHOW it, and the
     * source collection the grid was handed is now stale. Hence a second overlay:
     * `_editsByKey` is what the calling flow should save, this is what the user sees.
     */
    _savedByKey = {};

    /** Keys of every row whose action has been clicked, in click order, deduped. */
    _actionedKeys = [];
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
    /** Widths the user dragged, by columnKey. The columns array is rebuilt on every
     *  render, which resets the datatable's own width state, so they are re-applied
     *  from here or every re-render would snap the columns back. */
    _columnWidths = {};
    /** Page the grid last scrolled to the top for. */
    _scrolledForPage = 1;
    /** Rows rendered so far in scroll mode. Reset whenever the result set changes,
     *  or the grid would keep showing a window sized for the previous results. */
    _visibleCount = SCROLL_BATCH_SIZE;
    /** Page size the user picked at runtime, overriding the configured one. */
    _userRecordsPerPage = null;
    /**
     * Derived-value cache, keyed by dependency identity.
     *
     * LWC getters are not memoized, and this component's row pipeline is a deep
     * chain with many entry points: the template alone reads rows, hasRows,
     * isFilteredEmpty, showPaginationBar, pageSummary, isFirstPage, isLastPage and
     * headerCounts, and each one re-entered the chain from the top. With 300 records
     * that meant buildRows running about nine times per render and buildColumns more
     * than ten, each rebuilding describeByPath from scratch — several seconds before
     * the table would respond.
     *
     * Mutated in place rather than reassigned, so LWC does not treat filling the
     * cache during render as a state change and re-render because of it.
     */
    _memo = {};

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
            this.resetVisibleRows();
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
        return this.memoized("describeByPath", [this._metadata], () => {
            const columns = this._metadata?.columns;
            if (!columns) {
                return null;
            }
            return columns.reduce((map, column) => {
                map[column.fieldPath] = column;
                return map;
            }, {});
        });
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
        // Memoized because this parses JSON, and an unmemoized parse per read was
        // multiplied by every entry into the row pipeline.
        return this.memoized(
            "sourceRecords",
            [this.isSerializedRecordData, this.serializedRecordData, this.recordsJson],
            () => {
                const raw =
                    this.isSerializedRecordData && this.serializedRecordData
                        ? this.serializedRecordData
                        : this.recordsJson;
                return parseRecordJson(raw);
            }
        );
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
        return this.memoized(
            "allKnownRecords",
            [this.sourceRecords, this._addedRecords, this._editsByKey, this._savedByKey, this.keyField],
            () => {
                const all = this._addedRecords.length
                    ? [...this.sourceRecords, ...this._addedRecords]
                    : this.sourceRecords;
                return all.map((record) => {
                    const key = record?.[this.keyField];
                    // Saved first, then pending: a later inline edit of the same
                    // field must win over what the database happens to hold.
                    const saved = this._savedByKey[key];
                    const patch = this._editsByKey[key];
                    if (!saved && !patch) {
                        return record;
                    }
                    return { ...record, ...(saved || {}), ...(patch || {}) };
                });
            }
        );
    }

    get remainingRecords() {
        if (!this._removedKeys.length) {
            return this.allKnownRecords;
        }
        return this.memoized("remainingRecords", [this.allKnownRecords, this._removedKeys, this.keyField], () => {
            const removed = new Set(this._removedKeys);
            return this.allKnownRecords.filter((record) => !removed.has(record?.[this.keyField]));
        });
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
        if (!keys.size) {
            return [];
        }
        // A row the user has since REMOVED is not reported as edited, matching the
        // component this replaces. Otherwise a row edited and then removed appears in
        // both outputEditedRecords and outputRemovedRecords, and a flow told to update
        // it and delete it has been given contradictory instructions.
        const removed = new Set(this._removedKeys.map((key) => String(key)));
        return this.allKnownRecords.filter((record) => {
            const key = String(record?.[this.keyField]);
            return keys.has(key) && !removed.has(key);
        });
    }

    get columns() {
        // Every scalar that feeds buildColumns or withRowActionColumn is listed, so a
        // configuration change still rebuilds. Missing one here would show stale
        // columns after an edit in the property panel.
        return this.memoized(
            "columns",
            [
                this._columnPaths,
                this._columnConfig,
                this.describeByPath,
                this._columnWidths,
                this.hideHeaderActions,
                this.isNameFieldLinked,
                this.isUserDefinedObject,
                this.openLinkInSameTab,
                this.isNoneAllowed,
                this.showReadOnlyIcon,
                this.rowActionType,
                this.rowActionDisplay,
                this.rowActionPosition,
                this.rowActionLabel,
                this.rowActionIcon,
                this.rowActionColor,
                this.rowActionButtonLabel,
                this.rowActionButtonIcon,
                this.rowActionButtonIconPosition,
                this.rowActionButtonVariant,
                this._blanksFirst
            ],
            () => this.buildGridColumns()
        );
    }

    buildGridColumns() {
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
            filterActions: true,
            readOnlyIcon: Boolean(this.showReadOnlyIcon),
            blanksFirstFields: this._blanksFirst,
            userTimeZone: this._metadata?.userTimeZone
        });

        // Re-apply anything the user dragged. Rebuilding `columns` on every render
        // resets the datatable's internal width state, so without this a resize was
        // lost the moment anything else changed — paging, sorting, a filter.
        const dragged = this._columnWidths;
        if (Object.keys(dragged).length) {
            columns.forEach((column) => {
                const width = dragged[column.columnKey];
                if (width) {
                    // initialWidth, not fixedWidth: a column the user has already
                    // dragged must stay draggable.
                    column.initialWidth = width;
                    delete column.fixedWidth;
                }
            });
        }

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
        return this.memoized(
            "cappedRows",
            [this.remainingRecords, this.columns, this.keyField, this.maxNumberOfRows],
            () => {
                const rows = buildRows(this.remainingRecords, this.columns, this.keyField);
                const cap = Number(this.maxNumberOfRows);
                return Number.isFinite(cap) && cap > 0 ? rows.slice(0, cap) : rows;
            }
        );
    }

    /** Rows surviving search and per-column filters, then sorted. */
    get matchedRows() {
        return this.memoized(
            "matchedRows",
            [
                this.cappedRows,
                this.columns,
                this._searchTerm,
                this._filters,
                this._sortField,
                this._sortDirection,
                this.matchCaseOnFilters,
                this.isSearchByWord,
                this._blanksFirst
            ],
            () => {
                const columns = this.columns;
                let rows = searchRows(
                    this.cappedRows,
                    columns,
                    this._searchTerm,
                    this.matchCaseOnFilters,
                    this.isSearchByWord
                );
                rows = filterRows(rows, this._filters, this.matchCaseOnFilters);
                if (this._sortField) {
                    rows = sortRows(
                        rows,
                        this._sortField,
                        this._sortDirection,
                        this._blanksFirst.includes(this._sortField)
                    );
                }
                return rows;
            }
        );
    }

    /**
     * Scroll or Paginate, defaulting to Scroll.
     *
     * The default lives here rather than in the contract, following the rule in §4:
     * a declared default is re-asserted by Flow Builder and cannot be changed later.
     *
     * There is no third "render everything" mode. The standard datatable has no such
     * behaviour, and it was the previous default — which is what made a 300-record
     * grid render 300 rows of DOM before anyone could touch it.
     */
    get rowLoadingMode() {
        return this.rowLoading === "Paginate" ? "Paginate" : "Scroll";
    }

    get isPaginated() {
        return this.rowLoadingMode === "Paginate";
    }

    get isScrolling() {
        return this.rowLoadingMode === "Scroll";
    }

    /**
     * Whether the datatable should keep asking for more rows.
     *
     * Turned off once the window covers everything, so the datatable stops firing
     * `loadmore` at the bottom of a fully rendered list.
     */
    get enableInfiniteLoading() {
        return this.isScrolling && this._visibleCount < this.matchedRows.length;
    }

    /**
     * Page size in force: the user's runtime choice if they made one, otherwise the
     * configured value.
     */
    get effectiveRecordsPerPage() {
        return this._userRecordsPerPage || this.recordsPerPage;
    }

    /** Page state for the current result set. */
    get pageState() {
        return this.memoized(
            "pageState",
            [this.matchedRows, this.rowLoadingMode, this._page, this.effectiveRecordsPerPage, this._visibleCount],
            () => this.computePageState()
        );
    }

    computePageState() {
        if (this.isPaginated) {
            return paginate(this.matchedRows, this._page, this.effectiveRecordsPerPage);
        }
        // Scroll mode: a window over the matched rows, grown by `loadmore`. The page
        // fields are filled in so every consumer of pageState keeps working, but
        // there is only ever one "page".
        const matched = this.matchedRows;
        const rows = matched.length > this._visibleCount ? matched.slice(0, this._visibleCount) : matched;
        return {
            rows,
            page: 1,
            totalPages: 1,
            totalRows: matched.length,
            firstRow: rows.length ? 1 : 0,
            lastRow: rows.length,
            isFirstPage: true,
            isLastPage: true
        };
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
        if (this.selectionMode === "Single") {
            return 1;
        }
        const limit = Number(this.maxSelection);
        return Number.isFinite(limit) && limit > 0 ? limit : undefined;
    }

    /**
     * Radio unless the admin asked for a checkbox.
     *
     * The distinction is whether a single selection can be undone: a radio cannot be
     * cleared once chosen, a checkbox can be unticked. This is the platform's own
     * mechanism for it, and the reason no Clear Selection button is needed.
     */
    get singleRowSelectionMode() {
        return this.selectionMode === "Single" && this.singleSelectControl === "Checkbox" ? "checkbox" : undefined;
    }

    /** Fewest rows that must be selected, or 0 when nothing is required. */
    get requiredSelectionCount() {
        if (this.selectionMode === "Single") {
            return this.isRequired ? 1 : 0;
        }
        const minimum = Number(this.minSelection);
        return Number.isFinite(minimum) && minimum > 0 ? Math.trunc(minimum) : 0;
    }

    /**
     * Selected keys for the rows currently on screen.
     *
     * Two reasons this is not simply `_selectedKeys`.
     *
     * It is FILTERED because the datatable can only tick a row it is rendering, and
     * handing it keys for rows it cannot see tells it nothing.
     *
     * It is MEMOIZED ON `rows` so the array identity changes whenever the page does.
     * Returning the same array meant that after paging away and back, the datatable —
     * which had rebuilt its internal selection when the data changed — was never
     * handed the prop again, so a row stayed selected in our state and unticked on
     * screen. The count was right and the checkbox was wrong.
     */
    get selectedRowKeys() {
        return this.memoized("selectedRowKeys", [this.rows, this._selectedKeys, this.keyField], () => {
            const selected = new Set(this._selectedKeys.map((key) => String(key)));
            return this.rows.map((row) => row?.[this.keyField]).filter((key) => selected.has(String(key)));
        });
    }

    /**
     * Keys of rows the user can neither select nor edit.
     *
     * The Flow decides what "unavailable" means — typically a filtered collection
     * such as Status = Pending — and the datatable greys them. Showing them greyed
     * rather than omitting them is the whole point: the user can see why a row is
     * not offered instead of wondering where it went.
     *
     * A disabled row that is ALSO preselected still counts toward the selection
     * limit, per the component reference. Nothing here can change that, but it is
     * worth knowing before setting both to the same collection.
     */
    get disabledRows() {
        const source = this.isUserDefinedObject ? parseRecordJson(this.disabledRecordsJson) : this.disabledRecords;
        const configured = Array.isArray(source)
            ? source.map((record) => record?.[this.keyField]).filter((key) => key !== null && key !== undefined)
            : [];

        if (!this.isSelectionFull) {
            return configured;
        }

        // At the maximum, every row that is NOT already selected is disabled — on
        // every page, which is the part the datatable cannot do for itself. Its own
        // `max-row-selection` only sees the current page, so it greyed the remaining
        // checkboxes there and left them live everywhere else. Deselecting a row frees
        // a slot and these re-enable, because this is derived rather than stored.
        const selected = new Set(this._selectedKeys.map((key) => String(key)));
        const unselected = this.rows
            .map((row) => row?.[this.keyField])
            .filter((key) => key !== null && key !== undefined && !selected.has(String(key)));

        return [...configured, ...unselected];
    }

    /** True when a maximum is set and the user has reached it. */
    get isSelectionFull() {
        if (this.selectionMode !== "Multiple") {
            return false;
        }
        const cap = Number(this.maxSelection);
        return Number.isFinite(cap) && cap > 0 && this._selectedKeys.length >= cap;
    }

    /**
     * Whether the toolbar row has anything in it.
     *
     * Note this makes Clear Selection reachable with the header switched off. It
     * was previously nested inside the header markup, so its own conditions could
     * all be met and the button still never rendered.
     */
    get showToolbar() {
        return Boolean(this.showHeader) || Boolean(this.showSearchBar);
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
        return this.isPaginated && this.matchedRows.length > 0;
    }

    /* Page facts handed to c/fgrid_pagination, which owns the summary text and the
       first/last disabled states itself. `pageSummary`, `isFirstPage` and
       `isLastPage` lived here for the old four-button bar and are gone with it. */

    get currentPage() {
        return this.pageState.page;
    }

    get totalPages() {
        return this.pageState.totalPages;
    }

    get totalRows() {
        return this.pageState.totalRows;
    }

    get firstRow() {
        return this.pageState.firstRow;
    }

    get lastRow() {
        return this.pageState.lastRow;
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

    /**
     * Announced as soon as the maximum is reached, not only when a click is refused.
     *
     * Every unselected row is disabled at that point, so without this the grid simply
     * stops responding with no stated reason — and the reason may be a selection on a
     * page the user cannot see.
     */
    get selectionBlockedMessage() {
        if (!this.isSelectionFull) {
            return null;
        }
        const cap = Number(this.maxSelection);
        return `Maximum of ${cap} ${cap === 1 ? "row" : "rows"} selected. Deselect a row to choose another.`;
    }

    get hasSelectionBlockedMessage() {
        return Boolean(this.selectionBlockedMessage);
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

    /**
     * Always emits a height, falling back to 30rem.
     *
     * Two reasons it cannot stay optional. Infinite scrolling needs a scroll boundary
     * or `loadmore` never fires, and a grid with no height renders every row at full
     * length — the DOM cost scroll mode exists to avoid. The 30rem was previously only
     * PLACEHOLDER text on the property, so the field looked populated while nothing
     * was enforced.
     *
     * NO `overflow` is emitted, deliberately. `lightning-datatable` scrolls itself
     * once its container has a definite height, so adding `overflow: auto` here
     * stacked a SECOND scroll container outside the first — and the outer one
     * reserved its own scrollbar gutter, which showed as dead space down the right
     * edge beyond the visible scrollbar.
     *
     * That also removed the point of the old `allowOverflow` property, which set
     * `overflow: visible` — the CSS default — on a wrapper that no longer declares
     * any overflow, and so did nothing. It could not have worked regardless: a
     * clipped dropdown is clipped by the datatable's OWN scroll container, inside its
     * shadow DOM, which our CSS cannot reach.
     */
    /**
     * Lines a wrapped cell shows before truncating, or undefined for no limit.
     *
     * Passed as a STRING: the reference says the attribute "accepts a string value
     * representing a number", and the markup example is `wrap-text-max-lines="3"`.
     */
    get wrappedLines() {
        const requested = Number(this.wrapTextMaxLines);
        if (!Number.isFinite(requested) || requested <= 0) {
            return undefined;
        }
        return String(Math.min(Math.max(Math.trunc(requested), WRAPPED_LINES_MIN), WRAPPED_LINES_MAX));
    }

    get wrapperStyle() {
        const height = `height: ${this.tableHeight || DEFAULT_TABLE_HEIGHT};`;
        const lines = this.wrappedLines;
        if (!lines) {
            return height;
        }
        // Override the SLDS styling hook, because the datatable writes the wrong
        // variable for SLDS 2.
        //
        // It sets `--lwc-lineClamp` inline on the cell wrapper from
        // `wrap-text-max-lines`, but in an SLDS 2 org (`slds-plus.css`)
        // `.slds-line-clamp` clamps on `--slds-g-font-line-clamp`, which is pinned to 3
        // at `:where(html)`. So the datatable wrote 6, the stylesheet read 3, and no
        // value could ever take effect. Confirmed in the inspector: the cell carried
        // `--lwc-lineClamp: 6` while the computed clamp resolved to 3 from
        // slds-plus.css.
        //
        // Setting the hook here is the sanctioned SLDS 2 route, and custom properties
        // inherit, so it reaches cells inside the datatable's shadow DOM where our
        // own CSS cannot. `wrap-text-max-lines` is still passed, because it is what
        // makes the datatable apply the `slds-line-clamp` class at all.
        return `${height} --slds-g-font-line-clamp: ${lines}; --lwc-lineClamp: ${lines};`;
    }

    /**
     * Names the table for assistive technology.
     *
     * The datatable has no accessible name of its own, so without this a screen
     * reader announces an unlabelled grid. Falls back to the object's plural label
     * when the admin has not set a table label.
     */
    get tableAriaLabel() {
        return this.tableLabel || this._metadata?.object?.pluralLabel || "Records";
    }

    /**
     * Row- and table-level errors in the shape the datatable expects.
     *
     * Previously every failure was a banner above the grid, which cannot say WHICH
     * row failed. A row-action flow knows exactly which record it was launched for,
     * so that failure belongs on the row.
     */
    get tableErrors() {
        const errors = {};
        if (this._flowError && this._flowRecord) {
            const key = this._flowRecord[this.keyField];
            if (key !== null && key !== undefined) {
                errors.rows = {
                    [key]: { title: "This row's action did not finish", messages: [this._flowError] }
                };
            }
        }
        if (this._metadataError) {
            errors.table = { title: "Column setup problem", messages: [this._metadataError] };
        }
        return errors;
    }

    /** Remembers a dragged width so a re-render does not undo it. */
    handleColumnResize(event) {
        const widths = event.detail?.columnWidths;
        if (!Array.isArray(widths) || !event.detail?.isUserTriggered) {
            return;
        }
        const next = { ...this._columnWidths };
        this.columns.forEach((column, index) => {
            if (Number.isFinite(widths[index]) && widths[index] > 0) {
                next[column.columnKey] = widths[index];
            }
        });
        this._columnWidths = next;
    }

    /**
     * Sends the table back to the top after a page change.
     *
     * Without it, moving to page two leaves the viewport where it was, so the user
     * lands mid-table on rows they have not seen the start of.
     */
    renderedCallback() {
        if (this._scrolledForPage === this._page) {
            return;
        }
        this._scrolledForPage = this._page;
        this.template.querySelector("c-fgrid_custom-datatable")?.scrollToTop?.();
    }

    /** Shown once the user has interacted and a required selection is missing. */
    get validationMessage() {
        const required = this.requiredSelectionCount;
        if (!this._touched || required === 0 || this._selectedKeys.length >= required) {
            return null;
        }
        return required === 1
            ? "Select at least one row to continue."
            : `Select at least ${required} rows to continue.`;
    }

    get hasValidationMessage() {
        return Boolean(this.validationMessage);
    }

    /* ------------------------------------------------------------------ *
     * Handlers
     * ------------------------------------------------------------------ */

    handleRowSelection(event) {
        this._touched = true;
        const selected = (event.detail.selectedRows || []).map((row) => row?.[this.keyField]);

        // The datatable reports the rows IT is rendering, so its answer is
        // authoritative for the current page and silent about every other one.
        // Replacing the whole selection with it meant paging away deselected
        // everything the user had picked — and in scroll mode, so did scrolling past
        // it. Only the visible rows are reconciled; the rest are left alone.
        const visible = new Set(this.rows.map((row) => String(row?.[this.keyField])));
        const offPage = this._selectedKeys.filter((key) => !visible.has(String(key)));

        // Enforce Maximum Selection HERE, not through the datatable. It is handed
        // only the keys for rows it can see, so its own cap counts one page at a time:
        // three selected on page one left three more available on page two.
        //
        // Already-selected rows keep their place and only the newly ticked ones are
        // refused, so reaching the limit does not silently reshuffle what the user
        // already had.
        const cap = this.selectionMode === "Multiple" ? Number(this.maxSelection) : 0;
        const capped = Number.isFinite(cap) && cap > 0;
        let merged = [...offPage, ...selected];

        if (capped && merged.length > cap) {
            const previous = new Set(this._selectedKeys.map((key) => String(key)));
            const kept = [...offPage, ...selected.filter((key) => previous.has(String(key)))];
            const room = Math.max(cap - kept.length, 0);
            const added = selected.filter((key) => !previous.has(String(key))).slice(0, room);
            merged = [...kept, ...added];
        }

        this._selectedKeys = merged;
        this.publishSelection();
    }

    /**
     * Grows the rendered window.
     *
     * Synchronous, because the records are already in memory: there is nothing to
     * fetch, so no spinner and no async gap. `enableInfiniteLoading` turns itself off
     * once the window covers everything, which stops the datatable firing this again
     * at the bottom of a fully rendered list.
     */
    handleLoadMore() {
        if (!this.isScrolling) {
            return;
        }
        const total = this.matchedRows.length;
        if (this._visibleCount >= total) {
            return;
        }
        this._visibleCount = Math.min(total, this._visibleCount + SCROLL_BATCH_SIZE);
    }

    /** Back to one batch. Anything that changes the result set must call this, or the
     *  window stays sized for results the user is no longer looking at. */
    resetVisibleRows() {
        this._visibleCount = SCROLL_BATCH_SIZE;
    }

    handleSearch(event) {
        this._searchTerm = event.target.value || "";
        this._page = 1;
        this.resetVisibleRows();
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

        if (action?.name === BLANKS_FIRST_ACTION_NAME) {
            // Keyed by the field the column SORTS on, which for a linked Name column
            // or a lookup is not the field the datatable reports.
            const sorted = this.columns.find((candidate) => candidate.fieldName === columnDefinition?.fieldName);
            const field = sorted?.fgridTextField || sorted?.fgridLinkFor || columnDefinition?.fieldName;
            if (!field) {
                return;
            }
            this._blanksFirst = this._blanksFirst.includes(field)
                ? this._blanksFirst.filter((candidate) => candidate !== field)
                : [...this._blanksFirst, field];
            return;
        }

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
        this.resetVisibleRows();
    }

    handleClearFilters() {
        this._filters = {};
        this._searchTerm = "";
        this._page = 1;
        this.resetVisibleRows();
    }

    /** Clamped rather than trusted: a stale click could name a page that no longer
     *  exists after a filter narrowed the results. */
    handlePageChange(event) {
        const requested = Number(event.detail?.page);
        if (!Number.isFinite(requested)) {
            return;
        }
        this._page = Math.min(Math.max(1, requested), this.pageState.totalPages);
    }

    /**
     * Applies a runtime page size.
     *
     * Resets to page one, because page 5 of 32 at ten rows is page 2 of 7 at fifty —
     * holding the number would land the user somewhere they did not ask for.
     */
    handleRowsPerPageChange(event) {
        const size = Number(event.detail?.value);
        if (!Number.isFinite(size) || size < 1) {
            return;
        }
        this._userRecordsPerPage = size;
        this._page = 1;
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

        // Actioned means CLICKED, and nothing more. Published here, before either
        // branch, so it reports the row the user acted on regardless of what the
        // action then did — a cancelled flow, a flow that changed nothing, or a
        // removal refused by the cap all still count. It used to wait for an outcome,
        // which made it a second, weaker "edited" rather than a record of intent.
        this.publishActioned(record);

        if (this.rowActionType === "Flow") {
            this.openRowActionFlow(record);
            return;
        }

        if (this.rowActionType !== "Remove") {
            return;
        }

        // maxRemovedRows of 0 or blank means no limit.
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
        // The actioned record was published on click, so nothing to report here.
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
            } else if (this.rowActionFlowSavesChanges) {
                this.settleSavedEdits(record?.[this.keyField], current);
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
     *
     * MERGE, NEVER REPLACE. `cellchange` reports only the cell that just changed,
     * not the accumulated draft set. Assigning it wholesale therefore threw away
     * every earlier edit the moment a second cell was touched — and because
     * `draft-values` is bound straight back to the table, the first cell visibly
     * reverted too. Drafts are merged per row so editing three cells leaves three
     * fields pending on one draft record.
     */
    handleCellChange(event) {
        const incoming = event.detail?.draftValues || [];
        if (!incoming.length) {
            return;
        }

        // Auto-save: commit and keep nothing pending, so the Cancel/Save buttons have
        // no reason to appear. Deliberately no undo — that is what Cancel was for, and
        // an admin choosing this has chosen immediacy over it.
        if (this.autoSaveEdits) {
            incoming.forEach((draft) => {
                const key = draft?.[this.keyField];
                if (key !== null && key !== undefined && key !== "") {
                    this.upsertRecord(this.normalizeDraft(draft));
                }
            });
            this._draftValues = [];
            return;
        }

        const merged = this._draftValues.map((draft) => ({ ...draft }));
        incoming.forEach((draft) => {
            const key = draft?.[this.keyField];
            const existing =
                key === null || key === undefined
                    ? undefined
                    : merged.find((candidate) => candidate[this.keyField] === key);
            if (existing) {
                Object.assign(existing, draft);
            } else {
                merged.push({ ...draft });
            }
        });
        this._draftValues = merged;
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
     * Moves a row action's already-saved changes out of the pending set.
     *
     * Only runs when the admin has said the launched flow does its own DML, and even
     * then it does not take their word for it: each pending field is compared against
     * the record as re-read from the database. A field that matches was genuinely
     * saved and moves to the display-only overlay; one that does not is still pending
     * and stays in Edited Records. So a flow that saves some fields and returns others
     * reports exactly the unsaved remainder rather than all or nothing.
     */
    settleSavedEdits(key, current) {
        const pending = this._editsByKey[key];
        if (!pending) {
            return;
        }
        const stillPending = {};
        const saved = {};
        Object.keys(pending).forEach((field) => {
            if (sameValue(current[field], pending[field])) {
                saved[field] = pending[field];
            } else {
                stillPending[field] = pending[field];
            }
        });
        if (!Object.keys(saved).length) {
            return;
        }

        const nextEdits = { ...this._editsByKey };
        if (Object.keys(stillPending).length) {
            nextEdits[key] = stillPending;
        } else {
            delete nextEdits[key];
        }
        this._editsByKey = nextEdits;
        this._savedByKey = { ...this._savedByKey, [key]: { ...(this._savedByKey[key] || {}), ...saved } };
        this.publishEdits();
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
        // Drafts are keyed by columnKey, NOT fieldName. Columns carry a columnKey so
        // a dragged width survives a rebuild, and the datatable then reports edits
        // under it — an edit to Date_Test__c arrived as `Date_Test__c__3`, which was
        // written to the record verbatim. The real field kept its old value while a
        // phantom one held the edit, so the cell appeared to clear on save even
        // though a change was correctly detected.
        const fieldByColumnKey = new Map(
            this.columns.filter((column) => column.columnKey).map((column) => [column.columnKey, column.fieldName])
        );
        const multiFields = new Set(
            this.columns.filter((column) => column.fgridIsMultiPicklist).map((column) => column.fieldName)
        );
        // A percent cell is edited as the fraction the datatable displays, so the
        // draft comes back as 0.25 for 25%. Stored unconverted it would be 100x out.
        const percentFields = new Set(
            this.columns.filter((column) => column.type === "percent").map((column) => column.fieldName)
        );
        const normalized = {};
        Object.keys(draft).forEach((key) => {
            // The key field and anything without a columnKey pass through unchanged.
            const field = fieldByColumnKey.get(key) || key;
            if (field.endsWith(PICKLIST_OPTIONS_SUFFIX) || field.endsWith(PICKLIST_SELECTED_SUFFIX)) {
                return;
            }
            if (multiFields.has(field)) {
                normalized[field] = joinMultiPicklist(draft[key]);
            } else if (percentFields.has(field)) {
                normalized[field] = fractionToPercent(draft[key]);
            } else {
                normalized[field] = draft[key];
            }
        });
        return normalized;
    }

    /**
     * The column the datatable should draw its arrow on, and which way.
     *
     * Deliberately NOT the `sortedBy` / `sortDirection` output properties, even
     * though they hold the same values. Those belong to Flow: it owns them, may
     * write them back on its own schedule, and an outputOnly property is not a
     * dependable place to keep view state. Binding the table to them meant the
     * table could not see its own current direction, so every click reported `asc`
     * and the sort would never invert.
     */
    get tableSortedBy() {
        return this._tableSortedBy;
    }

    get tableSortDirection() {
        return this._sortDirection;
    }

    handleSort(event) {
        const { fieldName, columnKey, sortDirection } = event.detail;

        // MATCH ON columnKey, NOT fieldName. Our columns carry a columnKey, and the
        // datatable then identifies them by it — the sort event reports both, and
        // `sorted-by` has to be echoed back as the columnKey or the table never
        // recognises the column as sorted. It then refuses to flip: the second click
        // produced no event at all, so a grid could only ever sort ascending.
        //
        // Exactly the trap inline editing hit, where drafts arrive keyed by columnKey
        // (see normalizeDraft). Any state the datatable keys per column belongs to
        // columnKey once columnKey exists.
        const column =
            this.columns.find((candidate) => candidate.columnKey === columnKey) ||
            this.columns.find((candidate) => candidate.fieldName === fieldName);

        // Sort on what the column SHOWS, not on what it stores. A link column would
        // otherwise order rows by record id via its generated URL, and a lookup by the
        // parent's Id rather than the parent's name.
        this._sortField = column?.fgridTextField || column?.fgridLinkFor || column?.fieldName || fieldName;
        this._sortDirection = sortDirection;
        this._tableSortedBy = columnKey || fieldName;

        // The flow gets the field an admin would recognise, never the generated URL
        // field a linked column sorts through.
        this.publish("sortedBy", this._sortField);
        this.publish("sortDirection", sortDirection);
        this.resetVisibleRows();
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
        const required = this.requiredSelectionCount;
        if (required > 0 && this._selectedKeys.length < required) {
            this._touched = true;
            return {
                isValid: false,
                errorMessage:
                    required === 1
                        ? "Select at least one row to continue."
                        : `Select at least ${required} rows to continue.`
            };
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
        // The display-only overlay goes too. A recalculated collection is a fresh read
        // that already carries anything the database holds, and keeping the overlay
        // would mask a value the source has since changed back.
        this._savedByKey = {};
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

        // The single output above answers "which row just now", and is overwritten by
        // the next click — useful for reacting on the same screen, useless for
        // reporting afterwards. The collection answers "which rows in total". Repeats
        // collapse because it records WHICH rows were actioned, not how many clicks.
        const key = record?.Id ?? record?.[this.keyField];
        if (key === undefined || key === null || key === "") {
            return;
        }
        const id = String(key);
        if (!this._actionedKeys.includes(id)) {
            this._actionedKeys = [...this._actionedKeys, id];
            this.publish("outputActionedRecordIds", this._actionedKeys);
        }
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
