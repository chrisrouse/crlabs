import { createElement } from "lwc";
import CrRichTextEditor from "c/crRichTextEditor";

describe("c-cr-rich-text-editor", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
    });

    it("removes the Font and Size menus, and keeps the Color menu", () => {
        const element = createElement("c-cr-rich-text-editor", { is: CrRichTextEditor });
        document.body.appendChild(element);

        const input = element.shadowRoot.querySelector("lightning-input-rich-text");
        expect(input.formats).not.toContain("font");
        expect(input.formats).not.toContain("size");
        expect(input.formats).toContain("color");
    });

    it("shows the stored HTML in the rich text input", () => {
        const element = createElement("c-cr-rich-text-editor", { is: CrRichTextEditor });
        element.value = "<p>Stored</p>";
        document.body.appendChild(element);

        const input = element.shadowRoot.querySelector("lightning-input-rich-text");
        expect(input.value).toBe("<p>Stored</p>");
    });

    it("dispatches valuechange with the edited HTML after typing pauses", () => {
        jest.useFakeTimers();
        const element = createElement("c-cr-rich-text-editor", { is: CrRichTextEditor });
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        document.body.appendChild(element);

        const input = element.shadowRoot.querySelector("lightning-input-rich-text");
        input.value = "<p>Edited</p>";
        input.dispatchEvent(new CustomEvent("change"));

        expect(handler).not.toHaveBeenCalled();
        jest.advanceTimersByTime(300);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe("<p>Edited</p>");
    });

    it("sends one valuechange for a burst of keystrokes, with the latest HTML", () => {
        jest.useFakeTimers();
        const element = createElement("c-cr-rich-text-editor", { is: CrRichTextEditor });
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        document.body.appendChild(element);

        const input = element.shadowRoot.querySelector("lightning-input-rich-text");
        ["<p>H</p>", "<p>He</p>", "<p>Hel</p>"].forEach((html) => {
            input.value = html;
            input.dispatchEvent(new CustomEvent("change"));
            jest.advanceTimersByTime(100);
        });
        expect(handler).not.toHaveBeenCalled();

        jest.advanceTimersByTime(300);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe("<p>Hel</p>");
    });

    it("sends a pending edit when the editor is removed before the pause ends", () => {
        jest.useFakeTimers();
        const element = createElement("c-cr-rich-text-editor", { is: CrRichTextEditor });
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        document.body.appendChild(element);

        const input = element.shadowRoot.querySelector("lightning-input-rich-text");
        input.value = "<p>Unsaved</p>";
        input.dispatchEvent(new CustomEvent("change"));
        document.body.removeChild(element);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe("<p>Unsaved</p>");
    });

    describe("paragraph and heading menu", () => {
        const renderEditor = () => {
            const element = createElement("c-cr-rich-text-editor", { is: CrRichTextEditor });
            document.body.appendChild(element);
            const input = element.shadowRoot.querySelector("lightning-input-rich-text");
            input.setFormat = jest.fn();
            const menu = element.shadowRoot.querySelector("lightning-button-menu");
            return { element, input, menu };
        };

        const choose = (menu, value) => {
            menu.dispatchEvent(new CustomEvent("select", { detail: { value }, bubbles: true }));
        };

        const itemLabels = (element) =>
            Array.from(element.shadowRoot.querySelectorAll("lightning-menu-item")).map((item) => item.label);

        it("shows the menu with the text style icon", () => {
            const { menu } = renderEditor();

            expect(menu.iconName).toBe("utility:type_tool");
        });

        it("does not store the menu value as the editor text", () => {
            jest.useFakeTimers();
            const { element, menu } = renderEditor();
            const handler = jest.fn();
            element.addEventListener("valuechange", handler);

            choose(menu, "2");
            jest.advanceTimersByTime(300);

            expect(handler).not.toHaveBeenCalled();
        });

        it("lists Heading 1 through 6, then Paragraph 1", () => {
            const { element } = renderEditor();

            expect(itemLabels(element)).toEqual([
                "Heading 1",
                "Heading 2",
                "Heading 3",
                "Heading 4",
                "Heading 5",
                "Heading 6",
                "Paragraph 1"
            ]);
        });

        it("applies the chosen heading level to the editor", () => {
            const { input, menu } = renderEditor();

            choose(menu, "2");

            expect(input.setFormat).toHaveBeenCalledWith({ header: 2 });
        });

        it("applies Heading 6 as the last level", () => {
            const { input, menu } = renderEditor();

            choose(menu, "6");

            expect(input.setFormat).toHaveBeenCalledWith({ header: 6 });
        });

        it("applies Paragraph 1, which clears the heading", () => {
            const { input, menu } = renderEditor();

            choose(menu, "normal");

            expect(input.setFormat).toHaveBeenCalledWith({ header: false });
        });

        it("checks the last chosen style in the menu", async () => {
            const { element, menu } = renderEditor();

            choose(menu, "3");
            await Promise.resolve();

            const checked = Array.from(element.shadowRoot.querySelectorAll("lightning-menu-item"))
                .filter((item) => item.checked)
                .map((item) => item.value);
            expect(checked).toEqual(["3"]);
        });
    });
});
