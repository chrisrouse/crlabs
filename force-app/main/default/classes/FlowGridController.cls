/**
 * Aura-enabled entry points for the Flow Grid runtime component.
 *
 * Deliberately thin: every describe decision lives in `FlowGridColumnService`,
 * so this class only validates input, delegates, and shapes the response. That
 * keeps the describe logic testable without an Aura context and keeps both
 * classes well inside the 500-line limit.
 *
 * Returns typed objects rather than a serialized JSON string. The component this
 * replaces returned `String` from every method because its inner wrapper classes
 * carried no `@AuraEnabled` annotations and so could not be serialized; the DTOs
 * in `FlowGridColumnService` are annotated, so the platform handles it.
 *
 * @see FlowGridColumnService
 */
public with sharing class FlowGridController {
    /** Bundle of everything the grid needs to build its columns in one call. */
    public class GridMetadata {
        @AuraEnabled
        public FlowGridColumnService.ObjectInfo objectInfo;
        @AuraEnabled
        public List<FlowGridColumnService.ColumnInfo> columns;
    }

    /**
     * Describes an object and its selected columns in a single round trip.
     *
     * Cacheable: field metadata does not change within a Flow interview, so the
     * component can wire this and let Lightning Data Service cache it.
     *
     * @param objectApiName API name of the grid's object
     * @param fieldPaths ordered column field paths, as persisted in the
     *        component's `columnFields` property (a JSON array of API names)
     * @return object facts plus one column entry per requested path
     * @throws AuraHandledException when the object API name is blank
     *
     * @example
     * // In the LWC:
     * // import getGridMetadata from
     * //   '@salesforce/apex/FlowGridController.getGridMetadata';
     * // getGridMetadata({ objectApiName: 'Account',
     * //                   fieldPaths: ['Name', 'AnnualRevenue'] });
     */
    @AuraEnabled(cacheable=true)
    public static GridMetadata getGridMetadata(String objectApiName, List<String> fieldPaths) {
        // A wired Apex call fires even while its reactive parameters are still
        // undefined, so a blank object name is an ordinary not-ready state, not
        // an error. Report it the same way an unknown object is reported rather
        // than throwing and flashing an error banner on first render.
        if (String.isBlank(objectApiName)) {
            GridMetadata empty = new GridMetadata();
            empty.objectInfo = FlowGridColumnService.describeObject(objectApiName);
            empty.columns = new List<FlowGridColumnService.ColumnInfo>();
            return empty;
        }

        try {
            GridMetadata metadata = new GridMetadata();
            metadata.objectInfo = FlowGridColumnService.describeObject(objectApiName);
            metadata.columns = FlowGridColumnService.describeColumns(objectApiName, fieldPaths);
            return metadata;
        } catch (Exception error) {
            // Surface the reason to the admin; the raw stack trace is not useful
            // in a Flow screen and may leak metadata names.
            throw new AuraHandledException('Unable to describe ' + objectApiName + ': ' + error.getMessage());
        }
    }

    /**
     * Sample records for the Grid Studio preview.
     *
     * Design-time only, so deliberately NOT cacheable: an admin adding a column
     * expects the preview to refresh, not to serve a stale sample.
     *
     * @param objectApiName API name of the object to sample
     * @param fieldPaths requested column paths; inaccessible ones are skipped
     * @param recordLimit desired row count, clamped by the service
     * @return real records, or an empty list when none can be queried, in which
     *         case the caller falls back to fabricated rows
     */
    @AuraEnabled
    public static List<SObject> getPreviewRecords(String objectApiName, List<String> fieldPaths, Integer recordLimit) {
        if (String.isBlank(objectApiName)) {
            return new List<SObject>();
        }
        try {
            return FlowGridPreviewService.queryPreviewRecords(objectApiName, fieldPaths, recordLimit);
        } catch (Exception error) {
            throw new AuraHandledException('Unable to load preview records: ' + error.getMessage());
        }
    }

    /**
     * Active flows, for the row-action flow picker.
     *
     * Includes flows that cannot be launched, tagged with a null launch mode, so
     * the editor can explain the exclusions instead of silently hiding them.
     *
     * @return every active flow, ordered by label
     */
    @AuraEnabled(cacheable=true)
    public static List<FlowGridFlowService.FlowSummary> getFlows() {
        try {
            return FlowGridFlowService.listFlows();
        } catch (Exception error) {
            throw new AuraHandledException('Unable to list flows: ' + error.getMessage());
        }
    }

    /**
     * Runs an autolaunched flow for a row action and returns its outputs.
     *
     * Not cacheable: this performs work, and the same row may be actioned twice.
     *
     * @param flowApiName API name of the autolaunched flow
     * @param objectApiName object type of the record being passed
     * @param recordJson the clicked record, serialized
     * @param recordVariable flow input variable receiving the record
     * @param idVariable flow input variable receiving the record Id
     * @param recordId the clicked record's Id
     * @return the flow's output variables, keyed by API name
     */
    @AuraEnabled
    public static Map<String, Object> runFlow(
        String flowApiName,
        String objectApiName,
        String recordJson,
        String recordVariable,
        String idVariable,
        String recordId
    ) {
        try {
            return FlowGridFlowService.runFlow(
                flowApiName,
                objectApiName,
                recordJson,
                recordVariable,
                idVariable,
                recordId
            );
        } catch (Exception error) {
            throw new AuraHandledException('The flow ' + flowApiName + ' did not run: ' + error.getMessage());
        }
    }

    /**
     * Reports which of the given records still exist.
     *
     * Used after a row action, because a launched flow can delete the record it
     * was handed and the grid holds only an in-memory copy.
     *
     * @param objectApiName API name of the object to check
     * @param recordIds ids to look for
     * @return the subset that still exists and is visible to the running user
     */
    @AuraEnabled
    public static List<String> getExistingRecordIds(String objectApiName, List<String> recordIds) {
        try {
            return FlowGridRecordService.findExistingIds(objectApiName, recordIds);
        } catch (Exception error) {
            throw new AuraHandledException('Unable to verify records: ' + error.getMessage());
        }
    }

    /**
     * Variables declared by a flow, so the editor can map the grid's record and
     * Id onto the variables that flow actually has.
     *
     * @param flowApiName API name of the flow to inspect
     * @return its variables, or an empty list when there are none to report
     */
    @AuraEnabled(cacheable=true)
    public static List<FlowGridFlowService.FlowVariable> getFlowVariables(String flowApiName) {
        if (String.isBlank(flowApiName)) {
            return new List<FlowGridFlowService.FlowVariable>();
        }
        try {
            return FlowGridFlowService.listFlowVariables(flowApiName);
        } catch (Exception error) {
            throw new AuraHandledException('Unable to read variables for ' + flowApiName + ': ' + error.getMessage());
        }
    }
}
