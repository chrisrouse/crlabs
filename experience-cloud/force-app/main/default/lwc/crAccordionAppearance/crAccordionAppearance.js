/**
 * Appearance settings for crAccordion, stored as one JSON string in its "appearance" property.
 * The Appearance editor and the accordion both read defaults from here, so the panel always shows
 * the value the page actually uses.
 */
export const DEFAULT_APPEARANCE = Object.freeze({
    toggle: Object.freeze({
        position: "left",
        openIcon: "utility:chevrondown",
        closeIcon: "utility:chevronright",
        hide: false,
        size: "xx-small",
        background: "",
        foreground: ""
    }),
    header: Object.freeze({ background: "", openBackground: "", openText: "" }),
    content: Object.freeze({ background: "" }),
    sectionBorder: Object.freeze({ color: "", size: "0px", style: "solid", radius: "0px" }),
    containerBorder: Object.freeze({ color: "", size: "0px", style: "solid", radius: "0px" }),
    spacing: Object.freeze({ between: 1.5 }),
    animation: Object.freeze({ type: "none", speed: "normal" })
});

/**
 * Reads the stored appearance and fills any missing part or setting from the defaults. A missing
 * or unreadable value gives the defaults.
 * @param {string} json The stored appearance JSON, or empty.
 * @returns {object} A full appearance object, with every part and setting present.
 */
export function parseAppearance(json) {
    let stored = {};
    if (json) {
        try {
            stored = JSON.parse(json) || {};
        } catch {
            stored = {};
        }
    }
    const appearance = {};
    Object.keys(DEFAULT_APPEARANCE).forEach((part) => {
        appearance[part] = { ...DEFAULT_APPEARANCE[part], ...(stored[part] || {}) };
    });
    return appearance;
}

/** Border color used when no custom color is chosen: the site's standard border color. */
const DEFAULT_BORDER_COLOR = "var(--slds-g-color-border-1, #c9c9c9)";

/**
 * Turns border settings into CSS declarations. A weight of 0 draws no border, and an unset color
 * uses the site's standard border color. A radius also clips the inside to the rounded corners, so
 * colors don't poke out.
 * @param {{color: string, size: string, style: string, radius: string}} border The border settings.
 * @returns {string[]} The CSS declarations, empty when there's nothing to draw.
 */
export function borderDeclarations({ color, size, style, radius }) {
    const declarations = [];
    if (parseFloat(size) > 0) {
        declarations.push(`border: ${size} ${style || "solid"} ${color || DEFAULT_BORDER_COLOR}`);
    }
    if (parseFloat(radius) > 0) {
        declarations.push(`border-radius: ${radius}`, "overflow: hidden");
    }
    return declarations;
}
