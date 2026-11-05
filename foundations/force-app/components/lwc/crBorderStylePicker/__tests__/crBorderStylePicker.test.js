import { createElement } from "lwc";
import CrBorderStylePicker from "c/crBorderStylePicker";

describe("c-cr-border-style-picker", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderPicker = (props = {}) => {
        const element = createElement("c-cr-border-style-picker", {
            is: CrBorderStylePicker
        });
        Object.assign(element, props);
        document.body.appendChild(element);
        return element;
    };

    const button = (element, value) => element.shadowRoot.querySelector(`button[data-value="${value}"]`);

    it("shows the label and presses solid when no style is stored", () => {
        const element = renderPicker({ label: "Line Style", value: "" });

        expect(element.shadowRoot.querySelector("legend").textContent).toBe("Line Style");
        expect(button(element, "solid").getAttribute("aria-pressed")).toBe("true");
        expect(button(element, "dashed").getAttribute("aria-pressed")).toBe("false");
    });

    it("sends stylechange and presses the clicked style", async () => {
        const element = renderPicker({ value: "solid" });
        const handler = jest.fn();
        element.addEventListener("stylechange", handler);

        button(element, "dotted").click();
        await Promise.resolve();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe("dotted");
        expect(button(element, "dotted").getAttribute("aria-pressed")).toBe("true");
        expect(button(element, "solid").getAttribute("aria-pressed")).toBe("false");
    });

    it("sends nothing when the chosen style is clicked again", () => {
        const element = renderPicker({ value: "dashed" });
        const handler = jest.fn();
        element.addEventListener("stylechange", handler);

        button(element, "dashed").click();

        expect(handler).not.toHaveBeenCalled();
    });
});
