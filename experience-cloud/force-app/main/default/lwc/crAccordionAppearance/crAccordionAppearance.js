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
