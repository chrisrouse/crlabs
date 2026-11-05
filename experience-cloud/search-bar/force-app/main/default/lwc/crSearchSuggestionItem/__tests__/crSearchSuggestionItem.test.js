import { createElement } from "lwc";
import CrSearchSuggestionItem from "c/crSearchSuggestionItem";

describe("c-cr-search-suggestion-item", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderItem = (props = {}) => {
        const element = createElement("c-cr-search-suggestion-item", { is: CrSearchSuggestionItem });
        Object.assign(element, { suggestion: { id: "001A", name: "Acme", typeLabel: "Accounts" }, ...props });
        document.body.appendChild(element);
        return element;
    };

    it("shows the icon and type label by default", () => {
        const element = renderItem();

        expect(element.shadowRoot.querySelector("c-cr-search-object-icon")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".suggestion-type").textContent).toBe("Accounts");
    });

    it("leaves out the icon and the type label when asked", () => {
        const element = renderItem({ hideIcon: true, hideType: true });

        expect(element.shadowRoot.querySelector("c-cr-search-object-icon")).toBeNull();
        expect(element.shadowRoot.querySelector(".suggestion-type")).toBeNull();
        expect(element.shadowRoot.querySelector(".suggestion-name").textContent).toBe("Acme");
    });
});
