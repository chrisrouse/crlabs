/**
 * `lightning-datatable` with picklist cell types added.
 *
 * The base datatable has no picklist type, so a PICKLIST column would otherwise
 * fall back to `text` — and its inline editor to a free-text box, which lets a
 * user type any string into a restricted field. That was the original reason this
 * subclass exists; lookups and long text followed for the same shape of reason.
 *
 * Long text needs its own cell because the datatable's text editor is a single
 * line: editing a 32,000-character field through one would flatten every newline
 * and save it back that way.
 *
 * Both are registered with `standardCellLayout: true` so the cell keeps the
 * datatable's own padding, truncation and edit-pencil affordance; only the inner
 * control is ours.
 *
 * WHAT THE TEMPLATES RECEIVE. Salesforce documents four values for an edit
 * template: `editedValue`, `columnLabel`, `required` and `typeAttributes`. What
 * it does not document is how a custom edit cell reports a new value back — the
 * guidance defers to the standard `draft-values`/`onsave` path. The mechanism
 * relied on here is `data-inputable="true"`, which the docs require for
 * accessibility in the standard cell layout and which is also what the inline
 * edit machinery reads the value from. That is the fragile part of this bundle;
 * it is verified by browser testing, not by the docs.
 *
 * Picklist options are per COLUMN and hold the ACTIVE values only, matching a
 * record page: a stored value that has since been deactivated is not offered, and
 * changing away from it is one-way unless the user cancels.
 *
 * @see c/fgrid_gridModel buildColumns
 */
import { api } from "lwc";
import LightningDatatable from "lightning/datatable";

/** What a dragged field carries, shared with c/fgrid_fieldPalette and
 *  c/fgrid_flowGridStudio, so a header drops wherever a field does. */
const FIELD_DRAG_TYPE = "application/x-fgrid-field";
import picklistDisplay from "./picklistDisplay.html";
import progressBarDisplay from "./progressBarDisplay.html";
import picklistEdit from "./picklistEdit.html";
import multiPicklistDisplay from "./multiPicklistDisplay.html";
import multiPicklistEdit from "./multiPicklistEdit.html";
import lookupDisplay from "./lookupDisplay.html";
import lookupEdit from "./lookupEdit.html";
import longTextDisplay from "./longTextDisplay.html";
import longTextEdit from "./longTextEdit.html";
import textDisplay from "./textDisplay.html";
import textEdit from "./textEdit.html";
import richTextDisplay from "./richTextDisplay.html";
import timeDisplay from "./timeDisplay.html";
import timeEdit from "./timeEdit.html";
import progressRingDisplay from "./progressRingDisplay.html";
import { LONG_TEXT_COMMIT_EVENT, openLongTextEditor } from "c/fgrid_longTextEditors";

/** Column types that edit in place (fgrid_longTextCell) rather than in the panel. */
const IN_PLACE_TYPES = ["fgridLongText", "fgridText"];

export default class FgridCustomDatatable extends LightningDatatable {
    /**
     * Where each header cell sits on screen, left to right, in viewport pixels.
     *
     * For the Grid Studio, which drops a dragged field between two columns and
     * has no other way to find them: the cells are in this component's shadow
     * root. Includes the datatable's own checkbox and row-number cells, which
     * come first, so a caller wanting its columns takes the LAST
     * `columns.length` entries.
     */
    /**
     * Lets the Grid Studio's preview drag a column by its header.
     *
     * Off everywhere else: the runtime grid never sets it. The header cells are
     * in this component's shadow root, so only this component can make them
     * draggable; after each render every field column's cell is marked with
     * the field it shows (`fgridField`, from buildColumns) and carries it on
     * drag, the same way a field dragged from the Studio's Fields tab does.
     * Columns with no field -- the row action -- stay put.
     */
    @api reorderableColumns = false;

    _draggableHeaders = new WeakSet();
    _listening = false;

    connectedCallback() {
        // BEFORE the datatable's own connectedCallback, which adds the listener
        // that opens the edit panel to this same root. Listeners on one node run
        // in the order they were added, so this one must be first to stop it.
        // A capture listener would not help: LWC ignores listener options on a
        // template, so `capture` is silently dropped.
        if (!this._listening) {
            this._listening = true;
            this.template.addEventListener("privateeditcell", this.handleEditCellRequest);
            this.template.addEventListener(LONG_TEXT_COMMIT_EVENT, this.handleLongTextCommit);
        }
        if (super.connectedCallback) {
            super.connectedCallback();
        }
    }

    /**
     * Long Text and plain Text edit in place instead of in the datatable's
     * panel (IN_PLACE_TYPES). The flip below is the reason for Long Text;
     * plain Text follows so every text field edits the same way.
     *
     * The panel is placed by the positioning library with autoFlip on, which
     * measures the room below from the cell's BOTTOM edge -- clipped part
     * included -- and flips to bottom-aligned when there is none. A tall cell
     * near the grid's bottom then opens its editor off screen (STATUS.md 2.3m).
     * Neither setting can be passed in, so the request is taken over here.
     *
     * `privateeditcell` is the datatable's internal event, sent for a pencil
     * click and for Enter alike (Enter clicks the pencil). If it is ever
     * renamed this stops matching and the panel simply comes back.
     */
    handleEditCellRequest = (event) => {
        const { rowKeyValue, colKeyValue } = event.detail || {};
        const column = (this.columns || []).find(
            (candidate) =>
                IN_PLACE_TYPES.includes(candidate?.type) &&
                typeof colKeyValue === "string" &&
                colKeyValue.startsWith(`${candidate.columnKey}-${candidate.type}-`)
        );
        const opened = column ? openLongTextEditor(rowKeyValue, column.columnKey) : false;
        if (opened) {
            event.stopImmediatePropagation();
            event.stopPropagation();
        }
    };

