import { LightningElement, api } from "lwc";

/**
 * The text properties each heading and paragraph takes from the site's --dxp hooks.
 */
const TYPOGRAPHY_PROPERTIES = [
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-decoration",
    "text-transform"
];

/**
 * The site's hook name for each tag. Headings use "-color" and paragraphs use "-text-color".
 */
const TEXT_STYLE_HOOKS = {
    h1: { hook: "text-heading-extra-large", colorSuffix: "color" },
    h2: { hook: "text-heading-large", colorSuffix: "color" },
    h3: { hook: "text-heading-medium", colorSuffix: "color" },
    h4: { hook: "text-heading-small", colorSuffix: "color" },
    h5: { hook: "text-heading-extra-small", colorSuffix: "color" },
    h6: { hook: "text-heading-extra-extra-small", colorSuffix: "color" },
    p: { hook: "body", colorSuffix: "text-color" }
};

/**
 * Returns the names of the CSS properties declared in an inline style.
 * @param {string} style An inline style, such as "color: red; font-size: 2rem;".
 * @returns {Set<string>} The declared property names.
 */
function declaredProperties(style) {
    return new Set(
        style
            .split(";")
            .map((declaration) => declaration.split(":")[0].trim().toLowerCase())
            .filter(Boolean)
    );
}

/**
 * Builds the inline style for one tag from the site's hooks. Inline styles outrank the
 * base component's SLDS heading rules, which is why they are used here. A property the author
 * already set on the element itself is left out, so the author's value wins. Styles the author
 * set on words inside the element are never touched, because they sit on the child element.
 * @param {{hook: string, colorSuffix: string}} textStyle The hook names for the tag.
 * @param {string} authorStyle The style the author already set on the element, if any.
 * @returns {string} The declarations to set on the element.
 */
function siteTextStyle({ hook, colorSuffix }, authorStyle) {
    const authored = declaredProperties(authorStyle);
    const siteValues = {
        ...Object.fromEntries(TYPOGRAPHY_PROPERTIES.map((property) => [property, `var(--dxp-s-${hook}-${property})`])),
        color: `var(--dxp-s-${hook}-${colorSuffix})`,
        margin: "0",
        padding: "0"
    };
    return Object.entries(siteValues)
        .filter(([property]) => !authored.has(property))
        .map(([property, value]) => `${property}: ${value};`)
        .join(" ");
}

/**
 * Displays rich text stored in the Experience Builder properties panel.
 * Visitors see read-only output; authors edit in crRichTextEditor.
 */
export default class CrRichTextBlock extends LightningElement {
    /** HTML string written by the properties panel. Empty string renders nothing. */
    @api content;

    /**
     * Sets the site's text styles on each heading and paragraph. The stored HTML is not changed.
     * Styles the author already set on an element come first, and they keep their place.
     * @returns {string} The HTML to render, or an empty string.
     */
    get htmlContent() {
        if (!this.content) {
            return "";
        }
        const parsed = new DOMParser().parseFromString(this.content, "text/html");
        Object.entries(TEXT_STYLE_HOOKS).forEach(([tag, textStyle]) => {
            parsed.body.querySelectorAll(tag).forEach((element) => {
                const authorStyle = element.getAttribute("style") ?? "";
                const style = siteTextStyle(textStyle, authorStyle);
                element.setAttribute("style", authorStyle ? `${authorStyle.replace(/;\s*$/, "")}; ${style}` : style);
            });
        });
        // The string goes only to lightning-formatted-rich-text, which sanitizes it. Nothing is inserted here.
        // eslint-disable-next-line @lwc/lwc/no-inner-html
        return parsed.body.innerHTML;
    }
}
