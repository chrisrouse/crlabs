import { createElement } from "lwc";
import CrPixelSlider from "c/crPixelSlider";

describe("c-cr-pixel-slider", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const render = (props) => {
        const element = createElement("c-cr-pixel-slider", { is: CrPixelSlider });
        Object.assign(element, props);
        document.body.appendChild(element);
        return element;
    };

    const slider = (element) => element.shadowRoot.querySelector('input[type="range"]');
    const shown = (element) => element.shadowRoot.querySelector(".slds-slider__value").textContent;

    it("shows the label with its range, and the value in pixels", () => {
        const element = render({
            label: "Border Radius",
            max: 150,
            value: "12px"
        });

        expect(element.shadowRoot.querySelector(".slds-slider-label__label").textContent).toBe("Border Radius");
        expect(element.shadowRoot.querySelector(".slds-slider-label__range").textContent).toBe("(0–150 px)");
        expect(slider(element).min).toBe("0");
        expect(slider(element).max).toBe("150");
        expect(slider(element).value).toBe("12");
        expect(shown(element)).toBe("12");
    });

    it("keeps the number's width fixed for the largest value", () => {
        const value = (max) =>
            render({ max, value: "1px" }).shadowRoot.querySelector(".slds-slider__value").style.width;

        expect(value(150)).toBe("3ch");
        expect(value(30)).toBe("2ch");
    });

    it("shows a length in rem as pixels, within the range", () => {
        expect(shown(render({ max: 150, value: "0.5rem" }))).toBe("8");
        expect(shown(render({ max: 30, value: "20rem" }))).toBe("30");
        expect(shown(render({ max: 30, value: "" }))).toBe("0");
    });

    it("shows the value while dragging but sends it only on release", async () => {
        const element = render({ max: 30, value: "0px" });
        const handler = jest.fn();
        element.addEventListener("measurechange", handler);

        slider(element).value = "12";
        slider(element).dispatchEvent(new CustomEvent("input"));
        await Promise.resolve();
        expect(shown(element)).toBe("12");
        expect(handler).not.toHaveBeenCalled();

        slider(element).dispatchEvent(new CustomEvent("change"));
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe("12px");
    });
});
