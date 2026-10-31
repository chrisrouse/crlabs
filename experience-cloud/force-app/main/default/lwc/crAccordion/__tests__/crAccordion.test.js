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

    it("passes the header and content colors from the appearance to every section", async () => {
        const { accordion, first, second } = renderAccordion();

        accordion.appearance = JSON.stringify({
            header: { background: "#ff0000", openBackground: "#0000ff" },
            content: { background: "#00ff00" }
        });
        await Promise.resolve();

        [first, second].forEach((section) => {
            expect(section.headerBackgroundColor).toBe("#ff0000");
            expect(section.headerOpenBackgroundColor).toBe("#0000ff");
            expect(section.contentBackgroundColor).toBe("#00ff00");
        });
    });

    it("uses the shared defaults when no appearance is stored", () => {
        const { first } = renderAccordion();

        expect(first.iconSize).toBe("xx-small");
        expect(first.hideIcon).toBe(false);
        expect(first.headerBackgroundColor).toBe("");
    });

    const wrapperStyle = (accordion) => accordion.shadowRoot.querySelector(".slds-accordion").getAttribute("style");

    it("uses 1.5 rem between sections by default", () => {
        const { accordion } = renderAccordion();

        expect(wrapperStyle(accordion)).toContain("--dxp-c-l-component-spacer-size: 1.5rem");
        expect(wrapperStyle(accordion)).toContain("--dxp-c-s-component-spacer-size: 1.5rem");
    });

    it("sets the chosen space between sections in rem, including 0", async () => {
        const { accordion } = renderAccordion();

        accordion.appearance = JSON.stringify({ spacing: { between: 0 } });
        await Promise.resolve();

        expect(wrapperStyle(accordion)).toContain("--dxp-c-l-component-spacer-size: 0rem");
    });

    it("hides the Actions slot in every section when Show Actions is off", async () => {
        const { accordion, first, second } = renderAccordion();

        accordion.showActions = false;
        await Promise.resolve();

        [first, second].forEach((section) => {
            expect(section.shadowRoot.querySelector('slot[name="actions"]')).toBeNull();
        });
    });

    it("passes the section border from the appearance to every section", async () => {
        const { accordion, first, second } = renderAccordion();

        accordion.appearance = JSON.stringify({ sectionBorder: { size: "2px", style: "dotted", radius: "8px" } });
        await Promise.resolve();

        [first, second].forEach((section) => {
            expect(section.sectionBorder.size).toBe("2px");
            expect(section.sectionBorder.style).toBe("dotted");
            expect(section.sectionBorder.radius).toBe("8px");
        });
    });

    it("draws no container border by default", () => {
        const { accordion } = renderAccordion();

        expect(wrapperStyle(accordion)).not.toContain("border:");
    });

    it("draws the container border around the accordion", async () => {
        const { accordion } = renderAccordion();

        accordion.appearance = JSON.stringify({
            containerBorder: { color: "#00ff00", size: "3px", style: "dotted", radius: "1rem" }
        });
        await Promise.resolve();

        expect(wrapperStyle(accordion)).toContain("border: 3px dotted #00ff00");
        expect(wrapperStyle(accordion)).toContain("border-radius: 1rem");
    });

    it("gives every section the animation", async () => {
        const { accordion, first, second } = renderAccordion();

        accordion.appearance = JSON.stringify({ animation: { type: "slide", speed: "slow" } });
        await Promise.resolve();

        expect(first.animation).toEqual({ type: "slide", speed: "slow" });
        expect(second.animation).toEqual({ type: "slide", speed: "slow" });
    });
});
