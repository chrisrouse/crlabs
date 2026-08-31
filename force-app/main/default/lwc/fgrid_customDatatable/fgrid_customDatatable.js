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
import LightningDatatable from "lightning/datatable";
import picklistDisplay from "./picklistDisplay.html";
import picklistEdit from "./picklistEdit.html";
import multiPicklistDisplay from "./multiPicklistDisplay.html";
import multiPicklistEdit from "./multiPicklistEdit.html";
import lookupDisplay from "./lookupDisplay.html";
import lookupEdit from "./lookupEdit.html";
import longTextDisplay from "./longTextDisplay.html";
import longTextEdit from "./longTextEdit.html";
import timeDisplay from "./timeDisplay.html";
import timeEdit from "./timeEdit.html";

export default class FgridCustomDatatable extends LightningDatatable {
    static customTypes = {
        fgridPicklist: {
            template: picklistDisplay,
            editTemplate: picklistEdit,
            standardCellLayout: true,
            typeAttributes: ["options", "selected"]
        },
        fgridMultiPicklist: {
            template: multiPicklistDisplay,
            editTemplate: multiPicklistEdit,
            standardCellLayout: true,
            typeAttributes: ["options", "selected"]
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
        fgridTime: {
            template: timeDisplay,
            editTemplate: timeEdit,
            standardCellLayout: true,
            typeAttributes: []
        }
    };
}
