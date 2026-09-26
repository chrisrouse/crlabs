/**
 * Fetches the picklist values for ONE record type and hands them upward.
 *
 * This component exists because a wire adapter takes one `recordTypeId` and a
 * component cannot loop wires. A grid whose rows span several record types needs one
 * fetch per record type, so the parent renders one of these per distinct id and
 * collects what comes back.
 *
 * Renders nothing. It is a wire in component form.
 *
 * The payload carries BOTH things the grid needs: which values belong to the record
 * type, and `validFor` plus `controllerValues` for dependent picklists. One call
 * answers both questions, which is why record-type filtering and dependency
 * narrowing were built together.
 *
 * @see c/fgrid_flowGrid picklistValuesByRecordType
 */
import { LightningElement, api, wire } from "lwc";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";

export default class FgridPicklistValues extends LightningElement {
    @api objectApiName;
    @api recordTypeId;

    @wire(getPicklistValuesByRecordType, { objectApiName: "$objectApiName", recordTypeId: "$recordTypeId" })
    handleValues({ data, error }) {
        if (!data && !error) {
            return;
        }
        // An error is reported as an absence rather than swallowed: the grid falls
        // back to the unfiltered describe values, which is the honest degradation when
        // a record type cannot be read.
        this.dispatchEvent(
            new CustomEvent("picklistvalues", {
                detail: {
                    recordTypeId: this.recordTypeId,
                    picklistFieldValues: data?.picklistFieldValues || null,
                    error: error || null
                }
            })
        );
    }
}
