import { LightningElement, api } from "lwc";

/** Color a custom choice starts from, the site's standard text color. */
const STARTING_COLOR = "#1a1b1e";

/**
 * One compact color setting: a labeled row with a color dot. Clicking the row opens the choice
 * between the default and a custom color, in place. A custom color is edited in the CRLabs
 * Foundations color picker. Sends colorchange with the hex value ("#rrggbb", or "#rrggbbaa" below
 * full opacity), or an empty string for the default.
 */
export default class CrColorRow extends LightningElement {
    /** Name of the color, shown on the row. */
    @api label;

    /** The stored color as hex, or an empty string for the default. */
    @api value = "";

    _expanded = false;

    /**
     * @returns {boolean} Whether the default and custom choices are showing.
     */
    get isExpanded() {
        return this._expanded;
    }

    /**
     * @returns {string} The row's expanded state for assistive technology.
     */
    get ariaExpanded() {
        return String(this._expanded);
    }

    /**
     * @returns {boolean} Whether a custom color is set.
     */
    get isCustom() {
        return Boolean(this.value);
    }

    /**
     * @returns {string} The dot's classes. The default dot is drawn with a slash.
     */
    get dotClass() {
        return this.value ? "color-dot" : "color-dot is-default";
    }

    /**
     * @returns {string} The dot's fill when a custom color is set.
     */
    get dotStyle() {
        if (!this.value) {
            return "";
        }
        // A checkerboard under the color shows its transparency.
        return [
            `background: linear-gradient(${this.value}, ${this.value})`,
            "repeating-conic-gradient(#d8d8d8 0 25%, #ffffff 0 50%) 50% / 8px 8px"
        ].join(", ");
    }

    /**
     * @returns {string} The Use Default button's pressed state.
     */
    get defaultPressed() {
        return String(!this.value);
    }

    /**
     * @returns {string} The Use Custom button's pressed state.
     */
    get customPressed() {
        return String(Boolean(this.value));
    }

    /**
     * Opens or closes the choices.
     */
    handleToggle() {
        this._expanded = !this._expanded;
    }

    /**
     * Clears the color, so the default applies.
     */
    handleUseDefault() {
        this.notify("");
    }

    /**
     * Starts a custom color from the standard text color, unless one is already set.
     */
    handleUseCustom() {
        if (!this.value) {
            this.notify(STARTING_COLOR);
        }
    }

    /**
     * Sends the color picked in the color picker. It already sends "#rrggbb", or "#rrggbbaa" below
     * full opacity, and only when a drag or key press ends.
     * @param {CustomEvent} event The colorchange event from the picker.
     */
    handlePickerChange(event) {
        event.stopPropagation();
        this.notify(event.detail.value);
    }

    /**
     * Tells the parent the color changed.
     * @param {string} value The hex color, or an empty string for the default.
     */
    notify(value) {
        this.dispatchEvent(new CustomEvent("colorchange", { detail: { value } }));
    }
}
