/**
 * Discovers active flows and their variables so the property editor can offer
 * pickers instead of asking an admin to type variable names, and runs the
 * autolaunched ones on the grid's behalf.
 *
 * This is what makes the Flow row action behave like the platform's own Screen
 * Action editor: choose a flow, then map the grid's record and Id onto the
 * variables that flow actually declares.
 *
 * Everything comes from `FlowDefinitionView` and `FlowVariableView`, which are
 * ordinary SOQL views rather than the Tooling API, so no callout and no elevated
 * access is involved. Both queries run in user mode.
 *
 * @see FlowGridController
 */
public with sharing class FlowGridFlowService {
    /** ProcessType of a screen flow. */
    private static final String SCREEN_FLOW = 'Flow';

    /** ProcessType shared by autolaunched, record-triggered and scheduled flows. */
    private static final String AUTOLAUNCHED_FLOW = 'AutoLaunchedFlow';

    /** Launch modes Flow Grid can actually perform. */
    public static final String MODE_SCREEN = 'Screen';
    public static final String MODE_HEADLESS = 'Headless';

    /**
     * TriggerType values meaning the platform fires the flow, not us. An
     * AutoLaunchedFlow with any of these cannot be invoked from a component.
     */
    private static final Set<String> PLATFORM_TRIGGERED = new Set<String>{
        'RecordBeforeSave',
        'RecordAfterSave',
        'RecordBeforeDelete',
        'PlatformEvent',
        'Scheduled',
        'DataCloudDataChange'
    };

    /** An active flow, with whether and how Flow Grid can launch it. */
    public class FlowSummary {
        @AuraEnabled
        public String apiName;
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String processType;
        @AuraEnabled
        public String triggerType;
        /** `Screen`, `Headless`, or null when it cannot be launched. */
        @AuraEnabled
        public String launchMode;
        @AuraEnabled
        public String activeVersionId;
        @AuraEnabled
        public String latestVersionId;

        private FlowSummary(FlowDefinitionView definition) {
            this.apiName = definition.ApiName;
            this.label = definition.Label;
            this.processType = definition.ProcessType;
            this.triggerType = definition.TriggerType;
            this.launchMode = resolveLaunchMode(definition.ProcessType, definition.TriggerType);
            this.activeVersionId = definition.ActiveVersionId;
            this.latestVersionId = definition.LatestVersionId;
        }
    }

    /**
     * Decides how — or whether — a flow can be launched from a row action.
     *
     * ProcessType alone is not enough: a record-triggered flow is also an
     * AutoLaunchedFlow, and TriggerType is what separates one the platform fires
     * from one we can invoke ourselves.
     */
    private static String resolveLaunchMode(String processType, String triggerType) {
        if (processType == SCREEN_FLOW) {
            return MODE_SCREEN;
        }
        if (processType == AUTOLAUNCHED_FLOW && !PLATFORM_TRIGGERED.contains(triggerType)) {
            return MODE_HEADLESS;
        }
        return null;
    }

    /** One variable declared by a flow, with enough shape to filter on. */
    public class FlowVariable {
        @AuraEnabled
        public String apiName;
        @AuraEnabled
        public String dataType;
        @AuraEnabled
        public String objectType;
        @AuraEnabled
        public Boolean isInput;
        @AuraEnabled
        public Boolean isOutput;
        @AuraEnabled
        public Boolean isCollection;
    }

    /**
     * Lists every active flow the running user can see, each tagged with its
     * launch mode.
     *
     * Non-launchable flows are returned too, with a null launchMode, so the
     * editor can say how many were excluded and why rather than silently
     * shortening the list.
     *
     * @return all active flows, ordered by label
     *
     * @example
     * List<FlowSummary> flows = FlowGridFlowService.listFlows();
     */
    public static List<FlowSummary> listFlows() {
        List<FlowSummary> flows = new List<FlowSummary>();
        for (FlowDefinitionView definition : [
            SELECT ApiName, Label, ProcessType, TriggerType, ActiveVersionId, LatestVersionId
            FROM FlowDefinitionView
            WHERE IsActive = TRUE
            WITH USER_MODE
            ORDER BY Label
            LIMIT 2000
        ]) {
            flows.add(new FlowSummary(definition));
        }
        return flows;
    }

    /**
     * Runs an autolaunched flow and returns its output variables.
     *
     * Autolaunched flows have no screens, so `lightning-flow` is the wrong tool:
     * there is nothing to render. They are invoked here instead and the grid
     * simply folds the outputs back in, with no modal at all.
     *
     * The record arrives as JSON with its object API name rather than as a typed
     * parameter, because an SObject sent from LWC deserializes to a Map and Flow
     * would reject it for an SObject variable.
     *
     * NOTE ON CONTEXT: an autolaunched flow runs in whatever context its own
     * definition declares — by default system context, ignoring the running
     * user's object and field permissions. That is the flow's configuration, not
     * something this method can constrain, and it is worth knowing before wiring
     * one to a row action.
     *
     * @param flowApiName API name of the autolaunched flow
     * @param objectApiName object type of the record being passed, if any
     * @param recordJson the clicked record, serialized
     * @param recordVariable flow input variable receiving the record
     * @param idVariable flow input variable receiving the record Id
     * @param recordId the clicked record's Id
     * @return every output variable the flow declares, keyed by API name
     */
    public static Map<String, Object> runFlow(
        String flowApiName,
        String objectApiName,
        String recordJson,
        String recordVariable,
        String idVariable,
        String recordId
    ) {
        Map<String, Object> outputs = new Map<String, Object>();
        if (String.isBlank(flowApiName)) {
            return outputs;
        }

        Map<String, Object> inputs = new Map<String, Object>();
        if (String.isNotBlank(recordVariable) && String.isNotBlank(recordJson) && String.isNotBlank(objectApiName)) {
            SObject record = deserializeRecord(objectApiName, recordJson);
            if (record != null) {
                inputs.put(recordVariable, record);
            }
        }
        if (String.isNotBlank(idVariable) && String.isNotBlank(recordId)) {
            inputs.put(idVariable, recordId);
        }

        Flow.Interview interview = Flow.Interview.createInterview(flowApiName, inputs);
        interview.start();

        // Read back whatever the flow declares as output, so the caller does not
        // have to know the names in advance.
        for (FlowVariable variable : listFlowVariables(flowApiName)) {
            if (variable.isOutput == true) {
                outputs.put(variable.apiName, interview.getVariableValue(variable.apiName));
            }
        }
        return outputs;
    }

    /** Rebuilds a typed SObject from the JSON the component sent. */
    private static SObject deserializeRecord(String objectApiName, String recordJson) {
        Type sobjectType = Type.forName(objectApiName.trim());
        if (sobjectType == null) {
            return null;
        }
        try {
            return (SObject) JSON.deserialize(recordJson, sobjectType);
        } catch (Exception error) {
            // A record the flow cannot accept is better than a broken interview,
            // but not worth failing the whole action over.
            return null;
        }
    }

    /**
     * Lists the variables declared by a flow's active version.
     *
     * @param flowApiName API name of the flow to inspect
     * @return its variables, or an empty list when the flow is unknown, inactive,
     *         or declares none
     *
     * @example
     * List<FlowVariable> vars =
     *     FlowGridFlowService.listFlowVariables('FlowGrid_Edit_Account');
     */
    public static List<FlowVariable> listFlowVariables(String flowApiName) {
        List<FlowVariable> variables = new List<FlowVariable>();
        if (String.isBlank(flowApiName)) {
            return variables;
        }

        List<FlowDefinitionView> definitions = [
            SELECT ActiveVersionId
            FROM FlowDefinitionView
            WHERE ApiName = :flowApiName.trim() AND IsActive = TRUE
            WITH USER_MODE
            LIMIT 1
        ];
        if (definitions.isEmpty() || String.isBlank(definitions[0].ActiveVersionId)) {
            return variables;
        }

        // FlowVariableView requires a filter on the version, which is why the
        // definition is resolved first rather than queried in one hop.
        for (FlowVariableView view : [
            SELECT ApiName, DataType, ObjectType, IsInput, IsOutput, IsCollection
            FROM FlowVariableView
            WHERE FlowVersionViewId = :definitions[0].ActiveVersionId
            WITH USER_MODE
            ORDER BY ApiName
        ]) {
            FlowVariable variable = new FlowVariable();
            variable.apiName = view.ApiName;
            variable.dataType = view.DataType;
            variable.objectType = view.ObjectType;
            variable.isInput = view.IsInput;
            variable.isOutput = view.IsOutput;
            variable.isCollection = view.IsCollection;
            variables.add(variable);
        }
        return variables;
    }
}
