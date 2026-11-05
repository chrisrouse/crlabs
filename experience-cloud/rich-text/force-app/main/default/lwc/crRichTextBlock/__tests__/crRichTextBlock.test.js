import { createElement } from "lwc";
import CrRichTextBlock from "c/crRichTextBlock";

describe("c-cr-rich-text-block", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderBlock = (content) => {
        const element = createElement("c-cr-rich-text-block", { is: CrRichTextBlock });
        if (content !== undefined) {
            element.content = content;
        }
        document.body.appendChild(element);
        return element.shadowRoot.querySelector("lightning-formatted-rich-text");
    };

    it("renders an empty value when no content has been stored", () => {
        expect(renderBlock().value).toBe("");
    });

    it("sets the extra-large heading hooks on an H1", () => {
        const formatted = renderBlock("<h1>A</h1>");

        expect(formatted.value).toContain("font-size: var(--dxp-s-text-heading-extra-large-font-size);");
        expect(formatted.value).toContain("font-family: var(--dxp-s-text-heading-extra-large-font-family);");
        expect(formatted.value).toContain("color: var(--dxp-s-text-heading-extra-large-color);");
        expect(formatted.value).toContain(">A</h1>");
    });

    it("sets each heading level from its own hooks", () => {
        const formatted = renderBlock("<h2>B</h2><h4>D</h4><h6>F</h6>");

        expect(formatted.value).toContain("font-size: var(--dxp-s-text-heading-large-font-size);");
        expect(formatted.value).toContain("font-size: var(--dxp-s-text-heading-small-font-size);");
        expect(formatted.value).toContain("font-size: var(--dxp-s-text-heading-extra-extra-small-font-size);");
    });

    it("sets the body hooks on paragraphs, using the body text color", () => {
        const formatted = renderBlock("<p><strong>Hello</strong></p>");

        expect(formatted.value).toContain("font-size: var(--dxp-s-body-font-size);");
        expect(formatted.value).toContain("color: var(--dxp-s-body-text-color);");
        expect(formatted.value).toContain("<strong>Hello</strong>");
    });

    it("keeps styles the author already set, and lets the site's styles follow them", () => {
        const formatted = renderBlock('<h2 style="text-align: center;">Title</h2>');

        expect(formatted.value).toMatch(
            /^<h2 style="text-align: center; font-family: var\(--dxp-s-text-heading-large-font-family\);/
        );
    });

    it("keeps a color the author set on words inside a heading, and still sets the site color", () => {
        const formatted = renderBlock('<h2><span style="color: rgb(255, 0, 0);">Red</span> word</h2>');

        expect(formatted.value).toContain('<span style="color: rgb(255, 0, 0);">Red</span>');
        expect(formatted.value).toContain("color: var(--dxp-s-text-heading-large-color);");
    });

    it("keeps a color the author set on the paragraph itself, instead of the site color", () => {
        const formatted = renderBlock('<p style="color: rgb(0, 0, 255);">Blue</p>');

        expect(formatted.value).toContain('style="color: rgb(0, 0, 255); ');
        expect(formatted.value).not.toContain("color: var(--dxp-s-body-text-color);");
    });
});
