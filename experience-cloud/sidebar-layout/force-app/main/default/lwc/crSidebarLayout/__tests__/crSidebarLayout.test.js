import { createElement } from "lwc";
import CrSidebarLayout from "c/crSidebarLayout";
import { CurrentPageReference } from "lightning/navigation";

describe("c-cr-sidebar-layout", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderLayout = () => {
        const layout = createElement("c-cr-sidebar-layout", { is: CrSidebarLayout });
        document.body.appendChild(layout);
        return layout;
    };

    const menuButton = (layout) => layout.shadowRoot.querySelector(".menu-button");
    const isDrawerOpen = (layout) => layout.shadowRoot.querySelector(".layout").classList.contains("drawer-open");

    it("renders the header, sidebar, footer and default slots", () => {
        const layout = renderLayout();
        const names = [...layout.shadowRoot.querySelectorAll("slot")].map((slot) => slot.name);

        expect(names).toEqual(["header", "sidebar", "", "footer"]);
    });

    it("opens and closes the drawer from the menu button", async () => {
        const layout = renderLayout();

        menuButton(layout).click();
        await Promise.resolve();
        expect(isDrawerOpen(layout)).toBe(true);
        expect(menuButton(layout).getAttribute("aria-expanded")).toBe("true");
        expect(menuButton(layout).getAttribute("aria-label")).toBe("Close menu");

        menuButton(layout).click();
        await Promise.resolve();
        expect(isDrawerOpen(layout)).toBe(false);
        expect(menuButton(layout).getAttribute("aria-expanded")).toBe("false");
    });

    it("closes the drawer when the scrim is clicked", async () => {
        const layout = renderLayout();

        menuButton(layout).click();
        await Promise.resolve();
        layout.shadowRoot.querySelector(".scrim").click();
        await Promise.resolve();

        expect(isDrawerOpen(layout)).toBe(false);
    });

    it("closes the drawer on Escape and returns focus to the menu button", async () => {
        const layout = renderLayout();

        menuButton(layout).click();
        await Promise.resolve();
        layout.shadowRoot.querySelector(".sidebar").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await Promise.resolve();

        expect(isDrawerOpen(layout)).toBe(false);
        expect(layout.shadowRoot.activeElement).toBe(menuButton(layout));
    });

    it("closes the drawer when the page changes", async () => {
        const layout = renderLayout();

        menuButton(layout).click();
        await Promise.resolve();
        CurrentPageReference.emit({ type: "comm__namedPage", attributes: { name: "Home" } });
        await Promise.resolve();

        expect(isDrawerOpen(layout)).toBe(false);
    });
});
