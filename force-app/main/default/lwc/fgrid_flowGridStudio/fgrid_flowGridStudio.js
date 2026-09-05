/**
 * Grid Studio — a wide two-pane workspace launched from the Flow Builder property
 * panel: every configuration control on the left, a live preview and the column
 * attribute grid on the right.
 *
 * Renders as the platform's own SLDS 2 modal: this extends `LightningModal` and
 * is opened by the editor with `FgridFlowGridStudio.open({ size: "large" })`.
 *
 * WHY THE PLATFORM MODAL, NOT HAND-ROLLED MARKUP
 * Flow Builder wraps the property panel in transformed ancestors. A transform
 * creates both a containing block for `position: fixed` and a new stacking
 * context, so a z-index on any element *inside* the property editor is scoped to
 * that ancestor and cannot outrank the screen canvas beside it. The canvas chip,
 * its Move/Delete buttons and the connector lines painted straight over the old
 * hand-rolled modal, and three separate attempts failed to stop it: an explicit
 * z-index, elevating the component host via the kit's `setPopoverHostActive`, and
 * an opaque backdrop.
 *
 * A reduced repro (see `repro/canvas-bleed-through`) reproduced the bleed with
 * every custom style removed, which cleared this stylesheet of blame, and showed
 * that the platform modal does not bleed at any size. `lightning/modal` renders
 * in the platform's overlay container rather than in the editor's subtree, so it
 * is not a descendant of those transformed ancestors at all. That is the fix: the
 * problem was never CSS, it was where the modal lived in the DOM.
 *
 * `size="large"` is not a downgrade from the old 92vw. SLDS 2 modal sizes are
 * viewport-relative, and `large` measured at 89% of the viewport against the old
 * 92% — a difference of about 90px on a wide monitor.
 *
 * This component owns no configuration state. It renders what the editor hands it
 * and relays every change back up, so the editor stays the single writer to Flow
 * Builder. Preview updates are instant because the editor keeps optimistic local
 * values rather than waiting for Flow Builder to republish inputVariables.
 *
 * RELAYS ARE CALLBACKS, NOT EVENTS
 * A modal's events cannot be caught by the component that opened it — they bubble
 * to a root outside it — so `lightning/modal` requires handlers to be passed into
 * `open()`. Those passed handlers are invoked directly here instead of dispatching
 * events, which also avoids the documented requirement that modal *events* need
 * Lightning Web Security enabled in the org.
 */
import { api } from "lwc";
import LightningModal from "lightning/modal";
import {
    buildColumns,
    buildRows,
    buildSampleRows,
    parseFieldList,
    parseColumnConfig,
    withRowActionColumn,
    filterRows,
    filterKindFor,
    isFilterActive,
    describeFilter,
    FILTER_ACTION_NAME,
    ROW_ACTION_NAME
} from "c/fgrid_gridModel";
import getGridMetadata from "@salesforce/apex/FlowGridController.getGridMetadata";
import getPreviewRecords from "@salesforce/apex/FlowGridController.getPreviewRecords";

const PREVIEW_ROW_COUNT = 6;

export default class FgridFlowGridStudio extends LightningModal {
    @api sections = [];

    /**
     * Current configuration. Changing the object or the column selection
     * invalidates the preview sample, so the setter refetches on those.
     */
    @api
    get values() {
        return this._values || {};
    }
    set values(next) {
        this._values = next || {};
        this.refreshPreviewIfStale();
    }
    @api valueDataTypes = {};
    @api
    get objectApiName() {
        return this._objectApiName;
    }
    set objectApiName(next) {
        this._objectApiName = next;
        this.refreshPreviewIfStale();
    }

    @api validationErrors = [];

    @api builderContext;
    @api automaticOutputVariables;
    @api apiVersion;

    /* ------------------------------------------------------------------ *
     * Callbacks supplied by the editor through open()
     * ------------------------------------------------------------------ */

    /**
     * Called with the same detail the old `propertychange` event carried.
     *
     * Deliberately not named `onPropertyChange`: LWC reserves `on*` property
     * names for event handlers and rejects them on `@api`, which is the same rule
     * that makes an `on*` key in `open()` bind an event rather than set a prop.
     * These are plain function props, invoked directly.
     */
    @api notifyPropertyChange;

    /** Called with the same detail the old `columnconfigchange` event carried. */
    @api notifyColumnConfigChange;

    /**
     * Handed this instance once, on open.
     *
     * The editor needs a reference for two things the old template-child
     * arrangement gave it for free: pushing fresh `values` down as it commits, and
     * pulling `collectValidity()` during validation. `open()` returns a promise
     * rather than an instance, so the instance has to be handed out from in here.
     */
    @api notifyReady;

