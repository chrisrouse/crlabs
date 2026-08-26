/**
 * Resolves Salesforce field metadata into the column facts Flow Grid needs to
 * render a `lightning-datatable`.
 *
 * This is the describe half of Flow Grid's Apex. It holds no `@AuraEnabled`
 * entry points — `FlowGridController` owns those — so the logic here stays
 * unit-testable without an Aura context.
 *
 * It replaces the type inference in `fgrid_gridModel.inferType`, which guesses
 * from field API names because no describe was available during design time.
 * The Grid Studio preview keeps using that guess; the runtime uses this.
 *
 * All describe access is filtered by the running user's field-level security:
 * a field the user cannot read is returned marked inaccessible rather than
 * silently omitted, so the caller can report it instead of showing a blank
 * column.
 *
 * @see FlowGridController
 */
public with sharing class FlowGridColumnService {
    /** Maximum relationship hops in a field path, matching the kit's field picker. */
    @TestVisible
    private static final Integer MAX_RELATIONSHIP_DEPTH = 5;

    /** Datatable type used when a field's display type has no better match. */
    private static final String DEFAULT_TYPE = 'text';

    /**
     * Display types a `lightning-datatable` cell cannot meaningfully edit,
     * regardless of whether the field itself is updateable.
     *
     * MULTIPICKLIST and REFERENCE were both here and have been removed: Flow Grid
     * now ships a checkbox-group editor for the first and a record picker for the
     * second. REFERENCE is still refused case by case, in `isEditable`, when the
     * lookup is polymorphic.
     *
     * NOTE: this set only decides the DEFAULT. `buildColumns` resolves editability
     * as `attributes.edit ?? (isEditable && defaultEditable)`, so an explicit
     * `edit` in a column's config overrides everything here. Adding a type back to
     * this set therefore hides it from the default, but does not prevent an admin
     * from turning editing on — which is exactly how a lookup used to end up with a
     * free-text box for an 18-character Id.
     */
    private static final Set<Schema.DisplayType> NON_EDITABLE_TYPES = new Set<Schema.DisplayType>{
        Schema.DisplayType.ADDRESS,
        Schema.DisplayType.ANYTYPE,
        Schema.DisplayType.BASE64,
        Schema.DisplayType.DATACATEGORYGROUPREFERENCE,
        Schema.DisplayType.ENCRYPTEDSTRING,
        Schema.DisplayType.ID,
        Schema.DisplayType.LOCATION,
        // The datatable itself refuses to inline-edit these: "Inline editing is not
        // supported for date and location fields." Without them here, isEditable
        // said true, the column config offered Edit, and the cell rendered a pencil
        // that silently did nothing.
        Schema.DisplayType.DATE,
        Schema.DisplayType.DATETIME,
        Schema.DisplayType.TIME
    };

    /** Object-level facts the grid header and record links need. */
    public class ObjectInfo {
        @AuraEnabled
        public String apiName;
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String pluralLabel;
        @AuraEnabled
        public String iconName;
        @AuraEnabled
        public String nameField;
        @AuraEnabled
        public Boolean isAccessible;
    }

    /** One selectable value of a picklist column, for the inline-edit cell. */
    public class PicklistOption {
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String value;

        private PicklistOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }

    /** Everything the grid needs about one column. */
    public class ColumnInfo {
        @AuraEnabled
        public String fieldPath;
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String dataType;
        @AuraEnabled
        public String displayType;
        @AuraEnabled
        public Boolean isEditable;
        @AuraEnabled
        public Boolean isSortable;
        @AuraEnabled
        public Boolean isNameField;
        @AuraEnabled
        public Boolean isAccessible;
        @AuraEnabled
        public Integer scale;
        @AuraEnabled
        public List<PicklistOption> picklistOptions;
        /** Sole target object of a lookup, or null when there is none or several. */
        @AuraEnabled
        public String referenceTo;
        /** Relationship name of a lookup, e.g. `Account` for `AccountId`. Lets the
         *  grid read the parent's name from a record that already carries it. */
        @AuraEnabled
        public String relationshipName;
        /** True for a lookup pointing at more than one object, which no single
         *  record picker can edit. */
        @AuraEnabled
        public Boolean isPolymorphic;
        @AuraEnabled
        public String errorMessage;
    }

    /**
     * Describes an SObject for the grid header and record links.
     *
     * @param objectApiName API name of the object, for example `Account`
     * @return object facts; `isAccessible` is false when the object does not
     *         exist or the user cannot read it
     *
     * @example
     * FlowGridColumnService.ObjectInfo info =
     *     FlowGridColumnService.describeObject('Account');
     * System.debug(info.iconName); // standard:account
     */
    public static ObjectInfo describeObject(String objectApiName) {
        ObjectInfo info = new ObjectInfo();
        info.apiName = objectApiName;
        info.isAccessible = false;

        Schema.DescribeSObjectResult describe = objectDescribe(objectApiName);
        if (describe == null || !describe.isAccessible()) {
            return info;
        }

        info.label = describe.getLabel();
        info.pluralLabel = describe.getLabelPlural();
        info.iconName = iconFor(describe);
        info.nameField = nameFieldOf(describe);
        info.isAccessible = true;
        return info;
    }

    /**
     * Describes each requested field path, preserving the caller's order.
     *
     * Bulk by design: the grid asks once for every column rather than per field,
     * so a wide grid costs one call instead of one per column.
     *
     * @param objectApiName API name of the object the paths are rooted in
     * @param fieldPaths ordered field API names, optionally with relationship
     *        hops such as `Owner.Alias`
     * @return one entry per requested path, in the same order
     *
     * @example
     * List<ColumnInfo> columns = FlowGridColumnService.describeColumns(
     *     'Account', new List<String>{ 'Name', 'Owner.Alias', 'AnnualRevenue' });
     */
    public static List<ColumnInfo> describeColumns(String objectApiName, List<String> fieldPaths) {
        List<ColumnInfo> columns = new List<ColumnInfo>();
        if (fieldPaths == null || fieldPaths.isEmpty()) {
            return columns;
        }

        Schema.DescribeSObjectResult rootDescribe = objectDescribe(objectApiName);
        if (rootDescribe == null || !rootDescribe.isAccessible()) {
            for (String path : fieldPaths) {
                columns.add(inaccessibleColumn(path, 'Object ' + objectApiName + ' is not accessible.'));
            }
            return columns;
        }

        String nameField = nameFieldOf(rootDescribe);
        for (String path : fieldPaths) {
            columns.add(describeColumn(rootDescribe, path, nameField));
        }
        return columns;
    }

    /**
     * Resolves one field path, walking relationship hops from the root object.
     *
     * @param rootDescribe describe of the object the path starts from
     * @param fieldPath field API name, optionally dotted
     * @param nameField the root object's Name field, to flag the link column
     * @return column facts, or an inaccessible entry carrying the reason
     */
    private static ColumnInfo describeColumn(
        Schema.DescribeSObjectResult rootDescribe,
        String fieldPath,
        String nameField
    ) {
        if (String.isBlank(fieldPath)) {
            return inaccessibleColumn(fieldPath, 'Field path is blank.');
        }

        List<String> segments = fieldPath.trim().split('\\.');
        if (segments.size() > MAX_RELATIONSHIP_DEPTH) {
            return inaccessibleColumn(
                fieldPath,
                'Field path exceeds the maximum relationship depth of ' + MAX_RELATIONSHIP_DEPTH + '.'
            );
        }

        Schema.DescribeSObjectResult currentObject = rootDescribe;
        Schema.DescribeFieldResult field = null;

        for (Integer index = 0; index < segments.size(); index++) {
            Boolean isLast = (index == segments.size() - 1);
            String segment = segments[index];
            Map<String, Schema.SObjectField> fields = currentObject.fields.getMap();

            Schema.SObjectField token = isLast ? fields.get(segment) : resolveRelationship(fields, segment);
            if (token == null) {
                return inaccessibleColumn(
                    fieldPath,
                    'Field ' + segment + ' does not exist on ' + currentObject.getName() + '.'
                );
            }

            field = token.getDescribe();
            if (!field.isAccessible()) {
                return inaccessibleColumn(fieldPath, 'You do not have access to ' + field.getName() + '.');
            }

            if (!isLast) {
                List<Schema.SObjectType> targets = field.getReferenceTo();
                if (targets == null || targets.isEmpty()) {
                    return inaccessibleColumn(fieldPath, segment + ' is not a relationship.');
                }
                // A polymorphic relationship exposes several targets. Take the
                // first accessible one; resolving by the next segment would need
                // to describe every target, which is not worth the describe cost.
                currentObject = firstAccessible(targets);
                if (currentObject == null) {
                    return inaccessibleColumn(fieldPath, 'No accessible target for relationship ' + segment + '.');
                }
            }
        }

        return buildColumn(fieldPath, field, nameField, segments.size() == 1);
    }

    /** Assembles the column facts for a resolved field. */
    private static ColumnInfo buildColumn(
        String fieldPath,
        Schema.DescribeFieldResult field,
        String nameField,
        Boolean isDirectField
    ) {
        ColumnInfo column = new ColumnInfo();
        column.fieldPath = fieldPath;
        column.label = field.getLabel();
        column.displayType = field.getType().name();
        column.dataType = datatableType(field);
        column.isSortable = field.isSortable();
        column.isAccessible = true;
        column.isNameField = isDirectField && field.getName() == nameField;
        column.scale = scaleOf(field);
        applyLookupFacts(column, field);
        column.isEditable = isEditable(field);
        column.picklistOptions = picklistOptionsOf(field);
        return column;
    }

    /**
     * Maps a Salesforce display type to a `lightning-datatable` column type.
     *
     * Picklists deliberately map to `text`: the datatable has no picklist type,
     * and Flow Grid renders its own combobox cell for editing using
     * `picklistOptions`.
     */
    @TestVisible
    private static String datatableType(Schema.DescribeFieldResult field) {
        switch on field.getType() {
            when BOOLEAN {
                return 'boolean';
            }
            when CURRENCY {
                return 'currency';
            }
            when DATE {
                return 'date-local';
            }
            when DATETIME {
                return 'date';
            }
            when DOUBLE, INTEGER, LONG {
                return 'number';
            }
            when PERCENT {
                return 'percent';
            }
            when EMAIL {
                return 'email';
            }
            when PHONE {
                return 'phone';
            }
            when URL {
                return 'url';
            }
            when else {
                return DEFAULT_TYPE;
            }
        }
    }

    /** True when the field can be edited in a datatable cell. */
    @TestVisible
    private static Boolean isEditable(Schema.DescribeFieldResult field) {
        if (!field.isUpdateable() || field.isCalculated() || field.isAutoNumber()) {
            return false;
        }
        if (NON_EDITABLE_TYPES.contains(field.getType())) {
            return false;
        }
        // A lookup is editable through a record picker, which searches exactly one
        // object. A polymorphic field has no single object to search, and guessing
        // the first target would offer the wrong list for a value that may point
        // somewhere else entirely.
        if (field.getType() == Schema.DisplayType.REFERENCE) {
            List<Schema.SObjectType> targets = field.getReferenceTo();
            return targets != null && targets.size() == 1;
        }
        // Long text and rich text are reported as non-sortable TEXTAREA fields
        // and cannot be edited inline.
        if (field.getType() == Schema.DisplayType.TEXTAREA && !field.isSortable()) {
            return false;
        }
        return true;
    }

    /** Decimal places for numeric columns; null where scale is meaningless. */
    private static Integer scaleOf(Schema.DescribeFieldResult field) {
        switch on field.getType() {
            when CURRENCY, DOUBLE, PERCENT {
                return field.getScale();
            }
            when else {
                return null;
            }
        }
    }

    /**
     * Records what the grid needs to show and edit a lookup.
     *
     * `referenceTo` is populated only for a single-target lookup, because a record
     * picker searches one object. A polymorphic field — `OwnerId`, `WhoId`,
     * `WhatId` — is flagged instead, so the editor can say why it is read-only
     * rather than appearing to ignore the setting.
     *
     * `relationshipName` is what lets the parent's name be displayed without a
     * query: `AccountId` carries relationship `Account`, so a record that already
     * holds `Account.Name` can be read directly.
     */
    private static void applyLookupFacts(ColumnInfo column, Schema.DescribeFieldResult field) {
        if (field.getType() != Schema.DisplayType.REFERENCE) {
            return;
        }
        column.relationshipName = field.getRelationshipName();

        List<Schema.SObjectType> targets = field.getReferenceTo();
        if (targets == null || targets.isEmpty()) {
            return;
        }
        column.isPolymorphic = targets.size() > 1;
        if (targets.size() == 1) {
            column.referenceTo = targets[0].getDescribe().getName();
        }
    }

    /** Active picklist values, or null for a non-picklist field. */
    private static List<PicklistOption> picklistOptionsOf(Schema.DescribeFieldResult field) {
        if (field.getType() != Schema.DisplayType.PICKLIST && field.getType() != Schema.DisplayType.MULTIPICKLIST) {
            return null;
        }
        List<PicklistOption> options = new List<PicklistOption>();
        for (Schema.PicklistEntry entry : field.getPicklistValues()) {
            if (entry.isActive()) {
                options.add(new PicklistOption(entry.getLabel(), entry.getValue()));
            }
        }
        return options;
    }

    /**
     * Finds the field token for a relationship segment.
     *
     * A path uses the relationship name (`Owner`, `Account__r`) while the field
     * map is keyed by the field name (`OwnerId`, `Account__c`), so match on the
     * relationship name and fall back to the raw segment.
     */
    private static Schema.SObjectField resolveRelationship(Map<String, Schema.SObjectField> fields, String segment) {
        for (Schema.SObjectField token : fields.values()) {
            Schema.DescribeFieldResult candidate = token.getDescribe();
            String relationshipName = candidate.getRelationshipName();
            if (String.isNotBlank(relationshipName) && relationshipName.equalsIgnoreCase(segment)) {
                return token;
            }
        }
        return fields.get(segment);
    }

    /** First readable target of a (possibly polymorphic) relationship. */
    private static Schema.DescribeSObjectResult firstAccessible(List<Schema.SObjectType> targets) {
        for (Schema.SObjectType target : targets) {
            Schema.DescribeSObjectResult describe = target.getDescribe();
            if (describe.isAccessible()) {
                return describe;
            }
        }
        return null;
    }

    /** Describe for an object API name, or null when it does not exist. */
    private static Schema.DescribeSObjectResult objectDescribe(String objectApiName) {
        if (String.isBlank(objectApiName)) {
            return null;
        }
        Schema.SObjectType token = Schema.getGlobalDescribe().get(objectApiName.trim());
        return token == null ? null : token.getDescribe();
    }

    /** The object's Name field, used to flag the record-link column. */
    private static String nameFieldOf(Schema.DescribeSObjectResult describe) {
        for (Schema.SObjectField token : describe.fields.getMap().values()) {
            Schema.DescribeFieldResult field = token.getDescribe();
            if (field.isNameField()) {
                return field.getName();
            }
        }
        return null;
    }

    /**
     * SLDS icon for an object, taken from its tab.
     *
     * Custom objects fall back to `standard:record` because a custom tab's icon
     * is not expressible as an SLDS icon name.
     */
    private static String iconFor(Schema.DescribeSObjectResult describe) {
        String apiName = describe.getName();
        if (describe.isCustom()) {
            return 'standard:record';
        }
        return 'standard:' + apiName.toLowerCase();
    }

    /** A column entry carrying why the field could not be used. */
    private static ColumnInfo inaccessibleColumn(String fieldPath, String message) {
        ColumnInfo column = new ColumnInfo();
        column.fieldPath = fieldPath;
        column.label = fieldPath;
        column.dataType = DEFAULT_TYPE;
        column.isAccessible = false;
        column.isEditable = false;
        column.isSortable = false;
        column.isNameField = false;
        column.errorMessage = message;
        return column;
    }
}
