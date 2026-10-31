import { LightningElement, api } from "lwc";
import { borderDeclarations, parseAppearance } from "c/crAccordionAppearance";
import { normalizeName, publishAccordionState } from "c/crAccordionLink";

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

    _linkName = "";
    _lastOpened;

    /**
     * Name that links this accordion to an Accordion Image Panel. The panel's Linked Accordion uses
     * the same name. No name means no link.
     * @returns {string}
     */
    @api
    get linkName() {
        return this._linkName;
    }
    set linkName(value) {
        this._linkName = value || "";
        this.publishState();
    }

    _togglePosition = DEFAULTS.toggle.position;
    _spacingBetween = DEFAULTS.spacing.between;
    _openIconName = DEFAULTS.toggle.openIcon;
    _closeIconName = DEFAULTS.toggle.closeIcon;
    _appearanceJson = "";
    _showActions = true;
    _hideIcon = DEFAULTS.toggle.hide;
    _iconBackgroundColor = DEFAULTS.toggle.background;
    _iconOpenBackgroundColor = DEFAULTS.toggle.openBackground;
    _iconForegroundColor = DEFAULTS.toggle.foreground;
    _iconSize = DEFAULTS.toggle.size;
    _headerBackgroundColor = DEFAULTS.header.background;
    _headerOpenBackgroundColor = DEFAULTS.header.openBackground;
    _contentBackgroundColor = DEFAULTS.content.background;
    _sectionBorder = { ...DEFAULTS.sectionBorder };
    _containerBorder = { ...DEFAULTS.containerBorder };
    _separator = { ...DEFAULTS.separator };
    _animation = { ...DEFAULTS.animation };
    _sections = new Set();

    /**
     * Shows the Actions slot in every section. When off, sections don't render the slot, so the
     * Builder canvas shows no actions drop area either. On by default.
     * @returns {boolean}
     */
    @api
    get showActions() {
        return this._showActions;
    }
    set showActions(value) {
        this._showActions = value !== false;
        this._sections.forEach((section) => this.passSettingsTo(section));
    }

    /**
     * Style settings as one JSON string, edited in the Appearance editor. Only the settings that are
     * connected so far are applied: the toggle settings, the header and open header backgrounds, the
     * content background, the separator, the section and container borders, the space between sections, and the animation.
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
        this._iconOpenBackgroundColor = appearance.toggle.openBackground;
        this._iconForegroundColor = appearance.toggle.foreground;
        this._headerBackgroundColor = appearance.header.background;
        this._headerOpenBackgroundColor = appearance.header.openBackground;
        this._contentBackgroundColor = appearance.content.background;
        this._sectionBorder = appearance.sectionBorder;
        this._containerBorder = appearance.containerBorder;
        this._separator = appearance.separator;
        this._animation = appearance.animation;
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
        this.addEventListener("sectionrename", this.handleSectionRename);
    }

    /**
     * Inline style for the wrapper. Sections read the toggle order from it, so every section places
     * its toggle the same way. It also sets the site's component spacer for the sections, so the
     * space between them follows the Spacing setting instead of the page's Vertical Space Between
     * Components. -l-, -m- and -s- are the desktop, tablet and mobile versions. The container border
     * is drawn here too.
     * @returns {string} The custom properties for the toggle position and the space between sections.
     */
    get wrapperStyle() {
        const right = this._togglePosition === "right";
        const rem = Number(this._spacingBetween);
        const spacer = `${Number.isFinite(rem) ? rem : DEFAULTS.spacing.between}rem`;
        return [
            `--cr-accordion-toggle-order: ${right ? 2 : 0}`,
            `--cr-accordion-toggle-push: ${right ? "auto" : "0"}`,
            `--cr-accordion-title-end-gap: ${right ? "0.5rem" : "0"}`,
            `--dxp-c-l-component-spacer-size: ${spacer}`,
            `--dxp-c-m-component-spacer-size: ${spacer}`,
            `--dxp-c-s-component-spacer-size: ${spacer}`,
            ...borderDeclarations(this._containerBorder)
        ].join("; ");
    }

    /**
     * Records a section that has joined the accordion, and gives it the toggle icons.
     * @param {CustomEvent} event The sectionregister event from a section.
     */
    handleSectionRegister = (event) => {
        this._sections.add(event.target);
        this._sections.forEach((section) => this.passSettingsTo(section));
        this.publishState();
    };

    /**
     * Forgets a section that has left the accordion.
     * @param {CustomEvent} event The sectionunregister event from a section.
     */
    handleSectionUnregister = (event) => {
        this._sections.delete(event.target);
        this._sections.forEach((section) => this.passSettingsTo(section));
        this.publishState();
    };

    /**
     * Republishes the open sections when an author renames a section.
     */
    handleSectionRename = () => {
        this.publishState();
    };

    /**
     * Closes the other sections when one opens, unless multiple sections may be open.
     * @param {CustomEvent} event The sectiontoggle event from a section.
     */
    handleSectionToggle = (event) => {
        if (event.detail.open) {
            this.closeOtherSections(event.target);
            this._lastOpened = event.target;
        }
        this.publishState();
    };

    /**
     * Tells a linked Accordion Image Panel which sections are open, most recently opened last.
     */
    publishState() {
        if (!this._linkName) {
            return;
        }
        const sections = [...this._sections];
        const openSections = sections.filter((section) => section.expanded);
        // The most recently opened section goes last, so a panel shows its image.
        const last = openSections.indexOf(this._lastOpened);
        if (last >= 0) {
            openSections.push(...openSections.splice(last, 1));
        }
        const open = openSections.map((section) => normalizeName(section.sectionName)).filter(Boolean);
        publishAccordionState(this._linkName, { open });
    }

    /**
     * Gives a section the icon names, the icon size, and whether to hide the toggle icon.
     * @param {HTMLElement} section The section that needs the settings.
     */
    passSettingsTo(section) {
        section.openIconName = this._openIconName || "utility:chevrondown";
        section.closeIconName = this._closeIconName || "utility:chevronright";
        section.hideIcon = this._hideIcon;
        section.iconBackgroundColor = this._iconBackgroundColor;
        section.iconOpenBackgroundColor = this._iconOpenBackgroundColor;
        section.iconForegroundColor = this._iconForegroundColor;
        section.iconSize = this._iconSize;
        section.showActions = this._showActions;
        section.headerBackgroundColor = this._headerBackgroundColor;
        section.headerOpenBackgroundColor = this._headerOpenBackgroundColor;
        section.contentBackgroundColor = this._contentBackgroundColor;
        section.sectionBorder = this.sectionBorderFor(section);
        section.separator = this._separator;
        section.animation = this._animation;
    }

    /**
     * The section border for one section. With no space between sections, each section's bottom
     * border touches the next one's top border and the line looks doubled. So every section after
     * the first drops its top border, and the bottom border of the section above draws the line.
     * @param {HTMLElement} section The section that gets the border.
     * @returns {object} The border settings for that section.
     */
    sectionBorderFor(section) {
        const border = this._sectionBorder;
        const touching = Number(this._spacingBetween) === 0;
        if (!touching || !border.sides.includes("bottom") || section === this.firstSection()) {
            return border;
        }
        return { ...border, sides: border.sides.filter((side) => side !== "top") };
    }

    /**
     * @returns {HTMLElement} The section that comes first on the page.
     */
    firstSection() {
        let first;
        this._sections.forEach((section) => {
            if (!first || first.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_PRECEDING) {
                first = section;
            }
        });
        return first;
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
