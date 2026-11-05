import { LightningElement, api } from "lwc";

/**
 * One image for an Accordion Image Panel. It shows while the linked accordion's section with the
 * same Section Name is open. Put a standard Image component in its Image slot. An image without a
 * Section Name always shows, so a newly added one can be seen and named.
 * @slot image
 */
export default class CrAccordionImage extends LightningElement {
    /** Build label from the properties panel. Not used by the component. */
    @api versionInfo;

    /** Whether the panel is showing this image. The panel sets this. */
    @api active = false;

    _sectionName = "";

    /**
     * The Section Name of the accordion section this image belongs to.
     * @returns {string}
     */
    @api
    get sectionName() {
        return this._sectionName;
    }
    set sectionName(value) {
        this._sectionName = value || "";
        this.dispatchEvent(new CustomEvent("accordionimagechange", { bubbles: true }));
    }

    /**
     * Joins the panel that holds it.
     */
    connectedCallback() {
        this.dispatchEvent(new CustomEvent("accordionimageregister", { bubbles: true }));
    }

    /**
     * Shows the image while it's active, or while it has no Section Name yet.
     * @returns {string}
     */
    get itemClass() {
        if (!this._sectionName.trim()) {
            return "cr-image";
        }
        return this.active ? "cr-image is-active" : "cr-image is-hidden";
    }
}
