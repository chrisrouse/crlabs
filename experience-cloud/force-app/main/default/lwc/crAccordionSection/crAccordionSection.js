import { LightningElement, api } from "lwc";

let sectionCount = 0;

/**
 * Whether the component is running in the Experience Builder canvas. The canvas runs in a frame
 * on the live-preview host. This checks the frame's address, which is not a documented API, so
 * it falls back to closed if the address changes.
 * @returns {boolean}
 */
function isInExperienceBuilder() {
    return window.location.hostname.includes("live-preview.salesforce-experience.com");
}

/**
 * Whether Builder has this component selected. The Builder marks the selected component with a
 * selection overlay inside its component wrapper. That markup is not a documented API.
 * @param {HTMLElement} wrapper The component wrapper that holds the Builder's selection overlay.
 * @returns {boolean}
 */
function isSelectedInBuilder(wrapper) {
    return Boolean(wrapper.querySelector(".interactions-proxy-select"));
}

/**
 * One section of a crAccordion, or a section on its own. The header is the title slot,
 * the actions slot sits at the right, and the content slot is the expandable body.
 * In the Builder canvas, a section opens when it's selected, so the section being edited is open.
 * @slot title
 * @slot actions
 * @slot content
 */
export default class CrAccordionSection extends LightningElement {
    _expanded = false;
    _builderWrapper;
    _builderObserver;
    contentId = `cr-accordion-content-${++sectionCount}`;

    /**
     * Whether the section is open. A parent accordion sets this to close the section.
     * @returns {boolean}
     */
    @api
    get expanded() {
        return this._expanded;
    }
    set expanded(value) {
        this._expanded = Boolean(value);
    }

    /**
     * Tells a parent accordion that this section has joined, so it can close the others when
     * this one opens.
     */
    connectedCallback() {
        this.dispatchEvent(new CustomEvent("sectionregister", { bubbles: true }));
    }

    /**
     * Watches the Builder's selection once the section is rendered in the canvas.
     */
    renderedCallback() {
        if (this._builderWrapper || !isInExperienceBuilder()) {
            return;
        }
        this._builderWrapper = this.template.host.closest("webruntimedesign-component-wrapper");
        if (this._builderWrapper) {
            this._builderObserver = new MutationObserver(this.handleBuilderChange);
            this._builderObserver.observe(this._builderWrapper, { childList: true, subtree: true });
            this.handleBuilderChange();
        }
    }

    /**
     * Stops watching the Builder's selection, and tells a parent accordion that this section has left.
     */
    disconnectedCallback() {
        if (this._builderObserver) {
            this._builderObserver.disconnect();
        }
        this.dispatchEvent(new CustomEvent("sectionunregister", { bubbles: true }));
    }

    /**
     * Opens the section when Builder selects it. Deselecting leaves it as it is.
     */
    handleBuilderChange = () => {
        if (!this._expanded && isSelectedInBuilder(this._builderWrapper)) {
            this.setExpanded(true);
        }
    };

    /**
     * @returns {string} The SLDS section classes, including slds-is-open when expanded.
     */
    get sectionClass() {
        return this._expanded ? "slds-accordion__section slds-is-open" : "slds-accordion__section";
    }

    /**
     * @returns {string} The open state for assistive technology.
     */
    get ariaExpanded() {
        return String(this._expanded);
    }

    /**
     * Opens or closes the section from its header. Stops the click here, so it doesn't reach
     * the accordion as a separate event.
     * @param {Event} event The click on the header button.
     */
    handleHeaderClick(event) {
        event.stopPropagation();
        this.setExpanded(!this._expanded);
    }

    /**
     * Sets the open state and tells a parent accordion, so it can close the other sections.
     * @param {boolean} open Whether the section should be open.
     */
    setExpanded(open) {
        this._expanded = open;
        this.dispatchEvent(new CustomEvent("sectiontoggle", { bubbles: true, detail: { open } }));
    }
}
