import { DEFAULT_APPEARANCE, parseAppearance, appearanceStyles } from "c/crSearchBarAppearance";

describe("crSearchBarAppearance", () => {
    it("gives the defaults for an empty or unreadable value", () => {
        expect(parseAppearance("")).toEqual(DEFAULT_APPEARANCE);
        expect(parseAppearance("{not json")).toEqual(DEFAULT_APPEARANCE);
    });

    it("keeps stored settings and fills the rest from the defaults", () => {
        const appearance = parseAppearance(JSON.stringify({ border: { color: "#ff0000" } }));

        expect(appearance.border).toEqual({ ...DEFAULT_APPEARANCE.border, color: "#ff0000" });
        expect(appearance.field).toEqual(DEFAULT_APPEARANCE.field);
        expect(appearance.menu).toEqual(DEFAULT_APPEARANCE.menu);
    });

    it("leaves empty colors out of the styles, so the site branding applies", () => {
        const styles = appearanceStyles(parseAppearance(""));

        expect(styles).toEqual({
            "--cr-search-bar-height": "36px",
            "--cr-search-bar-border-width": "1px",
            "--cr-search-bar-border-style": "solid",
            "--cr-search-bar-bw-top": "1px",
            "--cr-search-bar-bw-right": "1px",
            "--cr-search-bar-bw-bottom": "1px",
            "--cr-search-bar-bw-left": "1px",
            "--cr-search-bar-radius-tl": "0px",
            "--cr-search-bar-radius-tr": "0px",
            "--cr-search-bar-radius-br": "0px",
            "--cr-search-bar-radius-bl": "0px"
        });
    });

    it("maps each color to its custom property", () => {
        const styles = appearanceStyles(
            parseAppearance(
                JSON.stringify({
                    field: {
                        background: "#111111",
                        text: "#222222",
                        placeholder: "#333333",
                        icon: "#444444",
                        focusColor: "#121212"
                    },
                    border: { color: "#555555" },
                    button: { background: "#666666", hoverBackground: "#777777", icon: "#888888" },
                    menu: {
                        background: "#a1a1a1",
                        text: "#a2a2a2",
                        typeText: "#a3a3a3",
                        hoverBackground: "#a4a4a4",
                        borderColor: "#a5a5a5"
                    }
                })
            )
        );

        expect(styles).toMatchObject({
            "--cr-search-bar-bg": "#111111",
            "--cr-search-bar-text-color": "#222222",
            "--cr-search-bar-placeholder-color": "#333333",
            "--cr-search-bar-icon-color": "#444444",
            "--cr-search-bar-focus-color": "#121212",
            "--cr-search-bar-border-color": "#555555",
            "--cr-search-bar-btn-bg": "#666666",
            "--cr-search-bar-btn-hover-bg": "#777777",
            "--cr-search-bar-btn-icon-color": "#888888",
            "--cr-search-bar-menu-bg": "#a1a1a1",
            "--cr-search-bar-menu-text": "#a2a2a2",
            "--cr-search-bar-menu-type-text": "#a3a3a3",
            "--cr-search-bar-menu-hover-bg": "#a4a4a4",
            "--cr-search-bar-menu-border-color": "#a5a5a5"
        });
    });

    it("draws the border only on the chosen sides", () => {
        const styles = appearanceStyles(
            parseAppearance(JSON.stringify({ border: { size: "2px", sides: ["bottom"] } }))
        );

        expect(styles["--cr-search-bar-bw-top"]).toBe("0px");
        expect(styles["--cr-search-bar-bw-right"]).toBe("0px");
        expect(styles["--cr-search-bar-bw-bottom"]).toBe("2px");
        expect(styles["--cr-search-bar-bw-left"]).toBe("0px");
    });

    it("sets the height and font for the Large size", () => {
        const styles = appearanceStyles(parseAppearance(JSON.stringify({ field: { size: "large" } })));

        expect(styles["--cr-search-bar-height"]).toBe("52px");
        expect(styles["--cr-search-bar-font-size"]).toBe("1rem");
    });

    it("pads a Custom button with the chosen SLDS size, or Medium for an unknown one", () => {
        expect(
            appearanceStyles(parseAppearance('{"button":{"theme":"custom","padding":"xx-large"}}'))[
                "--cr-search-bar-btn-padding"
            ]
        ).toBe("3rem");
        expect(
            appearanceStyles(parseAppearance('{"button":{"theme":"custom","padding":"none"}}'))[
                "--cr-search-bar-btn-padding"
            ]
        ).toBe("0");
        expect(
            appearanceStyles(parseAppearance('{"button":{"theme":"custom","padding":"huge"}}'))[
                "--cr-search-bar-btn-padding"
            ]
        ).toBe("1rem");
    });

    it("rounds only the chosen corners", () => {
        const styles = appearanceStyles(
            parseAppearance(JSON.stringify({ border: { radius: "12px", radiusCorners: ["top-left", "bottom-left"] } }))
        );

        expect(styles["--cr-search-bar-radius-tl"]).toBe("12px");
        expect(styles["--cr-search-bar-radius-tr"]).toBe("0px");
        expect(styles["--cr-search-bar-radius-br"]).toBe("0px");
        expect(styles["--cr-search-bar-radius-bl"]).toBe("12px");
    });

    it("rounds every corner when none were chosen yet", () => {
        const styles = appearanceStyles(parseAppearance(JSON.stringify({ border: { radius: "8px" } })));

        expect(["tl", "tr", "br", "bl"].map((key) => styles[`--cr-search-bar-radius-${key}`])).toEqual([
            "8px",
            "8px",
            "8px",
            "8px"
        ]);
    });

    it("reads a menu saved as attached as the fixed menu", () => {
        expect(parseAppearance('{"menu":{"position":"attached"}}').menu.position).toBe("fixed");
        expect(parseAppearance('{"menu":{"position":"floating"}}').menu.position).toBe("floating");
    });

    it("uses the site's Primary button style by default, so no button colors or padding are written", () => {
        const appearance = parseAppearance("");
        const styles = appearanceStyles(appearance);

        expect(appearance.button.theme).toBe("primary");
        expect(styles["--cr-search-bar-btn-bg"]).toBeUndefined();
        expect(styles["--cr-search-bar-btn-padding"]).toBeUndefined();
    });

    it("writes the custom button colors and padding only for the Custom style", () => {
        const styles = appearanceStyles(
            parseAppearance('{"button":{"theme":"custom","background":"#123456","padding":"large"}}')
        );

        expect(styles["--cr-search-bar-btn-bg"]).toBe("#123456");
        expect(styles["--cr-search-bar-btn-padding"]).toBe("1.5rem");
    });

    it("keeps a bar saved with custom button colors on the Custom style", () => {
        expect(parseAppearance('{"button":{"background":"#123456"}}').button.theme).toBe("custom");
        expect(parseAppearance('{"button":{"theme":"secondary","background":"#123456"}}').button.theme).toBe(
            "secondary"
        );
        expect(parseAppearance('{"button":{"label":"Go"}}').button.theme).toBe("primary");
    });

    it("ignores the Custom border and shadow for a site button style", () => {
        const styles = appearanceStyles(
            parseAppearance('{"button":{"theme":"primary","borderSize":"2px","shadow":"6px"}}')
        );

        expect(styles["--cr-search-bar-btn-border-width"]).toBeUndefined();
        expect(styles["--cr-search-bar-btn-shadow"]).toBeUndefined();
    });

    it("draws the bar's shadow the CRLabs way: even around the box, in the border color unless set", () => {
        const shadowOf = (json) => appearanceStyles(parseAppearance(json))["--cr-search-bar-shadow"];

        expect(shadowOf("")).toBeUndefined();
        expect(shadowOf('{"border":{"shadow":"12px","color":"#123456"}}')).toBe("0 0 12px #123456");
        expect(shadowOf('{"border":{"shadow":"8px","shadowColor":"#ff000080"}}')).toBe("0 0 8px #ff000080");
        expect(shadowOf('{"border":{"shadow":"8px","shadowColor":"#ff000080","shadowSides":["bottom"]}}')).toBe(
            "0px 8px 8px -8px #ff000080"
        );
    });

    it("draws a Custom button's own border from its border object only when its weight is above 0", () => {
        const none = appearanceStyles(parseAppearance('{"button":{"theme":"custom","border":{"color":"#ff0000"}}}'));
        expect(none["--cr-search-bar-btn-border-color"]).toBeUndefined();
        expect(none["--cr-search-bar-btn-bw-top"]).toBeUndefined();

        const styles = appearanceStyles(
            parseAppearance(
                JSON.stringify({
                    button: {
                        theme: "custom",
                        border: {
                            color: "#ff0000",
                            size: "2px",
                            style: "dashed",
                            sides: ["top", "bottom"],
                            radius: "6px",
                            radiusCorners: ["top-right"],
                            shadow: "4px",
                            shadowColor: "#00000040"
                        }
                    }
                })
            )
        );
        expect(styles).toMatchObject({
            "--cr-search-bar-btn-border-color": "#ff0000",
            "--cr-search-bar-btn-border-style": "dashed",
            "--cr-search-bar-btn-bw-top": "2px",
            "--cr-search-bar-btn-bw-right": "0px",
            "--cr-search-bar-btn-bw-bottom": "2px",
            "--cr-search-bar-btn-radius-tr": "6px",
            "--cr-search-bar-btn-radius-tl": "0px",
            "--cr-search-bar-btn-shadow": "0 0 4px #00000040"
        });
    });

    it("moves a Custom button's earlier border and shadow settings into its border object", () => {
        const button = parseAppearance(
            '{"button":{"theme":"custom","borderColor":"#ff0000","borderSize":"2px","shadow":"6px","shadowColor":"#000"}}'
        ).button;

        expect(button.border).toMatchObject({ color: "#ff0000", size: "2px", shadow: "6px", shadowColor: "#000" });
    });
});
