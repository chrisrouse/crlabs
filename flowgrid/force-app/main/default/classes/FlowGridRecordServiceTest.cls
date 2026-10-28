/**
 * Tests for FlowGridRecordService.
 *
 * Two contracts are covered: `safePaths`, which is the injection barrier both this
 * class and FlowGridPreviewService rely on, and `fetchRecords`, whose whole purpose
 * is telling "still there, here are current values" apart from "gone".
 */
@IsTest
private class FlowGridRecordServiceTest {
    @TestSetup
    static void makeData() {
        insert new List<Account>{
            new Account(Name = 'Refresh One', Industry = 'Energy'),
            new Account(Name = 'Refresh Two', Industry = 'Banking')
        };
    }

    private static List<String> idsOf(List<Account> accounts) {
        List<String> ids = new List<String>();
        for (Account account : accounts) {
            ids.add(account.Id);
        }
        return ids;
    }

    @IsTest
    static void fetchRecordsReturnsCurrentValues() {
        List<Account> accounts = [SELECT Id FROM Account ORDER BY Name];
        // Change the record behind the grid's back, exactly as a launched flow does.
        update new Account(Id = accounts[0].Id, Name = 'Renamed By Flow');

        Test.startTest();
        List<SObject> refreshed = FlowGridRecordService.fetchRecords(
            'Account',
            new List<String>{ 'Name', 'Industry' },
            idsOf(accounts)
        );
        Test.stopTest();

        Assert.areEqual(2, refreshed.size(), 'Both records still exist');
        Map<Id, SObject> byId = new Map<Id, SObject>(refreshed);
        Assert.areEqual(
            'Renamed By Flow',
            byId.get(accounts[0].Id).get('Name'),
            'The refresh should report the current value, not the one the grid held'
        );
    }

    @IsTest
    static void fetchRecordsOmitsARecordThatHasGone() {
        // The distinction the grid depends on: a record that does not come back has
        // been deleted, and the row leaves the grid.
        List<Account> accounts = [SELECT Id FROM Account ORDER BY Name];
        List<String> requested = idsOf(accounts);
        delete accounts[0];

        List<SObject> refreshed = FlowGridRecordService.fetchRecords('Account', new List<String>{ 'Name' }, requested);

        Assert.areEqual(1, refreshed.size(), 'Only the surviving record should come back');
        Assert.areEqual(accounts[1].Id, refreshed[0].Id, 'And it should be the one that was not deleted');
    }

    @IsTest
    static void fetchRecordsReturnsEmptyWithoutUsableInput() {
        List<String> paths = new List<String>{ 'Name' };
        List<String> ids = idsOf([SELECT Id FROM Account]);

        Assert.areEqual(0, FlowGridRecordService.fetchRecords(null, paths, ids).size(), 'Null object');
        Assert.areEqual(0, FlowGridRecordService.fetchRecords('  ', paths, ids).size(), 'Blank object');
        Assert.areEqual(0, FlowGridRecordService.fetchRecords('Account', paths, null).size(), 'Null ids');
        Assert.areEqual(
            0,
            FlowGridRecordService.fetchRecords('Account', paths, new List<String>()).size(),
            'Empty ids'
        );
        Assert.areEqual(0, FlowGridRecordService.fetchRecords('NoSuchObject__c', paths, ids).size(), 'Unknown object');
    }

    @IsTest
    static void fetchRecordsIgnoresValuesThatAreNotIds() {
        // Ids reach this method as Strings, so anything that is not an Id has to be
        // dropped before it can reach a bind variable.
        List<SObject> refreshed = FlowGridRecordService.fetchRecords(
            'Account',
            new List<String>{ 'Name' },
            new List<String>{ 'not-an-id', '', null, '12345' }
        );

        Assert.areEqual(0, refreshed.size(), 'No usable id means no query result');
    }

    @IsTest
    static void safePathsAlwaysLeadsWithId() {
        List<String> paths = FlowGridRecordService.safePaths('Account', new List<String>{ 'Name' });

        Assert.areEqual('Id', paths[0], 'Id is always selected first');
        Assert.areEqual(2, paths.size(), 'Id plus the one requested field');
    }

    @IsTest
    static void safePathsDropsPathsThatDoNotDescribe() {
        // This is the injection barrier: only identifiers that resolve through
        // describe are allowed into the query string.
        List<String> paths = FlowGridRecordService.safePaths(
            'Account',
            new List<String>{ 'Name', 'NoSuchField__c', 'Name FROM Account WHERE Id != null' }
        );

        Assert.areEqual(new List<String>{ 'Id', 'Name' }, paths, 'Only describable paths survive');
    }

    @IsTest
    static void safePathsDeduplicatesCaseInsensitively() {
        // The same field twice would produce a duplicate select entry.
        List<String> paths = FlowGridRecordService.safePaths('Account', new List<String>{ 'Name', 'name', 'Id', 'ID' });

        Assert.areEqual(new List<String>{ 'Id', 'Name' }, paths, 'Duplicates and Id repeats are collapsed');
    }

    @IsTest
    static void safePathsReturnsIdAloneWithoutUsableInput() {
        List<String> idOnly = new List<String>{ 'Id' };

        Assert.areEqual(idOnly, FlowGridRecordService.safePaths(null, new List<String>{ 'Name' }), 'Null object');
        Assert.areEqual(idOnly, FlowGridRecordService.safePaths('  ', new List<String>{ 'Name' }), 'Blank object');
        Assert.areEqual(idOnly, FlowGridRecordService.safePaths('Account', null), 'Null paths');
        Assert.areEqual(idOnly, FlowGridRecordService.safePaths('Account', new List<String>()), 'Empty paths');
    }
}
