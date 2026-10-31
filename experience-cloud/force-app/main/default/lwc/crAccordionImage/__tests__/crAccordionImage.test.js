import { createElement } from "lwc";
import CrAccordionImage from "c/crAccordionImage";

describe("c-cr-accordion-image", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderImage = (sectionName) => {
        const element = createElement("c-cr-accordion-image", { is: CrAccordionImage });
        element.sectionName = sectionName;
        document.body.appendChild(element);
        return element;
    };

    const box = (element) => element.shadowRoot.querySelector(".cr-image");

    it("is hidden until the panel makes it active", async () => {
        const element = renderImage("pricing");
        expect(box(element).classList.contains("is-hidden")).toBe(true);

        element.active = true;
        await Promise.resolve();
        expect(box(element).classList.contains("is-active")).toBe(true);
    });

    it("stays visible while it has no Section Name, so it can be named", () => {
        const element = renderImage("");

        expect(box(element).classList.contains("is-hidden")).toBe(false);
    });
});
