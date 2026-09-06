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
import FgridFlowGridStudio from "c/fgrid_flowGridStudio";

/** Generic SObject type letter declared in fgrid_flowGrid.js-meta.xml. */
const GENERIC_TYPE = "T";

const MAX_RECORDS_PER_PAGE = 200;

/** Properties stored as a `{!Reference}` rather than a literal, so they must be
 *  read back in reference form for the kit's resource picker. */
const REFERENCE_PROPERTIES = new Set(["records", "preSelectedRecords"]);

export default class FgridFlowGridEditor extends FlowConfigEditorBase {
    sections = SECTIONS;

    /** Sections open in the narrow panel. */
    initialSections = ["source", "columns"];

    /**
     * The open Studio modal, or null.
     *
     * `lightning/modal` renders outside this template, so the modal cannot be
     * reached with querySelector and `open()` hands back a promise rather than an
     * instance. The Studio passes itself here through its `onReady` callback,
     * which is what keeps `values` flowing down and `collectValidity()` reachable.
     */
    _studio = null;

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
        this.syncStudio();
    }

    /**
     * Retires optimistic values as Flow Builder confirms them, one property at a
     * time.
     *
     * This used to drop `pending` wholesale on any `inputVariables` republish, on
     * the assumption that Flow Builder's copy was then authoritative for
     * everything. It is not: Flow Builder republishes in response to whatever it
     * just processed, so a key it had not yet echoed was thrown away too — and
     * `resolve` then fell through to the schema DEFAULT.
     *
     * The symptom was a value published, wiped a moment later, and re-read as its
     * schema default — most visible on a checkbox defaulting to true, which then
     * could not be unchecked.
     *
     * NOTE: this was NOT the whole story for `showBorder`. That one also declared
     * `default="true"` in the component's meta.xml, which made Flow Builder itself
     * re-assert true; no editor-side change could survive that. The declared
     * defaults were removed for the four affected booleans. This fix stands on its
     * own — the race it closes is real — but do not expect it to rescue a property
     * whose contract declares a default.
     *
     * A pending entry is therefore retired on PRESENCE, not on matching values: as
     * soon as Flow Builder publishes the property at all, its copy wins, whatever
     * it says. Only keys it has not mentioned are held on to.
     *
     * Presence rather than equality matters in both directions. Equality would make
     * the editor ignore Flow Builder whenever it legitimately reports something
     * different — a value it transformed, or an edit from elsewhere — which is the
     * whole reason the original cleared wholesale.
     */
    configurationChanged(source) {
        super.configurationChanged(source);
        if (source !== "inputVariables" || !Object.keys(this.pending).length) {
            return;
        }
        const remaining = {};
        Object.keys(this.pending).forEach((name) => {
            if (!this.inputVariable(name)) {
                remaining[name] = this.pending[name];
            }
        });
        this.pending = remaining;
        this.syncStudio();
    }

    /**
     * Flat map every control and the preview read from. `records` and
     * `preSelectedRecords` are resolved in `{!Reference}` form because that is
     * what the kit's resource picker expects.
     */
    get values() {
        const resolved = {};
        [...schemaProperties(), ...EDITOR_MANAGED_PROPERTIES].forEach((name) => {
            resolved[name] = this.resolve(name, REFERENCE_PROPERTIES.has(name));
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
     * Opens the Studio as the platform's own modal.
     *
     * It used to render as a child of this template, where Flow Builder's
     * transformed ancestors let the screen canvas paint over it and no amount of
     * z-index or host elevation could stop it. `lightning/modal` renders in the
     * platform overlay container instead, outside those ancestors, which fixes it;
     * see the note at the top of fgrid_flowGridStudio.
     *
     * Relays come in as callbacks rather than events, because a modal's events do
     * not reach the component that opened it.
     */
    connectedCallback() {
        super.connectedCallback?.();
        this.startAnchorWatch();
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        this.stopAnchorWatch();
    }

    async handleOpenStudio() {
        await FgridFlowGridStudio.open({
            size: "large",
            description: "Grid Studio, the full configuration workspace for Flow Grid",
            sections: this.sections,
            values: this.values,
            valueDataTypes: this.valueDataTypes,
            objectApiName: this.objectApiName,
            validationErrors: this.validationErrors,
            builderContext: this.builderContext,
            automaticOutputVariables: this.automaticOutputVariables,
            apiVersion: this.apiVersion,
            notifyPropertyChange: (detail) => this.handlePropertyChange({ detail }),
            notifyColumnConfigChange: (detail) => this.handleColumnConfigChange({ detail }),
            notifyReady: (studio) => {
                this._studio = studio;
            }
        });
        this._studio = null;
    }

    /**
     * Pushes freshly committed values into the open Studio.
     *
     * As a template child the Studio picked these up through reactive props. A
     * modal's props are assigned once, at open, so the writes have to be repeated
     * by hand every time this editor changes something -- including its own
     * side-effect commits, such as clearing columnConfig when the object changes.
     */
    syncStudio() {
        if (!this._studio) {
            return;
        }
        this._studio.values = this.values;
        this._studio.valueDataTypes = this.valueDataTypes;
        this._studio.objectApiName = this.objectApiName;
        this._studio.validationErrors = this.validationErrors;
    }

    /* ------------------------------------------------------------------ *
     * Kit picker popovers
     * ------------------------------------------------------------------ */

    _anchorFrame = null;
    _anchorSignature = "";

    /**
     * Keeps an open kit picker's dropdown attached to its field.
     *
     * The pickers render their dropdown `position: fixed` at coordinates they
     * compute themselves -- inside a `lightning-accordion-section`, which is where
     * our controls live, that is the same choice `lightning-base-combobox` makes,
     * so it is correct rather than a mistake. They then reposition from a
     * capture-phase `scroll` listener on `window`, and THAT is the gap: `scroll` is
     * not composed, so it never crosses a shadow boundary. Neither our own
     * scrolling panes nor Flow Builder's property panel -- whose scroller sits
     * inside Flow Builder's shadow root -- can be observed that way. Confirmed in a
     * browser: a capture-phase `scroll` listener on `document` logs nothing at all
     * while that panel scrolls.
     *
     * So this stops trying to observe scrollers and watches the result instead. One
     * probe rect per animation frame; when it moves, tell the kit that something
     * changed and let it recompute from its own anchor. That covers a scroll
     * wherever it happens, and anything else that moves the anchor -- a transform,
     * an animation, a layout shift -- and it never reaches outside this component,
     * so no Lightning Web Security question arises.
     *
     * A single probe is enough because everything in a scroller moves together, and
     * the kit only needs to be told THAT something moved, not what.
     *
     * Native comboboxes track their field this way too, including following it out
     * of view rather than clamping. Verified against a standard Salesforce
     * component's picklist, 2026-09-06.
     *
     * Deliberately not a change to the vendored kit, which VENDOR.md forbids
     * editing so the copy stays diffable. The general fix belongs upstream -- a
     * per-frame check inside `createPopoverViewportController`, six lines, no picker
     * changes -- and is recorded in STATUS with a reproduction at
     * `repro/picker-popover-scroll`.
     */
    startAnchorWatch() {
        if (this._anchorFrame !== null || typeof window.requestAnimationFrame !== "function") {
            return;
        }
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._anchorFrame = window.requestAnimationFrame(this.checkAnchors);
    }

    stopAnchorWatch() {
        if (this._anchorFrame !== null) {
            window.cancelAnimationFrame(this._anchorFrame);
            this._anchorFrame = null;
        }
    }

    checkAnchors = () => {
        this._anchorFrame = null;
        const probe = this.template.querySelector("c-fgrid_property-controls");
        if (probe) {
            const rect = probe.getBoundingClientRect();
            const signature = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}`;
            if (this._anchorSignature && signature !== this._anchorSignature) {
                // CustomEvent rather than Event only to satisfy the lint rule; a
                // listener keys on the event TYPE, not the interface.
                window.dispatchEvent(new CustomEvent("scroll"));
            }
            this._anchorSignature = signature;
        }
        this.startAnchorWatch();
    };

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

        if (values.rowLoading === "Paginate" && this.valueDataTypes.recordsPerPage !== "reference") {
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

        if (this._studio) {
            absorb(this._studio.collectValidity(errorsByKey));
        }
        return collected;
    }
}
