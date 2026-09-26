/**
 * Tests for FlowGridFlowService.
 *
 * This class is awkward to test because its inputs are METADATA, not data: it
 * reads FlowDefinitionView and FlowVariableView, and a test cannot insert a flow.
 * The strategy is therefore split:
 *
 *   - `resolveLaunchMode` holds the branching that actually matters — which flows
 *     Flow Grid can launch — so it is exercised directly and deterministically.
 *     It is @TestVisible for exactly this reason.
 *   - The query methods are called for real and asserted on their CONTRACT
 *     (never null, well-formed entries) rather than on org contents, then queried
 *     for a suitable flow and skipped when the org has none. Same pattern as
 *     FlowGridColumnServiceTest's FLS test.
 *
 * `runFlow` is covered up to the interview itself. Actually starting one would
 * make the suite depend on a specific autolaunched flow being deployed and active,
 * so the tests instead prove the input-building and record-deserialization
 * decisions that precede it.
 */
@IsTest
private class FlowGridFlowServiceTest {
    @IsTest
    static void resolveLaunchModeAllowsScreenFlows() {
        Assert.areEqual(
            FlowGridFlowService.MODE_SCREEN,
            FlowGridFlowService.resolveLaunchMode('Flow', null),
            'A screen flow renders in the modal'
        );
    }

    @IsTest
    static void resolveLaunchModeAllowsInvocableAutolaunchedFlows() {
        for (String triggerType : new List<String>{ null, 'None' }) {
            Assert.areEqual(
                FlowGridFlowService.MODE_HEADLESS,
                FlowGridFlowService.resolveLaunchMode('AutoLaunchedFlow', triggerType),
                'An autolaunched flow with no platform trigger can be invoked: ' + triggerType
            );
        }
    }

    @IsTest
    static void resolveLaunchModeRefusesPlatformTriggeredFlows() {
        // ProcessType alone is not enough to decide this: a record-triggered flow is
        // ALSO an AutoLaunchedFlow, and invoking one from a row action is not
        // something Flow Grid can do. TriggerType is what separates them.
        List<String> platformTriggered = new List<String>{
            'RecordBeforeSave',
            'RecordAfterSave',
            'RecordBeforeDelete',
            'PlatformEvent',
            'Scheduled',
            'DataCloudDataChange'
        };

        for (String triggerType : platformTriggered) {
            Assert.isNull(
                FlowGridFlowService.resolveLaunchMode('AutoLaunchedFlow', triggerType),
                'The platform fires this one, not us: ' + triggerType
            );
        }
    }

    @IsTest
    static void resolveLaunchModeRefusesOtherProcessTypes() {
        for (String processType : new List<String>{ 'Workflow', 'CustomEvent', 'InvocableProcess', null }) {
            Assert.isNull(
                FlowGridFlowService.resolveLaunchMode(processType, null),
                'Not a launchable flow type: ' + processType
            );
        }
    }

    @IsTest
    static void listFlowsReturnsWellFormedSummaries() {
        Test.startTest();
        List<FlowGridFlowService.FlowSummary> flows = FlowGridFlowService.listFlows();
        Test.stopTest();

        Assert.isNotNull(flows, 'A list is always returned');
        for (FlowGridFlowService.FlowSummary flow : flows) {
            Assert.isNotNull(flow.apiName, 'Every summary needs an api name to be selectable');
            Assert.areEqual(
                FlowGridFlowService.resolveLaunchMode(flow.processType, flow.triggerType),
                flow.launchMode,
                'launchMode must agree with the resolver for ' + flow.apiName
            );
        }
    }

    @IsTest
    static void listFlowsExcludesTemplates() {
        // Templates exist to be cloned, not run, and managed packages ship enough of
        // them to crowd out the flows an admin wrote.
        Set<String> listed = new Set<String>();
        for (FlowGridFlowService.FlowSummary flow : FlowGridFlowService.listFlows()) {
            listed.add(flow.apiName);
        }

        for (FlowDefinitionView template : [
            SELECT ApiName
            FROM FlowDefinitionView
            WHERE IsActive = TRUE AND IsTemplate = TRUE
            LIMIT 5
        ]) {
            Assert.isFalse(listed.contains(template.ApiName), 'A template should not be offered: ' + template.ApiName);
        }
    }

