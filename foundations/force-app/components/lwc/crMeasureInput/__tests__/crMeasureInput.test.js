import { createElement } from "lwc";
import CrMeasureInput from "c/crMeasureInput";

describe("c-cr-measure-input", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderMeasure = (value, units) => {
        const element = createElement("c-cr-measure-input", { is: CrMeasureInput });
        element.label = "Radius";
        element.units = units || ["px", "%", "rem"];
        if (value !== undefined) {
            element.value = value;
        }
        document.body.appendChild(element);
        return element;
    };

    const numberBox = (element) => element.shadowRoot.querySelector("lightning-input");
    const unitBox = (element) => element.shadowRoot.querySelector("lightning-combobox");

    it("splits a stored length into its number and unit", () => {
        const element = renderMeasure("50%");

        expect(numberBox(element).value).toBe("50");
        expect(unitBox(element).value).toBe("%");
    });

    it("reads an empty value as 0 in the first unit", () => {
        const element = renderMeasure("");

        expect(numberBox(element).value).toBe("0");
        expect(unitBox(element).value).toBe("px");
    });

    it("offers only the units it is given", () => {
        const element = renderMeasure("2px", ["px", "rem"]);

        expect(unitBox(element).options.map((option) => option.value)).toEqual(["px", "rem"]);
    });

    it("sends the new length when the number box loses focus, not while typing", () => {
        const element = renderMeasure("4px");
        const handler = jest.fn();
        element.addEventListener("measurechange", handler);

        numberBox(element).value = "12";
        numberBox(element).dispatchEvent(new CustomEvent("change"));
        expect(handler).not.toHaveBeenCalled();

        numberBox(element).dispatchEvent(new CustomEvent("blur"));
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe("12px");
    });

    it("sends nothing on blur when the number didn't change", () => {
        const element = renderMeasure("4px");
        const handler = jest.fn();
        element.addEventListener("measurechange", handler);

        numberBox(element).dispatchEvent(new CustomEvent("blur"));

        expect(handler).not.toHaveBeenCalled();
    });

    it("sends the new length when the unit changes", () => {
        const element = renderMeasure("0.5rem");
        const handler = jest.fn();
        element.addEventListener("measurechange", handler);

        unitBox(element).dispatchEvent(new CustomEvent("change", { detail: { value: "px" } }));

        expect(handler.mock.calls[0][0].detail.value).toBe("0.5px");
    });

    it("counts an empty number box as 0", () => {
        const element = renderMeasure("4px");
        const handler = jest.fn();
        element.addEventListener("measurechange", handler);

        numberBox(element).value = "";
        numberBox(element).dispatchEvent(new CustomEvent("change"));
        numberBox(element).dispatchEvent(new CustomEvent("blur"));

        expect(handler.mock.calls[0][0].detail.value).toBe("0px");
    });

    it("lowers a number above the maximum to the maximum", () => {
        const element = renderMeasure("4px", ["px"]);
        element.max = 30;
        const handler = jest.fn();
        element.addEventListener("measurechange", handler);

        numberBox(element).value = "45";
        numberBox(element).dispatchEvent(new CustomEvent("change"));
        numberBox(element).dispatchEvent(new CustomEvent("blur"));

        expect(handler.mock.calls[0][0].detail.value).toBe("30px");
    });
});
