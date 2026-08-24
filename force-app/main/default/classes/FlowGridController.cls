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
        if (String.isBlank(objectApiName)) {
            throw new AuraHandledException('An object API name is required.');
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
}
