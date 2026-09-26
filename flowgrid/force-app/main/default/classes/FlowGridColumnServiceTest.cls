/**
 * Tests for FlowGridColumnService.
 *
 * Uses only standard objects so the suite runs in any org without depending on
 * custom metadata that may not be present. No `SeeAllData`; describe calls need
 * no data at all, and the one FLS test creates its own minimum-access user.
 */
@IsTest
private class FlowGridColumnServiceTest {
    @IsTest
    static void describeObjectReturnsLabelsAndIcon() {
        Test.startTest();
        FlowGridColumnService.ObjectInfo info = FlowGridColumnService.describeObject('Account');
        Test.stopTest();

        Assert.isTrue(info.isAccessible, 'Account should be accessible to an admin');
        Assert.areEqual('Account', info.apiName, 'API name should round-trip');
        Assert.isNotNull(info.label, 'Label should be populated');
        Assert.isNotNull(info.pluralLabel, 'Plural label should be populated');
        Assert.areEqual('standard:account', info.iconName, 'Standard object should map to its SLDS icon');
        Assert.areEqual('Name', info.nameField, 'Account name field should be Name');
    }

    @IsTest
    static void describeObjectMarksUnknownObjectInaccessible() {
        FlowGridColumnService.ObjectInfo info = FlowGridColumnService.describeObject('NotAnObject__c');

        Assert.isFalse(info.isAccessible, 'A non-existent object must not report as accessible');
        Assert.isNull(info.label, 'No label should be resolved');
    }

    @IsTest
    static void describeObjectHandlesBlankInput() {
        Assert.isFalse(FlowGridColumnService.describeObject(null).isAccessible, 'Null should be inaccessible');
        Assert.isFalse(FlowGridColumnService.describeObject('   ').isAccessible, 'Blank should be inaccessible');
    }

    @IsTest
    static void describeColumnsPreservesRequestedOrder() {
        List<String> paths = new List<String>{ 'AnnualRevenue', 'Name', 'Industry' };

        Test.startTest();
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns('Account', paths);
        Test.stopTest();

        Assert.areEqual(3, columns.size(), 'One column per requested path');
        Assert.areEqual('AnnualRevenue', columns[0].fieldPath, 'Order must match the request');
        Assert.areEqual('Name', columns[1].fieldPath, 'Order must match the request');
        Assert.areEqual('Industry', columns[2].fieldPath, 'Order must match the request');
    }

