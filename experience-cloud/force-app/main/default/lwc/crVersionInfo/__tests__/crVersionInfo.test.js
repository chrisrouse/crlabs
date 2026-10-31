import { createElement } from "lwc";
import CrVersionInfo from "c/crVersionInfo";

describe("c-cr-version-info", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it("shows the build label", () => {
        const element = createElement("c-cr-version-info", { is: CrVersionInfo });
        document.body.appendChild(element);

        expect(element.shadowRoot.textContent).toContain("Build 2026-10-31-F");
    });
});
