import { LightningElement, api } from "lwc";

/**
 * Container for crAccordionSection. Opening one section closes the others, unless
 * multiple sections are allowed to stay open.
 * @slot sections
 */
export default class CrAccordion extends LightningElement {
    /** Lets more than one section stay open. Off by default. */
    @api allowMultipleSectionsOpen = false;

    /** Build label from the properties panel. Not used by the component. */
    @api versionInfo;

    /** Where the toggle sits in each section's header: "left" or "right". */
    @api togglePosition = "left";

    _openIconName = "utility:chevrondown";
    _closeIconName = "utility:chevronright";
    _hideIcon = false;
    _iconBackgroundColor = "";
    _iconForegroundColor = "";
    _iconSize = "xx-small";
    _sections = new Set();

    /**
     * Icon shown on an open section's toggle. Passed to every section.
     * @returns {string}
     */
    @api
    get openIconName() {
        return this._openIconName;
    }
    set openIconName(value) {
        this._openIconName = value;
        this._sections.forEach((section) => this.passSettingsTo(section));
    }

    /**
     * Icon shown on a closed section's toggle. Passed to every section.
     * @returns {string}
     */
    @api
    get closeIconName() {
        return this._closeIconName;
    }
    set closeIconName(value) {
        this._closeIconName = value;
        this._sections.forEach((section) => this.passSettingsTo(section));
    }

    /**
     * Hides the toggle icon in every section.
     * @returns {boolean}
     */
    @api
    get hideIcon() {
        return this._hideIcon;
    }
    set hideIcon(value) {
        this._hideIcon = Boolean(value);
        this._sections.forEach((section) => this.passSettingsTo(section));
    }

    /**
     * Background color behind the toggle icon in every section. Empty means transparent.
     * @returns {string}
     */
    @api
    get iconBackgroundColor() {
        return this._iconBackgroundColor;
    }
    set iconBackgroundColor(value) {
        this._iconBackgroundColor = value || "";
        this._sections.forEach((section) => this.passSettingsTo(section));
    }

    /**
     * Color of the toggle icon in every section. Empty means the default color.
     * @returns {string}
     */
    @api
    get iconForegroundColor() {
        return this._iconForegroundColor;
    }
    set iconForegroundColor(value) {
        this._iconForegroundColor = value || "";
        this._sections.forEach((section) => this.passSettingsTo(section));
    }

    /**
     * Size of the toggle icon in every section.
     * @returns {string}
     */
    @api
    get iconSize() {
        return this._iconSize;
    }
    set iconSize(value) {
        this._iconSize = value || "xx-small";
        this._sections.forEach((section) => this.passSettingsTo(section));
    }

    /**
     * Listens on the host for sections registering, opening, and leaving. The sections are
     * light DOM children, so their events reach the host and not the slot.
     */
    connectedCallback() {
        this.addEventListener("sectionregister", this.handleSectionRegister);
        this.addEventListener("sectionunregister", this.handleSectionUnregister);
        this.addEventListener("sectiontoggle", this.handleSectionToggle);
    }

    /**
     * Inline style for the wrapper. Sections read the toggle order from it, so every section
     * places its toggle the same way.
     * @returns {string} The custom property that sets the toggle position.
     */
    get wrapperStyle() {
        return `--cr-accordion-toggle-order: ${this.togglePosition === "right" ? 2 : 0};`;
    }

    /**
     * Records a section that has joined the accordion, and gives it the toggle icons.
     * @param {CustomEvent} event The sectionregister event from a section.
     */
    handleSectionRegister = (event) => {
        this._sections.add(event.target);
        this.passSettingsTo(event.target);
    };

    /**
     * Forgets a section that has left the accordion.
     * @param {CustomEvent} event The sectionunregister event from a section.
     */
    handleSectionUnregister = (event) => {
        this._sections.delete(event.target);
    };

    /**
     * Closes the other sections when one opens, unless multiple sections may be open.
     * @param {CustomEvent} event The sectiontoggle event from a section.
     */
    handleSectionToggle = (event) => {
        if (event.detail.open) {
            this.closeOtherSections(event.target);
        }
    };

    /**
     * Gives a section the icon names, the icon size, and whether to hide the toggle icon.
     * @param {HTMLElement} section The section that needs the settings.
     */
    passSettingsTo(section) {
        section.openIconName = this._openIconName || "utility:chevrondown";
        section.closeIconName = this._closeIconName || "utility:chevronright";
        section.hideIcon = this._hideIcon;
        section.iconBackgroundColor = this._iconBackgroundColor;
        section.iconForegroundColor = this._iconForegroundColor;
        section.iconSize = this._iconSize;
    }

    /**
     * Closes every section except the one given, unless multiple sections may be open.
     * @param {HTMLElement} openSection The section that stays as it is.
     */
    closeOtherSections(openSection) {
        if (this.allowMultipleSectionsOpen) {
            return;
        }
        this._sections.forEach((section) => {
            if (section !== openSection) {
                section.expanded = false;
            }
        });
    }
}
