import { createElement } from "lwc";
import CrSearchBar from "c/crSearchBar";

import getSuggestions from "@salesforce/apex/SearchBarController.getSuggestions";

jest.mock(
    "@salesforce/apex/SearchBarController.getSuggestions",
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);

describe("c-cr-search-bar", () => {
    afterEach(() => {
        jest.useRealTimers();
        getSuggestions.mockClear();
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderSearchBar = (props = {}) => {
        const element = createElement("c-cr-search-bar", { is: CrSearchBar });
        Object.assign(element, props);
        document.body.appendChild(element);
        return element;
    };

    const container = (element) => element.shadowRoot.querySelector(".search-bar-container");

    it("shows the search button when the property is on", () => {
        const element = renderSearchBar({ showSearchButton: true });

        expect(element.shadowRoot.querySelector(".input-search-button")).not.toBeNull();
        expect(container(element).classList.contains("has-button")).toBe(true);
    });

    it("sets the stored appearance as custom properties on the container", () => {
        const element = renderSearchBar({
            appearance: JSON.stringify({ field: { background: "#123456" }, border: { radius: "8px" } })
        });

        const style = container(element).style;
        expect(style.getPropertyValue("--cr-search-bar-bg")).toBe("#123456");
        expect(style.getPropertyValue("--cr-search-bar-radius-tl")).toBe("8px");
        expect(style.getPropertyValue("--cr-search-bar-border-color")).toBe("");
    });

    it("updates the custom properties when the appearance changes", async () => {
        const element = renderSearchBar();

        element.appearance = JSON.stringify({ button: { background: "#abcdef" } });
        await Promise.resolve();

        expect(container(element).style.getPropertyValue("--cr-search-bar-btn-bg")).toBe("#abcdef");
    });

    const button = (element) => element.shadowRoot.querySelector(".input-search-button");

    it("puts the button inside the bar for the Inset style", () => {
        const element = renderSearchBar({ showSearchButton: true, appearance: '{"button":{"style":"inset"}}' });

        expect(container(element).classList.contains("is-inset")).toBe(true);
        expect(container(element).classList.contains("has-button")).toBe(false);
    });

    it("shows the button label beside the icon, or alone when Show Icon is off", async () => {
        const element = renderSearchBar({ showSearchButton: true, appearance: '{"button":{"label":"Search"}}' });

        expect(button(element).querySelector(".button-label").textContent).toBe("Search");
        expect(button(element).querySelector("lightning-icon")).not.toBeNull();

        element.appearance = '{"button":{"label":"Search","showIcon":false}}';
        await Promise.resolve();

        expect(button(element).querySelector("lightning-icon")).toBeNull();
    });

    it("keeps the icon when Show Icon is off but there is no label", () => {
        const element = renderSearchBar({ showSearchButton: true, appearance: '{"button":{"showIcon":false}}' });

        expect(button(element).querySelector("lightning-icon")).not.toBeNull();
        expect(button(element).querySelector(".slds-assistive-text").textContent).toBe("Search");
    });

    it("marks the bar for a floating menu", () => {
        const element = renderSearchBar({ appearance: '{"menu":{"position":"floating"}}' });

        expect(container(element).classList.contains("menu-floating")).toBe(true);
    });

    const typeInto = (element, text) => {
        const input = element.shadowRoot.querySelector("input");
        input.value = text;
        input.dispatchEvent(new CustomEvent("input"));
    };

    it("asks for suggestions while typing when the type-ahead menu is on", () => {
        jest.useFakeTimers();
        const element = renderSearchBar({ showTypeAhead: true, searchObjects: '[{"apiName":"Account"}]' });

        typeInto(element, "acme");
        jest.runAllTimers();

        expect(getSuggestions).toHaveBeenCalledWith({
            searchTerm: "acme",
            searchObjectsJson: '[{"apiName":"Account"}]'
        });
    });

    it("never asks for suggestions when the type-ahead menu is off", () => {
        jest.useFakeTimers();
        const element = renderSearchBar({ showTypeAhead: false, searchObjects: '[{"apiName":"Account"}]' });

        typeInto(element, "acme");
        jest.runAllTimers();

        expect(getSuggestions).not.toHaveBeenCalled();
    });

    it("draws the focus ring unless it is turned off", async () => {
        const element = renderSearchBar();
        expect(container(element).classList.contains("has-focus-ring")).toBe(true);

        element.appearance = '{"field":{"showFocusRing":false}}';
        await Promise.resolve();

        expect(container(element).classList.contains("has-focus-ring")).toBe(false);
    });

    describe("type-ahead layouts", () => {
        const RESULTS = [
            { id: "001A", name: "Acme", typeLabel: "Accounts", objectApiName: "Account" },
            { id: "001B", name: "Acme East", typeLabel: "Accounts", objectApiName: "Account" },
            { id: "500A", name: "Acme login issue", typeLabel: "Cases", objectApiName: "Case" }
        ];

        const openMenu = async (appearance) => {
            jest.useFakeTimers();
            getSuggestions.mockResolvedValue(RESULTS);
            const element = renderSearchBar({
                showTypeAhead: true,
                searchObjects: '[{"apiName":"Account"},{"apiName":"Case"}]',
                appearance
            });
            typeInto(element, "acme");
            jest.runAllTimers();
            jest.useRealTimers();
            await flushPromises();
            return element;
        };

        /** Lets the Apex promise chain settle and the menu render. */
        const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

        const rows = (element) => Array.from(element.shadowRoot.querySelectorAll("c-cr-search-suggestion-item"));

        it("lists every result with icons and type labels by default", async () => {
            const element = await openMenu("");

            expect(rows(element).map((row) => row.suggestion.name)).toEqual(["Acme", "Acme East", "Acme login issue"]);
            expect(rows(element).every((row) => !row.hideIcon && !row.hideType)).toBe(true);
            expect(element.shadowRoot.querySelector(".menu-tabs")).toBeNull();
        });

        it("leaves out the icons when Show Icons is off, and skips loading them", async () => {
            const element = await openMenu('{"menu":{"showIcons":false}}');

            expect(rows(element).every((row) => row.hideIcon)).toBe(true);
            expect(rows(element).every((row) => row.objectApiName === undefined)).toBe(true);
        });

        it("groups results under a header with the object's icon and name, in the configured order", async () => {
            const element = await openMenu('{"menu":{"layout":"grouped"}}');

            const headers = Array.from(element.shadowRoot.querySelectorAll(".menu-group-header"));
            expect(headers.map((header) => header.textContent.trim())).toEqual(["Accounts", "Cases"]);
            expect(headers.map((header) => header.querySelector("c-cr-search-object-icon").objectApiName)).toEqual([
                "Account",
                "Case"
            ]);
            expect(element.shadowRoot.querySelectorAll('.menu-group[role="group"]')[1].getAttribute("aria-label")).toBe(
                "Cases"
            );
            // Rows show only the record: the header carries the icon and type.
            expect(rows(element).every((row) => row.hideIcon && row.hideType)).toBe(true);
        });

        it("still shows the header when only one object has results", async () => {
            jest.useFakeTimers();
            getSuggestions.mockResolvedValue([RESULTS[2]]);
            const element = renderSearchBar({
                showTypeAhead: true,
                searchObjects: '[{"apiName":"Case"}]',
                appearance: '{"menu":{"layout":"grouped"}}'
            });
            typeInto(element, "acme");
            jest.runAllTimers();
            jest.useRealTimers();
            await flushPromises();

            const headers = element.shadowRoot.querySelectorAll(".menu-group-header");
            expect(headers).toHaveLength(1);
            expect(headers[0].textContent.trim()).toBe("Cases");
        });

        it("leaves the header icon out, and the rows unindented, when Show Icons is off", async () => {
            const element = await openMenu('{"menu":{"layout":"grouped","showIcons":false}}');

            expect(element.shadowRoot.querySelector(".menu-group-header c-cr-search-object-icon")).toBeNull();
            expect(element.shadowRoot.querySelector(".menu-group").classList.contains("has-icon")).toBe(false);
        });

        it("shows an All tab and one tab per type, and filters by the chosen tab", async () => {
            const element = await openMenu('{"menu":{"layout":"tabs"}}');
            const tab = (key) => element.shadowRoot.querySelector(`.menu-tab[data-key="${key}"]`);

            expect(
                Array.from(element.shadowRoot.querySelectorAll(".menu-tab")).map((t) => t.textContent.trim())
            ).toEqual(["All", "Accounts", "Cases"]);
            expect(tab("all").getAttribute("aria-selected")).toBe("true");
            expect(rows(element)).toHaveLength(3);

            tab("Case").click();
            await Promise.resolve();

            expect(tab("Case").getAttribute("aria-selected")).toBe("true");
            expect(rows(element).map((row) => row.suggestion.name)).toEqual(["Acme login issue"]);
            expect(rows(element)[0].hideType).toBe(true);
        });

        it("moves between tabs with the arrow keys, wrapping at the end", async () => {
            const element = await openMenu('{"menu":{"layout":"tabs"}}');
            const selected = () => element.shadowRoot.querySelector('.menu-tab[aria-selected="true"]').dataset.key;

            element.shadowRoot
                .querySelector(".menu-tab")
                .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
            await Promise.resolve();
            expect(selected()).toBe("Case");

            element.shadowRoot
                .querySelector('.menu-tab[data-key="Case"]')
                .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
            await Promise.resolve();
            expect(selected()).toBe("all");
        });

        it("keeps the menu open when a tab is pressed", async () => {
            const element = await openMenu('{"menu":{"layout":"tabs"}}');
            const mousedown = new MouseEvent("mousedown", { cancelable: true });

            element.shadowRoot.querySelector(".menu-tab").dispatchEvent(mousedown);

            expect(mousedown.defaultPrevented).toBe(true);
        });
    });

    it("marks the bar with the site button style and size, but not for Custom", async () => {
        const element = renderSearchBar({
            showSearchButton: true,
            appearance: '{"button":{"theme":"secondary","themeSize":"large"}}'
        });

        ["btn-theme-site", "btn-theme-secondary", "btn-size-large"].forEach((name) =>
            expect(container(element).classList.contains(name)).toBe(true)
        );

        element.appearance = '{"button":{"theme":"custom"}}';
        await Promise.resolve();

        expect(container(element).classList.contains("btn-theme-site")).toBe(false);
    });

    it("gives a Custom button its own border only when its Border Weight is above 0", async () => {
        const element = renderSearchBar({ showSearchButton: true, appearance: '{"button":{"theme":"custom"}}' });
        expect(container(element).classList.contains("btn-own-border")).toBe(false);

        element.appearance = '{"button":{"theme":"custom","borderSize":"2px"}}';
        await Promise.resolve();

        expect(container(element).classList.contains("btn-own-border")).toBe(true);
    });

    it("prints the fonts it uses only when Show Diagnostics is on", async () => {
        const element = renderSearchBar({ showSearchButton: true });
        expect(element.shadowRoot.querySelector(".diagnostics")).toBeNull();

        element.showDiagnostics = true;
        await Promise.resolve();
        await Promise.resolve();

        const labels = Array.from(element.shadowRoot.querySelectorAll(".diagnostics dt")).map((dt) => dt.textContent);
        expect(labels).toEqual(expect.arrayContaining(["Button font", "Page body font", "Theme button font"]));
    });
});
