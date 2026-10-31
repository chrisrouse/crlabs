import { LightningElement, api } from "lwc";

/**
 * A length setting: a number box and a unit dropdown on one row. The value is a CSS length such as
 * "4px", "50%", or "0.5rem". Sends measurechange with the new length.
 */
export default class CrMeasureInput extends LightningElement {
    /** Name of the setting, shown above the row. */
    @api label;

    /** Units the dropdown offers, such as ["px", "rem"]. The first is used when none is stored. */
    @api units = ["px"];

    /** Largest number allowed. A larger number is lowered to it when stored. No limit when unset. */
    @api max;

    _number = "0";
    _unit = "";
    _numberChanged = false;

    /**
     * The stored length, such as "4px". An empty or unreadable value reads as 0 in the first unit.
     * @param {string} newValue The stored CSS length.
     */
    @api
    set value(newValue) {
        const match = /^(-?[\d.]+)\s*([a-z%]*)$/i.exec(newValue || "");
        this._number = match ? match[1] : "0";
        this._unit = match && match[2] ? match[2] : "";
    }
    get value() {
        return `${this._number}${this.unit}`;
    }

    /**
     * @returns {string} The number shown in the box.
     */
    get number() {
        return this._number;
    }

    /**
     * @returns {string} The unit shown in the dropdown. Falls back to the first offered unit.
     */
    get unit() {
        return this.units.includes(this._unit) ? this._unit : this.units[0];
    }

    /**
     * @returns {Array<{label: string, value: string}>} The unit choices.
     */
    get unitOptions() {
        return this.units.map((unit) => ({ label: unit, value: unit }));
    }

    /**
     * @returns {string} The unit dropdown's label, for assistive technology.
     */
    get unitLabel() {
        return `${this.label} unit`;
    }

    /**
     * Holds the number while the author types. It is sent when the box loses focus, because every
     * sent change refreshes the Builder canvas. An empty box counts as 0.
     * @param {Event} event The change event from the number box.
     */
    handleNumberChange(event) {
        this._number = event.target.value === "" || event.target.value === null ? "0" : String(event.target.value);
        this._numberChanged = true;
    }

    /**
     * Sends the typed number when the box loses focus, if it changed.
     */
    handleNumberCommit() {
        if (this._numberChanged) {
            this._numberChanged = false;
            const max = Number(this.max);
            if (this.max !== undefined && Number(this._number) > max) {
                this._number = String(max);
            }
            this.notify();
        }
    }

    /**
     * Stores the unit the author picks.
     * @param {CustomEvent} event The change event from the unit dropdown.
     */
    handleUnitChange(event) {
        this._unit = event.detail.value;
        this.notify();
    }

    /**
     * Tells the parent the length changed.
     */
    notify() {
        this.dispatchEvent(new CustomEvent("measurechange", { detail: { value: this.value } }));
    }
}
