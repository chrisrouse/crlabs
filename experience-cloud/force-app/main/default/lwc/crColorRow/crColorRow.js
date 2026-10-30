import { LightningElement, api } from "lwc";

/** Color a custom choice starts from, the site's standard text color. */
const STARTING_COLOR = "#1a1b1e";

/**
 * One compact color setting: a labeled row with a color dot. Clicking the row opens the choice
 * between the default and a custom color, in place. Sends colorchange with the hex value, or an
 * empty string for the default.
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
        return this.value ? `background-color: ${this.value}` : "";
    }

    /**
     * @returns {string} The color shown in the custom color field.
     */
    get customValue() {
        return this.value || STARTING_COLOR;
    }

    /**
     * @returns {string} The custom color field's label, for assistive technology.
     */
    get customLabel() {
        return `Custom ${this.label}`;
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
     * Sends the color the author picks.
     * @param {Event} event The change event from the color field.
     */
    handleColorChange(event) {
        this.notify(event.target.value);
    }

    /**
     * Tells the parent the color changed.
     * @param {string} value The hex color, or an empty string for the default.
     */
    notify(value) {
        this.dispatchEvent(new CustomEvent("colorchange", { detail: { value } }));
    }
}
