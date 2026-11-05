import { LightningElement, api } from "lwc";
import { parseAppearance, BUTTON_PADDING } from "c/crSearchBarAppearance";

/** The collapsible sections, in the order they appear. Search Field starts open. */
const SECTION_KEYS = ["field", "border", "button", "menu"];

const SIZE_OPTIONS = [
    { label: "Small", value: "small" },
    { label: "Medium", value: "medium" },
    { label: "Large", value: "large" }
];

const BUTTON_STYLE_OPTIONS = [
    { label: "Attached", value: "attached" },
    { label: "Inset", value: "inset" }
];

/** The site's button styles (Theme > Buttons), as in the site's own Button component, or Custom. */
const BUTTON_THEME_OPTIONS = [
    { label: "Primary", value: "primary" },
    { label: "Secondary", value: "secondary" },
    { label: "Tertiary", value: "tertiary" },
    { label: "Custom", value: "custom" }
];

/** The site's button sizes (Theme > Buttons > Sizes). */
const BUTTON_SIZE_OPTIONS = [
    { label: "Standard", value: "standard" },
    { label: "Small", value: "small" },
    { label: "Large", value: "large" }
];

const MENU_LAYOUT_OPTIONS = [
    { label: "List", value: "list" },
    { label: "Grouped", value: "grouped" },
    { label: "Tabs", value: "tabs" }
];

/** Fixed keeps the results inside the bar's border; Floating shows them in a card below it. */
const MENU_POSITION_OPTIONS = [
    { label: "Fixed", value: "fixed" },
    { label: "Floating", value: "floating" }
];

/** Labels for the SLDS padding sizes, with each size in pixels so the author can picture it. */
const PADDING_LABELS = {
    none: "None",
    "xxx-small": "XXX-Small",
    "xx-small": "XX-Small",
    "x-small": "X-Small",
    small: "Small",
    medium: "Medium",
    large: "Large",
    "x-large": "X-Large",
    "xx-large": "XX-Large"
};

const PADDING_OPTIONS = Object.entries(BUTTON_PADDING).map(([value, rem]) => ({
    label: `${PADDING_LABELS[value]} (${parseFloat(rem) * 16}px)`,
    value
}));

/**
 * Properties panel editor for the search bar's appearance. Every style setting lives in one JSON
 * value, grouped into collapsible sections that can be open at the same time.
 */
export default class CrSearchBarAppearanceEditor extends LightningElement {
    _appearance = parseAppearance("");
    _openSections = new Set(["field"]);
    _pendingLabel;

    /**
     * The stored appearance JSON. Missing settings are filled from the shared defaults.
     * @param {string} newValue The stored value.
     */
    @api
    set value(newValue) {
        this._appearance = parseAppearance(newValue);
    }
    get value() {
        return JSON.stringify(this._appearance);
    }

    /**
     * @returns {object} The current appearance, for the template.
     */
    get appearance() {
        return this._appearance;
    }

    /**
     * @returns {object} Whether each section is open, keyed by section.
     */
    get open() {
        return Object.fromEntries(SECTION_KEYS.map((key) => [key, this._openSections.has(key)]));
    }

    /**
     * @returns {object} Each section's expanded state for assistive technology, keyed by section.
     */
    get expanded() {
        return Object.fromEntries(SECTION_KEYS.map((key) => [key, String(this._openSections.has(key))]));
    }

    /**
     * @returns {object} Each section's classes, keyed by section.
     */
    get sectionClass() {
        return Object.fromEntries(
            SECTION_KEYS.map((key) => [key, this._openSections.has(key) ? "style-section is-open" : "style-section"])
        );
    }

    get sizeOptions() {
        return SIZE_OPTIONS;
    }

    get buttonStyleOptions() {
        return BUTTON_STYLE_OPTIONS;
    }

    get buttonThemeOptions() {
        return BUTTON_THEME_OPTIONS;
    }

    get buttonSizeOptions() {
        return BUTTON_SIZE_OPTIONS;
    }

    /**
     * Whether the button uses its own colors and padding rather than a site button style.
     * @returns {boolean}
     */
    get isCustomButton() {
        return this._appearance.button.theme === "custom";
    }

    get menuLayoutOptions() {
        return MENU_LAYOUT_OPTIONS;
    }

    get menuPositionOptions() {
        return MENU_POSITION_OPTIONS;
    }

    get paddingOptions() {
        return PADDING_OPTIONS;
    }

    /**
     * Opens or closes a section. Other sections stay as they are.
     * @param {Event} event The click on a section header.
     */
    handleSectionToggle(event) {
        const key = event.currentTarget.dataset.key;
        const next = new Set(this._openSections);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        this._openSections = next;
    }

    /**
     * Stores a setting from a color row, length field, picker, or choice buttons. Each sends its
     * value only when the author finishes, because every stored change refreshes the Builder canvas.
     * @param {CustomEvent} event The change event, with the part and setting on the field.
     */
    handleSettingChange(event) {
        const { part, field } = event.currentTarget.dataset;
        this.update(part, field, event.detail.value);
    }

    /**
     * Stores a whole border object from the Foundations Border or Shadow settings. Both send the
     * full object, so it replaces the stored one: the bar's whole Border part, or the one setting
     * named on the field, such as the Custom button's border.
     * @param {CustomEvent} event The borderchange or shadowchange event.
     */
    handleBorderObjectChange(event) {
        const { part, field } = event.currentTarget.dataset;
        if (field) {
            this.update(part, field, event.detail.value);
            return;
        }
        this._appearance = { ...this._appearance, [part]: event.detail.value };
        this.dispatchEvent(new CustomEvent("valuechange", { detail: { value: JSON.stringify(this._appearance) } }));
    }

    /**
     * Stores a checkbox's state.
     * @param {CustomEvent} event The change event, with the part and setting on the checkbox.
     */
    handleCheckboxChange(event) {
        const { part, field } = event.currentTarget.dataset;
        this.update(part, field, event.detail.checked);
    }

    /**
     * Holds the button label while the author types. It is stored when the field loses focus.
     * @param {CustomEvent} event The change event from the label field.
     */
    handleLabelChange(event) {
        this._pendingLabel = event.detail.value;
    }

    /**
     * Stores the typed button label, trimmed, if it changed.
     */
    handleLabelCommit() {
        if (this._pendingLabel === undefined) {
            return;
        }
        const label = this._pendingLabel.trim();
        this._pendingLabel = undefined;
        if (label !== this._appearance.button.label) {
            this.update("button", "label", label);
        }
    }

    /**
     * Changes one setting and tells the properties panel the appearance changed.
     * @param {string} part The section, such as "border".
     * @param {string} field The setting in that section, such as "color".
     * @param {*} value The new value.
     */
    update(part, field, value) {
        this._appearance = { ...this._appearance, [part]: { ...this._appearance[part], [field]: value } };
        this.dispatchEvent(new CustomEvent("valuechange", { detail: { value: JSON.stringify(this._appearance) } }));
    }
}
