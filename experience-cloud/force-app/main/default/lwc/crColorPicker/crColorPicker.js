import { LightningElement, api } from "lwc";

const DEFAULT_MODE = "default";
const CUSTOM_MODE = "custom";

/** Color a custom choice starts from, the site's standard text color. */
const STARTING_COLOR = "#1a1b1e";

/**
 * Properties panel editor for an optional color. "Use Default Color" stores an empty string, so
 * the component keeps its own color. "Use Custom Color" stores the hex value the author picks.
 * The choices list opens inline, under the field, with a color dot beside each label.
 */
export default class CrColorPicker extends LightningElement {
    /** Which color this picker changes, such as "Background" or "Foreground". Names the options. */
    @api colorName = "";

    _value = "";
    _mode = DEFAULT_MODE;
    _expanded = false;

    /**
     * The stored color as hex, or an empty string for the default.
     * @param {string} newValue The stored value.
     */
    @api
    set value(newValue) {
        this._value = newValue || "";
        this._mode = this._value ? CUSTOM_MODE : DEFAULT_MODE;
    }
    get value() {
        return this._value;
    }

    /**
     * @returns {boolean} Whether the choices list is open.
     */
    get isExpanded() {
        return this._expanded;
    }

    /**
     * @returns {string} The field's expanded state for assistive technology.
     */
    get ariaExpanded() {
        return String(this._expanded);
    }

    /**
     * @returns {string} The label of the current choice, shown on the field.
     */
    get currentLabel() {
        return this.labelFor(this._mode);
    }

    /**
     * Label for a choice, naming the color it changes when a name is given.
     * @param {string} mode The choice.
     * @returns {string}
     */
    labelFor(mode) {
        const prefix = mode === CUSTOM_MODE ? "Use Custom" : "Use Default";
        return this.colorName ? `${prefix} ${this.colorName} Color` : `${prefix} Color`;
    }

    /**
     * @returns {string} The dot on the field, in the current choice's color.
     */
    get currentDotStyle() {
        return this.dotStyleFor(this._mode);
    }

    /**
     * The two choices, each with a label, a color dot, and its pressed state.
     * @returns {Array<{mode: string, label: string, dotStyle: string, pressed: string}>}
     */
    get choices() {
        return [DEFAULT_MODE, CUSTOM_MODE].map((mode) => ({
            mode,
            label: this.labelFor(mode),
            dotStyle: this.dotStyleFor(mode),
            pressed: String(this._mode === mode)
        }));
    }

    /**
     * @returns {boolean} Whether the custom color field is showing.
     */
    get isCustom() {
        return this._mode === CUSTOM_MODE;
    }

    /**
     * @returns {string} The label for the custom color field.
     */
    get customLabel() {
        return this.colorName ? `Custom ${this.colorName.toLowerCase()} color` : "Custom color";
    }

    /**
     * @returns {string} The color shown in the custom field.
     */
    get customValue() {
        return this._value || STARTING_COLOR;
    }

    /**
     * Inline style for a choice's dot. The default dot is an outline, and the custom dot shows the
     * chosen color.
     * @param {string} mode The choice the dot belongs to.
     * @returns {string}
     */
    dotStyleFor(mode) {
        if (mode === CUSTOM_MODE) {
            return `background-color: ${this._value || STARTING_COLOR}`;
        }
        return "background-color: #ffffff";
    }

    /**
     * Opens or closes the choices list.
     */
    handleToggle() {
        this._expanded = !this._expanded;
    }

    /**
     * Switches between the default and a custom color, and closes the list. Custom starts from the
     * standard text color.
     * @param {Event} event The click on a choice.
     */
    handleModeSelect(event) {
        this._mode = event.currentTarget.dataset.mode;
        this._expanded = false;
        this.store(this._mode === CUSTOM_MODE ? STARTING_COLOR : "");
    }

    /**
     * Stores the color the author picks.
     * @param {Event} event The change event from the color field.
     */
    handleColorChange(event) {
        this.store(event.target.value);
    }

    /**
     * Keeps the value and tells the properties panel it changed.
     * @param {string} value The hex color, or an empty string for the default.
     */
    store(value) {
        this._value = value;
        this.dispatchEvent(new CustomEvent("valuechange", { detail: { value } }));
    }
}
