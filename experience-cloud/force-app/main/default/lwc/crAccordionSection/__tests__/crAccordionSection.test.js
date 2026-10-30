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
});
