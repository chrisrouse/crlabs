import { LightningElement, api } from "lwc";
import { ICON_NAMES, ICON_SYNONYMS } from "./iconNames";

/** Icons shown per batch. "Show more" adds another batch, so the menu stays responsive. */
const BATCH_SIZE = 120;

/** The platform's icon sets, in the order their tabs appear. */
const CATEGORIES = [
    { value: "utility", label: "Utility" },
    { value: "standard", label: "Standard" },
    { value: "action", label: "Action" },
    { value: "custom", label: "Custom" },
    { value: "doctype", label: "Doctype" }
];

/**
 * An icon setting for a property editor. The field shows the chosen icon; clicking it opens a
 * floating menu with search, a tab for each of the platform's five icon sets, and the icon grid.
 *
 * Sends iconchange with `{ value }`, the icon name such as "utility:chevrondown".
 *
 * @example
 * <c-cr-icon-picker label="Open Icon" value={icon} oniconchange={handleIconChange}></c-cr-icon-picker>
 */
export default class CrIconPicker extends LightningElement {
    /** Label shown above the field. */
    @api label;

    _value = "";
    _search = "";
    _category = "utility";
    _shown = BATCH_SIZE;
    _open = false;
    _clickInside = false;

    /**
     * The chosen icon name, such as "utility:chevrondown".
     * @param {string} newValue The stored icon name.
     */
    @api
    set value(newValue) {
        this._value = newValue || "";
    }
    get value() {
        return this._value;
    }

    /**
     * Listens for Escape, and for clicks outside the picker, to close the menu.
     */
    connectedCallback() {
        this.addEventListener("keydown", this.handleKeydown);
        this.addEventListener("click", this.handleInsideClick);
        window.addEventListener("click", this.handleOutsideClick);
    }

    /**
     * Removes the outside-click listener when the picker leaves the page.
     */
    disconnectedCallback() {
        window.removeEventListener("click", this.handleOutsideClick);
    }

    /**
     * @returns {boolean} Whether the floating menu is open.
     */
    get isOpen() {
        return this._open;
    }

    /**
     * @returns {string} The field's expanded state for assistive technology.
     */
    get ariaExpanded() {
        return String(this._open);
    }

    /**
     * @returns {string} The chosen icon's name, or "None" when unset.
     */
    get selectedName() {
        return this._value || "None";
    }

    /**
     * @returns {boolean} Whether an icon is chosen, so the field can show it.
     */
    get hasValue() {
        return Boolean(this._value);
    }

    /**
     * @returns {string} The search text in the menu's search box.
     */
    get searchValue() {
        return this._search;
    }

    /**
     * @returns {string} The tab buttons' pressed state for the Utility tab.
     */
    get categories() {
        return CATEGORIES.map((category) => ({
            ...category,
            pressed: String(this._category === category.value)
        }));
    }

    /**
     * @returns {string[]} Every icon in the current set that matches the search by name or by another
     *   word for it, name matches first.
     */
    get matches() {
        const term = this._search.trim().toLowerCase();
        const names = ICON_NAMES[this._category];
        if (!term) {
            return names;
        }
        // Icons whose name matches come first, then icons found only by another word for them.
        const byName = names.filter((name) => name.split(":")[1].toLowerCase().includes(term));
        const bySynonym = names.filter((name) => !byName.includes(name) && (ICON_SYNONYMS[name] || "").includes(term));
        return [...byName, ...bySynonym];
    }

    /**
     * Icons that match the search, up to the current batch.
     * @returns {Array<{name: string, shortName: string, className: string, pressed: string}>}
     */
    get icons() {
        return this.matches.slice(0, this._shown).map((name) => {
            const selected = name === this._value;
            return {
                name,
                shortName: name.split(":")[1],
                className: selected ? "cr-control icon-option is-selected" : "cr-control icon-option",
                pressed: String(selected)
            };
        });
    }

    /**
     * @returns {boolean} Whether more matches are waiting behind "Show more".
     */
    get hasMore() {
        return this.matches.length > this._shown;
    }

    /**
     * @returns {string} The label for the "Show more" button.
     */
    get moreLabel() {
        return `Show ${Math.min(BATCH_SIZE, this.matches.length - this._shown)} more`;
    }

    /**
     * @returns {string} A short message when nothing matches the search.
     */
    get noMatches() {
        return this.matches.length === 0 ? "No icons match that search." : "";
    }

    /**
     * Opens or closes the floating menu from the field.
     */
    handleToggle() {
        this._open = !this._open;
        if (this._open) {
            this.showChosenSet();
        }
    }

    /**
     * Marks a click as coming from inside the picker. It reaches the picker before the page, so
     * the page's listener can tell it apart without reading the click's path, which some builders'
     * sandboxes hide or wrap.
     */
    handleInsideClick = () => {
        this._clickInside = true;
    };

    /**
     * Shows the chosen icon's set when the menu opens, so the chosen icon is in view.
     */
    showChosenSet() {
        const category = this._value.split(":")[0];
        if (ICON_NAMES[category] && category !== this._category) {
            this._category = category;
            this._shown = BATCH_SIZE;
        }
    }

    /**
     * Closes the menu when a click lands outside this picker.
     */
    handleOutsideClick = () => {
        if (this._open && !this._clickInside) {
            this._open = false;
        }
        this._clickInside = false;
    };

    /**
     * Closes the menu when Escape is pressed.
     * @param {KeyboardEvent} event The key press inside the picker.
     */
    handleKeydown = (event) => {
        if (this._open && event.key === "Escape") {
            this._open = false;
        }
    };

    /**
     * Filters the icons as the author types, and starts again from the first batch.
     * @param {Event} event The change event from the search box.
     */
    handleSearch(event) {
        this._search = event.target.value;
        this._shown = BATCH_SIZE;
    }

    /**
     * Switches between the Utility and Actions icon sets.
     * @param {Event} event The click on a category tab.
     */
    handleCategory(event) {
        this._category = event.currentTarget.dataset.category;
        this._shown = BATCH_SIZE;
    }

    /**
     * Shows the next batch of matching icons.
     */
    handleShowMore() {
        this._shown += BATCH_SIZE;
    }

    /**
     * Stores the chosen icon, sends iconchange, and closes the menu.
     * @param {Event} event The click on an icon.
     */
    handleSelect(event) {
        this._value = event.currentTarget.dataset.name;
        this._open = false;
        this.dispatchEvent(new CustomEvent("iconchange", { detail: { value: this._value } }));
    }
}
