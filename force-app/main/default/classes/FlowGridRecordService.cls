/**
 * Runtime record lookups the grid needs after a row action.
 *
 * Separate from FlowGridColumnService (describe) and FlowGridPreviewService
 * (design-time sampling) because this runs during a live interview and answers a
 * different question: what does this row look like now?
 *
 * A launched flow may update the record without returning it, or delete it
 * outright. Either way the grid cannot see it, because it holds an in-memory
 * copy. One query answers both: a record that comes back supplies current values,
 * and one that does not has gone.
 *
 * SECURITY. Field paths originate in the property editor, so they are validated
 * through FlowGridColumnService and dropped unless they describe to an accessible
 * field. Only validated identifiers reach the query string, and it runs in user
 * mode — a record the running user cannot see is therefore reported as missing,
 * which is the conservative answer for a grid about to stop displaying it.
 *
 * @see FlowGridController
 */
public with sharing class FlowGridRecordService {
    /**
     * Fetches the current state of the given records.
     *
     * @param objectApiName API name of the object to query
     * @param fieldPaths column field paths to select; inaccessible ones are
     *        skipped, and Id is always included
     * @param recordIds ids to look for
     * @return the records that exist and are visible to the running user
     *
     * @example
     * List<SObject> rows = FlowGridRecordService.fetchRecords(
     *     'Account', new List<String>{ 'Name', 'Industry' },
     *     new List<String>{ '001...' });
     */
    public static List<SObject> fetchRecords(String objectApiName, List<String> fieldPaths, List<String> recordIds) {
        List<SObject> records = new List<SObject>();
        Set<Id> ids = toIdSet(recordIds);
        if (String.isBlank(objectApiName) || ids.isEmpty()) {
            return records;
        }

        Schema.SObjectType token = Schema.getGlobalDescribe().get(objectApiName.trim());
        if (token == null || !token.getDescribe().isAccessible()) {
            return records;
        }

        List<String> selectList = safePaths(objectApiName, fieldPaths);
        // objectApiName and every entry in selectList have been validated against
        // describe, so neither can carry SOQL injected by the caller.
        String soql =
            'SELECT ' +
            String.join(selectList, ', ') +
            ' FROM ' +
            token.getDescribe().getName() +
            ' WHERE Id IN :ids';

        try {
            return Database.queryWithBinds(soql, new Map<String, Object>{ 'ids' => ids }, AccessLevel.USER_MODE);
        } catch (Exception error) {
            // A row the grid cannot re-read is left as it was rather than dropped.
            return records;
        }
    }

    /**
     * Field paths that describe to a readable field, with Id always first.
     *
     * Shared with FlowGridPreviewService so both the design-time sample and the
     * runtime refresh validate identifiers the same way.
     *
     * @param objectApiName API name of the object the paths are rooted in
     * @param fieldPaths requested paths
     * @return validated select list, never empty — Id alone if nothing else passes
     */
    public static List<String> safePaths(String objectApiName, List<String> fieldPaths) {
        List<String> selectList = new List<String>{ 'Id' };
        if (String.isBlank(objectApiName) || fieldPaths == null || fieldPaths.isEmpty()) {
            return selectList;
        }

        Set<String> seen = new Set<String>{ 'id' };
        for (
            FlowGridColumnService.ColumnInfo column : FlowGridColumnService.describeColumns(objectApiName, fieldPaths)
        ) {
            if (column.isAccessible != true || String.isBlank(column.fieldPath)) {
                continue;
            }
            String path = column.fieldPath.trim();
            if (seen.add(path.toLowerCase())) {
                selectList.add(path);
            }
        }
        return selectList;
    }

    /** Filters a list of strings down to the ones that are valid ids. */
    private static Set<Id> toIdSet(List<String> recordIds) {
        Set<Id> ids = new Set<Id>();
        for (String candidate : recordIds == null ? new List<String>() : recordIds) {
            if (String.isBlank(candidate)) {
                continue;
            }
            try {
                ids.add((Id) candidate);
            } catch (Exception ignored) {
                // Not an Id, so it cannot match a record.
            }
        }
        return ids;
    }
}
