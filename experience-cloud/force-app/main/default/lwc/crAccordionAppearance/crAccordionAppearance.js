/**
 * Appearance settings for crAccordion, stored as one JSON string in its "appearance" property.
 * The Appearance editor and the accordion both read defaults from here, so the panel always shows
 * the value the page actually uses.
 */
/** Box sides in CSS order. Borders and shadows apply to any combination of them. */
export const ALL_SIDES = Object.freeze(["top", "right", "bottom", "left"]);

/** Border settings with no border drawn: every side selected, no weight, and no shadow. The shadow
 * is a blur length; 0 draws none. */
const NO_BORDER = Object.freeze({
    color: "",
    size: "0px",
    style: "solid",
    radius: "0px",
    sides: ALL_SIDES,
    shadow: "0px",
    shadowSides: ALL_SIDES
});

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
    separator: Object.freeze({ color: "", size: "0px", style: "solid" }),
    sectionBorder: NO_BORDER,
    containerBorder: NO_BORDER,
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

/** Shadow color: a soft black that works on light and dark backgrounds. */
const SHADOW_COLOR = "rgba(0, 0, 0, 0.2)";

/** Which way each side's shadow is pushed, as x and y multipliers of the blur. */
const SHADOW_DIRECTION = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

/**
 * Turns the shadow settings into a box-shadow value. All four sides give an even shadow around the
 * box. Fewer sides give one shadow per side, each pushed out by its blur and pulled in by the same
 * amount of negative spread, so it shows only on its own side.
 * @param {string} shadow The blur as a CSS length, such as "8px". The shadow reaches out this far.
 * @param {string[]} sides The sides with a shadow.
 * @returns {string} The box-shadow value, or empty for no shadow.
 */
function shadowValue(shadow, sides) {
    const blur = parseFloat(shadow);
    if (!(blur > 0) || !sides.length) {
        return "";
    }
    const unit = /[a-z%]+$/i.exec(shadow)?.[0] || "px";
    if (sides.length === ALL_SIDES.length) {
        return `0 0 ${blur}${unit} ${SHADOW_COLOR}`;
    }
    return sides
        .map((side) => {
            const [x, y] = SHADOW_DIRECTION[side];
            return `${x * blur}${unit} ${y * blur}${unit} ${blur}${unit} -${blur}${unit} ${SHADOW_COLOR}`;
        })
        .join(", ");
}

/**
 * Reads a list of sides, keeping CSS order. Anything that isn't a list means all sides.
 * @param {string[]} sides The stored sides.
 * @returns {string[]}
 */
function readSides(sides) {
    return Array.isArray(sides) ? ALL_SIDES.filter((side) => sides.includes(side)) : [...ALL_SIDES];
}

/**
 * Turns border settings into CSS declarations. A weight of 0 or no sides draws no border, and an
 * unset color uses the site's standard border color. A radius also clips the inside to the rounded
 * corners, so colors don't poke out. The shadow is drawn on its own sides.
 * @param {object} border The border settings: color, size, style, radius, sides, shadow, shadowSides.
 * @returns {string[]} The CSS declarations, empty when there's nothing to draw.
 */
export function borderDeclarations({ color, size, style, radius, sides, shadow, shadowSides }) {
    const declarations = [];
    const borderSides = readSides(sides);
    if (parseFloat(size) > 0 && borderSides.length) {
        const line = `${size} ${style || "solid"} ${color || DEFAULT_BORDER_COLOR}`;
        if (borderSides.length === ALL_SIDES.length) {
            declarations.push(`border: ${line}`);
        } else {
            borderSides.forEach((side) => declarations.push(`border-${side}: ${line}`));
        }
    }
    if (parseFloat(radius) > 0) {
        declarations.push(`border-radius: ${radius}`, "overflow: hidden");
    }
    const boxShadow = shadowValue(shadow, readSides(shadowSides));
    if (boxShadow) {
        declarations.push(`box-shadow: ${boxShadow}`);
    }
    return declarations;
}
