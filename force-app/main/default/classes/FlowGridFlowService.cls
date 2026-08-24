/**
 * Discovers active screen flows and their variables, so the property editor can
 * offer pickers instead of asking an admin to type variable names.
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
    /** Screen flows only; `Flow` is the ProcessType for a screen flow. */
    private static final String SCREEN_FLOW_PROCESS_TYPE = 'Flow';

    /** A launchable flow. */
    public class FlowSummary {
        @AuraEnabled
        public String apiName;
        @AuraEnabled
        public String label;

        private FlowSummary(String apiName, String label) {
            this.apiName = apiName;
            this.label = label;
        }
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
     * Lists active screen flows the running user can see, ordered by label.
     *
     * @return every active flow with ProcessType `Flow`
     *
     * @example
     * List<FlowSummary> flows = FlowGridFlowService.listScreenFlows();
     */
    public static List<FlowSummary> listScreenFlows() {
        List<FlowSummary> flows = new List<FlowSummary>();
        for (FlowDefinitionView definition : [
            SELECT ApiName, Label
            FROM FlowDefinitionView
            WHERE IsActive = TRUE AND ProcessType = :SCREEN_FLOW_PROCESS_TYPE
            WITH USER_MODE
            ORDER BY Label
            LIMIT 2000
        ]) {
            flows.add(new FlowSummary(definition.ApiName, definition.Label));
        }
        return flows;
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