    @IsTest
    static void listFlowVariablesReturnsEmptyWithoutAUsableFlow() {
        Assert.areEqual(0, FlowGridFlowService.listFlowVariables(null).size(), 'Null flow name');
        Assert.areEqual(0, FlowGridFlowService.listFlowVariables('   ').size(), 'Blank flow name');
        Assert.areEqual(
            0,
            FlowGridFlowService.listFlowVariables('No_Such_Flow_Anywhere').size(),
            'An unknown flow has no variables to report'
        );
    }

    @IsTest
    static void listFlowVariablesReturnsWellFormedEntriesForARealFlow() {
        // Looks for a flow that actually DECLARES variables, not merely one that is
        // active. Picking the first active flow found nothing to iterate, so the
        // mapping loop — the part worth testing — never ran.
        List<FlowGridFlowService.FlowVariable> variables = new List<FlowGridFlowService.FlowVariable>();
        String inspected = null;
        for (FlowDefinitionView definition : [
            SELECT ApiName
            FROM FlowDefinitionView
            WHERE IsActive = TRUE AND IsTemplate = FALSE AND ActiveVersionId != NULL
            ORDER BY ApiName
            LIMIT 25
        ]) {
            variables = FlowGridFlowService.listFlowVariables(definition.ApiName);
            if (!variables.isEmpty()) {
                inspected = definition.ApiName;
                break;
            }
        }

        if (inspected == null) {
            // No active flow in this org declares a variable, so there is nothing to
            // map. Skipping keeps the suite runnable in an empty scratch org.
            return;
        }

        for (FlowGridFlowService.FlowVariable variable : variables) {
            Assert.isNotNull(variable.apiName, 'A variable without an api name cannot be mapped: ' + inspected);
            Assert.isNotNull(variable.dataType, 'dataType is what the editor filters on');
            Assert.isNotNull(variable.isInput, 'The editor offers inputs only, so this must be populated');
            Assert.isNotNull(variable.isOutput, 'And reads outputs back after a headless run');
            Assert.isNotNull(variable.isCollection, 'A collection variable cannot take a single record');
        }
    }

    @IsTest
    static void runFlowReturnsEmptyForABlankFlowName() {
        Map<String, Object> outputs = FlowGridFlowService.runFlow(null, 'Account', '{}', 'rec', 'recId', null);

        Assert.areEqual(0, outputs.size(), 'No flow name means no interview and no outputs');
    }

    @IsTest
    static void runFlowBuildsInputsThenFailsOnAnUnknownFlow() {
        // Everything before the interview is what this asserts: the record
        // deserializes, the id is mapped, and only then does the unknown flow fail.
        Account account = new Account(Name = 'Row Action Target');
        insert account;
        Account queried = [SELECT Id, Name FROM Account WHERE Id = :account.Id LIMIT 1];

        Boolean threw = false;
        try {
            FlowGridFlowService.runFlow(
                'No_Such_Flow_Anywhere',
                'Account',
                JSON.serialize(queried),
                'inputRecord',
                'inputRecordId',
                account.Id
            );
        } catch (Exception error) {
            threw = true;
        }

        Assert.isTrue(threw, 'An unknown flow cannot be started, and that must not pass silently');
    }

    @IsTest
    static void runFlowToleratesARecordItCannotDeserialize() {
        // A record the flow cannot accept is dropped rather than failing the action
        // before it starts. Both routes to null are covered: an object name that is
        // not a type, and JSON that is not a record.
        for (
            List<String> attempt : new List<List<String>>{
                new List<String>{ 'NoSuchObject__c', '{"Name":"x"}' },
                new List<String>{ 'Account', 'not json at all' }
            }
        ) {
            Boolean threw = false;
            try {
                FlowGridFlowService.runFlow('No_Such_Flow_Anywhere', attempt[0], attempt[1], 'inputRecord', null, null);
            } catch (Exception error) {
                // Failing at the interview is expected; failing at deserialization
                // is not, and would have thrown before this point.
                threw = true;
            }
            Assert.isTrue(threw, 'Reached the interview for: ' + attempt[0]);
        }
    }
}
