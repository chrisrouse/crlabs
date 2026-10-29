import { LightningElement, api } from "lwc";

/** Quiet time after the last keystroke before the edit is sent to the panel. */
const COMMIT_DELAY_MS = 300;

/**
 * Heading 1 to 6, then Paragraph 1, in the order the site's standard text style menu uses.
 * The editor's header format takes 1 to 6. Paragraph is header false, which the docs
 * do not state, so it needs a check in the org.
 */
const STYLE_OPTIONS = [
    { value: "1", label: "Heading 1", header: 1 },
    { value: "2", label: "Heading 2", header: 2 },
    { value: "3", label: "Heading 3", header: 3 },
    { value: "4", label: "Heading 4", header: 4 },
    { value: "5", label: "Heading 5", header: 5 },
    { value: "6", label: "Heading 6", header: 6 },
    { value: "normal", label: "Paragraph 1", header: false }
];

/**
 * The editor's default formats without "font" and "size". The size menu only appears with the
 * font menu, so both are left out and the site sets the size. "color" adds a color menu, and a
 * color the author picks overrides the site's text color only for the words it's set on.
 * The editor's formats list is the complete set, so every other default format is listed too.
 */
const EDITOR_FORMATS = [
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "indent",
    "align",
    "link",
    "image",
    "clean",
    "table",
    "header",
    "color"
];

/**
 * Properties panel editor for crRichTextBlock. Edits the HTML in
 * lightning-input-rich-text and reports edits as valuechange, after a short pause in typing.
 */
export default class CrRichTextEditor extends LightningElement {
    _value = "";
    _styleValue = "normal";
    _commitTimer;

    /**
     * @param {string} newValue HTML stored on the block. Unset becomes an empty string.
     */
    @api
    set value(newValue) {
        this._value = newValue || "";
    }
    get value() {
        return this._value;
    }

    /**
     * Formats the editor offers, without the Font menu.
     * @returns {string[]}
     */
    get editorFormats() {
        return EDITOR_FORMATS;
    }

    /**
     * Current style shown in the dropdown. It follows the last choice made here, not the cursor.
     * @returns {string}
     */
    get styleValue() {
        return this._styleValue;
    }

    /**
     * Paragraph and heading options for the style menu. The current style is checked.
     * @returns {Array<{label: string, value: string, checked: boolean}>}
     */
    get styleOptions() {
        return STYLE_OPTIONS.map(({ label, value }) => ({ label, value, checked: value === this._styleValue }));
    }

    /**
     * Holds the pending edit so a burst of keystrokes produces one valuechange.
     */
    disconnectedCallback() {
        if (this._commitTimer) {
            clearTimeout(this._commitTimer);
            this.commit();
        }
    }

    /**
     * Keeps the latest HTML locally and schedules a single commit to the panel.
     * @param {Event} event The rich text input's change event.
     */
    handleChange(event) {
        this._value = event.target.value;
        clearTimeout(this._commitTimer);
        // The timer is the debounce itself; nothing outside this component runs in it.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._commitTimer = setTimeout(() => this.commit(), COMMIT_DELAY_MS);
    }

    /**
     * Applies the chosen style to the line where the cursor is.
     * @param {Event} event The select event from the style menu.
     */
    handleStyleChange(event) {
        // The menu's event must not bubble into the rich text input, where handleChange
        // would store the menu's value as the editor's text.
        event.stopPropagation();
        const option = STYLE_OPTIONS.find((style) => style.value === event.detail.value);
        this._styleValue = option.value;
        this.template.querySelector("lightning-input-rich-text").setFormat({ header: option.header });
    }

    /**
     * Tells the properties panel the stored value has changed.
     */
    commit() {
        this._commitTimer = undefined;
        this.dispatchEvent(new CustomEvent("valuechange", { detail: { value: this._value } }));
    }
}
