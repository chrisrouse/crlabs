import { LightningElement, api } from "lwc";

/** Color a custom choice starts from, the site's standard text color. */
const STARTING_COLOR = "#1a1b1e";

/**
 * Splits a stored color into its 6-digit hex and its opacity. "#rrggbbaa" carries the opacity in
 * its last two digits; "#rrggbb" is fully opaque.
 * @param {string} value The stored color.
 * @returns {{hex: string, opacity: number}} The color and its opacity, 0 to 100.
 */
function splitColor(value) {
    const match = /^(#[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value || "");
    if (!match) {
        return { hex: value || STARTING_COLOR, opacity: 100 };
    }
    return { hex: match[1], opacity: match[2] ? Math.round((parseInt(match[2], 16) / 255) * 100) : 100 };
}

/**
 * Joins a 6-digit hex and an opacity into the stored color. Full opacity stays 6-digit hex.
 * @param {string} hex The color as "#rrggbb".
 * @param {number} opacity The opacity, 0 to 100.
 * @returns {string} The stored color.
 */
function joinColor(hex, opacity) {
    if (opacity >= 100) {
        return hex;
    }
    const alpha = Math.round((Math.max(0, opacity) / 100) * 255);
    return `${hex}${alpha.toString(16).padStart(2, "0")}`;
}

/**
 * One compact color setting: a labeled row with a color dot. Clicking the row opens the choice
 * between the default and a custom color, in place. A custom color has an opacity too. Sends
 * colorchange with the hex value ("#rrggbb", or "#rrggbbaa" below full opacity), or an empty
 * string for the default.
 */
export default class CrColorRow extends LightningElement {
    /** Name of the color, shown on the row. */
    @api label;

    /** The stored color as hex, or an empty string for the default. */
    @api value = "";

    _expanded = false;
    _pendingOpacity;

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
     * @returns {string} The color shown in the custom color field, without its opacity.
     */
    get customValue() {
        return splitColor(this.value).hex;
    }

    /**
     * @returns {number} The opacity shown in the opacity field, 0 to 100.
     */
    get opacity() {
        return this._pendingOpacity ?? splitColor(this.value).opacity;
    }

    /**
     * @returns {string} The opacity as a percentage, shown beside the slider.
     */
    get opacityText() {
        return `${this.opacity}%`;
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
        this.notify(joinColor(event.target.value, this.opacity));
    }

    /**
     * Shows the opacity while the slider is dragged. It is sent only when the slider is released,
     * because every sent change refreshes the Builder canvas.
     * @param {Event} event The input event from the opacity slider.
     */
    handleOpacityInput(event) {
        this._pendingOpacity = Number(event.target.value);
    }

    /**
     * Sends the opacity when the slider is released or moved with the keyboard.
     * @param {Event} event The change event from the opacity slider.
     */
    handleOpacityCommit(event) {
        this._pendingOpacity = undefined;
        this.notify(joinColor(this.customValue, Number(event.target.value)));
    }

    /**
     * Tells the parent the color changed.
     * @param {string} value The hex color, or an empty string for the default.
     */
    notify(value) {
        this.dispatchEvent(new CustomEvent("colorchange", { detail: { value } }));
    }
}
