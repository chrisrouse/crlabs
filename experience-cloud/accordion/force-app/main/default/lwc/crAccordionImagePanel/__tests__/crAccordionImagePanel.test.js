import { createElement } from "lwc";
import CrAccordionImagePanel from "c/crAccordionImagePanel";
import CrAccordionImage from "c/crAccordionImage";
import { publishAccordionState } from "c/crAccordionLink";

describe("c-cr-accordion-image-panel", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    let linkCount = 0;

    const renderPanel = () => {
        const linkName = `panel-test-${++linkCount}`;
        const panel = createElement("c-cr-accordion-image-panel", { is: CrAccordionImagePanel });
        panel.linkedAccordion = linkName;
        const pricing = createElement("c-cr-accordion-image", { is: CrAccordionImage });
        pricing.sectionName = "Pricing";
        const support = createElement("c-cr-accordion-image", { is: CrAccordionImage });
        support.sectionName = "support";
        panel.appendChild(pricing);
        panel.appendChild(support);
        document.body.appendChild(panel);
        return { linkName, panel, pricing, support };
    };

    const defaultHidden = (panel) =>
        panel.shadowRoot.querySelector(".cr-panel__default").classList.contains("is-hidden");

    it("shows the default image while no linked section is open", () => {
        const { panel, pricing, support } = renderPanel();

        expect(defaultHidden(panel)).toBe(false);
        expect(pricing.active).toBe(false);
        expect(support.active).toBe(false);
    });

    it("shows the image whose Section Name matches the open section, ignoring case", async () => {
        const { linkName, panel, pricing, support } = renderPanel();

        publishAccordionState(linkName, { open: ["pricing"] });
        await Promise.resolve();

        expect(pricing.active).toBe(true);
        expect(support.active).toBe(false);
        expect(defaultHidden(panel)).toBe(true);
    });

    it("shows the most recently opened section's image when several are open", () => {
        const { linkName, pricing, support } = renderPanel();

        publishAccordionState(linkName, { open: ["pricing", "support"] });

        expect(support.active).toBe(true);
        expect(pricing.active).toBe(false);
    });

    it("falls back to the default image when the open section has no image", async () => {
        const { linkName, panel } = renderPanel();

        publishAccordionState(linkName, { open: ["shipping"] });
        await Promise.resolve();

        expect(defaultHidden(panel)).toBe(false);
    });
});
