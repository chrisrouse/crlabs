/**
 * Fetches a handful of real records so the Grid Studio preview shows the admin
 * their actual data instead of fabricated rows.
 *
 * Design-time only. The runtime never calls this — it renders the collection the
 * Flow already supplies. At design time there is no collection yet, only a Flow
 * reference such as `{!Get_Accounts}`, so the preview has to read a sample
 * itself.
 *
 * SECURITY. The field paths arrive from the property editor, so they are treated
 * as untrusted input: every path is resolved through `FlowGridColumnService` and
 * dropped unless it describes to an accessible field. Only validated paths reach
 * the query string, and the query runs in user mode, so a preview can never show
 * an admin data they could not query themselves.
 *
 * @see FlowGridColumnService
 * @see FlowGridController
 */
public with sharing class FlowGridPreviewService {
    /** Hard ceiling on preview rows, whatever the caller asks for. */
    @TestVisible
    private static final Integer MAX_PREVIEW_ROWS = 10;

    /** Rows returned when the caller does not specify. */
    private static final Integer DEFAULT_PREVIEW_ROWS = 6;

    /**
     * Queries a sample of records for the preview.
     *
     * @param objectApiName API name of the object to sample
     * @param fieldPaths requested column paths; inaccessible ones are skipped
     * @param recordLimit desired row count, clamped to 1..MAX_PREVIEW_ROWS
     * @return matching records, or an empty list when nothing can be queried
     *
     * @example
     * List<SObject> sample = FlowGridPreviewService.queryPreviewRecords(
     *     'Account', new List<String>{ 'Name', 'Industry' }, 6);
     */
    public static List<SObject> queryPreviewRecords(
        String objectApiName,
        List<String> fieldPaths,
        Integer recordLimit
    ) {
        if (String.isBlank(objectApiName) || fieldPaths == null || fieldPaths.isEmpty()) {
            return new List<SObject>();
        }
        // Same validation the runtime refresh uses, so a path that is unsafe in
        // one place cannot be safe in the other.
        List<String> safePaths = FlowGridRecordService.safePaths(objectApiName, fieldPaths);
        if (safePaths.size() < 2) {
            // Only Id survived, so there is nothing worth previewing.
            return new List<SObject>();
        }

        Integer rowLimit = clampLimit(recordLimit);
        // objectApiName and every entry in safePaths have been validated against
        // describe above, so neither can carry SOQL injected by the caller.
        String soql = 'SELECT ' + String.join(safePaths, ', ') + ' FROM ' + objectApiName.trim() + ' LIMIT ' + rowLimit;

        try {
            return Database.query(soql, AccessLevel.USER_MODE);
        } catch (Exception error) {
            // A preview is a convenience. If the query cannot run, the caller
            // falls back to fabricated rows rather than failing the editor.
            return new List<SObject>();
        }
    }

    /** Keeps the row count inside a sane range regardless of the request. */
    private static Integer clampLimit(Integer requested) {
        if (requested == null || requested <= 0) {
            return DEFAULT_PREVIEW_ROWS;
        }
        return Math.min(requested, MAX_PREVIEW_ROWS);
    }
}