    connectedCallback() {
        super.connectedCallback?.();
        this.notifyReady?.(this);
    }

    /** Section names expanded in the left pane. */
    openSections = ["source", "rows", "columns"];

    /* ------------------------------------------------------------------ *
     * Settings pane
     * ------------------------------------------------------------------ */

    /**
     * Whether the settings pane is hidden, giving the preview the full width.
     *
     * Deliberately not a Flow property: it is a per-session view preference, and
     * persisting it would mean an admin's collapsed pane greeted the next person
     * to open the element with no settings visible.
     */
    isSidebarCollapsed = false;

    handleToggleSidebar() {
        this.isSidebarCollapsed = !this.isSidebarCollapsed;
    }

    get contentClass() {
        return this.isSidebarCollapsed ? "studio__content studio__content_collapsed" : "studio__content";
    }

    get sidebarToggleIcon() {
        return this.isSidebarCollapsed ? "utility:chevronright" : "utility:chevronleft";
    }

    get sidebarToggleLabel() {
        return this.isSidebarCollapsed ? "Show the Settings Pane" : "Hide the Settings Pane";
    }

    /** aria-expanded wants the string, not the boolean. */
    get sidebarExpanded() {
        return String(!this.isSidebarCollapsed);
    }

    _values = {};
    _objectApiName;
    /** Real field metadata, keyed by field path. Null until Apex answers. */
    _describeByPath = null;
    /** Real sample records. Empty means fall back to fabricated rows. */
    _sampleRecords = [];
    /** Signature of the object + columns the current sample was fetched for. */
    _sampleSignature = null;
    _isLoadingSample = false;
    /** Filters applied to the preview. Real, not decorative: the preview holds real
     *  sample records, so filtering them demonstrates the actual behaviour rather
     *  than showing a control that does nothing. */
    _previewFilters = {};
    _previewFilterEditorPath = null;

    /** Field metadata for the column attributes table, which uses it only to tell
     *  which columns are lookups. */
    get describeByPath() {
        return this._describeByPath;
    }

    /* ------------------------------------------------------------------ *
     * Preview
     * ------------------------------------------------------------------ */

    get columnFields() {
        return parseFieldList(this.values?.columnFields);
    }

    get columnConfigObject() {
        return parseColumnConfig(this.values?.columnConfig);
    }

    get hasColumns() {
        return this.columnFields.length > 0;
    }

    /** Columns come from the selected object, so there is nothing to configure
     *  until a record collection has established one. */
    get hasObject() {
        return Boolean(this.objectApiName);
    }

    /** Same switch the runtime applies, so the preview wraps the same way. */
    get previewWrappedLines() {
        return this.values?.limitWrappedLines ? "3" : undefined;
    }

    get previewColumns() {
        const columns = buildColumns(this.columnFields, this.columnConfigObject, {
            hideHeaderActions: Boolean(this.values?.hideHeaderActions),
            defaultEditable: false,
            // The preview cannot edit anything — its search box and pagination are
            // disabled for the same reason — so editable columns would only offer a
            // pencil that does nothing. It also keeps custom picklist cell types out
            // of the preview entirely: their option lists are addressed as row
            // fields, and buildSampleRows works from field names, so a synthetic row
            // has no options array for the editor to render.
            forceReadOnly: true,
            // Filtering IS offered here, unlike editing: it needs no writable data
            // and it is the only way an admin can confirm from the preview which
            // columns they marked filterable.
            filterActions: true,
            readOnlyIcon: Boolean(this.values?.showReadOnlyIcon),
            // Marked here too: the preview exists to show what will ship, and a
            // dependent column is dependent whether or not the preview can edit it.
            dependentPicklistIcon: this.values?.dependentPicklistIcon,
            describeByPath: this._describeByPath,
            // Links are inert in a preview and would invite a misclick that
            // navigates away from the editor.
            linkNameField: false
        });
        // Built the same way the runtime builds it, so the icon, colour, side and
        // button variant on screen are the ones that will ship. No `onrowaction`
        // handler is wired, which leaves the control inert like the preview's
        // disabled search box and pagination buttons — clicking it here must not
        // launch a flow or drop a row from the editor.
        return withRowActionColumn(columns, {
            actionType: this.values?.rowActionType,
            display: this.values?.rowActionDisplay,
            position: this.values?.rowActionPosition,
            label: this.values?.rowActionLabel,
            iconName: this.values?.rowActionIcon,
            color: this.values?.rowActionColor,
            buttonLabel: this.values?.rowActionButtonLabel,
            buttonIcon: this.values?.rowActionButtonIcon,
            buttonIconPosition: this.values?.rowActionButtonIconPosition,
            buttonVariant: this.values?.rowActionButtonVariant
        });
    }

