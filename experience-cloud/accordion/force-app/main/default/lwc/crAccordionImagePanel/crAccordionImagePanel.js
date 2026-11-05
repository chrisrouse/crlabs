import { LightningElement, api } from "lwc";
import { normalizeName, subscribeToAccordion } from "c/crAccordionLink";

/**
 * Shows the image for the open section of a linked accordion, beside it or anywhere on the page.
 * Each Accordion Image in the Images slot names its section. While no linked section is open, or the
 * open one has no image, the Default Image shows. In the Builder canvas, selecting a section opens
 * it, which shows its image for editing.
 * @slot defaultImage
 * @slot images
 */
export default class CrAccordionImagePanel extends LightningElement {
    /** Build label from the properties panel. Not used by the component. */
    @api versionInfo;

    _linkedAccordion = "";
    _state = { open: [] };
    _images = new Set();
    _hasActiveImage = false;
    _unsubscribe = () => {};

    /**
     * The Link Name of the accordion this panel follows.
     * @returns {string}
     */
    @api
    get linkedAccordion() {
        return this._linkedAccordion;
    }
    set linkedAccordion(value) {
        this._linkedAccordion = value || "";
        if (this.isConnected) {
            this.subscribe();
        }
    }

    /**
     * Listens for images joining and for the linked accordion's state.
     */
    connectedCallback() {
        this.addEventListener("accordionimageregister", this.handleImageRegister);
        this.addEventListener("accordionimagechange", this.handleImageChange);
        this.subscribe();
    }

    /**
     * Stops listening to the accordion.
     */
    disconnectedCallback() {
        this._unsubscribe();
    }

    /**
     * Follows the linked accordion, replacing any earlier link.
     */
    subscribe() {
        this._unsubscribe();
        this._unsubscribe = subscribeToAccordion(this._linkedAccordion, (state) => {
            this._state = state;
            this.updateImages();
        });
    }

    /**
     * Records an image that has joined the panel.
     * @param {CustomEvent} event The accordionimageregister event from an image.
     */
    handleImageRegister = (event) => {
        this._images.add(event.target);
        this.updateImages();
    };

    /**
     * Updates the images when an author renames one.
     */
    handleImageChange = () => {
        this.updateImages();
    };

    /**
     * The name of the section whose image shows: the most recently opened one.
     * @returns {string}
     */
    get activeName() {
        return this._state.open[this._state.open.length - 1] || "";
    }

    /**
     * Tells each image whether it's showing. Images that have left the page are forgotten.
     */
    updateImages() {
        const active = this.activeName;
        this._images.forEach((image) => {
            if (!image.isConnected) {
                this._images.delete(image);
                return;
            }
            const name = normalizeName(image.sectionName);
            image.active = Boolean(active) && name === active;
        });
        this._hasActiveImage = [...this._images].some((image) => image.active);
    }

    /**
     * The default image shows while no image is active.
     * @returns {string}
     */
    get defaultClass() {
        return this._hasActiveImage ? "cr-panel__default is-hidden" : "cr-panel__default";
    }
}
