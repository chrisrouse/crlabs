/**
 * Configures the Flow row action by discovery rather than by typing.
 *
 * Modelled on the platform's own Screen Action editor: pick an active screen
 * flow, and the editor reads that flow's variables and offers only the ones the
 * grid can actually populate. Free-text variable names were the previous
 * approach here, and a typo produced a flow that launched and silently ignored
 * its inputs.
 *
 * Filtering is deliberately narrow:
 *   record variable  - input, SObject, not a collection, and matching the grid's
 *                      object where the flow declares one
 *   Id variable      - input, String or Id, not a collection
 *   output variable  - output, SObject, not a collection
 *
 * A record variable typed to a different object is still offered but flagged,
 * because that combination fails at runtime rather than at save time.
 */
import { LightningElement, api, wire } from "lwc";
import getScreenFlows from "@salesforce/apex/FlowGridController.getScreenFlows";
import getFlowVariables from "@salesforce/apex/FlowGridController.getFlowVariables";

const NONE = "__none__";

export default class FgridFlowActionConfig extends LightningElement {
    @api flowApiName;
    @api recordVariable;
    @api idVariable;
    @api outputVariable;

    /** The grid's object, used to flag a mismatched record variable. */
    @api objectApiName;

    _flows = [];
    _variables = [];
    _flowsError;
    _variablesError;

    @wire(getScreenFlows)
    wiredFlows({ data, error }) {
        if (data) {
            this._flows = data;
            this._flowsError = undefined;
        } else if (error) {
            this._flows = [];
            this._flowsError = "Could not load the list of screen flows.";
        }
    }

    @wire(getFlowVariables, { flowApiName: "$flowApiName" })
    wiredVariables({ data, error }) {
        if (data) {
            this._variables = data;
            this._variablesError = undefined;
        } else if (error) {
            this._variables = [];
            this._variablesError = "Could not read the variables for this flow.";
        }
    }

    /* ------------------------------------------------------------------ *
     * Options
     * ------------------------------------------------------------------ */

    get flowOptions() {
        return this._flows.map((flow) => ({
            label: flow.label ? `${flow.label} (${flow.apiName})` : flow.apiName,
            value: flow.apiName
        }));
    }

    get hasFlows() {
        return this._flows.length > 0;
    }

    get hasFlowSelected() {
        return Boolean(this.flowApiName);
    }

    /** Input SObject variables, non-collection. */
    get recordOptions() {
        return this.optional(
            this._variables
                .filter((v) => v.isInput && v.dataType === "SObject" && !v.isCollection)
                .map((v) => ({
                    label: v.objectType ? `${v.apiName} (${v.objectType})` : v.apiName,
                    value: v.apiName
                }))
        );
    }

    /** Input text variables that can carry a record Id. */
    get idOptions() {
        return this.optional(
            this._variables
                .filter((v) => v.isInput && !v.isCollection && (v.dataType === "String" || v.dataType === "Id"))
                .map((v) => ({ label: `${v.apiName} (${v.dataType})`, value: v.apiName }))
        );
    }

    /** Output SObject variables the grid can read the edited record from. */
    get outputOptions() {
        return this.optional(
            this._variables
                .filter((v) => v.isOutput && v.dataType === "SObject" && !v.isCollection)
                .map((v) => ({
                    label: v.objectType ? `${v.apiName} (${v.objectType})` : v.apiName,
                    value: v.apiName
                }))
        );
    }

    get recordValue() {
        return this.recordVariable || NONE;
    }

    get idValue() {
        return this.idVariable || NONE;
    }

    get outputValue() {
        return this.outputVariable || NONE;
    }

    /* ------------------------------------------------------------------ *
     * Diagnostics
     * ------------------------------------------------------------------ */

    get errorMessage() {
        return this._flowsError || this._variablesError;
    }

    get hasError() {
        return Boolean(this.errorMessage);
    }

    /** Warns when the chosen record variable is typed to a different object. */
    get objectMismatch() {
        if (!this.recordVariable || !this.objectApiName) {
            return null;
        }
        const chosen = this._variables.find((v) => v.apiName === this.recordVariable);
        if (!chosen?.objectType || chosen.objectType === this.objectApiName) {
            return null;
        }
        return `${this.recordVariable} expects a ${chosen.objectType} record, but this grid shows ${this.objectApiName}. The flow will fail at runtime.`;
    }

    get hasObjectMismatch() {
        return Boolean(this.objectMismatch);
    }

    /** Warns when the flow takes nothing the grid can populate. */
    get takesNoInput() {
        return (
            this.hasFlowSelected &&
            this._variables.length > 0 &&
            this.recordOptions.length === 1 &&
            this.idOptions.length === 1
        );
    }

    /** Warns when the flow returns nothing, so no edit can come back. */
    get returnsNothing() {
        return this.hasFlowSelected && this._variables.length > 0 && this.outputOptions.length === 1;
    }

    get variablesSummary() {
        if (!this.hasFlowSelected) {
            return null;
        }
        if (!this._variables.length) {
            return "This flow declares no variables, so nothing can be passed in or read back.";
        }
        const inputs = this._variables.filter((v) => v.isInput).length;
        const outputs = this._variables.filter((v) => v.isOutput).length;
        return `${inputs} input and ${outputs} output ${outputs === 1 ? "variable" : "variables"} available.`;
    }

    get hasVariablesSummary() {
        return Boolean(this.variablesSummary);
    }

    /* ------------------------------------------------------------------ *
     * Handlers
     * ------------------------------------------------------------------ */

    handleFlowChange(event) {
        const value = event.detail.value;
        this.publish("rowActionFlowApiName", value || null);
        // The previous mappings referred to a different flow's variables.
        this.publish("rowActionFlowRecordVariable", null);
        this.publish("rowActionFlowIdVariable", null);
        this.publish("rowActionFlowOutputVariable", null);
    }

    handleRecordChange(event) {
        this.publish("rowActionFlowRecordVariable", this.normalize(event.detail.value));
    }

    handleIdChange(event) {
        this.publish("rowActionFlowIdVariable", this.normalize(event.detail.value));
    }

    handleOutputChange(event) {
        this.publish("rowActionFlowOutputVariable", this.normalize(event.detail.value));
    }

    /** Prepends a "not passed" choice so a mapping can be cleared. */
    optional(options) {
        return [{ label: "— not passed —", value: NONE }, ...options];
    }

    normalize(value) {
        return !value || value === NONE ? null : value;
    }

    publish(property, value) {
        this.dispatchEvent(
            new CustomEvent("propertychange", {
                detail: { property, value, dataType: "String" }
            })
        );
    }
}