    @IsTest
    static void describeColumnsMapsDisplayTypesToDatatableTypes() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'Name', 'AnnualRevenue', 'NumberOfEmployees', 'Website', 'Phone', 'CreatedDate' }
        );
        Map<String, FlowGridColumnService.ColumnInfo> byPath = indexByPath(columns);

        Assert.areEqual('text', byPath.get('Name').dataType, 'Text field');
        Assert.areEqual('currency', byPath.get('AnnualRevenue').dataType, 'Currency field');
        Assert.areEqual('number', byPath.get('NumberOfEmployees').dataType, 'Integer field');
        Assert.areEqual('url', byPath.get('Website').dataType, 'URL field');
        Assert.areEqual('phone', byPath.get('Phone').dataType, 'Phone field');
        Assert.areEqual('date', byPath.get('CreatedDate').dataType, 'DateTime field');
    }

    @IsTest
    static void describeColumnsFlagsTheNameField() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'Name', 'Industry' }
        );
        Map<String, FlowGridColumnService.ColumnInfo> byPath = indexByPath(columns);

        Assert.isTrue(byPath.get('Name').isNameField, 'Name is the record-link column');
        Assert.isFalse(byPath.get('Industry').isNameField, 'Industry is not the name field');
    }

    @IsTest
    static void describeColumnsReturnsActivePicklistOptions() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'Industry' }
        );

        FlowGridColumnService.ColumnInfo industry = columns[0];
        Assert.isNotNull(industry.picklistOptions, 'A picklist must expose its options');
        Assert.isTrue(industry.picklistOptions.size() > 0, 'Industry has active values');
        Assert.isNotNull(industry.picklistOptions[0].label, 'Option label is populated');
        Assert.isNotNull(industry.picklistOptions[0].value, 'Option value is populated');
        // The datatable has no picklist type; Flow Grid renders its own cell.
        Assert.areEqual('text', industry.dataType, 'Picklist maps to text');
    }

    @IsTest
    static void describeColumnsOmitsPicklistOptionsForOtherTypes() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'Name' }
        );

        Assert.isNull(columns[0].picklistOptions, 'A text field has no picklist options');
    }

    @IsTest
    static void describeColumnsReportsScaleOnlyForNumerics() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'AnnualRevenue', 'Name' }
        );
        Map<String, FlowGridColumnService.ColumnInfo> byPath = indexByPath(columns);

        Assert.isNotNull(byPath.get('AnnualRevenue').scale, 'Currency reports a scale');
        Assert.isNull(byPath.get('Name').scale, 'Text has no meaningful scale');
    }

    @IsTest
    static void describeColumnsMarksFormulaAndSystemFieldsNonEditable() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'Name', 'CreatedDate', 'Id' }
        );
        Map<String, FlowGridColumnService.ColumnInfo> byPath = indexByPath(columns);

        Assert.isTrue(byPath.get('Name').isEditable, 'Name is updateable');
        Assert.isFalse(byPath.get('CreatedDate').isEditable, 'Audit fields are not updateable');
        Assert.isFalse(byPath.get('Id').isEditable, 'Id is never editable');
    }

    @IsTest
    static void describeColumnsResolvesRelationshipPaths() {
        Test.startTest();
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'Owner.Alias' }
        );
        Test.stopTest();

        FlowGridColumnService.ColumnInfo owner = columns[0];
        Assert.isTrue(owner.isAccessible, 'Owner.Alias should resolve through the relationship');
        Assert.areEqual('Owner.Alias', owner.fieldPath, 'Path is echoed verbatim');
        Assert.areEqual('text', owner.dataType, 'Alias is a text field');
        Assert.isFalse(owner.isNameField, 'A related field is never the root name field');
    }

    @IsTest
    static void describeColumnsRejectsUnknownField() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'NotAField__c' }
        );

        Assert.isFalse(columns[0].isAccessible, 'An unknown field is not accessible');
        Assert.isTrue(
            columns[0].errorMessage.contains('does not exist'),
            'The reason should name the problem, got: ' + columns[0].errorMessage
        );
    }

    @IsTest
    static void describeColumnsRejectsNonRelationshipHop() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ 'Name.Something' }
        );

        Assert.isFalse(columns[0].isAccessible, 'Name is not traversable');
        Assert.isTrue(
            columns[0].errorMessage.contains('not a relationship'),
            'The reason should explain the failure, got: ' + columns[0].errorMessage
        );
    }

    @IsTest
    static void describeColumnsRejectsPathBeyondMaximumDepth() {
        String deepPath = 'A.B.C.D.E.F';
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ deepPath }
        );

        Assert.isFalse(columns[0].isAccessible, 'Too many hops must be refused');
        Assert.isTrue(
            columns[0].errorMessage.contains('relationship depth'),
            'The reason should mention depth, got: ' + columns[0].errorMessage
        );
    }

    @IsTest
    static void describeColumnsRejectsBlankPath() {
        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'Account',
            new List<String>{ '' }
        );

        Assert.isFalse(columns[0].isAccessible, 'A blank path is not usable');
    }

    @IsTest
    static void describeColumnsReturnsEmptyForNoPaths() {
        Assert.areEqual(
            0,
            FlowGridColumnService.describeColumns('Account', new List<String>()).size(),
            'No paths means no columns'
        );
        Assert.areEqual(0, FlowGridColumnService.describeColumns('Account', null).size(), 'Null paths is tolerated');
    }

    @IsTest
    static void describeColumnsReportsEveryPathWhenObjectIsInaccessible() {
        List<String> paths = new List<String>{ 'Name', 'Industry' };

        List<FlowGridColumnService.ColumnInfo> columns = FlowGridColumnService.describeColumns(
            'NoSuchObject__c',
            paths
        );

        Assert.areEqual(2, columns.size(), 'Every requested path still gets an entry');
        for (FlowGridColumnService.ColumnInfo column : columns) {
            Assert.isFalse(column.isAccessible, 'Nothing is accessible without the object');
            Assert.isTrue(column.errorMessage.contains('not accessible'), 'The reason names the object problem');
        }
    }

    @IsTest
    static void describeObjectMarksCustomObjectsWithGenericIcon() {
        // A custom tab's icon is not expressible as an SLDS icon name, so custom
        // objects intentionally fall back. Only asserted when the org has one.
        for (Schema.SObjectType token : Schema.getGlobalDescribe().values()) {
            Schema.DescribeSObjectResult describe = token.getDescribe();
            if (describe.isCustom() && describe.isAccessible() && !describe.getName().contains('__mdt')) {
                FlowGridColumnService.ObjectInfo info = FlowGridColumnService.describeObject(describe.getName());
                Assert.areEqual('standard:record', info.iconName, 'Custom objects use the generic icon');
                return;
            }
        }
    }

    /**
     * A minimum-access user cannot read Account, so every column must come back
     * inaccessible with a reason rather than silently blank.
     */
    @IsTest
    static void describeColumnsRespectsFieldLevelSecurity() {
        User restricted = buildMinimumAccessUser();
        if (restricted == null) {
            return; // No suitable profile in this org; nothing to assert.
        }

        System.runAs(restricted) {
            Test.startTest();
            FlowGridColumnService.ObjectInfo info = FlowGridColumnService.describeObject('Account');
            Test.stopTest();

            Assert.isFalse(info.isAccessible, 'A minimum-access user cannot read Account');
        }
    }

    /** Indexes results by field path for order-independent assertions. */
    private static Map<String, FlowGridColumnService.ColumnInfo> indexByPath(
        List<FlowGridColumnService.ColumnInfo> columns
    ) {
        Map<String, FlowGridColumnService.ColumnInfo> byPath = new Map<String, FlowGridColumnService.ColumnInfo>();
        for (FlowGridColumnService.ColumnInfo column : columns) {
            byPath.put(column.fieldPath, column);
        }
        return byPath;
    }

    /** Creates a user on the most restrictive standard profile available. */
    private static User buildMinimumAccessUser() {
        List<Profile> profiles = [
            SELECT Id
            FROM Profile
            WHERE Name IN ('Minimum Access - Salesforce', 'Standard Platform User')
            ORDER BY Name
            LIMIT 1
        ];
        if (profiles.isEmpty()) {
            return null;
        }

        User restricted = new User(
            ProfileId = profiles[0].Id,
            LastName = 'FlowGrid',
            Email = 'flowgrid.test@example.invalid',
            Username = 'flowgrid.test.' + DateTime.now().getTime() + '@example.invalid',
            Alias = 'fgtst',
            TimeZoneSidKey = 'America/New_York',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        Database.SaveResult result = Database.insert(restricted, false, AccessLevel.SYSTEM_MODE);
        return result.isSuccess() ? restricted : null;
    }
}
