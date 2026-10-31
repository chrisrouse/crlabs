import { LightningElement, api } from "lwc";
import { parseAppearance } from "c/crAccordionAppearance";

/** The collapsible sections, in the order they appear. Toggles starts open. */
const SECTION_KEYS = [
    "toggle",
    "header",
    "separator",
    "content",
    "sectionBorder",
    "containerBorder",
    "spacing",
    "animation"
];

const POSITION_OPTIONS = [
    { label: "Left", value: "left" },
    { label: "Right", value: "right" }
];

/** Units for border weight. CSS doesn't accept % for border width, so it isn't offered. */
const WEIGHT_UNITS = ["px", "rem"];

/** Units for border radius. 50% makes a circle or pill at any size. */
const RADIUS_UNITS = ["px", "%", "rem"];

const LINE_STYLE_OPTIONS = [
    { label: "Solid", value: "solid" },
    { label: "Dashed", value: "dashed" },
    { label: "Dotted", value: "dotted" }
];

/** Largest space between sections, in rem. The site's own spacing control uses the same range. */
const MAX_SPACING_REM = 5;

const ICON_SIZE_OPTIONS = ["xx-small", "x-small", "small", "medium", "large"].map((size) => ({
    label: size,
    value: size
}));

/** Shadow size is a blur in pixels, up to a broad, soft shadow. */
const SHADOW_UNITS = ["px"];
const MAX_SHADOW_PX = 30;

const SPEED_OPTIONS = [
    { label: "Slow", value: "slow" },
    { label: "Normal", value: "normal" },
    { label: "Fast", value: "fast" }
];

/**
 * Properties panel editor for the accordion's appearance. Every style setting lives in one JSON
 * value, grouped into collapsible sections that can be open at the same time.
 */
export default class CrAccordionAppearanceEditor extends LightningElement {
    _appearance = parseAppearance("");
    _openSections = new Set(["toggle"]);
    _pendingSpacing;

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

    get positionOptions() {
        return POSITION_OPTIONS;
    }

    get weightUnits() {
        return WEIGHT_UNITS;
    }

    get radiusUnits() {
        return RADIUS_UNITS;
    }

    get lineStyleOptions() {
        return LINE_STYLE_OPTIONS;
    }

    get iconSizeOptions() {
        return ICON_SIZE_OPTIONS;
    }

    /**
     * Whether sections animate. Stored as the animation type, slide or none, so another animation
     * can be added later without changing the stored format.
     * @returns {boolean}
     */
    get isAnimated() {
        return this._appearance.animation.type === "slide";
    }

    get speedOptions() {
        return SPEED_OPTIONS;
    }

    get shadowUnits() {
        return SHADOW_UNITS;
    }

    get maxShadow() {
        return MAX_SHADOW_PX;
    }

    /**
     * Whether each border part has a shadow, which shows its Shadow Sides field.
     * @returns {{sectionBorder: boolean, containerBorder: boolean}}
     */
    get hasRadius() {
        return {
            sectionBorder: parseFloat(this._appearance.sectionBorder.radius) > 0,
            containerBorder: parseFloat(this._appearance.containerBorder.radius) > 0
        };
    }

    /**
     * Whether each border part has a shadow, which shows its Shadow Sides field.
     * @returns {{sectionBorder: boolean, containerBorder: boolean}}
     */
    get hasShadow() {
        return {
            sectionBorder: parseFloat(this._appearance.sectionBorder.shadow) > 0,
            containerBorder: parseFloat(this._appearance.containerBorder.shadow) > 0
        };
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
     * Stores a color from a color row.
     * @param {CustomEvent} event The colorchange event, with the part and setting on the row.
     */
    handleColorChange(event) {
        const { part, field } = event.currentTarget.dataset;
        this.update(part, field, event.detail.value);
    }

    /**
     * Stores a choice from a dropdown or an icon picker.
     * @param {CustomEvent} event The change or valuechange event, with the part and setting on the field.
     */
    handleOptionChange(event) {
        const { part, field } = event.currentTarget.dataset;
        this.update(part, field, event.detail.value);
    }

    /**
     * Stores a length from a number-and-unit field.
     * @param {CustomEvent} event The measurechange event, with the part and setting on the field.
     */
    handleMeasureChange(event) {
        const { part, field } = event.currentTarget.dataset;
        this.update(part, field, event.detail.value);
    }

    /**
     * Holds the space between sections while the author types. It is stored when the field loses
     * focus, because every stored change refreshes the Builder canvas.
     * @param {Event} event The change event from the number field.
     */
    handleSpacingChange(event) {
        this._pendingSpacing = event.target.value;
    }

    /**
     * Stores the typed space between sections, in rem. Values outside 0 to 5 are moved to the
     * nearest end, and an empty field counts as 0.
     */
    handleSpacingCommit() {
        if (this._pendingSpacing === undefined) {
            return;
        }
        const rem = Number(this._pendingSpacing) || 0;
        this._pendingSpacing = undefined;
        this.update("spacing", "between", Math.min(MAX_SPACING_REM, Math.max(0, rem)));
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
     * Turns the slide animation on or off.
     * @param {CustomEvent} event The change event from the Animate checkbox.
     */
    handleAnimateChange(event) {
        this.update("animation", "type", event.detail.checked ? "slide" : "none");
    }

    /**
     * Changes one setting and tells the properties panel the appearance changed.
     * @param {string} part The section, such as "header".
     * @param {string} field The setting in that section, such as "background".
     * @param {*} value The new value.
     */
    update(part, field, value) {
        this._appearance = { ...this._appearance, [part]: { ...this._appearance[part], [field]: value } };
        this.dispatchEvent(new CustomEvent("valuechange", { detail: { value: JSON.stringify(this._appearance) } }));
    }
}
