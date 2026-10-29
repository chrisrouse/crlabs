import { createElement } from "lwc";
import CrAccordion from "c/crAccordion";
import CrAccordionSection from "c/crAccordionSection";

describe("c-cr-accordion", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderAccordion = (allowMultipleSectionsOpen) => {
        const accordion = createElement("c-cr-accordion", { is: CrAccordion });
        if (allowMultipleSectionsOpen !== undefined) {
            accordion.allowMultipleSectionsOpen = allowMultipleSectionsOpen;
        }
        const first = createElement("c-cr-accordion-section", { is: CrAccordionSection });
        const second = createElement("c-cr-accordion-section", { is: CrAccordionSection });
        accordion.appendChild(first);
        accordion.appendChild(second);
        document.body.appendChild(accordion);
        return { accordion, first, second };
    };

    const clickHeader = (section) => section.shadowRoot.querySelector("button").click();
    const isOpen = (section) => section.shadowRoot.querySelector("section").classList.contains("slds-is-open");

    it("does not allow multiple open sections by default", () => {
        const { accordion } = renderAccordion();

        expect(accordion.allowMultipleSectionsOpen).toBe(false);
    });

    it("closes the other sections when one opens", async () => {
        const { first, second } = renderAccordion(false);

        clickHeader(first);
        await Promise.resolve();
        expect(isOpen(first)).toBe(true);

        clickHeader(second);
        await Promise.resolve();
        expect(isOpen(second)).toBe(true);
        expect(isOpen(first)).toBe(false);
    });

    it("keeps the other sections open when multiple sections are allowed", async () => {
        const { first, second } = renderAccordion(true);

        clickHeader(first);
        clickHeader(second);
        await Promise.resolve();

        expect(isOpen(first)).toBe(true);
        expect(isOpen(second)).toBe(true);
    });
});
