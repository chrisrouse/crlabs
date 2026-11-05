import {
    DEFAULT_APPEARANCE,
    SITE_BACKGROUND,
    parseAppearance,
    resolveSurfaces,
    withLineColor
} from "c/crAccordionAppearance";

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

    describe("resolveSurfaces", () => {
        const surfaces = (stored) => resolveSurfaces(parseAppearance(JSON.stringify(stored)));

        it("puts the section, header, and content on the site background", () => {
            const resolved = surfaces({});

            expect(resolved.section).toBe(SITE_BACKGROUND);
            expect(resolved.header).toBe(SITE_BACKGROUND);
            expect(resolved.content).toBe(SITE_BACKGROUND);
            expect(resolved.container).toBe("");
            expect(resolved.headerOpen).toContain(SITE_BACKGROUND);
        });

        it("shades the open header from the header's own color when it has one", () => {
            const resolved = surfaces({ section: { background: "#111111" }, header: { background: "#222222" } });

            expect(resolved.section).toBe("#111111");
            expect(resolved.headerOpen).toContain("#222222");
            expect(resolved.headerOpen).not.toContain("#111111");
        });

        it("passes each color down the chain: Container to Section, Header to Content", () => {
            const resolved = surfaces({ container: { background: "#000001" }, header: { background: "#000003" } });

            expect(resolved.section).toBe("#000001");
            expect(resolved.header).toBe("#000003");
            expect(resolved.content).toBe("#000003");
        });

        it("gives an unset header the section's color, so the site's header color can't cover it", () => {
            const resolved = surfaces({ container: { background: "#d4dcf5" } });

            expect(resolved.header).toBe("#d4dcf5");
            expect(resolved.content).toBe("#d4dcf5");
        });

        it("uses every chosen color as is", () => {
            const resolved = surfaces({
                container: { background: "#000001" },
                section: { background: "#000002" },
                header: { background: "#000003", openBackground: "#000004" },
                content: { background: "#000005" }
            });

            expect(resolved).toEqual({
                container: "#000001",
                section: "#000002",
                header: "#000003",
                headerOpen: "#000004",
                content: "#000005"
            });
        });
    });

    it("fills a missing line color with the faint line, and keeps a chosen one", () => {
        expect(withLineColor({ size: "1px", color: "" }).color).toContain("color-mix(");
        expect(withLineColor({ size: "1px", color: "#ff0000" }).color).toBe("#ff0000");
    });

    it("returns a copy that can be changed without touching the defaults", () => {
        const appearance = parseAppearance("");
        appearance.header.background = "#00ff00";

        expect(DEFAULT_APPEARANCE.header.background).toBe("");
    });
});
