/**
 * Runtime record lookups the grid needs after a row action.
 *
 * Separate from FlowGridColumnService (describe) and FlowGridPreviewService
 * (design-time sampling) because this runs during a live interview and answers a
 * different question: is this row still there?
 *
 * A launched flow can delete the record it was given. The grid cannot see that,
 * because it holds an in-memory copy, so it asks. Queries run in user mode; a
 * record the running user cannot see is reported as missing, which is the
 * conservative answer for a grid that is about to stop displaying it.
 *
 * @see FlowGridController
 */
public with sharing class FlowGridRecordService {
    /**
     * Reports which of the given ids still exist.
     *
     * @param objectApiName API name of the object to check
     * @param recordIds ids to look for
     * @return the subset that still exists and is visible to the running user
     *
     * @example
     * Set<Id> alive = FlowGridRecordService.findExistingIds(
     *     'Account', new List<String>{ '001...' });
     */
    public static List<String> findExistingIds(String objectApiName, List<String> recordIds) {
        List<String> existing = new List<String>();
        if (String.isBlank(objectApiName) || recordIds == null || recordIds.isEmpty()) {
            return existing;
        }

        Schema.SObjectType token = Schema.getGlobalDescribe().get(objectApiName.trim());
        if (token == null || !token.getDescribe().isAccessible()) {
            return existing;
        }

        Set<Id> ids = new Set<Id>();
        for (String candidate : recordIds) {
            if (String.isNotBlank(candidate)) {
                try {
                    ids.add((Id) candidate);
                } catch (Exception ignored) {
                    // Not an Id at all; it cannot exist, so leave it out.
                }
            }
        }
        if (ids.isEmpty()) {
            return existing;
        }

        String soql = 'SELECT Id FROM ' + token.getDescribe().getName() + ' WHERE Id IN :ids';
        for (
            SObject record : Database.queryWithBinds(
                soql,
                new Map<String, Object>{ 'ids' => ids },
                AccessLevel.USER_MODE
            )
        ) {
            existing.add((String) record.get('Id'));
        }
        return existing;
    }
}
