import { createElement } from "lwc";
import CrSearchBarAppearanceEditor from "c/crSearchBarAppearanceEditor";

describe("c-cr-search-bar-appearance-editor", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderEditor = (value) => {
        const element = createElement("c-cr-search-bar-appearance-editor", { is: CrSearchBarAppearanceEditor });
        if (value !== undefined) {
            element.value = value;
        }
        document.body.appendChild(element);
        return element;
    };

    const sectionHeader = (element, key) =>
        element.shadowRoot.querySelector(`.style-section__header[data-key="${key}"]`);

    const field = (element, part, name) =>
        element.shadowRoot.querySelector(`[data-part="${part}"][data-field="${name}"]`);

    const lastStored = (handler) => JSON.parse(handler.mock.calls[handler.mock.calls.length - 1][0].detail.value);

    const openBorder = async (element) => {
        sectionHeader(element, "border").click();
        await Promise.resolve();
    };

    it("lists the four style sections with only Search Field open", () => {
        const element = renderEditor("");

        const labels = Array.from(element.shadowRoot.querySelectorAll(".style-section__header")).map((header) =>
            header.textContent.trim()
        );
        expect(labels).toEqual(["Search Field", "Border", "Search Button", "Type-Ahead Menu"]);
        expect(sectionHeader(element, "field").getAttribute("aria-expanded")).toBe("true");
        expect(sectionHeader(element, "border").getAttribute("aria-expanded")).toBe("false");
    });

    it("stores a field color from its color row", () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);

        field(element, "field", "background").dispatchEvent(
            new CustomEvent("colorchange", { detail: { value: "#ff000080" } })
        );

        expect(lastStored(handler).field.background).toBe("#ff000080");
    });

    const openSection = async (element, key) => {
        sectionHeader(element, key).click();
        await Promise.resolve();
    };

    it("stores the button label when the field loses focus, not while typing", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openSection(element, "button");
        const labelInput = field(element, "button", "label");

        labelInput.dispatchEvent(new CustomEvent("change", { detail: { value: " Search " } }));
        expect(handler).not.toHaveBeenCalled();
        labelInput.dispatchEvent(new CustomEvent("blur"));

        expect(lastStored(handler).button.label).toBe("Search");
    });

    it("stores the button style and the menu position from their choice buttons", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openSection(element, "button");
        await openSection(element, "menu");

        field(element, "button", "style").dispatchEvent(new CustomEvent("change", { detail: { value: "inset" } }));
        field(element, "menu", "position").dispatchEvent(new CustomEvent("change", { detail: { value: "floating" } }));

        const stored = lastStored(handler);
        expect(stored.button.style).toBe("inset");
        expect(stored.menu.position).toBe("floating");
    });

    it("stores Show Icon from its checkbox", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openSection(element, "button");

        field(element, "button", "showIcon").dispatchEvent(new CustomEvent("change", { detail: { checked: false } }));

        expect(lastStored(handler).button.showIcon).toBe(false);
    });

    it("offers the SLDS padding sizes and stores the chosen one", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        element.value = '{"button":{"theme":"custom"}}';
        await openSection(element, "button");
        const padding = field(element, "button", "padding");

        expect(padding.value).toBe("medium");
        expect(padding.options.map((option) => option.label)).toEqual([
            "None (0px)",
            "XXX-Small (2px)",
            "XX-Small (4px)",
            "X-Small (8px)",
            "Small (12px)",
            "Medium (16px)",
            "Large (24px)",
            "X-Large (32px)",
            "XX-Large (48px)"
        ]);

        padding.dispatchEvent(new CustomEvent("change", { detail: { value: "x-large" } }));

        expect(lastStored(handler).button.padding).toBe("x-large");
    });

    it("hides the focus ring color once Show Focus Ring is turned off", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        expect(field(element, "field", "focusColor")).not.toBeNull();

        field(element, "field", "showFocusRing").dispatchEvent(
            new CustomEvent("change", { detail: { checked: false } })
        );
        await Promise.resolve();

        expect(lastStored(handler).field.showFocusRing).toBe(false);
        expect(field(element, "field", "focusColor")).toBeNull();
    });

    it("stores the menu layout and Show Icons", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openSection(element, "menu");

        expect(field(element, "menu", "layout").value).toBe("list");
        field(element, "menu", "layout").dispatchEvent(new CustomEvent("change", { detail: { value: "tabs" } }));
        field(element, "menu", "showIcons").dispatchEvent(new CustomEvent("change", { detail: { checked: false } }));

        const stored = lastStored(handler);
        expect(stored.menu.layout).toBe("tabs");
        expect(stored.menu.showIcons).toBe(false);
    });

    it("shows Size for a site button style, and Padding and colors only for Custom", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openSection(element, "button");

        expect(field(element, "button", "theme").value).toBe("primary");
        expect(field(element, "button", "themeSize")).not.toBeNull();
        expect(field(element, "button", "padding")).toBeNull();
        expect(field(element, "button", "background")).toBeNull();

        field(element, "button", "theme").dispatchEvent(new CustomEvent("change", { detail: { value: "custom" } }));
        await Promise.resolve();

        expect(lastStored(handler).button.theme).toBe("custom");
        expect(field(element, "button", "themeSize")).toBeNull();
        expect(field(element, "button", "padding")).not.toBeNull();
        expect(field(element, "button", "background")).not.toBeNull();
    });

    it("stores the site button size", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openSection(element, "button");

        field(element, "button", "themeSize").dispatchEvent(new CustomEvent("change", { detail: { value: "large" } }));

        expect(lastStored(handler).button.themeSize).toBe("large");
    });

    it("edits the bar's border and shadow with the Foundations Border and Shadow settings", async () => {
        const stored = { border: { color: "#00ff00", size: "2px", shadow: "6px" } };
        const element = renderEditor(JSON.stringify(stored));
        await openBorder(element);

        const border = element.shadowRoot.querySelector('c-cr-border-settings[data-part="border"]');
        const shadow = element.shadowRoot.querySelector('c-cr-shadow-settings[data-part="border"]');
        expect(border.value).toMatchObject(stored.border);
        expect(shadow.value).toEqual(border.value);
    });

    it("stores the whole border object each control sends", async () => {
        const element = renderEditor("");
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openBorder(element);
        const next = { color: "#ff0000", size: "3px", style: "dashed", sides: ["bottom"], radius: "12px" };

        element.shadowRoot
            .querySelector('c-cr-border-settings[data-part="border"]')
            .dispatchEvent(new CustomEvent("borderchange", { detail: { value: next } }));
        expect(lastStored(handler).border).toEqual(next);

        const withShadow = { ...next, shadow: "8px", shadowSides: ["bottom"] };
        element.shadowRoot
            .querySelector('c-cr-shadow-settings[data-part="border"]')
            .dispatchEvent(new CustomEvent("shadowchange", { detail: { value: withShadow } }));
        expect(lastStored(handler).border).toEqual(withShadow);
    });

    it("edits a Custom button's border and shadow as its own border object", async () => {
        const element = renderEditor('{"button":{"theme":"custom"}}');
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);
        await openSection(element, "button");

        const border = element.shadowRoot.querySelector('c-cr-border-settings[data-part="button"]');
        expect(element.shadowRoot.querySelector('c-cr-shadow-settings[data-part="button"]')).not.toBeNull();
        expect(border.value.size).toBe("0px");

        border.dispatchEvent(
            new CustomEvent("borderchange", { detail: { value: { ...border.value, size: "2px", color: "#c23934" } } })
        );

        const stored = lastStored(handler);
        expect(stored.button.border).toMatchObject({ size: "2px", color: "#c23934" });
        expect(stored.button.theme).toBe("custom");
    });

    it("hides the button's border and shadow settings for a site button style", async () => {
        const element = renderEditor("");
        await openSection(element, "button");

        expect(element.shadowRoot.querySelector('c-cr-border-settings[data-part="button"]')).toBeNull();
        expect(element.shadowRoot.querySelector('c-cr-shadow-settings[data-part="button"]')).toBeNull();
    });
});
