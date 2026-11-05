/**
 * Appearance settings for crSearchBar, stored as one JSON string in its "appearance" property.
 * The Appearance editor and the search bar both read defaults from here, so the panel always shows
 * the value the page actually uses. An empty color means the site's own branding color.
 */

import { ALL_CORNERS, ALL_SIDES, NO_BORDER, borderDeclarations } from "c/crBorderCss";

export { ALL_CORNERS, ALL_SIDES };

/** Short names for each corner's custom property, such as --cr-search-bar-radius-tl. */
const CORNER_KEYS = Object.freeze({ "top-left": "tl", "top-right": "tr", "bottom-right": "br", "bottom-left": "bl" });

/** Bar height for each size. The font steps up with Large so the text keeps its proportion. */
const SIZES = Object.freeze({
    small: { height: "28px" },
    medium: { height: "36px" },
    large: { height: "52px", fontSize: "1rem" }
});

/**
 * The SLDS spacing scale, used for the button's left and right padding. Keys match the SLDS
 * padding utility names, such as slds-p-horizontal_medium.
 */
export const BUTTON_PADDING = Object.freeze({
    none: "0",
    "xxx-small": "0.125rem",
    "xx-small": "0.25rem",
    "x-small": "0.5rem",
    small: "0.75rem",
    medium: "1rem",
    large: "1.5rem",
    "x-large": "2rem",
    "xx-large": "3rem"
});

