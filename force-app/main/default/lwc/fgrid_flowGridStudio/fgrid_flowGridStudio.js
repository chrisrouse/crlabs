/**
 * Grid Studio — a wide two-pane workspace launched from the Flow Builder property
 * panel: every configuration control on the left, a live preview and the column
 * attribute grid on the right.
 *
 * Renders as an SLDS modal inside the custom property editor.
 *
 * ESCAPING FLOW BUILDER'S STACKING CONTEXT
 * Flow Builder wraps the property panel in transformed ancestors. A transform
 * creates both a containing block for `position: fixed` and a new stacking
 * context, so a z-index on any element *inside* this component is scoped to that
 * ancestor and cannot outrank the screen canvas beside it — no value works, and
 * a repaint (such as focusing and blurring a picker) exposes the real order.
 *
 * The kit documents this same problem for its popovers and solves it by
 * elevating the component *host*. `setPopoverHostActive` is its exported helper
 * for exactly that, and all three kit pickers call it on open and close, so this
 * reuses the kit's workaround rather than reinventing it.
 *
 * This component owns no configuration state. It renders what the editor hands it
 * and relays every change back up, so the editor stays the single writer to Flow
 * Builder. Preview updates are instant because the editor keeps optimistic local
 * values rather than waiting for Flow Builder to republish inputVariables.
 */
import { LightningElement, api } from "lwc";
import { buildColumns, buildSampleRows, parseFieldList, parseColumnConfig } from "c/fgrid_gridModel";
import { setPopoverHostActive } from "c/flowConfigPopoverUtils";

const PREVIEW_ROW_COUNT = 6;

export default class FgridFlowGridStudio extends LightningElement {
    @api sections = [];
    @api values = {};
    @api valueDataTypes = {};
    @api objectApiName;
    @api validationErrors = [];

    @api builderContext;
    @api automaticOutputVariables;
    @api apiVersion;

    /* ------------------------------------------------------------------ *
     * Stacking
     * ------------------------------------------------------------------ */

    /**
     * The Studio is rendered only while open, so connect/disconnect map exactly
     * to opening and closing. Elevating the host is what actually lifts this
     * modal above Flow Builder's screen canvas; see the note at the top.
     */
    connectedCallback() {
        setPopoverHostActive(this.template.host, true);
    }

    disconnectedCallback() {
        setPopoverHostActive(this.template?.host, false);
    }

    /** Section names expanded in the left pane. */
    openSections = ["source", "columns"];

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

    get previewColumns() {
        return buildColumns(this.columnFields, this.columnConfigObject, {
            hideHeaderActions: Boolean(this.values?.hideHeaderActions),
            defaultEditable: false
        });
    }

    get previewRows() {
        const rows = buildSampleRows(
            this.columnFields,
            this.columnConfigObject,
            PREVIEW_ROW_COUNT,
            this.values?.keyField || "Id"
        );
        const max = Number(this.values?.maxNumberOfRows);
        const perPage = this.values?.showPagination ? Number(this.values?.recordsPerPage) : null;
        const limit = [max, perPage].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)[0];
        return limit ? rows.slice(0, limit) : rows;
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

    get previewWrapperClass() {
        return this.values?.showBorder ? "preview__grid preview__grid_bordered" : "preview__grid";
    }

    /** Honors the configured grid height so the preview reflects it. */
    get previewGridStyle() {
        const height = this.values?.tableHeight;
        return height ? `height: ${height}; overflow: auto;` : "";
    }

    get showPaginationChrome() {
        return Boolean(this.values?.showPagination);
    }

    get showFirstLast() {
        return Boolean(this.values?.showFirstLastButtons);
    }

    get showSearchBar() {
        return Boolean(this.values?.showSearchBar);
    }

    get rowActionSummary() {
        const type = this.values?.rowActionType;
        if (!type || type === "None") {
            return null;
        }
        const display = this.values?.rowActionDisplay === "Button" ? "button" : "icon";
        const side = (this.values?.rowActionPosition || "Right").toLowerCase();
        return `${type} row action, shown as ${display === "button" ? "a button" : "an icon"} on the ${side}`;
    }

    get hasRowAction() {
        return Boolean(this.rowActionSummary);
    }

    get hasValidationErrors() {
        return (this.validationErrors || []).length > 0;
    }

    /* ------------------------------------------------------------------ *
     * Relays — the editor remains the only writer
     * ------------------------------------------------------------------ */

    handlePropertyChange(event) {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("propertychange", { detail: event.detail }));
    }

    handleColumnConfigChange(event) {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("columnconfigchange", { detail: event.detail }));
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent("close"));
    }

    /** Escape closes the modal, as SLDS expects. */
    handleKeyDown(event) {
        if (event.key === "Escape") {
            event.stopPropagation();
            this.handleClose();
        }
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
