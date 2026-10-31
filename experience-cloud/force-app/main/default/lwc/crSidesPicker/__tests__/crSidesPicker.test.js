import { createElement } from "lwc";
import CrSidesPicker from "c/crSidesPicker";

describe("c-cr-sides-picker", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderPicker = (value) => {
        const element = createElement("c-cr-sides-picker", { is: CrSidesPicker });
        if (value !== undefined) {
            element.value = value;
        }
        document.body.appendChild(element);
        return element;
    };

    const tile = (element, side) => element.shadowRoot.querySelector(`button[data-side="${side}"]`);
    const pressed = (element) =>
        Array.from(element.shadowRoot.querySelectorAll("button"))
            .filter((button) => button.getAttribute("aria-pressed") === "true")
            .map((button) => button.dataset.side);

    it("shows Top, Right, Bottom, and Left, all on by default", () => {
        const element = renderPicker();

        const labels = Array.from(element.shadowRoot.querySelectorAll("button")).map((b) => b.textContent.trim());
        expect(labels).toEqual(["Top", "Right", "Bottom", "Left"]);
        expect(pressed(element)).toEqual(["top", "right", "bottom", "left"]);
    });

    it("turns a side off and on, reporting the sides in CSS order", async () => {
        const element = renderPicker(["top", "bottom"]);
        const handler = jest.fn();
        element.addEventListener("sideschange", handler);

        tile(element, "left").click();
        expect(handler.mock.calls[0][0].detail.value).toEqual(["top", "bottom", "left"]);

        tile(element, "top").click();
        expect(handler.mock.calls[1][0].detail.value).toEqual(["bottom", "left"]);
        await Promise.resolve();
        expect(pressed(element)).toEqual(["bottom", "left"]);
    });
});
