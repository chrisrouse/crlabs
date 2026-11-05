import { LightningElement, wire } from "lwc";
import { CurrentPageReference } from "lightning/navigation";

/**
 * Theme layout for an LWR site: a full-width header and footer, with a sidebar beside the page content.
 * At phone width the sidebar becomes a drawer that the header's menu button opens.
 * The theme layout stays mounted while a visitor moves between pages, so the drawer closes on each page change.
 * @slot header
 * @slot sidebar
 * @slot footer
 */
export default class CrSidebarLayout extends LightningElement {
    drawerOpen = false;

    /**
     * Closes the drawer whenever the page changes, so a link tapped in the drawer doesn't leave it covering the new page.
     */
    @wire(CurrentPageReference)
    handlePageChange() {
        this.drawerOpen = false;
    }

    connectedCallback() {
        this.template.addEventListener("keydown", this.handleKeydown);
    }

    disconnectedCallback() {
        this.template.removeEventListener("keydown", this.handleKeydown);
    }

    get layoutClass() {
        return this.drawerOpen ? "layout drawer-open" : "layout";
    }

    get ariaExpanded() {
        return String(this.drawerOpen);
    }

    get menuButtonLabel() {
        return this.drawerOpen ? "Close menu" : "Open menu";
    }

    handleMenuClick() {
        this.drawerOpen = !this.drawerOpen;
    }

    handleScrimClick() {
        this.drawerOpen = false;
    }

    /**
     * Escape closes the drawer and returns focus to the menu button.
     * @param {KeyboardEvent} event the keydown inside the layout
     */
    handleKeydown = (event) => {
        if (event.key !== "Escape" || !this.drawerOpen) {
            return;
        }
        this.drawerOpen = false;
        this.template.querySelector(".menu-button").focus();
    };
}
