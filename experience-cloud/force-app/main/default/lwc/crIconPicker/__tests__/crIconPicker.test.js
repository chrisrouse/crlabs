import { createElement } from "lwc";
import CrIconPicker from "c/crIconPicker";

describe("c-cr-icon-picker", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderPicker = (value) => {
        const element = createElement("c-cr-icon-picker", { is: CrIconPicker });
        if (value !== undefined) {
            element.value = value;
        }
        document.body.appendChild(element);
        return element;
    };

    const openMenu = async (element) => {
        element.shadowRoot.querySelector(".icon-trigger").click();
        await Promise.resolve();
    };

    const iconButtons = (element) => Array.from(element.shadowRoot.querySelectorAll(".icon-option"));

    const search = async (element, text) => {
        const box = element.shadowRoot.querySelector("lightning-input");
        box.value = text;
        box.dispatchEvent(new CustomEvent("change"));
        await Promise.resolve();
    };

    it("shows the chosen icon on the field, and no menu until it is opened", () => {
        const element = renderPicker("utility:add");

        expect(element.shadowRoot.querySelector(".icon-trigger-name").textContent).toBe("utility:add");
        expect(element.shadowRoot.querySelector(".icon-menu")).toBeNull();
    });

    it("opens the floating menu when the field is clicked", async () => {
        const element = renderPicker();

        await openMenu(element);

        expect(element.shadowRoot.querySelector(".icon-menu")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".icon-trigger").getAttribute("aria-expanded")).toBe("true");
    });

    it("shows the first batch of utility icons when opened", async () => {
        const element = renderPicker();

        await openMenu(element);

        expect(iconButtons(element).length).toBe(120);
        expect(iconButtons(element)[0].dataset.name.startsWith("utility:")).toBe(true);
    });

    it("offers a Show more button while more icons remain", async () => {
        const element = renderPicker();
        await openMenu(element);

        element.shadowRoot.querySelector(".show-more").click();
        await Promise.resolve();

        expect(iconButtons(element).length).toBe(240);
    });

    it("filters the icons by the search text", async () => {
        const element = renderPicker();
        await openMenu(element);

        await search(element, "chevron");

        const names = iconButtons(element).map((button) => button.dataset.name);
        expect(names).toContain("utility:chevrondown");
        expect(names).toContain("utility:chevronright");
        expect(names.every((name) => name.includes("chevron"))).toBe(true);
    });

    it("says so when nothing matches", async () => {
        const element = renderPicker();
        await openMenu(element);

        await search(element, "zzzz-no-such-icon");

        expect(iconButtons(element).length).toBe(0);
        expect(element.shadowRoot.textContent).toContain("No icons match that search.");
    });

    it("switches to the action icon set", async () => {
        const element = renderPicker();
        await openMenu(element);

        element.shadowRoot.querySelector('[data-category="action"]').click();
        await Promise.resolve();

        expect(iconButtons(element)[0].dataset.name.startsWith("action:")).toBe(true);
    });

    it("sends the picked icon as valuechange and closes the menu", async () => {
        const element = renderPicker("utility:add");
        await openMenu(element);
        const handler = jest.fn();
        element.addEventListener("valuechange", handler);

        iconButtons(element)
            .find((button) => button.dataset.name === "utility:close")
            .click();
        await Promise.resolve();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe("utility:close");
        expect(element.shadowRoot.querySelector(".icon-menu")).toBeNull();
    });

    it("closes the menu when Escape is pressed", async () => {
        const element = renderPicker();
        await openMenu(element);

        element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".icon-menu")).toBeNull();
    });
});
