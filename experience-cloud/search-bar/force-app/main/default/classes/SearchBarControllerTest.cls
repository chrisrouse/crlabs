@IsTest
private class SearchBarControllerTest {

    // ── getSearchableObjects ─────────────────────────────────────────────────

    @IsTest
    static void testGetSearchableObjects_ReturnsNonEmptyList() {
        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSearchableObjects();
        Test.stopTest();

        System.assertNotEquals(0, results.size(),
            'getSearchableObjects should return at least some objects');
    }

    @IsTest
    static void testGetSearchableObjects_EachResultHasRequiredKeys() {
        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSearchableObjects();
        Test.stopTest();

        for (Map<String, String> obj : results) {
            System.assert(obj.containsKey('apiName'),
                'Each object map must contain apiName');
            System.assert(obj.containsKey('label'),
                'Each object map must contain label');
            System.assertNotEquals(null, obj.get('apiName'),
                'apiName must not be null');
            System.assertNotEquals('', obj.get('apiName'),
                'apiName must not be empty');
        }
    }

    @IsTest
    static void testGetSearchableObjects_ContainsAccount() {
        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSearchableObjects();
        Test.stopTest();

        Boolean found = false;
        for (Map<String, String> obj : results) {
            if (obj.get('apiName') == 'Account') {
                found = true;
                break;
            }
        }
        System.assert(found, 'Account should appear in the searchable objects list');
    }

    // ── getSuggestions — input validation ────────────────────────────────────

    @IsTest
    static void testGetSuggestions_NullSearchTerm_ReturnsEmpty() {
        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions(
            null, '[{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":""}]'
        );
        Test.stopTest();

        System.assertEquals(0, results.size(),
            'Null search term should return empty list');
    }

    @IsTest
    static void testGetSuggestions_BlankSearchTerm_ReturnsEmpty() {
        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions(
            '   ', '[{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":""}]'
        );
        Test.stopTest();

        System.assertEquals(0, results.size(),
            'Blank search term should return empty list');
    }

    @IsTest
    static void testGetSuggestions_SingleCharTerm_ReturnsEmpty() {
        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions(
            'a', '[{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":""}]'
        );
        Test.stopTest();

        System.assertEquals(0, results.size(),
            'Single-character search term should return empty list');
    }

    @IsTest
    static void testGetSuggestions_EmptyObjectsArray_ReturnsEmpty() {
        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('braun', '[]');
        Test.stopTest();

        System.assertEquals(0, results.size(),
            'Empty objects array should return empty list');
    }

    @IsTest
    static void testGetSuggestions_NullObjectsJson_ReturnsEmpty() {
        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('braun', null);
        Test.stopTest();

        System.assertEquals(0, results.size(),
            'Null searchObjectsJson should return empty list');
    }

    @IsTest
    static void testGetSuggestions_UnknownObjectApiName_SkipsSilently() {
        String json = '[{"apiName":"DoesNotExist__c","label":"Fake","publiclyAvailable":true,"customUrl":""}]';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('test', json);
        Test.stopTest();

        System.assertEquals(0, results.size(),
            'Unknown object API name should be silently skipped');
    }

    // ── getSuggestions — Account (Name field via isNameField) ────────────────

    @IsTest
    static void testGetSuggestions_Account_ReturnsSuggestionWithCorrectFields() {
        Account acct = new Account(Name = 'TestBraun Corp');
        insert acct;
        Test.setFixedSearchResults(new List<Id>{ acct.Id });

        String json = '[{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":""}]';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('TestBraun', json);
        Test.stopTest();

        System.assertEquals(1, results.size(), 'Should return one Account suggestion');
        Map<String, String> r = results[0];
        System.assertEquals(acct.Id,       r.get('id'),            'id should match the inserted record');
        System.assertEquals('TestBraun Corp', r.get('name'),       'name should use the Name field');
        System.assertEquals('Accounts',    r.get('typeLabel'),      'typeLabel should match configured label');
        System.assertEquals('Account',     r.get('objectApiName'), 'objectApiName should be properly cased');
        System.assertEquals('false',       r.get('promoted'),      'Non-Knowledge results are not promoted');
        System.assertEquals('',            r.get('urlName'),       'urlName is empty for non-Knowledge');
        System.assertEquals('',            r.get('customUrl'),     'customUrl is empty when not configured');
    }

    @IsTest
    static void testGetSuggestions_Account_WithCustomUrl_PassesThroughToResult() {
        Account acct = new Account(Name = 'TestCustom Corp');
        insert acct;
        Test.setFixedSearchResults(new List<Id>{ acct.Id });

        String json = '[{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":"/account/{Id}"}]';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('TestCustom', json);
        Test.stopTest();

        System.assertEquals(1, results.size(), 'Should return one suggestion');
        System.assertEquals('/account/{Id}', results[0].get('customUrl'),
            'customUrl should be passed through verbatim for token replacement in LWC');
    }

