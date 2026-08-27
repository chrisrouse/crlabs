/**
 * Tests for FlowGridPreviewService.
 *
 * Creates its own Accounts rather than using `SeeAllData`, so the row counts the
 * clamp tests assert on are known exactly. Twelve records exist because the
 * ceiling is ten: a clamp that silently did nothing would otherwise pass.
 */
@IsTest
private class FlowGridPreviewServiceTest {
    /** More than MAX_PREVIEW_ROWS, so the ceiling is observable. */
    private static final Integer RECORD_COUNT = 12;

    @TestSetup
    static void makeData() {
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < RECORD_COUNT; i++) {
            accounts.add(new Account(Name = 'Preview ' + i, Industry = 'Energy'));
        }
        insert accounts;
    }

    @IsTest
    static void queryPreviewRecordsReturnsRealRecords() {
        Test.startTest();
        List<SObject> sample = FlowGridPreviewService.queryPreviewRecords(
            'Account',
            new List<String>{ 'Name', 'Industry' },
            6
        );
        Test.stopTest();

        Assert.areEqual(6, sample.size(), 'The requested row count should be honoured');
        Assert.isNotNull(sample[0].get('Name'), 'The requested field should be selected');
        Assert.isNotNull(sample[0].get('Id'), 'Id is always selected, whether asked for or not');
    }

    @IsTest
    static void queryPreviewRecordsClampsToTheCeiling() {
        // A preview is a sample. Whatever the caller asks for, the query must not
        // become an unbounded read of the object.
        List<SObject> sample = FlowGridPreviewService.queryPreviewRecords(
            'Account',
            new List<String>{ 'Name' },
            500
        );

        Assert.areEqual(
            FlowGridPreviewService.MAX_PREVIEW_ROWS,
            sample.size(),
            'A request above the ceiling should be clamped to it'
        );
    }

    @IsTest
    static void queryPreviewRecordsDefaultsWhenLimitIsUnusable() {
        // null, zero and negative all mean "the caller did not choose".
        for (Integer requested : new List<Integer>{ null, 0, -3 }) {
            List<SObject> sample = FlowGridPreviewService.queryPreviewRecords(
                'Account',
                new List<String>{ 'Name' },
                requested
            );

            Assert.areEqual(6, sample.size(), 'DEFAULT_PREVIEW_ROWS should apply for: ' + requested);
        }
    }

    @IsTest
    static void queryPreviewRecordsReturnsEmptyWithoutEnoughInput() {
        List<String> paths = new List<String>{ 'Name' };

        Assert.areEqual(0, FlowGridPreviewService.queryPreviewRecords(null, paths, 6).size(), 'Null object');
        Assert.areEqual(0, FlowGridPreviewService.queryPreviewRecords('  ', paths, 6).size(), 'Blank object');
        Assert.areEqual(0, FlowGridPreviewService.queryPreviewRecords('Account', null, 6).size(), 'Null paths');
        Assert.areEqual(
            0,
            FlowGridPreviewService.queryPreviewRecords('Account', new List<String>(), 6).size(),
            'Empty paths'
        );
    }

    @IsTest
    static void queryPreviewRecordsReturnsEmptyWhenOnlyIdSurvivesValidation() {
        // Every requested path was dropped by validation, so there is nothing worth
        // previewing — and, importantly, no query is run for a select list the
        // caller never asked for.
        List<SObject> sample = FlowGridPreviewService.queryPreviewRecords(
            'Account',
            new List<String>{ 'NoSuchField__c' },
            6
        );

        Assert.areEqual(0, sample.size(), 'A column set that validates to Id alone should not be previewed');
    }

    @IsTest
    static void queryPreviewRecordsSurvivesAnUnknownObject() {
        // The editor can hold a stale object name. A preview is a convenience, so
        // that must degrade to fabricated rows rather than throwing.
        List<SObject> sample = FlowGridPreviewService.queryPreviewRecords(
            'NoSuchObject__c',
            new List<String>{ 'Name' },
            6
        );

        Assert.areEqual(0, sample.size(), 'An unknown object should yield no preview and no exception');
    }
}
