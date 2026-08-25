/**
 * Configures the Flow row action: which flow to launch, and what to call the
 * variables it should receive.
 *
 * The flow itself is picked from a list of active, non-template, launchable
 * flows. The variable names are typed.
 *
 * Variable names were briefly discovered from the flow and offered as dropdowns.
 * That read well but accumulated scaffolding around the mechanism rather than the
 * task — a refresh button, version-mismatch warnings, stale-mapping flags — so it
 * was cut back to plain text. The grid produces exactly two values a flow can
 * receive, the row's record and the row's Id, and naming the target variable is
 * all the mapping this needs.
 *
 * Discovery still runs at RUNTIME, in `c/fgrid_flowGrid`, to drop names the flow
 * does not declare. That is not for convenience: the mapping properties carry
 * platform defaults that cannot be removed, so without it a flow declaring
 * neither variable is handed both and fails.
 */
import { LightningElement, api, wire } from "lwc";
import getFlows from "@salesforce/apex/FlowGridController.getFlows";

export default class FgridFlowActionConfig extends LightningElement {
    @api label = "Flow to launch";
    @api help;
    @api required = false;

    @api flowApiName;
    @api recordVariable;
    @api idVariable;
    @api outputVariable;
    @api statusVariable;

    _flows = [];
    _flowsError;

    @wire(getFlows)
    wiredFlows({ data, error }) {
        if (data) {
            this._flows = data;
            this._flowsError = undefined;
        } else if (error) {
            this._flows = [];
            this._flowsError = "Could not load the list of flows.";
        }
    }

    /* ------------------------------------------------------------------ *
     * Flow selection
     * ------------------------------------------------------------------ */

    get flowOptions() {
        return this._flows
            .filter((flow) => flow.launchMode)
            .map((flow) => ({ label: flow.label || flow.apiName, value: flow.apiName }));
    }

    get hasFlows() {
        return this.flowOptions.length > 0;
    }

    get selectedFlow() {
        return this._flows.find((flow) => flow.apiName === this.flowApiName) || null;
    }

    get hasFlowSelected() {
        return Boolean(this.flowApiName);
    }

    get isHeadlessFlow() {
        return this.selectedFlow?.launchMode === "Headless";
    }

    get launchModeNote() {
        if (!this.selectedFlow?.launchMode) {
            return null;
        }
        return this.isHeadlessFlow
            ? "Autolaunched: runs immediately with no screen. Its outputs are read back into the grid."
            : "Screen flow: opens in a modal for the user to complete.";
    }

    get hasLaunchModeNote() {
        return Boolean(this.launchModeNote);
    }

    get errorMessage() {
        return this._flowsError;
    }

    get hasError() {
        return Boolean(this._flowsError);
    }

    /* ------------------------------------------------------------------ *
     * Handlers
     * ------------------------------------------------------------------ */

    handleFlowChange(event) {
        const value = event.detail.value;
        const chosen = this._flows.find((flow) => flow.apiName === value);
        this.publish("rowActionFlowApiName", value || null);
        // Stored so the runtime picks its launch path without another lookup.
        this.publish("rowActionFlowLaunchMode", chosen?.launchMode || null);
        // The previous names referred to a different flow's variables.
        this.publish("rowActionFlowRecordVariable", null);
        this.publish("rowActionFlowIdVariable", null);
        this.publish("rowActionFlowOutputVariable", null);
        this.publish("rowActionFlowStatusVariable", null);
    }

    handleVariableChange(event) {
        this.publish(event.target.dataset.property, this.normalize(event.target.value));
    }

    normalize(value) {
        const trimmed = String(value ?? "").trim();
        return trimmed === "" ? null : trimmed;
    }

    publish(property, value) {
        this.dispatchEvent(
            new CustomEvent("propertychange", {
                detail: { property, value, dataType: "String" }
            })
        );
    }
}
