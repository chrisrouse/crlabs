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
import picklistDisplay from "./picklistDisplay.html";
import progressBarDisplay from "./progressBarDisplay.html";
import picklistEdit from "./picklistEdit.html";
import multiPicklistDisplay from "./multiPicklistDisplay.html";
import multiPicklistEdit from "./multiPicklistEdit.html";
import lookupDisplay from "./lookupDisplay.html";
import lookupEdit from "./lookupEdit.html";
import longTextDisplay from "./longTextDisplay.html";
import longTextEdit from "./longTextEdit.html";
import timeDisplay from "./timeDisplay.html";
import timeEdit from "./timeEdit.html";
import progressRingDisplay from "./progressRingDisplay.html";

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
            typeAttributes: ["maxLength"]
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
