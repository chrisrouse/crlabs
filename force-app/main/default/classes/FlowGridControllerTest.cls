/**
 * Tests for FlowGridController.
 *
 * The controller is a thin delegate, so these cover only its own contract:
 * input validation, the shape of the returned bundle, and error translation.
 * Describe behaviour is covered by FlowGridColumnServiceTest.
 */
@IsTest
private class FlowGridControllerTest {
    @IsTest
    static void getGridMetadataReturnsObjectAndColumnsTogether() {
        Test.startTest();
        FlowGridController.GridMetadata metadata = FlowGridController.getGridMetadata(
            'Account',
            new List<String>{ 'Name', 'AnnualRevenue' }
        );
        Test.stopTest();

        Assert.isNotNull(metadata.objectInfo, 'Object info should be present');
        Assert.isTrue(metadata.objectInfo.isAccessible, 'Account should be accessible');
        Assert.areEqual(2, metadata.columns.size(), 'One column per requested path');
        Assert.areEqual('Name', metadata.columns[0].fieldPath, 'Request order is preserved');
    }

    @IsTest
    static void getGridMetadataTreatsBlankObjectNameAsNotReady() {
        // A wired call fires before its reactive parameters resolve; that must
        // not surface as an error to the user.
        for (String candidate : new List<String>{ null, '', '   ' }) {
            FlowGridController.GridMetadata metadata = FlowGridController.getGridMetadata(
                candidate,
                new List<String>{ 'Name' }
            );

            Assert.isNotNull(metadata, 'A bundle is always returned: ' + candidate);
            Assert.isFalse(metadata.objectInfo.isAccessible, 'Nothing is accessible yet');
            Assert.areEqual(0, metadata.columns.size(), 'No columns are described yet');
        }
    }

    @IsTest
    static void getGridMetadataTolerantOfNoColumns() {
        FlowGridController.GridMetadata metadata = FlowGridController.getGridMetadata('Account', null);

        Assert.isTrue(metadata.objectInfo.isAccessible, 'The object still resolves');
        Assert.areEqual(0, metadata.columns.size(), 'No paths means no columns');
    }

    @IsTest
    static void getGridMetadataReportsUnknownObjectWithoutThrowing() {
        // An unknown object is a configuration problem the grid should render,
        // not an exception that blanks the whole screen.
        FlowGridController.GridMetadata metadata = FlowGridController.getGridMetadata(
            'NoSuchObject__c',
            new List<String>{ 'Name' }
        );

        Assert.isFalse(metadata.objectInfo.isAccessible, 'The object is not accessible');
        Assert.areEqual(1, metadata.columns.size(), 'The requested column is still reported');
        Assert.isFalse(metadata.columns[0].isAccessible, 'And marked inaccessible');
    }

    @IsTest
    static void getGridMetadataCarriesTheUsersTimeZone() {
        // A Datetime column renders in the user's SALESFORCE zone, so the component
        // has to be told what that is rather than reading the browser's.
        FlowGridController.GridMetadata metadata = FlowGridController.getGridMetadata(
            'Account',
            new List<String>{ 'CreatedDate' }
        );

        Assert.areEqual(
            UserInfo.getTimeZone().getID(),
            metadata.userTimeZone,
            'The running user timezone should be carried on the bundle'
        );
    }

    @IsTest
    static void getGridMetadataCarriesTheTimeZoneEvenWhenNotReady() {
        // The not-ready branch returns early, and it would be easy to leave the
        // timezone unset there and have the first render guess.
        FlowGridController.GridMetadata metadata = FlowGridController.getGridMetadata(null, null);

        Assert.areEqual(UserInfo.getTimeZone().getID(), metadata.userTimeZone, 'Set on the not-ready path too');
    }

    @IsTest
    static void getPreviewRecordsDelegatesAndGuardsBlankObject() {
        insert new Account(Name = 'Controller Preview');

        Test.startTest();
        List<SObject> sample = FlowGridController.getPreviewRecords('Account', new List<String>{ 'Name' }, 3);
        Test.stopTest();

        Assert.areEqual(1, sample.size(), 'The one created record should be sampled');
        Assert.areEqual(0, FlowGridController.getPreviewRecords(null, new List<String>{ 'Name' }, 3).size(), 'Blank');
        Assert.areEqual(0, FlowGridController.getPreviewRecords('  ', new List<String>{ 'Name' }, 3).size(), 'Blank');
    }

    @IsTest
    static void getRecordsByIdsDelegatesToTheRecordService() {
        Account account = new Account(Name = 'Controller Refresh');
        insert account;

        List<SObject> refreshed = FlowGridController.getRecordsByIds(
            'Account',
            new List<String>{ 'Name' },
            new List<String>{ account.Id }
        );

        Assert.areEqual(1, refreshed.size(), 'The record should come back');
        Assert.areEqual('Controller Refresh', refreshed[0].get('Name'), 'With the requested field selected');
    }

    @IsTest
    static void getFlowsReturnsAList() {
        Test.startTest();
        List<FlowGridFlowService.FlowSummary> flows = FlowGridController.getFlows();
        Test.stopTest();

        Assert.isNotNull(flows, 'The picker needs a list, empty or not');
    }

    @IsTest
    static void getFlowVariablesGuardsBlankNames() {
        // Called reactively as the admin picks a flow, so it fires before a name
        // exists. That is not an error state.
        Assert.areEqual(0, FlowGridController.getFlowVariables(null).size(), 'Null flow name');
        Assert.areEqual(0, FlowGridController.getFlowVariables('   ').size(), 'Blank flow name');
        Assert.areEqual(0, FlowGridController.getFlowVariables('No_Such_Flow_Anywhere').size(), 'Unknown flow');
    }

    @IsTest
    static void runFlowTranslatesAFailureIntoAnAuraException() {
        // The component shows the admin this message, so the flow name has to be in
        // it — "the flow did not run" alone is not actionable.
        Boolean threw = false;
        try {
            FlowGridController.runFlow('No_Such_Flow_Anywhere', 'Account', '{}', 'rec', 'recId', null);
        } catch (Exception error) {
            threw = true;
            Assert.isInstanceOfType(error, AuraHandledException.class, 'Aura callers need an AuraHandledException');
        }

        Assert.isTrue(threw, 'An unknown flow should not fail silently');
    }
}
