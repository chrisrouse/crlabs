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
}
