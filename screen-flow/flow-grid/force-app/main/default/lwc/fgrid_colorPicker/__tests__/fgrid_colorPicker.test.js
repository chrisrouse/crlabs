import { createElement } from "lwc";
import FgridColorPicker from "c/fgrid_colorPicker";

function mount(props = {}) {
    const element = createElement("c-fgrid-color-picker", { is: FgridColorPicker });
    Object.assign(element, { label: "Color", ...props });
    document.body.appendChild(element);
    return element;
}

const flush = () => Promise.resolve();
const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [...element.shadowRoot.querySelectorAll(selector)];

async function openPicker(element) {
    $(element, ".slds-color-picker__summary-button").click();
    await flush();
}

function listen(element) {
    const values = [];
    element.addEventListener("colorchange", (event) => values.push(event.detail.value));
    return values;
}

function change(input, value) {
    input.value = value;
    input.dispatchEvent(new CustomEvent("change"));
}

describe("c-fgrid_color-picker", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it("shows the swatch button and hex field, and no popover until asked", () => {
        const element = mount({ value: "#BA0517" });
        expect($(element, ".slds-color-picker__summary-button")).not.toBeNull();
        expect($(element, ".slds-color-picker__summary-input input").value).toBe("#ba0517");
        expect($(element, "section")).toBeNull();
    });

    it("opens on the Default tab, with the blueprint's 28 swatches inside the popover", async () => {
        const element = mount();
        await openPicker(element);
        const popover = $(element, "section.slds-color-picker__selector");
        expect(popover).not.toBeNull();
        expect(popover.querySelectorAll('[role="option"]')).toHaveLength(28);
        expect($(element, '[data-tab="default"]').getAttribute("aria-selected")).toBe("true");
        expect($(element, '[data-tab="custom"]').getAttribute("aria-selected")).toBe("false");
    });

    it("commits a swatch on Done, and not before", async () => {
        const element = mount();
        const values = listen(element);
        await openPicker(element);

        $(element, '[data-index="5"]').click();
        await flush();
        expect(values).toEqual([]);
        expect($(element, '[data-index="5"]').getAttribute("aria-selected")).toBe("true");

        $(element, ".slds-button_brand").click();
        await flush();
        expect(values).toEqual(["#fff099"]);
        expect($(element, "section")).toBeNull();
    });

    it("discards the choice on Cancel and on Escape", async () => {
        const element = mount({ value: "#ba0517" });
        const values = listen(element);

        await openPicker(element);
        $(element, '[data-index="5"]').click();
        $(element, ".slds-button_neutral").click();
        await flush();
        expect($(element, "section")).toBeNull();

        await openPicker(element);
        $(element, '[data-index="5"]').click();
        $(element, "section").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await flush();
        expect($(element, "section")).toBeNull();
        expect(values).toEqual([]);
    });

    it("marks only the first of the blueprint's duplicated swatch", async () => {
        const element = mount({ value: "#5EBBFF" });
        await openPicker(element);
        const selected = $$(element, '[role="option"][aria-selected="true"]');
        expect(selected).toHaveLength(1);
        expect(selected[0].dataset.index).toBe("9");
    });

    it("moves between swatches with the arrow keys and picks with Enter", async () => {
        const element = mount();
        const values = listen(element);
        await openPicker(element);

        $(element, '[data-index="0"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        await flush();
        // One row down is seven on, and it now takes Tab.
        expect($(element, '[data-index="7"]').getAttribute("tabindex")).toBe("0");
        expect($(element, '[data-index="0"]').getAttribute("tabindex")).toBe("-1");

        $(element, '[data-index="7"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        $(element, ".slds-button_brand").click();
        expect(values).toEqual(["#d073e0"]);
    });

    it("places the current color on the Custom tab's range and hue", async () => {
        // #5679c0 is hue 220, saturation 55%, brightness 75%.
        const element = mount({ value: "#5679c0" });
        await openPicker(element);
        $(element, '[data-tab="custom"]').click();
        await flush();

        expect($(element, '[data-tab="custom"]').getAttribute("aria-selected")).toBe("true");
        expect($(element, ".slds-color-picker__custom-range").getAttribute("style")).toContain("hsl(220, 100%, 50%)");
        const indicator = $(element, ".slds-color-picker__range-indicator").getAttribute("style");
        expect(indicator).toContain("bottom: 75%");
        expect(indicator).toContain("left: 55%");
        expect($(element, "#custom-r, [data-channel='red']").value).toBe("86");
    });

    it("changes the color from the hue slider, the hex field and the RGB fields", async () => {
        const element = mount({ value: "#ff0000" });
        const values = listen(element);
        await openPicker(element);
        $(element, '[data-tab="custom"]').click();
        await flush();

        const hue = $(element, ".slds-color-picker__hue-slider");
        hue.value = "120";
        hue.dispatchEvent(new CustomEvent("input"));
        await flush();
        expect($(element, "[data-channel='green']").value).toBe("255");

        change($(element, "[data-channel='blue']"), "300");
        await flush();
        // Clamped to a channel's range.
        expect($(element, "[data-channel='blue']").value).toBe("255");

        change($(element, ".slds-color-picker__input-custom-hex input"), "#AbC");
        await flush();
        $(element, ".slds-button_brand").click();
        expect(values).toEqual(["#aabbcc"]);
    });

    it("moves the range indicator with the arrow keys", async () => {
        const element = mount({ value: "#5679c0" });
        const values = listen(element);
        await openPicker(element);
        $(element, '[data-tab="custom"]').click();
        await flush();

        $(element, ".slds-color-picker__range-indicator").dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true })
        );
        await flush();
        expect($(element, ".slds-color-picker__range-indicator").getAttribute("style")).toContain("bottom: 85%");
        $(element, ".slds-button_brand").click();
        expect(values).toHaveLength(1);
        expect(values[0]).not.toBe("#5679c0");
    });

    it("flags an invalid hex, with the SLDS wording, and commits nothing", async () => {
        const element = mount({ value: "#ba0517" });
        const values = listen(element);
        await openPicker(element);
        $(element, '[data-tab="custom"]').click();
        await flush();

        change($(element, ".slds-color-picker__input-custom-hex input"), "#12");
        await flush();
        expect($(element, ".slds-form-error").textContent).toBe(
            "Invalid color code. Please enter a hex code like #FFFFFF."
        );
        expect($(element, ".slds-color-picker__input-custom-hex").classList).toContain("slds-has-error");
        $(element, ".slds-button_brand").click();
        // Done commits the last VALID color, which is unchanged.
        expect(values).toEqual([]);
    });

    it("takes a hex typed into the summary field, and flags a bad one", async () => {
        const element = mount();
        const values = listen(element);
        const input = $(element, ".slds-color-picker__summary-input input");

        change(input, "not a color");
        await flush();
        expect($(element, ".slds-color-picker__summary").classList).toContain("slds-has-error");
        expect(values).toEqual([]);

        change(input, "#AD1071");
        await flush();
        expect(values).toEqual(["#ad1071"]);
        expect($(element, ".slds-color-picker__summary").classList).not.toContain("slds-has-error");
    });

    it("stays open for a press inside it, such as on the Custom tab", async () => {
        // The org regression: every press inside was read as outside, so
        // choosing Custom closed the popover.
        const element = mount();
        await openPicker(element);
        const tab = $(element, '[data-tab="custom"]');
        tab.dispatchEvent(new CustomEvent("pointerdown", { bubbles: true, composed: true }));
        tab.click();
        await flush();
        expect($(element, "section")).not.toBeNull();
        expect($(element, '[data-tab="custom"]').getAttribute("aria-selected")).toBe("true");
    });

    it("opens in the page flow, not floating, and stays open until Done or Cancel", async () => {
        // Inline by decision: a fixed popover drifted off its button inside
        // the Studio modal. So a press elsewhere does not dismiss it either.
        const element = mount();
        await openPicker(element);
        const section = $(element, "section");
        expect(section.classList).toContain("fgridColorPicker__inline");
        expect(section.getAttribute("style")).toBeNull();

        document.body.dispatchEvent(new CustomEvent("pointerdown", { bubbles: true, composed: true }));
        await flush();
        expect($(element, "section")).not.toBeNull();

        // The swatch button toggles it closed again.
        $(element, ".slds-color-picker__summary-button").click();
        await flush();
        expect($(element, "section")).toBeNull();
    });
});