    /**
     * Reports an in-place edit as the datatable would, so the grid's existing
     * draft handling -- the Save/Cancel bar, auto-save -- treats it like any
     * other cell. Keyed by columnKey, as the datatable keys its own drafts;
     * the grid maps it back to the field (normalizeDraft).
     */
    handleLongTextCommit = (event) => {
        event.stopPropagation();
        const { rowKey, columnKey, value } = event.detail || {};
        this.dispatchEvent(
            new CustomEvent("cellchange", {
                detail: { draftValues: [{ [this.keyField]: rowKey, [columnKey]: value }] }
            })
        );
    };

    renderedCallback() {
        // The platform datatable has its own, which must still run; the Jest
        // stub of lightning/datatable has none.
        if (super.renderedCallback) {
            super.renderedCallback();
        }
        if (!this.reorderableColumns) {
            return;
        }
        const columns = Array.isArray(this.columns) ? this.columns : [];
        const cells = [...this.template.querySelectorAll("thead th")];
        // The datatable's own checkbox and row-number cells come first.
        cells.slice(cells.length - columns.length).forEach((cell, index) => {
            const field = columns[index]?.fgridField;
            if (!field) {
                cell.removeAttribute("draggable");
                return;
            }
            cell.setAttribute("draggable", "true");
            cell.dataset.fgridField = field;
            if (!this._draggableHeaders.has(cell)) {
                cell.addEventListener("dragstart", this.handleHeaderDragStart);
                this._draggableHeaders.add(cell);
            }
        });
    }

    handleHeaderDragStart = (event) => {
        const field = event.currentTarget?.dataset?.fgridField;
        if (!field || !event.dataTransfer) {
            return;
        }
        event.dataTransfer.setData(FIELD_DRAG_TYPE, field);
        event.dataTransfer.setData("text/plain", field);
        event.dataTransfer.effectAllowed = "copyMove";
    };

    @api
    getColumnEdges() {
        return [...this.template.querySelectorAll("thead th")].map((cell) => {
            const rect = cell.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
        });
    }

    static customTypes = {
        fgridPicklist: {
            template: picklistDisplay,
            editTemplate: picklistEdit,
            standardCellLayout: true,
            typeAttributes: ["options", "selected", "locked", "lockedText", "badge", "badgeClass"]
        },
        fgridMultiPicklist: {
            template: multiPicklistDisplay,
            editTemplate: multiPicklistEdit,
            standardCellLayout: true,
            typeAttributes: ["options", "selected", "locked", "lockedText", "badge", "badgeClass"]
        },
        fgridLookup: {
            template: lookupDisplay,
            editTemplate: lookupEdit,
            standardCellLayout: true,
            typeAttributes: ["label", "url", "link", "objectApiName"]
        },
        fgridText: {
            template: textDisplay,
            editTemplate: textEdit,
            standardCellLayout: true,
            typeAttributes: ["maxLength", "linkify", "rowKey", "columnKey", "label", "singleLine"]
        },
        fgridLongText: {
            template: longTextDisplay,
            editTemplate: longTextEdit,
            standardCellLayout: true,
            typeAttributes: ["maxLength", "linkify", "rowKey", "columnKey", "label"]
        },
        // No editTemplate: rich text stays read-only until there is a rich text
        // editor, and Apex already reports the field non-editable.
        fgridRichText: {
            template: richTextDisplay,
            standardCellLayout: true,
            typeAttributes: ["plainText", "disableLinkify"]
        },
        // No editTemplate: a gauge is a reading, not an input. The column
        // forces Editable off rather than showing a pencil that does nothing.
        fgridProgressBar: {
            template: progressBarDisplay,
            standardCellLayout: true,
            typeAttributes: ["progressValue", "progressLabel", "progressStyle", "barClass", "fillClass", "showValue"]
        },
        // One template, two types: the circle is the ring blueprint resized,
        // so they differ only in which of these buildColumns fills in.
        fgridProgressRing: {
            template: progressRingDisplay,
            standardCellLayout: true,
            typeAttributes: [
                "progressValue",
                "progressLabel",
                "ringPath",
                "ringClass",
                "iconPath",
                "iconClass",
                "iconLabel",
                "valueInside",
                "valueBeside",
                "caption",
                "headVisible",
                "headX",
                "headY",
                "fillStyle"
            ]
        },
        fgridProgressCircle: {
            template: progressRingDisplay,
            standardCellLayout: true,
            typeAttributes: [
                "progressValue",
                "progressLabel",
                "ringPath",
                "ringClass",
                "iconPath",
                "iconClass",
                "iconLabel",
                "valueInside",
                "valueBeside",
                "caption",
                "headVisible",
                "headX",
                "headY",
                "fillStyle"
            ]
        },
        fgridTime: {
            template: timeDisplay,
            editTemplate: timeEdit,
            standardCellLayout: true,
            typeAttributes: []
        }
    };
}
