import { createElement } from "lwc";
import CrSearchObjectIcon from "c/crSearchObjectIcon";
import { getObjectInfo } from "lightning/uiObjectInfoApi";

describe("c-cr-search-object-icon", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const renderIcon = () => {
        const element = createElement("c-cr-search-object-icon", { is: CrSearchObjectIcon });
        element.objectApiName = "Account";
        document.body.appendChild(element);
        return element;
    };

    it("shows a gray badge until the object's info loads", () => {
        const element = renderIcon();

        expect(element.shadowRoot.querySelector(".object-icon").style.backgroundColor).toBe("rgb(221, 219, 218)");
        expect(element.shadowRoot.querySelector("img")).toBeNull();
    });

    it("shows the object's icon on its theme color", async () => {
        const element = renderIcon();

        getObjectInfo.emit({ themeInfo: { iconUrl: "/img/icon/t4v35/standard/account.svg", color: "5867E8" } });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".object-icon").style.backgroundColor).toBe("rgb(88, 103, 232)");
        expect(element.shadowRoot.querySelector("img").getAttribute("src")).toBe(
            "/img/icon/t4v35/standard/account.svg"
        );
    });
});
