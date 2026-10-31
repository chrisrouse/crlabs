import { createElement } from "lwc";
import CrAccordionAppearanceEditor from "c/crAccordionAppearanceEditor";

describe("c-cr-accordion-appearance-editor", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderEditor = (value) => {
        const element = createElement("c-cr-accordion-appearance-editor", { is: CrAccordionAppearanceEditor });
        if (value !== undefined) {
            element.value = value;
        }
        document.body.appendChild(element);
        return element;
    };

    const sectionHeader = (element, key) =>
        element.shadowRoot.querySelector(`.style-section__header[data-key="${key}"]`);

    const lastStored = (handler) => JSON.parse(handler.mock.calls[handler.mock.calls.length - 1][0].detail.value);

    it("lists the eight style sections with Toggles first, and only Toggles open", () => {
        const element = renderEditor("");

        const labels = Array.from(element.shadowRoot.querySelectorAll(".style-section__header")).map((header) =>
            header.textContent.trim()
        );
        expect(labels).toEqual([
            "Toggles",
            "Header",
            "Separator",
            "Content",
            "Section Border",
            "Container Border",
            "Spacing",
            "Animation"
        ]);
        expect(sectionHeader(element, "toggle").getAttribute("aria-expanded")).toBe("true");
        expect(sectionHeader(element, "header").getAttribute("aria-expanded")).toBe("false");
    });

    it("keeps a section open when another opens", async () => {
        const element = renderEditor("");

        sectionHeader(element, "header").click();
        await Promise.resolve();

        expect(sectionHeader(element, "toggle").getAttribute("aria-expanded")).toBe("true");
        expect(sectionHeader(element, "header").getAttribute("aria-expanded")).toBe("true");
    });

    it("stores a header background color in the appearance", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "header").click();
        await Promise.resolve();

        element.shadowRoot
            .querySelector('c-cr-color-row[data-part="header"][data-field="background"]')
            .dispatchEvent(new CustomEvent("colorchange", { detail: { value: "#ff0000" } }));

        expect(lastStored(handler).header.background).toBe("#ff0000");
        expect(lastStored(handler).toggle.size).toBe("xx-small");
    });

    it("stores a border radius as a CSS length", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "sectionBorder").click();
        await Promise.resolve();

        element.shadowRoot
            .querySelector('c-cr-measure-input[data-part="sectionBorder"][data-field="radius"]')
            .dispatchEvent(new CustomEvent("measurechange", { detail: { value: "50%" } }));

        expect(lastStored(handler).sectionBorder.radius).toBe("50%");
    });

    it("stores the Hide Icon checkbox", () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);

        element.shadowRoot
            .querySelector('lightning-input[data-field="hide"]')
            .dispatchEvent(new CustomEvent("change", { detail: { checked: true } }));

        expect(lastStored(handler).toggle.hide).toBe(true);
    });

    it("shows stored settings when the panel opens", () => {
        const element = renderEditor(JSON.stringify({ toggle: { size: "large" } }));

        expect(element.shadowRoot.querySelector('lightning-combobox[data-field="size"]').value).toBe("large");
    });

    it("stores the toggle position and icons", () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);

        element.shadowRoot
            .querySelector('lightning-combobox[data-field="position"]')
            .dispatchEvent(new CustomEvent("change", { detail: { value: "right" } }));
        element.shadowRoot
            .querySelector('c-cr-icon-picker[data-field="openIcon"]')
            .dispatchEvent(new CustomEvent("valuechange", { detail: { value: "utility:add" } }));

        expect(lastStored(handler).toggle.position).toBe("right");
        expect(lastStored(handler).toggle.openIcon).toBe("utility:add");
        expect(lastStored(handler).toggle.closeIcon).toBe("utility:chevronright");
    });

    it("stores the container border weight and its line style", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "containerBorder").click();
        await Promise.resolve();

        element.shadowRoot
            .querySelector('c-cr-measure-input[data-part="containerBorder"][data-field="size"]')
            .dispatchEvent(new CustomEvent("measurechange", { detail: { value: "0.25rem" } }));
        element.shadowRoot
            .querySelector('lightning-combobox[data-part="containerBorder"][data-field="style"]')
            .dispatchEvent(new CustomEvent("change", { detail: { value: "dashed" } }));

        expect(lastStored(handler).containerBorder.size).toBe("0.25rem");
        expect(lastStored(handler).containerBorder.style).toBe("dashed");
    });

    it("offers px and rem for weight, and px, % and rem for radius", async () => {
        const element = renderEditor("");
        sectionHeader(element, "sectionBorder").click();
        await Promise.resolve();

        const field = (name) =>
            element.shadowRoot.querySelector(`c-cr-measure-input[data-part="sectionBorder"][data-field="${name}"]`);
        expect(field("size").units).toEqual(["px", "rem"]);
        expect(field("radius").units).toEqual(["px", "%", "rem"]);
    });

    const setSpacing = async (element, value) => {
        const field = element.shadowRoot.querySelector('lightning-input[data-part="spacing"]');
        field.value = value;
        field.dispatchEvent(new CustomEvent("change"));
        field.dispatchEvent(new CustomEvent("blur"));
    };

    it("stores the space between sections as a number of rem", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "spacing").click();
        await Promise.resolve();

        await setSpacing(element, "1.5");

        expect(lastStored(handler).spacing.between).toBe(1.5);
    });

    it("keeps the space between sections within 0 to 5 rem", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "spacing").click();
        await Promise.resolve();

        await setSpacing(element, "9");
        expect(lastStored(handler).spacing.between).toBe(5);

        await setSpacing(element, "-2");
        expect(lastStored(handler).spacing.between).toBe(0);
    });

    it("doesn't store the space between sections until the field loses focus", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "spacing").click();
        await Promise.resolve();

        const field = element.shadowRoot.querySelector('lightning-input[data-part="spacing"]');
        field.value = "2";
        field.dispatchEvent(new CustomEvent("change"));
        expect(handler).not.toHaveBeenCalled();

        field.dispatchEvent(new CustomEvent("blur"));
        expect(handler).toHaveBeenCalledTimes(1);
    });

    const speedField = (element) => element.shadowRoot.querySelector('lightning-radio-group[data-field="speed"]');

    it("turns the slide animation on and off with the Animate checkbox", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "animation").click();
        await Promise.resolve();
        const animate = element.shadowRoot.querySelector('lightning-input[data-part="animation"]');

        animate.dispatchEvent(new CustomEvent("change", { detail: { checked: true } }));
        expect(lastStored(handler).animation.type).toBe("slide");

        animate.dispatchEvent(new CustomEvent("change", { detail: { checked: false } }));
        expect(lastStored(handler).animation.type).toBe("none");
    });

    it("shows Speed only while animation is on", async () => {
        const element = renderEditor(JSON.stringify({ animation: { type: "none" } }));
        sectionHeader(element, "animation").click();
        await Promise.resolve();
        expect(speedField(element)).toBeNull();

        element.value = JSON.stringify({ animation: { type: "slide", speed: "fast" } });
        await Promise.resolve();
        expect(speedField(element).value).toBe("fast");
    });

    it("stores the border sides, and shows Shadow Sides only with a shadow", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "sectionBorder").click();
        await Promise.resolve();
        const shadowSides = () =>
            element.shadowRoot.querySelector('c-cr-sides-picker[data-part="sectionBorder"][data-field="shadowSides"]');

        element.shadowRoot
            .querySelector('c-cr-sides-picker[data-part="sectionBorder"][data-field="sides"]')
            .dispatchEvent(new CustomEvent("sideschange", { detail: { value: ["top", "bottom"] } }));
        expect(lastStored(handler).sectionBorder.sides).toEqual(["top", "bottom"]);
        expect(shadowSides()).toBeNull();

        element.shadowRoot
            .querySelector('c-cr-measure-input[data-part="sectionBorder"][data-field="shadow"]')
            .dispatchEvent(new CustomEvent("measurechange", { detail: { value: "6px" } }));
        await Promise.resolve();
        expect(lastStored(handler).sectionBorder.shadow).toBe("6px");
        expect(shadowSides()).not.toBeNull();
    });
});
