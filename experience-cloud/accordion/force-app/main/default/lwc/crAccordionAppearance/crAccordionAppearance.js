/**
 * Appearance settings for crAccordion, stored as one JSON string in its "appearance" property.
 * The Appearance editor and the accordion both read defaults from here, so the panel always shows
 * the value the page actually uses.
 */
import { NO_BORDER } from "c/crBorderCss";

export { ALL_CORNERS, ALL_SIDES, borderDeclarations } from "c/crBorderCss";

export const DEFAULT_APPEARANCE = Object.freeze({
    toggle: Object.freeze({
        position: "left",
        // "swap" cross-fades between the open and close icons; "rotate" turns the close icon by rotation degrees.
        change: "swap",
        rotation: "90",
        openIcon: "utility:chevrondown",
        closeIcon: "utility:chevronright",
        hide: false,
        size: "xx-small",
        background: "",
        openBackground: "",
        foreground: ""
    }),
    headerIcon: Object.freeze({
        show: false,
        icon: "utility:question",
        size: "x-small",
        background: "",
        openBackground: "",
        foreground: "",
        borderSize: "0px",
        borderColor: ""
    }),
    // An empty surface color falls back along the cascade in resolveSurfaces.
    section: Object.freeze({ background: "" }),
    header: Object.freeze({ background: "", openBackground: "" }),
    content: Object.freeze({ background: "" }),
    separator: Object.freeze({ color: "", size: "1px", style: "solid" }),
    sectionBorder: Object.freeze({ ...NO_BORDER, size: "1px", radius: "4px" }),
    container: Object.freeze({ background: "" }),
    containerBorder: NO_BORDER,
    spacing: Object.freeze({ between: 0.5 }),
    animation: Object.freeze({ type: "none", speed: "normal" })
});

/** The site's background. Text components use the site's text color, which is always readable on it. */
export const SITE_BACKGROUND = "var(--dxp-g-root, #ffffff)";

/** The site's text color, mixed into the shade and line defaults so they show on light and dark sites. */
const SITE_TEXT = "var(--dxp-g-root-contrast, #181818)";

/** Line color for a border or separator with no color chosen: a faint tint of the site's text color. */
export const FAINT_LINE = `color-mix(in srgb, ${SITE_TEXT} 15%, transparent)`;

/**
 * A slightly shaded version of a color, toward the site's text color. Marks the open header.
 * @param {string} color Any CSS color, including a var().
 * @returns {string} A CSS color.
 */
export function shadeOf(color) {
    return `color-mix(in srgb, ${SITE_TEXT} 6%, ${color})`;
}

/**
 * Works out every surface color from the cascade: Site, Container, Section, Header, Content. An
 * unset color takes the one above it. The container has no color of its own until one is chosen,
 * so the page shows through it, and an unset section then uses the site background. The open
 * header defaults to a shade of the closed one.
 *
 * The header always gets a color, never transparent: the site paints .slds-accordion__summary
 * through --slds-c-accordion-summary-color-background, which would cover the section's color.
 * @param {object} appearance A full appearance, from parseAppearance.
 * @returns {{container: string, section: string, header: string, headerOpen: string, content: string}}
 */
export function resolveSurfaces(appearance) {
    const container = appearance.container.background;
    const section = appearance.section.background || container || SITE_BACKGROUND;
    const header = appearance.header.background || section;
    return {
        container,
        section,
        header,
        headerOpen: appearance.header.openBackground || shadeOf(header),
        content: appearance.content.background || header
    };
}

/**
 * A border or separator with the faint line color filled in when none is chosen.
 * @param {object} border Border settings in the crBorderCss shape.
 * @returns {object} The same settings with a color.
 */
export function withLineColor(border) {
    return { ...border, color: border.color || FAINT_LINE };
}

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
