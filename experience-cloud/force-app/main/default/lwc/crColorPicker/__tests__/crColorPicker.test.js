import { createElement } from "lwc";
import CrColorPicker from "c/crColorPicker";

describe("c-cr-color-picker", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderPicker = (value) => {
        const element = createElement("c-cr-color-picker", { is: CrColorPicker });
        if (value !== undefined) {
            element.value = value;
        }
        document.body.appendChild(element);
        return element;
    };

    const trigger = (element) => element.shadowRoot.querySelector(".color-trigger");
    const colorField = (element) => element.shadowRoot.querySelector("lightning-input");
    const choiceButton = (element, mode) => element.shadowRoot.querySelector(`.color-choice[data-mode="${mode}"]`);

    it("names the color in the choices when a color name is given", async () => {
        const element = createElement("c-cr-color-picker", { is: CrColorPicker });
        element.colorName = "Background";
        document.body.appendChild(element);

        trigger(element).click();
        await Promise.resolve();

        const labels = Array.from(element.shadowRoot.querySelectorAll(".color-choice")).map((b) =>
            b.textContent.trim()
        );
        expect(labels).toEqual(["Use Default Background Color", "Use Custom Background Color"]);
    });

    it("shows the default choice on the field, with the choices closed", () => {
        const element = renderPicker("");

        expect(trigger(element).textContent).toContain("Use Default Color");
        expect(element.shadowRoot.querySelector(".color-choices")).toBeNull();
        expect(colorField(element)).toBeNull();
    });

    it("shows the custom color on the field when a color is stored", () => {
        const element = renderPicker("#ff0000");

        expect(trigger(element).textContent).toContain("Use Custom Color");
        expect(element.shadowRoot.querySelector(".color-trigger .color-dot").getAttribute("style")).toContain(
            "#ff0000"
        );
        expect(colorField(element).value).toBe("#ff0000");
    });

    it("opens the choices with a labeled dot for each", async () => {
        const element = renderPicker("");

        trigger(element).click();
        await Promise.resolve();

        const labels = Array.from(element.shadowRoot.querySelectorAll(".color-choice")).map((b) =>
            b.textContent.trim()
        );
        expect(labels).toEqual(["Use Default Color", "Use Custom Color"]);
        expect(element.shadowRoot.querySelectorAll(".color-choice .color-dot").length).toBe(2);
    });

    it("starts a custom color from the standard text color, and closes the choices", async () => {
        const element = renderPicker("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        trigger(element).click();
        await Promise.resolve();

        choiceButton(element, "custom").click();
        await Promise.resolve();

        expect(handler.mock.calls[0][0].detail.value).toBe("#1a1b1e");
        expect(element.shadowRoot.querySelector(".color-choices")).toBeNull();
        expect(colorField(element)).not.toBeNull();
    });

    it("sends the color the author picks", () => {
        const element = renderPicker("#1a1b1e");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);

        colorField(element).value = "#00ff00";
        colorField(element).dispatchEvent(new CustomEvent("change"));

        expect(handler.mock.calls[0][0].detail.value).toBe("#00ff00");
    });

    it("clears the color and hides the field when the default is chosen", async () => {
        const element = renderPicker("#1a1b1e");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        trigger(element).click();
        await Promise.resolve();

        choiceButton(element, "default").click();
        await Promise.resolve();

        expect(handler.mock.calls[0][0].detail.value).toBe("");
        expect(colorField(element)).toBeNull();
    });
});
