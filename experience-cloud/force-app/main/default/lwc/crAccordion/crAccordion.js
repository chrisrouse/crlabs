import { LightningElement, api } from "lwc";

/**
 * Container for crAccordionSection. Opening one section closes the others, unless
 * multiple sections are allowed to stay open.
 * @slot sections
 */
export default class CrAccordion extends LightningElement {
    /** Lets more than one section stay open. Off by default. */
    @api allowMultipleSectionsOpen = false;

    _sections = new Set();

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
     * Records a section that has joined the accordion.
     * @param {CustomEvent} event The sectionregister event from a section.
     */
    handleSectionRegister = (event) => {
        this._sections.add(event.target);
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
