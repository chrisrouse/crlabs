import { LightningElement, api } from "lwc";
import { parseAppearance } from "c/crAccordionAppearance";

/** Appearance defaults, from the same module the Appearance editor uses. */
const DEFAULTS = parseAppearance("");

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

    _togglePosition = DEFAULTS.toggle.position;
    _spacingBetween = DEFAULTS.spacing.between;
    _openIconName = DEFAULTS.toggle.openIcon;
    _closeIconName = DEFAULTS.toggle.closeIcon;
    _appearanceJson = "";
    _hideIcon = DEFAULTS.toggle.hide;
    _iconBackgroundColor = DEFAULTS.toggle.background;
    _iconForegroundColor = DEFAULTS.toggle.foreground;
    _iconSize = DEFAULTS.toggle.size;
    _headerBackgroundColor = DEFAULTS.header.background;
    _headerOpenBackgroundColor = DEFAULTS.header.openBackground;
    _contentBackgroundColor = DEFAULTS.content.background;
    _sections = new Set();

    /**
     * Style settings as one JSON string, edited in the Appearance editor. Only the settings that are
     * connected so far are applied: the toggle settings, the header and open header backgrounds, the
     * content background, and the space between sections.
     * @returns {string}
     */
    @api
    get appearance() {
        return this._appearanceJson;
    }
    set appearance(value) {
        this._appearanceJson = value || "";
        const appearance = parseAppearance(this._appearanceJson);
        this._togglePosition = appearance.toggle.position;
        this._spacingBetween = appearance.spacing.between;
        this._openIconName = appearance.toggle.openIcon;
        this._closeIconName = appearance.toggle.closeIcon;
        this._hideIcon = appearance.toggle.hide;
        this._iconSize = appearance.toggle.size;
        this._iconBackgroundColor = appearance.toggle.background;
        this._iconForegroundColor = appearance.toggle.foreground;
        this._headerBackgroundColor = appearance.header.background;
        this._headerOpenBackgroundColor = appearance.header.openBackground;
        this._contentBackgroundColor = appearance.content.background;
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
     * Inline style for the wrapper. Sections read the toggle order from it, so every section places
     * its toggle the same way. It also sets the site's component spacer for the sections, so the
     * space between them follows the Spacing setting instead of the page's Vertical Space Between
     * Components. -l-, -m- and -s- are the desktop, tablet and mobile versions.
     * @returns {string} The custom properties for the toggle position and the space between sections.
     */
    get wrapperStyle() {
        const rem = Number(this._spacingBetween);
        const spacer = `${Number.isFinite(rem) ? rem : DEFAULTS.spacing.between}rem`;
        return [
            `--cr-accordion-toggle-order: ${this._togglePosition === "right" ? 2 : 0}`,
            `--dxp-c-l-component-spacer-size: ${spacer}`,
            `--dxp-c-m-component-spacer-size: ${spacer}`,
            `--dxp-c-s-component-spacer-size: ${spacer}`
        ].join("; ");
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
        section.headerBackgroundColor = this._headerBackgroundColor;
        section.headerOpenBackgroundColor = this._headerOpenBackgroundColor;
        section.contentBackgroundColor = this._contentBackgroundColor;
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