export const DEFAULT_APPEARANCE = Object.freeze({
    field: Object.freeze({
        size: "medium",
        background: "",
        text: "",
        placeholder: "",
        icon: "",
        showFocusRing: true,
        focusColor: ""
    }),
    // The bar's border and shadow, in the shape crBorderSettings and crShadowSettings edit.
    border: Object.freeze({ ...NO_BORDER, size: "1px" }),
    button: Object.freeze({
        style: "attached",
        theme: "primary",
        themeSize: "standard",
        label: "",
        showIcon: true,
        padding: "medium",
        background: "",
        hoverBackground: "",
        icon: "",
        // A Custom button's own border and shadow. A weight of 0 shares the bar's border.
        border: NO_BORDER
    }),
    menu: Object.freeze({
        layout: "list",
        showIcons: true,
        position: "fixed",
        background: "",
        text: "",
        typeText: "",
        hoverBackground: "",
        borderColor: ""
    })
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
    // A Custom button's border and shadow were first saved as separate settings on the button.
    const storedButtonBorder = (stored.button || {}).border;
    if (!storedButtonBorder) {
        const { borderColor, borderSize, shadow, shadowColor } = stored.button || {};
        appearance.button = {
            ...appearance.button,
            border: {
                ...NO_BORDER,
                ...(borderColor ? { color: borderColor } : {}),
                ...(borderSize ? { size: borderSize } : {}),
                ...(shadow ? { shadow } : {}),
                ...(shadowColor ? { shadowColor } : {})
            }
        };
    } else {
        appearance.button = { ...appearance.button, border: { ...NO_BORDER, ...storedButtonBorder } };
    }
    // Bars saved before the site button styles existed keep any custom colors they had.
    const storedButton = stored.button || {};
    if (!storedButton.theme && (storedButton.background || storedButton.hoverBackground || storedButton.icon)) {
        appearance.button = { ...appearance.button, theme: "custom" };
    }
    // The fixed menu was first saved as "attached".
    if (appearance.menu.position === "attached") {
        appearance.menu = { ...appearance.menu, position: "fixed" };
    }
    return appearance;
}

/**
 * The custom properties the search bar's stylesheet reads. An empty value is left out, so the
 * stylesheet's site-branding fallback applies.
 * @param {object} appearance A full appearance object from parseAppearance.
 * @returns {object} CSS custom property values, keyed by property name.
 * @example
 * appearanceStyles(parseAppearance('{"border":{"sides":["bottom"]}}'))["--cr-search-bar-bw-top"]; // "0px"
 */
export function appearanceStyles(appearance) {
    const { field, border, button, menu } = appearance;
    const size = SIZES[field.size] || SIZES.medium;
    const sides = Array.isArray(border.sides) ? border.sides : ALL_SIDES;
    // A site button style reads the theme's button hooks in the stylesheet, so its custom colors
    // and padding are left out here.
    const customButton = button.theme === "custom";
    const ownBorder = hasOwnBorder(button);
    const buttonBorder = button.border;
    const styles = {
        "--cr-search-bar-height": size.height,
        "--cr-search-bar-font-size": size.fontSize,
        "--cr-search-bar-bg": field.background,
        "--cr-search-bar-text-color": field.text,
        "--cr-search-bar-placeholder-color": field.placeholder,
        "--cr-search-bar-icon-color": field.icon,
        "--cr-search-bar-focus-color": field.focusColor,
        "--cr-search-bar-border-color": border.color,
        "--cr-search-bar-border-width": border.size,
        "--cr-search-bar-border-style": border.style,
        "--cr-search-bar-shadow": shadowValue(border),
        "--cr-search-bar-btn-padding": customButton ? BUTTON_PADDING[button.padding] || BUTTON_PADDING.medium : "",
        "--cr-search-bar-btn-bg": customButton ? button.background : "",
        "--cr-search-bar-btn-hover-bg": customButton ? button.hoverBackground : "",
        "--cr-search-bar-btn-icon-color": customButton ? button.icon : "",
        // A Custom button's own border; at weight 0 it shares the bar's border instead.
        "--cr-search-bar-btn-border-color": ownBorder ? buttonBorder.color : "",
        "--cr-search-bar-btn-border-style": ownBorder ? buttonBorder.style : "",
        "--cr-search-bar-btn-shadow": customButton ? shadowValue(buttonBorder) : "",
        "--cr-search-bar-menu-bg": menu.background,
        "--cr-search-bar-menu-text": menu.text,
        "--cr-search-bar-menu-type-text": menu.typeText,
        "--cr-search-bar-menu-hover-bg": menu.hoverBackground,
        "--cr-search-bar-menu-border-color": menu.borderColor
    };
    // Each side's width and each corner's radius is its own property, so the border can be drawn
    // on some sides and rounded on some corners only.
    ALL_SIDES.forEach((side) => {
        styles[`--cr-search-bar-bw-${side}`] = sides.includes(side) ? border.size : "0px";
    });
    const corners = Array.isArray(border.radiusCorners) ? border.radiusCorners : ALL_CORNERS;
    ALL_CORNERS.forEach((corner) => {
        styles[`--cr-search-bar-radius-${CORNER_KEYS[corner]}`] = corners.includes(corner) ? border.radius : "0px";
    });
    // A Custom button with its own border: its sides, and its own corners once it has a radius.
    if (ownBorder) {
        const buttonSides = Array.isArray(buttonBorder.sides) ? buttonBorder.sides : ALL_SIDES;
        ALL_SIDES.forEach((side) => {
            styles[`--cr-search-bar-btn-bw-${side}`] = buttonSides.includes(side) ? buttonBorder.size : "0px";
        });
        if (parseFloat(buttonBorder.radius) > 0) {
            const buttonCorners = Array.isArray(buttonBorder.radiusCorners) ? buttonBorder.radiusCorners : ALL_CORNERS;
            ALL_CORNERS.forEach((corner) => {
                styles[`--cr-search-bar-btn-radius-${CORNER_KEYS[corner]}`] = buttonCorners.includes(corner)
                    ? buttonBorder.radius
                    : "0px";
            });
        }
    }
    return Object.fromEntries(Object.entries(styles).filter(([, value]) => value));
}

/**
 * Whether a Custom button draws its own border rather than sharing the bar's.
 * @param {object} button The button settings from parseAppearance.
 * @returns {boolean}
 */
export function hasOwnBorder(button) {
    return button.theme === "custom" && parseFloat((button.border || {}).size) > 0;
}

/**
 * The box-shadow for a border object, drawn the same way as every CRLabs component: on its Shadow
 * Sides, in its Shadow Color, or in the border's color when it has none.
 * @param {object} border Border settings in the crBorderCss shape.
 * @returns {string} The box-shadow value, or empty for no shadow.
 */
function shadowValue(border) {
    // Only the shadow is wanted here; the border itself is drawn by the search bar's stylesheet.
    const declaration = borderDeclarations({ ...border, size: "0px", radius: "0px" }).find((line) =>
        line.startsWith("box-shadow: ")
    );
    return declaration ? declaration.slice("box-shadow: ".length) : "";
}
