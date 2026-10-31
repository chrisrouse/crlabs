import { createElement } from "lwc";
import CrAccordionSection from "c/crAccordionSection";

describe("c-cr-accordion-section", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderSection = () => {
        const element = createElement("c-cr-accordion-section", { is: CrAccordionSection });
        document.body.appendChild(element);
        return element;
    };

    const isOpen = (element) => element.shadowRoot.querySelector("section").classList.contains("slds-is-open");

    it("starts closed", () => {
        const element = renderSection();
        const button = element.shadowRoot.querySelector("button");

        expect(isOpen(element)).toBe(false);
        expect(button.getAttribute("aria-expanded")).toBe("false");
    });

    it("opens and closes when the header is clicked", async () => {
        const element = renderSection();
        const button = element.shadowRoot.querySelector("button");

        button.click();
        await Promise.resolve();

        expect(isOpen(element)).toBe(true);
        expect(button.getAttribute("aria-expanded")).toBe("true");

        button.click();
        await Promise.resolve();

        expect(isOpen(element)).toBe(false);
        expect(button.getAttribute("aria-expanded")).toBe("false");
    });

    it("tells its parent when it opens or closes", () => {
        const element = renderSection();
        const handler = jest.fn();
        element.addEventListener("sectiontoggle", handler);

        element.shadowRoot.querySelector("button").click();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.open).toBe(true);
    });

    it("ties the header button to the content it controls", () => {
        const element = renderSection();
        const button = element.shadowRoot.querySelector("button");
        const content = element.shadowRoot.querySelector(".slds-accordion__content");

        expect(content.id).toBeTruthy();
        expect(button.getAttribute("aria-controls")).toBe(content.id);
    });

    it("uses the open background on the header only while the section is open", async () => {
        const element = renderSection();
        element.headerBackgroundColor = "#eeeeee";
        element.headerOpenBackgroundColor = "#0176d3";
        await Promise.resolve();
        const header = () => element.shadowRoot.querySelector(".slds-accordion__summary");

        expect(header().getAttribute("style")).toContain("#eeeeee");

        element.shadowRoot.querySelector("button").click();
        await Promise.resolve();
        expect(header().getAttribute("style")).toContain("#0176d3");

        element.shadowRoot.querySelector("button").click();
        await Promise.resolve();
        expect(header().getAttribute("style")).toContain("#eeeeee");
    });

    it("keeps the regular header background when no open background is set", async () => {
        const element = renderSection();
        element.headerBackgroundColor = "#eeeeee";
        element.shadowRoot.querySelector("button").click();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".slds-accordion__summary").getAttribute("style")).toContain("#eeeeee");
    });

    const actionsSlot = (element) => element.shadowRoot.querySelector('slot[name="actions"]');

    it("shows the Actions slot by default", () => {
        const element = renderSection();

        expect(actionsSlot(element)).not.toBeNull();
    });

    it("leaves the Actions slot out when actions are hidden", async () => {
        const element = renderSection();
        element.showActions = false;
        await Promise.resolve();

        expect(actionsSlot(element)).toBeNull();
    });

    const sectionBox = (element) => element.shadowRoot.querySelector("section");

    it("draws no border by default", () => {
        const element = renderSection();

        expect(sectionBox(element).getAttribute("style") || "").not.toContain("border");
    });

    it("draws the border with the chosen size, style, and color", async () => {
        const element = renderSection();
        element.sectionBorder = { color: "#ff0000", size: "2px", style: "dashed", radius: "0px" };
        await Promise.resolve();

        expect(sectionBox(element).getAttribute("style")).toContain("border: 2px dashed #ff0000");
    });

    it("uses the site's border color when no color is chosen", async () => {
        const element = renderSection();
        element.sectionBorder = { size: "1px" };
        await Promise.resolve();

        expect(sectionBox(element).getAttribute("style")).toContain("border: 1px solid var(--slds-g-color-border-1");
    });

    it("rounds the corners and clips the colors to them", async () => {
        const element = renderSection();
        element.sectionBorder = { radius: "12px" };
        await Promise.resolve();

        const style = sectionBox(element).getAttribute("style");
        expect(style).toContain("border-radius: 12px");
        expect(style).toContain("overflow: hidden");
    });

    const sectionClasses = (element) => sectionBox(element).classList;

    it("doesn't animate by default", () => {
        const element = renderSection();

        expect(sectionClasses(element).contains("cr-animated")).toBe(false);
        expect(sectionBox(element).getAttribute("style") || "").not.toContain("--cr-accordion-duration");
    });

    it("animates with the chosen type and speed", async () => {
        const element = renderSection();
        element.animation = { type: "slide", speed: "fast" };
        await Promise.resolve();

        expect(sectionClasses(element).contains("cr-animate-slide")).toBe(true);
        expect(sectionBox(element).getAttribute("style")).toContain("--cr-accordion-duration: 250ms");
    });

    it("lets open content overflow only after it finishes opening, and clips it again when closing", async () => {
        const element = renderSection();
        element.animation = { type: "slide", speed: "normal" };
        element.shadowRoot.querySelector("button").click();
        await Promise.resolve();
        expect(sectionClasses(element).contains("cr-is-settled")).toBe(false);

        element.shadowRoot.querySelector(".slds-accordion__content").dispatchEvent(new CustomEvent("transitionend"));
        await Promise.resolve();
        expect(sectionClasses(element).contains("cr-is-settled")).toBe(true);

        element.shadowRoot.querySelector("button").click();
        await Promise.resolve();
        expect(sectionClasses(element).contains("cr-is-settled")).toBe(false);
    });

    const body = (element) => element.shadowRoot.querySelector(".cr-accordion__body");

    it("draws no separator by default", () => {
        const element = renderSection();

        expect(body(element).getAttribute("style") || "").not.toContain("border");
    });

    it("draws the separator as the top border of the content", async () => {
        const element = renderSection();
        element.separator = { color: "#123456", size: "2px", style: "dashed" };
        await Promise.resolve();

        expect(body(element).getAttribute("style")).toBe("border-top: 2px dashed #123456");
    });

    const iconStyle = (element) => element.shadowRoot.querySelector("lightning-icon").getAttribute("style") || "";

    it("uses the icon's open background only while the section is open", async () => {
        const element = renderSection();
        element.iconBackgroundColor = "#eeeeee";
        element.iconOpenBackgroundColor = "#0176d3";
        await Promise.resolve();
        expect(iconStyle(element)).toContain("#eeeeee");

        element.shadowRoot.querySelector("button").click();
        await Promise.resolve();
        expect(iconStyle(element)).toContain("#0176d3");
    });

    it("keeps the regular icon background when no open background is set", async () => {
        const element = renderSection();
        element.iconBackgroundColor = "#eeeeee";
        element.shadowRoot.querySelector("button").click();
        await Promise.resolve();

        expect(iconStyle(element)).toContain("#eeeeee");
    });
});
