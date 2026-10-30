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
});
