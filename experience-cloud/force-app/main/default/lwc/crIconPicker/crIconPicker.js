import { LightningElement, api } from "lwc";
import { UTILITY_ICON_NAMES, ACTION_ICON_NAMES } from "./iconNames";

/** Icons shown per batch. "Show more" adds another batch, so the menu stays responsive. */
const BATCH_SIZE = 120;

const CATEGORIES = {
    utility: { label: "Utility", names: UTILITY_ICON_NAMES },
    action: { label: "Actions", names: ACTION_ICON_NAMES }
};

/**
 * Properties panel editor that lets an author pick a utility or action icon. The field shows the
 * current icon, and clicking it opens a floating menu with search, tabs, and the icon grid.
 */
export default class CrIconPicker extends LightningElement {
    /** Label shown above the field. */
    @api label;

    _value = "";
    _search = "";
    _category = "utility";
    _shown = BATCH_SIZE;
    _open = false;

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
    get utilityPressed() {
        return String(this._category === "utility");
    }

    /**
     * @returns {string} The tab buttons' pressed state for the Actions tab.
     */
    get actionPressed() {
        return String(this._category === "action");
    }

    /**
     * @returns {string[]} Every icon name in the current category that matches the search.
     */
    get matches() {
        const term = this._search.trim().toLowerCase();
        const names = CATEGORIES[this._category].names;
        return term ? names.filter((name) => name.includes(term)) : names;
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
                className: selected ? "icon-option is-selected" : "icon-option",
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
    }

    /**
     * Closes the menu when a click lands outside this picker.
     * @param {MouseEvent} event The click anywhere on the page.
     */
    handleOutsideClick = (event) => {
        if (this._open && !event.composedPath().includes(this.template.host)) {
            this._open = false;
        }
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
     * Stores the chosen icon, tells the properties panel the value changed, and closes the menu.
     * @param {Event} event The click on an icon.
     */
    handleSelect(event) {
        this._value = event.currentTarget.dataset.name;
        this._open = false;
        this.dispatchEvent(new CustomEvent("valuechange", { detail: { value: this._value } }));
    }
}
