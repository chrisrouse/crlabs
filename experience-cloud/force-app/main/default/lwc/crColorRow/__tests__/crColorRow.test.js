import { createElement } from "lwc";
import CrColorRow from "c/crColorRow";

describe("c-cr-color-row", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderRow = (value) => {
        const element = createElement("c-cr-color-row", { is: CrColorRow });
        element.label = "Background";
        if (value !== undefined) {
            element.value = value;
        }
        document.body.appendChild(element);
        return element;
    };

    const openRow = async (element) => {
        element.shadowRoot.querySelector(".color-row__trigger").click();
        await Promise.resolve();
    };

    it("shows the label and a default dot when no color is set", () => {
        const element = renderRow("");

        expect(element.shadowRoot.querySelector(".color-row__label").textContent).toBe("Background");
        expect(element.shadowRoot.querySelector(".color-dot").classList.contains("is-default")).toBe(true);
        expect(element.shadowRoot.querySelector(".color-row__detail")).toBeNull();
    });

    it("fills the dot with the custom color", () => {
        const element = renderRow("#ff0000");

        expect(element.shadowRoot.querySelector(".color-dot").getAttribute("style")).toContain("#ff0000");
    });

    it("opens the default and custom choices when the row is clicked", async () => {
        const element = renderRow("");

        await openRow(element);

        expect(element.shadowRoot.querySelector(".color-row__detail")).not.toBeNull();
        expect(element.shadowRoot.querySelector('[data-choice="default"]').getAttribute("aria-pressed")).toBe("true");
    });

    it("starts a custom color from the standard text color", async () => {
        const element = renderRow("");
        const handler = jest.fn();
        element.addEventListener("colorchange", handler);
        await openRow(element);

        element.shadowRoot.querySelector('[data-choice="custom"]').click();

        expect(handler.mock.calls[0][0].detail.value).toBe("#1a1b1e");
    });

    it("clears the color when Use Default is chosen", async () => {
        const element = renderRow("#ff0000");
        const handler = jest.fn();
        element.addEventListener("colorchange", handler);
        await openRow(element);

        element.shadowRoot.querySelector('[data-choice="default"]').click();

        expect(handler.mock.calls[0][0].detail.value).toBe("");
    });

    it("sends the color picked in the custom field", async () => {
        const element = renderRow("#ff0000");
        const handler = jest.fn();
        element.addEventListener("colorchange", handler);
        await openRow(element);

        const field = element.shadowRoot.querySelector("lightning-input");
        field.value = "#00ff00";
        field.dispatchEvent(new CustomEvent("change"));

        expect(handler.mock.calls[0][0].detail.value).toBe("#00ff00");
    });

    const opacityField = (element) => element.shadowRoot.querySelector('input[data-field="opacity"]');

    const setOpacity = (element, value) => {
        const field = opacityField(element);
        field.value = value;
        field.dispatchEvent(new CustomEvent("input"));
        field.dispatchEvent(new CustomEvent("change"));
    };

    it("shows full opacity for a 6-digit color, and reads the opacity from an 8-digit one", async () => {
        const element = renderRow("#ff0000");
        await openRow(element);
        expect(opacityField(element).value).toBe("100");

        element.value = "#ff000080";
        await Promise.resolve();
        expect(opacityField(element).value).toBe("50");
        expect(element.shadowRoot.querySelector('lightning-input[data-field="color"]').value).toBe("#ff0000");
    });

    it("stores the opacity in the color's last two digits when the slider is released", async () => {
        const element = renderRow("#ff0000");
        const handler = jest.fn();
        element.addEventListener("colorchange", handler);
        await openRow(element);

        setOpacity(element, "50");

        expect(handler.mock.calls[0][0].detail.value).toBe("#ff000080");
    });

    it("keeps the opacity when the color changes", async () => {
        const element = renderRow("#ff000080");
        const handler = jest.fn();
        element.addEventListener("colorchange", handler);
        await openRow(element);

        const field = element.shadowRoot.querySelector('lightning-input[data-field="color"]');
        field.value = "#00ff00";
        field.dispatchEvent(new CustomEvent("change"));

        expect(handler.mock.calls[0][0].detail.value).toBe("#00ff0080");
    });

    it("stores plain hex at full opacity, and fully transparent at 0", async () => {
        const element = renderRow("#ff000080");
        const handler = jest.fn();
        element.addEventListener("colorchange", handler);
        await openRow(element);

        setOpacity(element, "100");
        expect(handler.mock.calls[0][0].detail.value).toBe("#ff0000");

        setOpacity(element, "0");
        expect(handler.mock.calls[1][0].detail.value).toBe("#ff000000");
    });

    it("shows the opacity while dragging but sends it only on release", async () => {
        const element = renderRow("#ff0000");
        const handler = jest.fn();
        element.addEventListener("colorchange", handler);
        await openRow(element);

        opacityField(element).value = "30";
        opacityField(element).dispatchEvent(new CustomEvent("input"));
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".slds-slider__value").textContent).toBe("30%");
        expect(handler).not.toHaveBeenCalled();
    });
});
