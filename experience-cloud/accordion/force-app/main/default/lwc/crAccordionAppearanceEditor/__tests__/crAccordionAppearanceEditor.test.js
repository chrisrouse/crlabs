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

    /** Opens a style section, leaving it alone if it already starts open. */
    const openSection = async (element, key) => {
        if (sectionHeader(element, key).getAttribute("aria-expanded") !== "true") {
            sectionHeader(element, key).click();
            await Promise.resolve();
        }
    };

    const lastStored = (handler) => JSON.parse(handler.mock.calls[handler.mock.calls.length - 1][0].detail.value);

    it("lists the nine style sections from the outside in, with only Container open", () => {
        const element = renderEditor("");

        const labels = Array.from(element.shadowRoot.querySelectorAll(".style-section__header")).map((header) =>
            header.textContent.trim()
        );
        expect(labels).toEqual([
            "Container",
            "Section",
            "Header",
            "Toggles",
            "Header Icon",
            "Separator",
            "Content",
            "Spacing",
            "Animation"
        ]);
        expect(sectionHeader(element, "containerBorder").getAttribute("aria-expanded")).toBe("true");
        expect(sectionHeader(element, "toggle").getAttribute("aria-expanded")).toBe("false");
    });

    it("keeps a section open when another opens", async () => {
        const element = renderEditor("");

        sectionHeader(element, "header").click();
        await Promise.resolve();

        expect(sectionHeader(element, "containerBorder").getAttribute("aria-expanded")).toBe("true");
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

    const openToggles = async (element) => {
        sectionHeader(element, "toggle").click();
        await Promise.resolve();
    };

    it("stores the Hide Icon checkbox", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openToggles(element);

        element.shadowRoot
            .querySelector('lightning-input[data-field="hide"]')
            .dispatchEvent(new CustomEvent("change", { detail: { checked: true } }));

        expect(lastStored(handler).toggle.hide).toBe(true);
    });

    it("shows stored settings when the panel opens", async () => {
        const element = renderEditor(JSON.stringify({ toggle: { size: "large" } }));
        await openToggles(element);

        expect(element.shadowRoot.querySelector('lightning-combobox[data-field="size"]').value).toBe("large");
    });

    it("stores the toggle position and icons", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openToggles(element);

        element.shadowRoot
            .querySelector('lightning-radio-group[data-field="position"]')
            .dispatchEvent(new CustomEvent("change", { detail: { value: "right" } }));
        element.shadowRoot
            .querySelector('c-cr-icon-picker[data-field="openIcon"]')
            .dispatchEvent(new CustomEvent("iconchange", { detail: { value: "utility:add" } }));

        expect(lastStored(handler).toggle.position).toBe("right");
        expect(lastStored(handler).toggle.openIcon).toBe("utility:add");
        expect(lastStored(handler).toggle.closeIcon).toBe("utility:chevronright");
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

    it.each(["sectionBorder", "containerBorder"])(
        "gives the %s's Border and Shadow settings the stored border object",
        async (part) => {
            const stored = { [part]: { color: "#c23934", size: "2px", radius: "8px", shadow: "6px" } };
            const element = renderEditor(JSON.stringify(stored));
            await openSection(element, part);

            const border = element.shadowRoot.querySelector(`c-cr-border-settings[data-part="${part}"]`);
            const shadow = element.shadowRoot.querySelector(`c-cr-shadow-settings[data-part="${part}"]`);
            expect(border.value).toMatchObject(stored[part]);
            expect(shadow.value).toEqual(border.value);
        }
    );

    it.each(["sectionBorder", "containerBorder"])(
        "stores the whole %s object each control sends, leaving other settings alone",
        async (part) => {
            const element = renderEditor(JSON.stringify({ container: { background: "#00000080" } }));
            const handler = jest.fn();
            element.addEventListener("valuechange", handler);
            await openSection(element, part);
            const border = element.shadowRoot.querySelector(`c-cr-border-settings[data-part="${part}"]`);

            const next = { ...border.value, size: "0.25rem", style: "dashed", sides: ["top", "bottom"] };
            border.dispatchEvent(new CustomEvent("borderchange", { detail: { value: next } }));
            expect(lastStored(handler)[part]).toEqual(next);

            const withShadow = { ...next, shadow: "8px", shadowSides: ["bottom"] };
            element.shadowRoot
                .querySelector(`c-cr-shadow-settings[data-part="${part}"]`)
                .dispatchEvent(new CustomEvent("shadowchange", { detail: { value: withShadow } }));
            expect(lastStored(handler)[part]).toEqual(withShadow);
            expect(lastStored(handler).container.background).toBe("#00000080");
        }
    );

    it("names the Section background's default after the Container, once it has a color", async () => {
        const element = renderEditor("");
        sectionHeader(element, "sectionBorder").click();
        await Promise.resolve();
        const sectionRow = () => element.shadowRoot.querySelector('c-cr-color-row[data-part="section"]');
        expect(sectionRow().defaultLabel).toBe("Site Background");

        element.shadowRoot
            .querySelector('c-cr-color-row[data-part="container"]')
            .dispatchEvent(new CustomEvent("colorchange", { detail: { value: "#112233" } }));
        await Promise.resolve();

        expect(sectionRow().defaultLabel).toBe("Same as Container");
    });

    it("shows Icon and Rotation instead of Open and Close Icon when the toggle rotates", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openToggles(element);
        const picker = (field) => element.shadowRoot.querySelector(`c-cr-icon-picker[data-field="${field}"]`);
        const rotation = () => element.shadowRoot.querySelector('lightning-combobox[data-field="rotation"]');
        expect(picker("openIcon")).not.toBeNull();
        expect(rotation()).toBeNull();

        element.shadowRoot
            .querySelector('lightning-radio-group[data-field="change"]')
            .dispatchEvent(new CustomEvent("change", { detail: { value: "rotate" } }));
        await Promise.resolve();

        expect(lastStored(handler).toggle.change).toBe("rotate");
        expect(picker("openIcon")).toBeNull();
        expect(picker("closeIcon").label).toBe("Icon");
        expect(rotation().value).toBe("90");
    });

    it("stores the separator's line style from the line style picker", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        sectionHeader(element, "separator").click();
        await Promise.resolve();

        element.shadowRoot
            .querySelector('c-cr-border-style-picker[data-part="separator"]')
            .dispatchEvent(new CustomEvent("stylechange", { detail: { value: "dotted" } }));

        expect(lastStored(handler).separator.style).toBe("dotted");
    });
});
