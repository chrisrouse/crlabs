/**
 * Flow Grid — custom property editor.
 *
 * Uses the imperative side of the Flow Config Editor Kit rather than
 * `static flowProperties`, for two reasons the kit's own schema layer states:
 *
 *   1. The declarative schema has no Boolean control. `flowConfigEditorSchema`
 *      recognizes only String, Number, SObject, and field; anything else is
 *      normalized to String. Flow Grid has ~25 booleans.
 *   2. `flowConfigEditorForm` renders one flat list. Flow Grid has ~48 editable
 *      properties, which needs grouping.
 *
 * Everything else still comes from the base class: the four Flow Builder inputs,
 * the input and generic-type-mapping events, `applyCollectionChange()`, and
 * `validate()`. No kit code is forked.
 *
 * Controls are defined once in `c/fgrid_propertySchema` and rendered by
 * `c/fgrid_propertyControls`, in both the narrow panel and the Grid Studio modal.
 * This class is the only writer to Flow Builder.
 */
import FlowConfigEditorBase from "c/flowConfigEditorBase";
import { SECTIONS, DEFAULTS, schemaProperties, EDITOR_MANAGED_PROPERTIES } from "c/fgrid_propertySchema";
import { setPopoverHostActive } from "c/flowConfigPopoverUtils";

/** Generic SObject type letter declared in fgrid_flowGrid.js-meta.xml. */
const GENERIC_TYPE = "T";

const MAX_RECORDS_PER_PAGE = 200;

export default class FgridFlowGridEditor extends FlowConfigEditorBase {
    sections = SECTIONS;

    /** Sections open in the narrow panel. */
    initialSections = ["source", "columns"];

    isStudioOpen = false;

    /**
     * Optimistic values, keyed by property.
     *
     * Every getter reads through here before falling back to `input()`. Without
     * it each control's displayed value would wait on Flow Builder republishing
     * `inputVariables`, which makes typing feel laggy and makes a live preview
     * stutter. The kit's own declarative form keeps the same kind of local state
     * (see `handleConfigChange` in flowConfigEditorBase), so this mirrors the
     * pattern rather than inventing one.
     */
    pending = {};

    /* ------------------------------------------------------------------ *
     * Value resolution
     * ------------------------------------------------------------------ */

    /** Saved-or-pending value for a property, with the schema default applied. */
    resolve(name, asReference = false) {
        if (Object.prototype.hasOwnProperty.call(this.pending, name)) {
            const pendingValue = this.pending[name];
            return pendingValue === null || pendingValue === undefined ? (DEFAULTS[name] ?? null) : pendingValue;
        }
        return this.input(name, DEFAULTS[name] ?? null, asReference);
    }

    /** Writes a property and records it optimistically. */
    commit(name, value, dataType = "String") {
        this.pending = { ...this.pending, [name]: value };
        if (value === null || value === undefined) {
            this.clearInput(name, dataType);
        } else {
            this.setInput(name, value, dataType);
        }
    }

    /**
     * Flow Builder republishes `inputVariables` in response to our own change
     * events, so once it does, its copy is authoritative and the optimistic
     * layer can be dropped wholesale.
     */
    configurationChanged(source) {
        super.configurationChanged(source);
        if (source === "inputVariables" && Object.keys(this.pending).length) {
            this.pending = {};
        }
    }

    /**
     * Flat map every control and the preview read from. `records` and
     * `preSelectedRecords` are resolved in `{!Reference}` form because that is
     * what the kit's resource picker expects.
     */
    get values() {
        const referenceProperties = new Set(["records", "preSelectedRecords"]);
        const resolved = {};
        [...schemaProperties(), ...EDITOR_MANAGED_PROPERTIES].forEach((name) => {
            resolved[name] = this.resolve(name, referenceProperties.has(name));
        });
        resolved.objectApiName = this.objectApiName;
        return resolved;
    }

    /** `valueDataType` per property, for the literal-or-reference pickers. */
    get valueDataTypes() {
        const types = {};
        schemaProperties().forEach((name) => {
            types[name] = this.inputDataType(name, null);
        });
        return types;
    }

    /**
     * Object API name every field picker resolves against. Comes from the generic
     * type mapping Flow already persists, with the mirrored String property as a
     * fallback.
     */
    get objectApiName() {
        if (Object.prototype.hasOwnProperty.call(this.pending, "objectApiName")) {
            return this.pending.objectApiName;
        }
        return this.genericType(GENERIC_TYPE, this.input("objectApiName"));
    }

    get hasObject() {
        return Boolean(this.objectApiName);
    }

    get studioButtonLabel() {
        return this.hasObject ? "Open Grid Studio" : "Open Grid Studio (choose records first)";
    }

    /** The flow picker only applies to the Flow row action. */
    get isFlowRowAction() {
        return this.values?.rowActionType === "Flow";
    }

