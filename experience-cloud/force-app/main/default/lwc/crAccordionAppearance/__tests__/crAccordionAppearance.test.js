import { DEFAULT_APPEARANCE, borderDeclarations, parseAppearance } from "c/crAccordionAppearance";

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

    it("draws no border at a weight of 0", () => {
        expect(borderDeclarations({ color: "#ff0000", size: "0px", style: "solid", radius: "0px" })).toEqual([]);
    });

    it("draws a border with the site's color when none is chosen", () => {
        expect(borderDeclarations({ color: "", size: "1px", style: "dashed", radius: "0px" })).toEqual([
            "border: 1px dashed var(--slds-g-color-border-1, #c9c9c9)"
        ]);
    });

    it("rounds and clips at a radius above 0", () => {
        expect(borderDeclarations({ color: "", size: "0px", style: "solid", radius: "50%" })).toEqual([
            "border-radius: 50%",
            "overflow: hidden"
        ]);
    });
});
