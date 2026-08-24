/**
 * Configures the Flow row action by discovery rather than by typing.
 *
 * Modelled on the platform's own Screen Action editor: pick an active flow, and
 * the editor reads that flow's variables and offers only the ones the grid can
 * populate. Free-text variable names were the previous approach, and a typo
 * produced a flow that launched and silently ignored its inputs.
 *
 * Both launchable kinds are offered. A screen flow opens in a modal; an
 * autolaunched flow runs server-side with no UI. Flows the platform fires itself
 * are simply absent, since nothing can invoke them from a component.
 *
 * Refresh re-reads the flow list and the selected flow's variables in place, so
 * editing a flow in another tab does not mean closing and reopening this editor.
 * It goes through refreshApex because the underlying Apex is cacheable and a
 * plain re-call would hand back the cached answer.
 *
 * Variables come from the flow's ACTIVE version, which is also the version the
 * row action launches. A saved-but-not-activated version therefore shows no
 * change on refresh, and the editor says so rather than looking broken.
 */
import { LightningElement, api, wire } from "lwc";
import { refreshApex } from "@salesforce/apex";
import getFlows from "@salesforce/apex/FlowGridController.getFlows";
import getFlowVariables from "@salesforce/apex/FlowGridController.getFlowVariables";

const NONE = "__none__";

export default class FgridFlowActionConfig extends LightningElement {
    @api label = "Flow to launch";
    @api help;
    @api required = false;

    @api flowApiName;
    @api recordVariable;
    @api idVariable;
    @api outputVariable;
    @api statusVariable;

    /** The grid's object, used to flag a mismatched record variable. */
    @api objectApiName;

    _flowsResult;
    _variablesResult;
    _flows = [];
    _variables = [];
    _flowsError;
    _variablesError;
    isRefreshing = false;

    @wire(getFlows)
    wiredFlows(result) {
        this._flowsResult = result;
        if (result.data) {
            this._flows = result.data;
            this._flowsError = undefined;
        } else if (result.error) {
            this._flows = [];
            this._flowsError = "Could not load the list of flows.";
        }
    }

    @wire(getFlowVariables, { flowApiName: "$flowApiName" })
    wiredVariables(result) {
        this._variablesResult = result;
        if (result.data) {
            this._variables = result.data;
            this._variablesError = undefined;
        } else if (result.error) {
            this._variables = [];
            this._variablesError = "Could not read the variables for this flow.";
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

    /**
     * Warns when the flow has a newer version that is not active.
     *
     * Without this, refreshing after editing a flow appears to do nothing.
     */
    get versionNote() {
        const flow = this.selectedFlow;
        if (!flow?.latestVersionId || !flow?.activeVersionId) {
            return null;
        }
        if (flow.latestVersionId === flow.activeVersionId) {
            return null;
        }
        return "This flow has a newer version that is not activated. The editor and the row action both use the active version — activate your changes to see them here.";
    }

    get hasVersionNote() {
        return Boolean(this.versionNote);
    }

    /* ------------------------------------------------------------------ *
     * Variable mapping
     * ------------------------------------------------------------------ */

    get recordOptions() {
        return this.withCurrent(
            this._variables
                .filter((v) => v.isInput && v.dataType === "SObject" && !v.isCollection)
                .map((v) => ({
                    label: v.objectType ? `${v.apiName} (${v.objectType})` : v.apiName,
                    value: v.apiName
                })),
            this.recordVariable
        );
    }

    get idOptions() {
        return this.withCurrent(
            this._variables
                .filter((v) => v.isInput && !v.isCollection && (v.dataType === "String" || v.dataType === "Id"))
                .map((v) => ({ label: `${v.apiName} (${v.dataType})`, value: v.apiName })),
            this.idVariable
        );
    }

    get outputOptions() {
        return this.withCurrent(
            this._variables
                .filter((v) => v.isOutput && v.dataType === "SObject" && !v.isCollection)
                .map((v) => ({
                    label: v.objectType ? `${v.apiName} (${v.objectType})` : v.apiName,
                    value: v.apiName
                })),
            this.outputVariable
        );
    }

    /**
     * Any non-collection output. Not restricted to SObject, because a status can
     * be a Boolean, a picklist, or free text.
     */
    get statusOptions() {
        return this.withCurrent(
            this._variables
                .filter((v) => v.isOutput && !v.isCollection)
                .map((v) => ({ label: `${v.apiName} (${v.dataType})`, value: v.apiName })),
            this.statusVariable
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

    get statusValue() {
        return this.statusVariable || NONE;
    }

    /**
     * Names any mapping pointing at a variable the flow no longer declares.
     *
     * Flagged rather than cleared: silently discarding configuration is worse
     * than showing it, and the stale value stays selectable so it can be cleared
     * deliberately — the way Flow surfaces a removed subflow variable.
     */
    get staleMappings() {
        if (!this._variables.length) {
            return [];
        }
        const declared = new Set(this._variables.map((v) => v.apiName));
        return [
            { label: "the row's record", name: this.recordVariable },
            { label: "the row's Id", name: this.idVariable },
            { label: "the edited record", name: this.outputVariable },
            { label: "the status", name: this.statusVariable }
        ]
            .filter((entry) => entry.name && !declared.has(entry.name))
            .map((entry) => ({
                key: `${entry.name}:${entry.label}`,
                message: `${entry.name}, mapped to ${entry.label}, is no longer a variable in this flow. Set it to "not passed" to clear it.`
            }));
    }

    get hasStaleMappings() {
        return this.staleMappings.length > 0;
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

    get statusHint() {
        if (!this.statusVariable) {
            return null;
        }
        const chosen = this._variables.find((v) => v.apiName === this.statusVariable);
        return chosen?.dataType === "Boolean"
            ? `${this.statusVariable} is a Boolean, so the value it returns decides whether the row is recorded as actioned.`
            : `${this.statusVariable} is passed through to Last Action Status. Only a Boolean can decide whether the row is recorded.`;
    }

    get hasStatusHint() {
        return Boolean(this.statusHint);
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
        // The previous mappings referred to a different flow's variables.
        this.publish("rowActionFlowRecordVariable", null);
        this.publish("rowActionFlowIdVariable", null);
        this.publish("rowActionFlowOutputVariable", null);
        this.publish("rowActionFlowStatusVariable", null);
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

    handleStatusChange(event) {
        this.publish("rowActionFlowStatusVariable", this.normalize(event.detail.value));
    }

    /** Re-reads the flow list and the selected flow's variables from the server. */
    async handleRefresh() {
        this.isRefreshing = true;
        try {
            await Promise.all(
                [this._flowsResult, this._variablesResult].filter(Boolean).map((result) => refreshApex(result))
            );
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Keeps a saved value selectable even when the flow no longer declares it, so
     * the combobox does not render blank and the mapping can be cleared.
     */
    withCurrent(options, current) {
        const base = [{ label: "— not passed —", value: NONE }, ...options];
        if (current && !options.some((option) => option.value === current)) {
            base.push({ label: `${current} (no longer in this flow)`, value: current });
        }
        return base;
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
