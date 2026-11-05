/**
 * Provides type-ahead search suggestions for the crSearchBar LWC.
 * Executes SOSL for CRM objects and Search.suggest() for Knowledge (handles promoted terms).
 */
public with sharing class SearchBarController {

    private static final Integer MAX_PER_TYPE = 3;

    /**
     * Returns all searchable, accessible sObjects for the running user.
     * Used by crSearchObjectPicker to populate the object selection dropdown.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getSearchableObjects() {
        List<Map<String, String>> result = new List<Map<String, String>>();
        Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
        for (String apiName : globalDescribe.keySet()) {
            Schema.DescribeSObjectResult objDescribe = globalDescribe.get(apiName).getDescribe();
            if (objDescribe.isSearchable() && objDescribe.isAccessible()) {
                Map<String, String> obj = new Map<String, String>();
                obj.put('apiName', apiName);
                obj.put('label', objDescribe.getLabel());
                result.add(obj);
            }
        }
        return result;
    }

    /**
     * Returns up to MAX_PER_TYPE suggestions per configured object type.
     * Knowledge objects use Search.suggest() to support promoted search terms.
     * All other objects use SOSL. Results are returned in CPE-configured order.
     *
     * @param searchTerm        Partial search term typed by the user.
     * @param searchObjectsJson JSON array: [{"apiName":"Account","label":"Accounts","publiclyAvailable":true}]
     * @return List of suggestion maps: {id, name, typeLabel, objectApiName, promoted, urlName}
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getSuggestions(
        String searchTerm,
        String searchObjectsJson
    ) {
        if (String.isBlank(searchTerm) || searchTerm.trim().length() < 2) {
            return new List<Map<String, String>>();
        }
        if (String.isBlank(searchObjectsJson) || searchObjectsJson == '[]') {
            return new List<Map<String, String>>();
        }

        List<Object> rawObjects = (List<Object>) JSON.deserializeUntyped(searchObjectsJson);
        Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();

        // Maintain configured order; bucket results by API name
        List<String> configuredOrder       = new List<String>();
        Map<String, List<Map<String, String>>> resultsByObject = new Map<String, List<Map<String, String>>>();

        // SOSL accumulators for non-Knowledge objects
        List<String> soslApiNames       = new List<String>();
        List<String> returningClauses   = new List<String>();
        Map<String, String> labelMap      = new Map<String, String>();
        Map<String, String> nameFieldMap  = new Map<String, String>();
        Map<String, String> customUrlMap  = new Map<String, String>();

        for (Object obj : rawObjects) {
            Map<String, Object> objMap  = (Map<String, Object>) obj;
            String apiName  = (String) objMap.get('apiName');
            String objLabel = (String) objMap.get('label');

            Schema.SObjectType sType = globalDescribe.get(apiName);
            if (sType == null) {
                continue;
            }
            Schema.DescribeSObjectResult objDescribe = sType.getDescribe();
            if (!objDescribe.isSearchable() || !objDescribe.isAccessible()) {
                continue;
            }

            String properApiName = objDescribe.getName();
            configuredOrder.add(properApiName);
            resultsByObject.put(properApiName, new List<Map<String, String>>());

            String customUrl = (String) objMap.get('customUrl');
            if (customUrl == null) {
                customUrl = '';
            }

            if (isKnowledgeType(properApiName)) {
                // Knowledge: use Search.suggest() for promoted term support
                resultsByObject.put(
                    properApiName,
                    getKnowledgeSuggestions(searchTerm, properApiName, objLabel)
                );
            } else {
                // All other objects: batch into one SOSL query
                // Use isNameField() to correctly identify the display field for any object
                String nameField = getNameField(objDescribe);
                if (nameField == null) {
                    configuredOrder.remove(configuredOrder.size() - 1);
                    resultsByObject.remove(properApiName);
                    continue;
                }
                labelMap.put(properApiName, objLabel);
                nameFieldMap.put(properApiName, nameField);
                customUrlMap.put(properApiName, customUrl);
                soslApiNames.add(properApiName);
                returningClauses.add(
                    properApiName + '(Id, ' + nameField + ' LIMIT ' + MAX_PER_TYPE + ')'
                );
            }
        }

        // Run a single SOSL for all non-Knowledge objects
        if (!returningClauses.isEmpty()) {
            String safeTerm  = String.escapeSingleQuotes(searchTerm.trim()) + '*';
            String soslQuery = 'FIND {' + safeTerm + '} IN ALL FIELDS RETURNING ' +
                               String.join(returningClauses, ', ');
            List<List<SObject>> soslResults = Search.query(soslQuery);

            for (Integer i = 0; i < soslApiNames.size() && i < soslResults.size(); i++) {
                String apiName   = soslApiNames[i];
                String typeLabel = labelMap.get(apiName);
                String nameField = nameFieldMap.get(apiName);
                String customUrl = customUrlMap.get(apiName);
                List<Map<String, String>> objResults = new List<Map<String, String>>();

                for (SObject record : soslResults[i]) {
                    Map<String, String> s = new Map<String, String>();
                    s.put('id',            record.Id);
                    s.put('name',          (String) record.get(nameField));
                    s.put('typeLabel',     typeLabel);
                    s.put('objectApiName', apiName);
                    s.put('promoted',      'false');
                    s.put('urlName',       '');
                    s.put('customUrl',     customUrl != null ? customUrl : '');
                    objResults.add(s);
                }
                resultsByObject.put(apiName, objResults);
            }
        }

        // Combine in CPE-configured order
        List<Map<String, String>> suggestions = new List<Map<String, String>>();
        for (String apiName : configuredOrder) {
            if (resultsByObject.containsKey(apiName)) {
                suggestions.addAll(resultsByObject.get(apiName));
            }
        }
        return suggestions;
    }

    // ── Field helpers ────────────────────────────────────────────────────────

    /**
     * Returns the best display field for any SObject:
     * 1. Subject — for Case, Task, Event and similar activity objects
     * 2. Title   — for ContentVersion and other title-based objects
     * 3. A non-auto-number name field (via isNameField) — covers Account, Contact,
     *    Lead, Solution.SolutionName, and all custom objects with a Name field
     * 4. Any name field including auto-numbers (last resort fallback)
     */
    private static String getNameField(Schema.DescribeSObjectResult objDescribe) {
        Map<String, Schema.SObjectField> fieldMap = objDescribe.fields.getMap();

        if (fieldMap.containsKey('subject')) {
            return 'Subject';
        }
        if (fieldMap.containsKey('title')) {
            return 'Title';
        }

        String autoNumberFallback = null;
        for (Schema.SObjectField f : fieldMap.values()) {
            Schema.DescribeFieldResult fr = f.getDescribe();
            if (fr.isNameField()) {
                if (!fr.isAutoNumber()) {
                    return fr.getName();
                }
                autoNumberFallback = fr.getName();
            }
        }
        return autoNumberFallback;
    }

    // ── Knowledge helpers ────────────────────────────────────────────────────

    private static Boolean isKnowledgeType(String apiName) {
        return apiName != null && apiName.toLowerCase().endsWith('__kav');
    }

    private static List<Map<String, String>> getKnowledgeSuggestions(
        String searchTerm,
        String apiName,
        String objLabel
    ) {
        List<Map<String, String>> results = new List<Map<String, String>>();

        // ── Step 1: Try Search.suggest() for promoted term detection ─────────
        Set<Id> promotedIds = new Set<Id>();
        List<Id> suggestIds = new List<Id>();

        try {
            Search.SuggestionOption options = new Search.SuggestionOption();
            options.setLimit(MAX_PER_TYPE * 2);

            List<Search.SuggestionResult> suggestionList =
                Search.suggest(searchTerm, apiName, options).getSuggestionResults();

            for (Search.SuggestionResult sr : suggestionList) {
                suggestIds.add(sr.getSObject().Id);
            }

            // Check for promoted terms
            if (!suggestIds.isEmpty()) {
                for (SearchPromotionRule rule : [
                    SELECT PromotedEntityId
                    FROM SearchPromotionRule
                    WHERE PromotedEntityId IN :suggestIds
                    AND Query = :searchTerm
                    WITH USER_MODE
                ]) {
                    promotedIds.add(rule.PromotedEntityId);
                }
            }
        } catch (Exception e) {
            // Search.suggest() unavailable — fall through to SOSL
        }

        // ── Step 2: SOSL for actual results (reliable across all article states) ──
        try {
            String safeTerm = String.escapeSingleQuotes(searchTerm.trim()) + '*';
            String soslQuery = 'FIND {' + safeTerm + '} IN ALL FIELDS RETURNING ' +
                               apiName + '(Id, Title, UrlName LIMIT ' + (MAX_PER_TYPE * 2) + ')';
            List<List<SObject>> soslResults = Search.query(soslQuery);

            if (!soslResults.isEmpty()) {
                // Build a set of SOSL result IDs in order
                List<SObject> articles = soslResults[0];

                // Collect promoted IDs that appear in SOSL results (highest priority)
                List<SObject> promoted = new List<SObject>();
                List<SObject> regular  = new List<SObject>();
                for (SObject article : articles) {
                    if (promotedIds.contains(article.Id)) {
                        promoted.add(article);
                    } else {
                        regular.add(article);
                    }
                }

                Integer count = 0;
                for (SObject article : promoted) {
                    if (count >= MAX_PER_TYPE) break;
                    Map<String, String> s = buildKnowledgeMap(article, apiName, objLabel, true);
                    if (s != null) { results.add(s); count++; }
                }
                for (SObject article : regular) {
                    if (count >= MAX_PER_TYPE) break;
                    Map<String, String> s = buildKnowledgeMap(article, apiName, objLabel, false);
                    if (s != null) { results.add(s); count++; }
                }
            }
        } catch (Exception e) {
            // SOSL failed — return whatever we have
        }

        return results;
    }

    @TestVisible
    private static Map<String, String> buildKnowledgeMap(
        SObject record,
        String apiName,
        String objLabel,
        Boolean promoted
    ) {
        String title = record.get('Title') != null   ? (String) record.get('Title')   :
                       record.get('Name')  != null   ? (String) record.get('Name')    : null;
        if (title == null) {
            return null;
        }
        String urlName = record.get('UrlName') != null ? (String) record.get('UrlName') : '';

        Map<String, String> s = new Map<String, String>();
        s.put('id',            record.Id);
        s.put('name',          title);
        s.put('typeLabel',     objLabel);
        s.put('objectApiName', apiName);
        s.put('promoted',      promoted ? 'true' : 'false');
        s.put('urlName',       urlName);
        return s;
    }
}
