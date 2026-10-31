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

    const border = (settings) => ({ color: "#000000", size: "2px", style: "solid", radius: "0px", ...settings });

    it("draws the border only on the chosen sides", () => {
        expect(borderDeclarations(border({ sides: ["top", "bottom"] }))).toEqual([
            "border-top: 2px solid #000000",
            "border-bottom: 2px solid #000000"
        ]);
    });

    it("draws no border when no side is chosen", () => {
        expect(borderDeclarations(border({ sides: [] }))).toEqual([]);
    });

    it("draws an even shadow on all sides", () => {
        expect(borderDeclarations(border({ size: "0px", shadow: "4px" }))).toEqual(["box-shadow: 0 0 4px #000000"]);
    });

    it("draws a shadow only on the chosen sides", () => {
        expect(borderDeclarations(border({ size: "0px", shadow: "8px", shadowSides: ["bottom"] }))).toEqual([
            "box-shadow: 0px 8px 8px -8px #000000"
        ]);
    });

    it("defaults to all sides and no shadow", () => {
        expect(DEFAULT_APPEARANCE.sectionBorder.sides).toEqual(["top", "right", "bottom", "left"]);
        expect(DEFAULT_APPEARANCE.sectionBorder.shadow).toBe("0px");
    });

    it("draws the shadow in its own color when one is chosen", () => {
        expect(borderDeclarations(border({ size: "0px", shadow: "4px", shadowColor: "#ff0000" }))).toEqual([
            "box-shadow: 0 0 4px #ff0000"
        ]);
    });

    it("uses the site's border color for the shadow when neither color is chosen", () => {
        expect(borderDeclarations(border({ color: "", size: "0px", shadow: "4px" }))).toEqual([
            "box-shadow: 0 0 4px var(--slds-g-color-border-1, #c9c9c9)"
        ]);
    });
});