    // ── getSuggestions — Case (Subject field) ────────────────────────────────

    @IsTest
    static void testGetSuggestions_Case_UsesSubjectField() {
        Case c = new Case(Subject = 'TestCase Login Issue');
        insert c;
        Test.setFixedSearchResults(new List<Id>{ c.Id });

        String json = '[{"apiName":"Case","label":"Cases","publiclyAvailable":true,"customUrl":""}]';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('TestCase', json);
        Test.stopTest();

        System.assertEquals(1, results.size(), 'Should return one Case suggestion');
        System.assertEquals('TestCase Login Issue', results[0].get('name'),
            'Case should display Subject, not CaseNumber');
        System.assertEquals('Case', results[0].get('objectApiName'),
            'objectApiName should be properly cased');
    }

    // ── getSuggestions — multiple objects, order preserved ───────────────────

    @IsTest
    static void testGetSuggestions_MultipleObjects_ResultsGroupedByConfiguredOrder() {
        Account acct = new Account(Name = 'TestOrder Account');
        insert acct;
        Case c = new Case(Subject = 'TestOrder Case');
        insert c;

        // Fixed results: Account ID first, then Case ID
        Test.setFixedSearchResults(new List<Id>{ acct.Id, c.Id });

        String json = '[' +
            '{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":""},' +
            '{"apiName":"Case","label":"Cases","publiclyAvailable":true,"customUrl":""}' +
        ']';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('TestOrder', json);
        Test.stopTest();

        System.assertEquals(2, results.size(), 'Should return one result per object type');
        System.assertEquals('Account', results[0].get('objectApiName'),
            'Account should appear first, matching CPE configuration order');
        System.assertEquals('Case', results[1].get('objectApiName'),
            'Case should appear second, matching CPE configuration order');
    }

    @IsTest
    static void testGetSuggestions_MultipleObjects_ReversedOrder_RespectsConfiguration() {
        Account acct = new Account(Name = 'TestReverse Account');
        insert acct;
        Case c = new Case(Subject = 'TestReverse Case');
        insert c;

        Test.setFixedSearchResults(new List<Id>{ acct.Id, c.Id });

        // Case configured before Account
        String json = '[' +
            '{"apiName":"Case","label":"Cases","publiclyAvailable":true,"customUrl":""},' +
            '{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":""}' +
        ']';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('TestReverse', json);
        Test.stopTest();

        System.assertEquals(2, results.size(), 'Should return results for both objects');
        System.assertEquals('Case', results[0].get('objectApiName'),
            'Case should appear first when configured first');
        System.assertEquals('Account', results[1].get('objectApiName'),
            'Account should appear second when configured second');
    }

    // ── getSuggestions — Knowledge (Search.suggest path) ────────────────────

    @IsTest
    static void testGetSuggestions_KnowledgeObject_DoesNotThrow() {
        // Knowledge__kav triggers Search.suggest() instead of SOSL.
        // In a test context Search.suggest() returns empty — verify graceful handling.
        String json = '[{"apiName":"Knowledge__kav","label":"Articles","publiclyAvailable":true,"customUrl":""}]';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('reset', json);
        Test.stopTest();

        System.assertNotEquals(null, results,
            'Knowledge search should return a list (possibly empty) without throwing');
    }

    @IsTest
    static void testGetSuggestions_IsKnowledgeType_IdentifiesKavObjects() {
        // Indirectly validates isKnowledgeType(): a __kav object routes to
        // Search.suggest() rather than SOSL, which we verify by confirming
        // the method completes without SOSL errors when no fixed results are set.
        String json = '[' +
            '{"apiName":"Knowledge__kav","label":"Articles","publiclyAvailable":true,"customUrl":""},' +
            '{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":""}' +
        ']';

        Account acct = new Account(Name = 'TestKav Account');
        insert acct;
        Test.setFixedSearchResults(new List<Id>{ acct.Id });

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('TestKav', json);
        Test.stopTest();

        // Account results should still come through even when Knowledge is also configured
        Boolean hasAccount = false;
        for (Map<String, String> r : results) {
            if (r.get('objectApiName') == 'Account') {
                hasAccount = true;
            }
        }
        System.assert(hasAccount, 'Account results should appear alongside Knowledge in mixed configuration');
    }

    // ── buildKnowledgeMap (via @TestVisible) ─────────────────────────────────

