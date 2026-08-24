/**
 * Flow Grid — runtime screen component.
 *
 * PHASE 2 STUB. This holds the full property contract and renders a read-only
 * summary of what the editor saved, so the configuration surface can be reviewed
 * in Flow Builder before any grid rendering or Apex exists.
 *
 * The grid itself, the custom cell types, and DatatableNGController-equivalent
 * Apex all land in a later phase.
 */
import { LightningElement, api } from "lwc";

export default class FgridFlowGrid extends LightningElement {
    // ----- Data source -----
    @api records;
    @api objectApiName;
    @api preSelectedRecords;
    @api keyField = "Id";
    @api isUserDefinedObject = false;
    @api recordsJson;
    @api preSelectedRecordsJson;
    @api isSerializedRecordData = false;
    @api serializedRecordData;

    // ----- Columns -----
    @api columnFields;
    @api columnConfig;

    // ----- Table display -----
    @api showHeader = false;
    @api tableLabel;
    @api tableIcon;
    @api showRecordCount = false;
    @api showSelectedCount = false;
    @api showRowNumbers = false;
    @api tableHeight;
    // Public booleans that default to true are declared uninitialized (@lwc/valid-api:
    // an initialized public boolean makes "unset" indistinguishable from false).
    // The true default lives in the meta; read these through the getters below.
    @api showBorder;
    @api allowOverflow = false;

    // ----- Selection -----
    @api selectionMode = "Multiple";
    @api isRequired = false;
    @api hideClearSelectionButton = false;

    // ----- Search, filter, sort -----
    @api showSearchBar = false;
    @api hideHeaderActions = false;
    @api matchCaseOnFilters = false;
    @api caseInsensitiveSort = false;

    // ----- Pagination -----
    @api showPagination = false;
    @api recordsPerPage;
    @api showFirstLastButtons = false;
    @api maxNumberOfRows;

    // ----- Inline editing -----
    @api suppressBottomBar = false;
    @api navigateNextOnSave = false;

    // ----- Row action -----
    @api rowActionType = "None";
    @api rowActionDisplay = "Icon";
    @api rowActionPosition = "Right";
    @api rowActionLabel;
    @api rowActionIcon;
    @api rowActionColor;
    @api rowActionButtonLabel;
    @api rowActionButtonIcon;
    @api rowActionButtonIconPosition = "Left";
    @api rowActionButtonVariant = "neutral";
    @api maxRemovedRows;

    // ----- Links and formatting -----
    @api showNameFieldLink;
    @api openLinkInSameTab = false;
    @api suppressCurrencyConversion = false;

    // ----- Picklist editing -----
    @api recordTypeId;
    @api showAllPicklistValues = false;
    @api allowNoneToBeChosen;

    @api flowRuntimeApiVersion;

    // ----- Outputs -----
    @api outputSelectedRecords = [];
    @api outputSelectedRecord;
    @api outputEditedRecords = [];
    @api outputRemovedRecords = [];
    @api outputRemainingRecords = [];
    @api outputActionedRecord;
    @api outputSelectedRecordsJson;
    @api outputEditedRecordsJson;
    @api outputRemovedRecordsJson;
    @api outputRemainingRecordsJson;
    @api outputActionedRecordJson;
    @api selectedCount = 0;
    @api editedCount = 0;
    @api removedCount = 0;
    @api selectedRowKey;
    @api sortedBy;
    @api sortDirection;

    /* True-defaulting booleans: undefined means the admin never touched it. */

    get isBordered() {
        return this.showBorder !== false;
    }

    get isNameFieldLinked() {
        return this.showNameFieldLink !== false;
    }

    get isNoneAllowed() {
        return this.allowNoneToBeChosen !== false;
    }

    /** Ordered column field paths the editor persisted, or [] if unset/invalid. */
    get resolvedColumns() {
        return parseJson(this.columnFields, []);
    }

    /** Per-column attribute map the editor persisted, or {} if unset/invalid. */
    get resolvedColumnConfig() {
        return parseJson(this.columnConfig, {});
    }

    get recordCount() {
        return Array.isArray(this.records) ? this.records.length : 0;
    }

    /** Rows for the stub's summary table. */
    get summaryRows() {
        const config = this.resolvedColumnConfig;
        return this.resolvedColumns.map((field, index) => ({
            key: field,
            position: index + 1,
            field,
            attributes: describeAttributes(config[field])
        }));
    }

    get hasColumns() {
        return this.summaryRows.length > 0;
    }

    get sourceSummary() {
        if (this.isUserDefinedObject) {
            return "User-defined object (JSON)";
        }
        return this.objectApiName ? `${this.objectApiName} — ${this.recordCount} record(s)` : "No object selected";
    }
}

/** Tolerates absent or malformed JSON; the editor is the only writer, but the
 *  property is a plain String and a Flow admin can type into it. */
function parseJson(raw, fallback) {
    if (!raw) {
        return fallback;
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function describeAttributes(attributes) {
    if (!attributes || typeof attributes !== "object") {
        return "—";
    }
    const entries = Object.entries(attributes).filter(([, value]) => value !== null && value !== "");
    return entries.length ? entries.map(([key, value]) => `${key}: ${value}`).join(", ") : "—";
}
