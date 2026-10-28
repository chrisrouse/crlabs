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
import richTextDisplay from "./richTextDisplay.html";
import timeDisplay from "./timeDisplay.html";
import timeEdit from "./timeEdit.html";
import progressRingDisplay from "./progressRingDisplay.html";

/** In every trace line, so a stale bundle is visible in the console. */
const DIAGNOSTICS_BUILD = "BUILD_2026_09_28_D_editTraceEvent";

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

    /**
     * Traces what happens after an edit pencil is clicked (or Enter opens an
     * editor), for an inline editor that does not appear on a long cell.
     *
     * The datatable anchors its edit panel to the cell's top-left corner and
     * CLOSES it if its inner scroller moves more than 5px while it is open
     * (inlineEdit.js, private). Both are candidates, so this records the cell,
     * its content, the scroller, the page scroll, the panel's position and
     * visibility, every scroll and focus change, for two seconds, to the
     * browser console at debug (Verbose) level.
     *
     * TEMPORARY, always on: a URL switch cannot be set in a Flow Builder debug
     * run, and Lightning Web Security partitions localStorage by namespace, so
     * a flag set from the console is not seen. Remove before committing.
     */
    editDiagnostics = true;

    _draggableHeaders = new WeakSet();
    _trace = null;
    _traceListening = false;

    renderedCallback() {
        // The platform datatable has its own, which must still run; the Jest
        // stub of lightning/datatable has none.
        if (super.renderedCallback) {
            super.renderedCallback();
        }
        if (this.editDiagnostics && !this._traceListening) {
            this._traceListening = true;
            // Capture, because scroll and focus do not bubble, and so the trace
            // starts before the datatable's own click handler opens the panel.
            // The cell's own request to edit, sent for a pencil click and for
            // the keyboard alike. A click listener cannot see the pencil: it is
            // inside the cell's shadow root, so the target arrives retargeted to
            // the whole cell.
            this.template.addEventListener("privateeditcell", this.handleTraceEditCell, true);
            this.template.addEventListener("scroll", this.handleTraceScroll, true);
            this.template.addEventListener("focusin", this.handleTraceFocus, true);
            window.addEventListener("scroll", this.handleTracePageScroll);
            console.debug(`[fgrid edit ${DIAGNOSTICS_BUILD}] trace armed`);
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

    disconnectedCallback() {
        if (super.disconnectedCallback) {
            super.disconnectedCallback();
        }
        window.removeEventListener("scroll", this.handleTracePageScroll);
    }

    handleTraceEditCell = (event) => {
        const factory = event.target;
        this.startTrace(`edit requested (${event.detail?.colKeyValue})`, factory?.closest?.("td, th"), factory);
    };

    handleTraceScroll = (event) => {
        const target = event.target;
        this.traceEntry("scroll", {
            on: target?.className || target?.tagName,
            scrollTop: Math.round(target?.scrollTop ?? 0),
            scrollLeft: Math.round(target?.scrollLeft ?? 0)
        });
    };

    handleTracePageScroll = () => {
        this.traceEntry("page scroll", { scrollY: Math.round(window.scrollY) });
    };

    handleTraceFocus = (event) => {
        const target = event.target;
        this.traceEntry("focus", { on: `${target?.tagName} ${target?.className || ""}`.trim() });
    };

    startTrace(reason, cell, content) {
        this._trace = { start: Date.now(), cell, content };
        this.traceEntry(reason, this.traceSnapshot());
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        requestAnimationFrame(() => {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            requestAnimationFrame(() => this.traceEntry("after 2 frames", this.traceSnapshot()));
        });
        [100, 500, 1500].forEach((delay) => {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => this.traceEntry(`after ${delay}ms`, this.traceSnapshot()), delay);
        });
    }

    /** Records one entry, only within two seconds of a trace starting. */
    traceEntry(label, data) {
        const trace = this._trace;
        if (!trace || Date.now() - trace.start > 2000) {
            return;
        }
        console.debug(
            `[fgrid edit ${DIAGNOSTICS_BUILD}] +${Date.now() - trace.start}ms ${label}`,
            JSON.stringify(data)
        );
    }

    traceSnapshot() {
        const { cell, content } = this._trace;
        const box = (element) => {
            if (!element?.getBoundingClientRect) {
                return null;
            }
            const rect = element.getBoundingClientRect();
            return {
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
                left: Math.round(rect.left),
                height: Math.round(rect.height)
            };
        };
        const scrollerY = this.template.querySelector(".slds-scrollable_y");
        const panel = this.template.querySelector("lightning-primitive-datatable-iedit-panel");
        let section = null;
        let sectionError = null;
        try {
            section = panel?.getPositionedElement?.() || null;
        } catch (error) {
            sectionError = error?.message || String(error);
        }
        let editableValid = null;
        try {
            editableValid = panel?.isEditableValid ?? null;
        } catch (error) {
            editableValid = `error: ${error?.message || error}`;
        }
        return {
            viewport: { height: window.innerHeight, scrollY: Math.round(window.scrollY) },
            cell: cell ? { ...box(cell), connected: cell.isConnected, col: cell.dataset?.colKeyValue } : null,
            // The cell's content box, which holds the pencil.
            content: box(content),
            scrollerY: scrollerY
                ? {
                      ...box(scrollerY),
                      scrollTop: Math.round(scrollerY.scrollTop),
                      scrollHeight: scrollerY.scrollHeight,
                      clientHeight: scrollerY.clientHeight
                  }
                : null,
            panel: panel
                ? {
                      visible: panel.visible,
                      editableValid,
                      section: box(section),
                      style: section?.getAttribute?.("style") || null,
                      sectionError
                  }
                : "not rendered",
            active: this.template.activeElement?.tagName || null
        };
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
        fgridLongText: {
            template: longTextDisplay,
            editTemplate: longTextEdit,
            standardCellLayout: true,
            typeAttributes: ["maxLength", "linkify"]
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