    /** True when the rows on screen are real records, not fabricated ones. */
    get isRealSample() {
        return this._sampleRecords.length > 0;
    }

    get previewRows() {
        const keyField = this.values?.keyField || "Id";
        const rows = this.isRealSample
            ? buildRows(this._sampleRecords, this.previewColumns, keyField)
            : buildSampleRows(this.columnFields, this.columnConfigObject, PREVIEW_ROW_COUNT, keyField);
        const filtered = filterRows(rows, this._previewFilters, Boolean(this.values?.matchCaseOnFilters));
        const max = Number(this.values?.maxNumberOfRows);
        const perPage = this.values?.rowLoading === "Paginate" ? Number(this.values?.recordsPerPage) : null;
        const limit = [max, perPage].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)[0];
        return limit ? filtered.slice(0, limit) : filtered;
    }

    get previewKeyField() {
        return this.values?.keyField || "Id";
    }

    /** `lightning-datatable` selection modes. */
    get previewMaxRowSelection() {
        if (this.values?.selectionMode === "Single") {
            return 1;
        }
        return undefined;
    }

    get previewHideCheckbox() {
        return this.values?.selectionMode === "None";
    }

    get showPreviewHeader() {
        return Boolean(this.values?.showHeader);
    }

    get previewHeaderLabel() {
        return this.values?.tableLabel || "Untitled grid";
    }

    get previewHeaderIcon() {
        return this.values?.tableIcon || null;
    }

    get hasPreviewHeaderIcon() {
        return Boolean(this.values?.tableIcon);
    }

    get previewCountLabel() {
        const parts = [];
        if (this.values?.showRecordCount) {
            parts.push(`${this.previewRows.length} items`);
        }
        if (this.values?.showSelectedCount) {
            parts.push("0 selected");
        }
        return parts.join(" • ");
    }

    get hasPreviewCountLabel() {
        return Boolean(this.previewCountLabel);
    }

    /** Honors the configured grid height so the preview reflects it. */
    get previewGridStyle() {
        const height = this.values?.tableHeight;
        return height ? `height: ${height}; overflow: auto;` : "";
    }

    /* Datatable attributes the preview mirrors so layout choices are visible here. */

    get showPaginationChrome() {
        return this.values?.rowLoading === "Paginate";
    }

    get showFirstLast() {
        return Boolean(this.values?.showFirstLastButtons);
    }

    get showSearchBar() {
        return Boolean(this.values?.showSearchBar);
    }

    /* ----- preview toolbar ----- */

    /**
     * The preview mirrors the runtime toolbar's shape but offers no filtering:
     * filters are set from a column's header menu, and a header menu in the
     * preview would have nothing to act on. `buildColumns` is called without
     * `filterActions`, so no Filter item appears there either.
     */
    get showPreviewToolbar() {
        return this.showPreviewHeader || this.showSearchBar;
    }

    /* ----- preview filters -----
       Mirrors the runtime: set from a column's header menu, reported by pills. The
       column descriptors are built the same way, so the operators and value
       controls an admin sees here are the ones that will appear at runtime. */

    get previewFilterColumns() {
        const config = this.columnConfigObject;
        return this.previewColumns
            .filter((column) => column.fieldName !== ROW_ACTION_NAME)
            .map((column) => ({
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
            .filter((entry) => config?.[entry.configKey]?.filter === true);
    }

    get previewFilterPills() {
        const byPath = new Map(this.previewFilterColumns.map((column) => [column.path, column]));
        return Object.entries(this._previewFilters)
            .filter(([, filter]) => isFilterActive(filter))
            .map(([path, filter]) => ({
                path,
                label: describeFilter(byPath.get(path)?.label || path, filter)
            }));
    }

    get hasPreviewFilters() {
        return this.previewFilterPills.length > 0;
    }

    get previewFilterEditorColumn() {
        return this.previewFilterColumns.find((column) => column.path === this._previewFilterEditorPath) || null;
    }

    get isPreviewFilterEditorOpen() {
        return Boolean(this.previewFilterEditorColumn);
    }

    get previewFilterEditorFilter() {
        return this._previewFilterEditorPath ? this._previewFilters[this._previewFilterEditorPath] || null : null;
    }

    handlePreviewHeaderAction(event) {
        const { action, columnDefinition } = event.detail;
        if (action?.name !== FILTER_ACTION_NAME) {
            return;
        }
        const name = columnDefinition?.fieldName;
        this._previewFilterEditorPath =
            this.previewFilterColumns.find((candidate) => candidate.fieldName === name)?.path || null;
    }

    handlePreviewFilterSave(event) {
        this.applyPreviewFilter(event.detail.path, event.detail.filter);
        this._previewFilterEditorPath = null;
    }

    handlePreviewFilterRemove(event) {
        this.applyPreviewFilter(event.detail.path, null);
        this._previewFilterEditorPath = null;
    }

    handlePreviewFilterEditorClose() {
        this._previewFilterEditorPath = null;
    }

    handleEditPreviewPill(event) {
        this._previewFilterEditorPath = event.currentTarget.dataset.path;
    }

    handleRemovePreviewPill(event) {
        this.applyPreviewFilter(event.currentTarget.dataset.path, null);
    }

    handleClearPreviewFilters() {
        this._previewFilters = {};
    }

    applyPreviewFilter(path, filter) {
        const next = { ...this._previewFilters };
        if (filter === null || filter === undefined) {
            delete next[path];
        } else {
            next[path] = filter;
        }
        this._previewFilters = next;
    }

    get rowActionSummary() {
        const type = this.values?.rowActionType;
        if (!type || type === "None") {
            return null;
        }
        const display = this.values?.rowActionDisplay === "Button" ? "button" : "icon";
        // Left, matching the property default and withRowActionColumn's own.
        const side = (this.values?.rowActionPosition || "Left").toLowerCase();
        return `${type} row action, shown as ${display === "button" ? "a button" : "an icon"} on the ${side}`;
    }

    get hasRowAction() {
        return Boolean(this.rowActionSummary);
    }

    get hasValidationErrors() {
        return (this.validationErrors || []).length > 0;
    }

    get previewBannerText() {
        if (this._isLoadingSample) {
            return "Loading a sample of your records\u2026";
        }
        if (this.isRealSample) {
            return "Live preview using real records from this object.";
        }
        if (this.hasObject && this.hasColumns) {
            return "No records found for this object, so the rows below are fabricated. Column layout and formatting are real.";
        }
        return "Preview with sample data. Values are fabricated; column layout and formatting are real.";
    }

    get previewBannerIcon() {
        return this.isRealSample ? "utility:success" : "utility:preview";
    }

    get previewBannerClass() {
        return this.isRealSample ? "preview__banner preview__banner_live" : "preview__banner";
    }

    /* ------------------------------------------------------------------ *
     * Preview data loading
     * ------------------------------------------------------------------ */

    /**
     * Refetches describe and a record sample when the object or the column
     * selection changes.
     *
     * Guarded by a signature rather than a lifecycle hook: Flow Builder
     * republishes `values` on every keystroke, and refetching on each one would
     * hammer Apex for a preview.
     */
    refreshPreviewIfStale() {
        const object = this._objectApiName;
        const paths = parseFieldList(this._values?.columnFields);
        const signature = object ? `${object}|${paths.join(",")}` : null;

        if (signature === this._sampleSignature) {
            return;
        }
        this._sampleSignature = signature;
        this._describeByPath = null;
        this._sampleRecords = [];

        if (!object || !paths.length) {
            return;
        }
        this.loadPreview(object, paths, signature);
    }

    /**
     * Loads real metadata and records for the preview.
     *
     * Both calls are best effort. Describe failing means the preview keeps
     * guessing types from field names; no records means it keeps fabricating
     * rows. Neither should break the editor.
     */
    async loadPreview(object, paths, signature) {
        this._isLoadingSample = true;
        try {
            const [metadata, records] = await Promise.all([
                getGridMetadata({ objectApiName: object, fieldPaths: paths }).catch(() => null),
                getPreviewRecords({
                    objectApiName: object,
                    fieldPaths: paths,
                    recordLimit: PREVIEW_ROW_COUNT
                }).catch(() => [])
            ]);

            // The admin may have changed the object while this was in flight.
            if (signature !== this._sampleSignature) {
                return;
            }
            if (metadata?.columns?.length) {
                this._describeByPath = metadata.columns.reduce((map, column) => {
                    map[column.fieldPath] = column;
                    return map;
                }, {});
            }
            this._sampleRecords = Array.isArray(records) ? records : [];
        } finally {
            if (signature === this._sampleSignature) {
                this._isLoadingSample = false;
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Relays — the editor remains the only writer
     * ------------------------------------------------------------------ */

    handlePropertyChange(event) {
        event.stopPropagation();
        this.notifyPropertyChange?.(event.detail);
    }

    handleColumnConfigChange(event) {
        event.stopPropagation();
        this.notifyColumnConfigChange?.(event.detail);
    }

    /** Escape, the close button and the backdrop are the platform's job now. */
    handleClose() {
        this.close();
    }

    /** Forwarded so the editor's validate() can reach controls in this subtree. */
    @api
    collectValidity(errorsByKey) {
        const found = [];
        this.template.querySelectorAll("c-fgrid_property-controls").forEach((controls) => {
            (controls.collectValidity(errorsByKey) || []).forEach((error) => found.push(error));
        });
        return found;
    }
}
