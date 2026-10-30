import { DEFAULT_APPEARANCE, parseAppearance } from "c/crAccordionAppearance";

describe("c/crAccordionAppearance", () => {
    it("gives the defaults when nothing is stored", () => {
        expect(parseAppearance("")).toEqual(DEFAULT_APPEARANCE);
    });

    it("gives the defaults when the stored value can't be read", () => {
        expect(parseAppearance("{not json")).toEqual(DEFAULT_APPEARANCE);
    });

    it("keeps stored settings and fills the rest from the defaults", () => {
        const appearance = parseAppearance(JSON.stringify({ header: { background: "#ff0000" } }));

        expect(appearance.header.background).toBe("#ff0000");
        expect(appearance.header.openBackground).toBe("");
        expect(appearance.toggle.size).toBe("xx-small");
    });

    it("returns a copy that can be changed without touching the defaults", () => {
        const appearance = parseAppearance("");
        appearance.header.background = "#00ff00";

        expect(DEFAULT_APPEARANCE.header.background).toBe("");
    });
});