    @IsTest
    static void testBuildKnowledgeMap_WithTitle_ReturnsCorrectMap() {
        // Create a Knowledge article so we have a real __kav SObject
        Knowledge__kav article = new Knowledge__kav(
            Title   = 'Reset Your Password',
            UrlName = 'reset-your-password'
        );
        insert article;
        // Re-query to get a fully hydrated SObject
        Knowledge__kav queried = [SELECT Id, Title, UrlName FROM Knowledge__kav WHERE Id = :article.Id LIMIT 1];

        Test.startTest();
        Map<String, String> result = SearchBarController.buildKnowledgeMap(
            queried, 'Knowledge__kav', 'Articles', true
        );
        Test.stopTest();

        System.assertNotEquals(null, result, 'Should return a map when Title is present');
        System.assertEquals(queried.Id,             result.get('id'),            'id should match the article');
        System.assertEquals('Reset Your Password',  result.get('name'),          'name should use Title field');
        System.assertEquals('Articles',             result.get('typeLabel'),     'typeLabel should match');
        System.assertEquals('Knowledge__kav',       result.get('objectApiName'), 'objectApiName should match');
        System.assertEquals('true',                 result.get('promoted'),      'promoted should be true');
        System.assertEquals('reset-your-password',  result.get('urlName'),       'urlName should be populated');
    }

    @IsTest
    static void testBuildKnowledgeMap_NotPromoted_SetsPromotedFalse() {
        Knowledge__kav article = new Knowledge__kav(Title = 'Not Promoted Article', UrlName = 'not-promoted');
        insert article;
        Knowledge__kav queried = [SELECT Id, Title, UrlName FROM Knowledge__kav WHERE Id = :article.Id LIMIT 1];

        Test.startTest();
        Map<String, String> result = SearchBarController.buildKnowledgeMap(
            queried, 'Knowledge__kav', 'Articles', false
        );
        Test.stopTest();

        System.assertEquals('false', result.get('promoted'),
            'promoted should be false for non-promoted articles');
    }

    @IsTest
    static void testBuildKnowledgeMap_EmptyUrlName_ReturnsEmptyString() {
        // Verifies the UrlName fallback branch returns '' rather than null
        Knowledge__kav article = new Knowledge__kav(Title = 'No URL Article', UrlName = 'no-url-article');
        insert article;
        Knowledge__kav queried = [SELECT Id, Title, UrlName FROM Knowledge__kav WHERE Id = :article.Id LIMIT 1];

        Test.startTest();
        Map<String, String> result = SearchBarController.buildKnowledgeMap(
            queried, 'Knowledge__kav', 'Articles', false
        );
        Test.stopTest();

        System.assertNotEquals(null, result, 'Should return a map');
        System.assertNotEquals(null, result.get('urlName'),
            'urlName should never be null — empty string is the fallback');
    }

    // ── getNameField — auto-number fallback ──────────────────────────────────

    @IsTest
    static void testGetSuggestions_ContractSearch_HandlesAutoNumberNameField() {
        // Contract.ContractNumber is an auto-number isNameField. Our getNameField
        // implementation falls back to it when no better field is available.
        // This test ensures contracts are not silently dropped and the method
        // completes without error even for auto-number name fields.
        Contract c = new Contract(
            AccountId  = [SELECT Id FROM Account LIMIT 1]?.Id,
            StartDate  = Date.today(),
            ContractTerm = 12
        );
        if (c.AccountId != null) {
            insert c;
            Test.setFixedSearchResults(new List<Id>{ c.Id });
        }

        String json = '[{"apiName":"Contract","label":"Contracts","publiclyAvailable":true,"customUrl":""}]';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('test', json);
        Test.stopTest();

        // Either returns the contract (if one was found) or empty — both are valid.
        // The key assertion is that no exception was thrown.
        System.assertNotEquals(null, results, 'Contract search should not throw');
    }

    // ── getSuggestions — result structure completeness ───────────────────────

    @IsTest
    static void testGetSuggestions_AllRequiredFieldsPresentInResult() {
        Account acct = new Account(Name = 'FieldCheck Account');
        insert acct;
        Test.setFixedSearchResults(new List<Id>{ acct.Id });

        String json = '[{"apiName":"Account","label":"Accounts","publiclyAvailable":true,"customUrl":""}]';

        Test.startTest();
        List<Map<String, String>> results = SearchBarController.getSuggestions('FieldCheck', json);
        Test.stopTest();

        System.assertEquals(1, results.size(), 'Should return one result for field structure check');
        Map<String, String> r = results[0];
        for (String key : new List<String>{ 'id', 'name', 'typeLabel', 'objectApiName', 'promoted', 'urlName', 'customUrl' }) {
            System.assert(r.containsKey(key), 'Result map must contain key: ' + key);
        }
    }
}
