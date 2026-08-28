/**
 * Renders one section of Flow Grid's configuration, from the descriptors in
 * `c/fgrid_propertySchema`.
 *
 * Rendered by both the narrow Flow Builder panel and the wide Grid Studio modal.
 * Neither owns a control definition, so the two surfaces cannot drift.
 *
 * This component is deliberately dumb: it renders values it is handed and emits
 * one normalized `propertychange` event. Deciding what a change means — moving a
 * generic type mapping, clearing dependents — stays in the editor.
 */
import { LightningElement, api } from "lwc";
import { resolveSection, DATA_TYPE_FOR, CONTROL } from "c/fgrid_propertySchema";

export default class FgridPropertyControls extends LightningElement {
    /** Section descriptor from SECTIONS. */
    @api section;

    /** Flat map of property name to current value. */
    @api values = {};

    /** Flow `valueDataType` per property, for literal-or-reference pickers.
     *  Named `valueDataTypes`, not `dataTypes`: an @api named `dataTypes` maps to
     *  the `data-types` attribute, which collides with HTML dataset handling. The
     *  kit's own form avoids this the same way. */
    @api valueDataTypes = {};

    /** Object the field pickers resolve against. */
    @api objectApiName;

    /* Flow Builder context, forwarded to every kit picker. */
    @api builderContext;
    @api automaticOutputVariables;
    @api apiVersion;

    get controls() {
        if (!this.section) {
            return [];
        }
        return resolveSection(this.section, this.values || {}).map((control) => ({
            ...control,
            dataType: this.valueDataTypes?.[control.property] ?? null
        }));
    }

    get hasControls() {
        return this.controls.length > 0;
    }

    /* ------------------------------------------------------------------ *
     * Handlers — each normalizes to one outbound event
     * ------------------------------------------------------------------ */

    handleCheckbox(event) {
        this.publish(event.target.dataset.property, event.target.checked, DATA_TYPE_FOR[CONTROL.CHECKBOX]);
    }

    /**
     * A whole number, or nothing.
     *
     * Blank clears the property rather than storing 0, because 0 and "not set" mean
     * different things here — a minimum of 0 is a deliberate "no minimum", while a
     * blank field is an unanswered question. Negatives and fractions are discarded;
     * the input's own `min` and `step` report them, and this makes sure a value that
     * slips past cannot reach the property.
     */
    handleInteger(event) {
        const raw = event.target.value;
        const property = event.target.dataset.property;
        if (raw === "" || raw === null || raw === undefined) {
            this.publish(property, null, DATA_TYPE_FOR[CONTROL.INTEGER]);
            return;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
            return;
        }
        // Published as a STRING, matching what the kit's number input sends. Flow
        // stores a literal as text and declares the property as Integer, so it coerces
        // on the way into the component.
        this.publish(property, String(Math.trunc(parsed)), DATA_TYPE_FOR[CONTROL.INTEGER]);
    }

    handleSelect(event) {
        this.publish(event.target.dataset.property, event.detail.value, DATA_TYPE_FOR[CONTROL.SELECT]);
    }

    /** `c-flow-config-value-input` carries its own data type; the admin may have
     *  supplied a Flow reference instead of a literal. */
    handleValue(event) {
        const { name, newValue, newValueDataType } = event.detail;
        this.publish(name, newValue, newValueDataType);
    }

    handleIcon(event) {
        this.publish(event.target.dataset.property, event.detail.value, DATA_TYPE_FOR[CONTROL.ICON]);
    }

    handleResource(event) {
        const { name, newValue, newValueDataType, resource } = event.detail;
        this.publish(name, newValue, newValueDataType || DATA_TYPE_FOR[CONTROL.RESOURCE], resource);
    }

    /** The flow picker already emits the normalized shape; pass it straight on. */
    handleFlowConfig(event) {
        event.stopPropagation();
        this.publish(event.detail.property, event.detail.value, event.detail.dataType || "String");
    }

    handleField(event) {
        const { name, newValue } = event.detail;
        this.publish(name, newValue, DATA_TYPE_FOR[CONTROL.FIELD]);
    }

    publish(property, value, dataType, resource = null) {
        this.dispatchEvent(
            new CustomEvent("propertychange", {
                detail: { property, value, dataType, resource }
            })
        );
    }

    /**
     * Lets the editor's inherited validate() reach controls that live in this
     * shadow root. Mirrors the pattern the kit's own form uses.
     */
    @api
    collectValidity(errorsByKey) {
        const found = [];
        this.template.querySelectorAll("[data-validatable]").forEach((control) => {
            const key = control.dataset.property;
            control.setCustomValidity?.(errorsByKey.get(key) || "");
            control.reportValidity?.();
            if (control.validationMessage && !errorsByKey.has(key)) {
                found.push({ key, errorString: control.validationMessage });
            }
        });
        return found;
    }
}