    get columnSummaryVisible() {
        return this.hasObject && Boolean(this.values.columnFields);
    }

    /* ------------------------------------------------------------------ *
     * Change handling
     * ------------------------------------------------------------------ */

    /**
     * Single entry point for both surfaces. Most properties just store; the
     * record collection additionally moves its generic type mapping, the
     * mirrored object name, and everything scoped to the old object.
     */
    handlePropertyChange(event) {
        const { property, value, dataType, resource } = event.detail;
        this.clearError(property);

        if (property === "records") {
            this.applyRecordsChange(value, dataType, resource);
            return;
        }
        this.commit(property, value, dataType || "String");
    }

    applyRecordsChange(newValue, dataType, resource) {
        const transition = this.applyCollectionChange({
            objectProperty: "objectApiName",
            dependentProperty: "columnFields",
            typeName: GENERIC_TYPE,
            newValue,
            objectType: resource?.objectType || null,
            currentObjectType: this.objectApiName,
            dependentValue: this.values.columnFields
        });

        this.commit("records", newValue, dataType || "reference");

        if (transition.changed) {
            // applyCollectionChange already emitted the objectApiName and
            // columnFields writes; mirror them locally and clear what else was
            // scoped to the previous object.
            this.pending = {
                ...this.pending,
                objectApiName: transition.nextObjectType,
                columnFields: null
            };
            this.commit("columnConfig", null, "String");
            this.commit("keyField", "Id", "String");
        }
    }

    handleColumnConfigChange(event) {
        this.commit("columnConfig", event.detail.value, "String");
    }

    /**
     * Flow Builder's transformed ancestors trap a modal's stacking order inside
     * the property panel (see the note in fgrid_flowGridStudio). The Studio
     * elevates its own host, which is the kit's documented remedy; this elevates
     * the editor host too, because the trapping stacking context may sit between
     * the two. Both are reverted on close.
     */
    handleOpenStudio() {
        this.isStudioOpen = true;
        setPopoverHostActive(this.template.host, true);
    }

    handleCloseStudio() {
        this.isStudioOpen = false;
        setPopoverHostActive(this.template?.host, false);
    }

    /* ------------------------------------------------------------------ *
     * Validation
     * ------------------------------------------------------------------ */

    validateConfiguration() {
        const values = this.values;
        const errors = [];

        if (values.isUserDefinedObject) {
            if (!values.recordsJson) {
                errors.push({
                    key: "recordsJson",
                    errorString: "Records (JSON) is required when using a user-defined object."
                });
            }
        } else if (!values.records) {
            errors.push({ key: "records", errorString: "Records is required." });
        }

        if (!values.columnFields) {
            errors.push({ key: "columnFields", errorString: "Select at least one column." });
        }

        if (values.showPagination && this.valueDataTypes.recordsPerPage !== "reference") {
            const perPage = Number(values.recordsPerPage);
            if (!Number.isFinite(perPage) || perPage < 1 || perPage > MAX_RECORDS_PER_PAGE) {
                errors.push({
                    key: "recordsPerPage",
                    errorString: `Records Per Page must be between 1 and ${MAX_RECORDS_PER_PAGE}.`
                });
            }
        }

        if (values.rowActionType !== "None" && values.rowActionDisplay === "Button" && !values.rowActionButtonLabel) {
            errors.push({
                key: "rowActionButtonLabel",
                errorString: "Row Action Button Label is required when the row action is displayed as a button."
            });
        }

        return [...errors, ...this.collectChildValidity(errors)];
    }

    /**
     * Mirrors our errors onto the controls and collects theirs.
     *
     * The inherited `validate()` sweeps `[data-validatable]` in this template and
     * asks `c-flow-config-editor-form` for the rest. Our controls live one shadow
     * root deeper, inside `c-fgrid_property-controls`, so that sweep never reaches
     * them. Redeclaring `validate()` is explicitly off-limits, so this runs from
     * `validateConfiguration()`, which `validate()` calls.
     */
    collectChildValidity(ownErrors) {
        const errorsByKey = new Map(ownErrors.map((error) => [error.key, error.errorString]));
        const collected = [];
        const seen = new Set(errorsByKey.keys());

        const absorb = (results) => {
            (results || []).forEach((error) => {
                if (error?.key && error.errorString && !seen.has(error.key)) {
                    seen.add(error.key);
                    collected.push(error);
                }
            });
        };

        this.template
            .querySelectorAll("c-fgrid_property-controls")
            .forEach((controls) => absorb(controls.collectValidity(errorsByKey)));

        const studio = this.template.querySelector("c-fgrid_flow-grid-studio");
        if (studio) {
            absorb(studio.collectValidity(errorsByKey));
        }
        return collected;
    }
}
