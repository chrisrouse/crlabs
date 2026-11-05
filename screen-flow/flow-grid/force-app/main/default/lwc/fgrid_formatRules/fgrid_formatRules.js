/**
 * Conditional cell formatting — the rule model.
 *
 * Step 2 of STATUS 2.3d. Pure logic: reads the rules an admin configured,
 * decides which one a row matches, and names the CSS class that paints it. It
 * renders nothing and knows nothing about the datatable.
 *
 * The grammar deliberately mirrors Salesforce's own conditional formatting —
 * ordered rules, first match wins, each with conditions of field + operator +
 * value and an All / Any / Custom / Always selector. That is what an admin has
 * already seen in Setup, and it keeps any future import of a
 * `UiFormatSpecificationSet` a mapping job rather than a rewrite (2.3e).
 *
 * Conditions may test ANY column, not only the one being formatted, which is
 * what the native editor does. The cost is that `buildRows` must carry a field
 * a rule tests even when it is not displayed — see `conditionFields`.
 *
 * Operators and per-kind matching are NOT reimplemented here. `matchesFilter`
 * from `c/fgrid_gridModel` already answers "does this value satisfy this
 * spec?" for text, picklist, date, number and boolean, including how blanks
 * behave. A second copy would drift.
 *
 * It is INJECTED rather than imported, because gridModel has to call back into
 * this module to evaluate rules while building rows, and importing each other
 * is a cycle. The caller passes the matcher it already has.
 *
 * Stored shape, under `columnConfig[fieldPath].format`:
 *
 *   [
 *     {
 *       color: "#ba0517",                // any #rrggbb the admin picked
 *       textOnly: false,                 // color the text, not the cell
 *       icon: "utility:warning",         // optional
 *       iconPosition: "left",
 *       logic: "all",                    // all | any | always | custom
 *       customLogic: "1 AND (2 OR 3)",   // only when logic is "custom"
 *       conditions: [
 *         { field: "Status", kind: "picklist", operator: "equals", values: ["Overdue"] },
 *         { field: "Amount", kind: "number", operator: "greaterThan", value: 10000 }
 *       ]
 *     }
 *   ]
 *
 * Configs saved before colors were free-form carry `style: "error"` instead.
 * `migrateColumnColors` turns those into hex on read; see LEGACY_COLORS.
 */

/**
 * The named palette this replaced, as hex, so a saved config keeps its look.
 *
 * The values are the SLDS 1 light-mode fallbacks the old classes used. They
 * are now fixed: the names used to follow the theme into dark mode, a picked
 * hex does not, and that was accepted in exchange for any color.
 */
const LEGACY_COLORS = {
    fill: {
        success: "#acf3e4",
        warning: "#f9e3b6",
        error: "#fddde3",
        accent: "#066afe",
        neutral: "#e5e5e5",
        inverse: "#032d60"
    },
    text: {
        success: "#056764",
        warning: "#8c4b02",
        error: "#b60554",
        accent: "#0250d9",
        neutral: "#5c5c5c"
    },
    // A gauge's fill, which had its own stronger set.
    gauge: {
        success: "#2e844a",
        warning: "#dd7a01",
        error: "#ba0517",
        accent: "#066afe",
        neutral: "#747474",
        inverse: "#032d60"
    }
};

/**
 * How many distinct colors one grid can use.
 *
 * `cellAttributes` takes a class and no style, so a color reaches a cell as a
 * fixed class (`fgridColor_3`) whose value is a custom property the grid sets
 * on the datatable's host. fgridFormatStyles.css declares this many; a grid
 * using more leaves the extras unpainted rather than failing.
 */
export const MAX_COLOR_SLOTS = 40;

/** What a new rule starts with, so it paints something before it is edited. */
export const DEFAULT_RULE_COLOR = "#ba0517";

/** How a rule's conditions combine. */
export const FORMAT_LOGIC = {
    ALL: "all",
    ANY: "any",
    ALWAYS: "always",
    CUSTOM: "custom"
};

export const FORMAT_LOGIC_OPTIONS = [
    { label: "All Conditions Are Met", value: FORMAT_LOGIC.ALL },
    { label: "Any Condition Is Met", value: FORMAT_LOGIC.ANY },
    { label: "Custom Condition Logic Is Met", value: FORMAT_LOGIC.CUSTOM },
    { label: "Always", value: FORMAT_LOGIC.ALWAYS }
];

/** Marker class every FILLED variant carries; the hover and focus rules key off it. */
const FILL_MARKER = "fgridFormat";

/**
 * Reads the stored rules, tolerating everything an admin can leave behind.
 *
 * Returns [] rather than throwing on malformed JSON: a broken rule is a
 * configuration problem, and an unformatted grid reports it better than a
 * crash in front of a site visitor.
 */
export function parseFormatRules(raw, legacy = "fill") {
    return coerceArray(raw)
        .filter((rule) => rule && typeof rule === "object")
        .map((rule) => migrateRule(rule, legacy))
        .filter((rule) => rule.color);
}

/**
 * Every field path the rules read, so `buildRows` can carry them.
 *
 * A rule may test a column that is not displayed — coloring Amount by Status
 * when Status is not shown. Without this the row would not hold Status and the
 * rule would silently never match.
 */
export function conditionFields(rules) {
    const fields = new Set();
    parseFormatRules(rules).forEach((rule) => {
        asConditions(rule).forEach((condition) => {
            if (condition?.field) {
                fields.add(condition.field);
            }
        });
    });
    return [...fields];
}

/**
 * The first rule a row matches, or null.
 *
 * First match wins, in stored order, which is what the native editor's
 * `order: 1, 2, 3` means. Later rules are not merged into earlier ones: two
 * backgrounds on one cell is not a thing, and "the first rule that applies"
 * is a model an admin can hold in their head.
 */
export function matchFormatRule(rules, row, matchValue, caseSensitive = false) {
    if (typeof matchValue !== "function") {
        return null;
    }
    const parsed = parseFormatRules(rules);
    for (const rule of parsed) {
        if (ruleMatches(rule, row, matchValue, caseSensitive)) {
            return rule;
        }
    }
    return null;
}

/**
 * A color as `#rrggbb`, lower case, or null when it is not one.
 *
 * Accepts the short `#rgb` form, which is what an admin may type. Everything
 * that ends up in a `style` passes through here first, so nothing but a hex
 * color can reach one.
 */
export function normalizeHex(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(trimmed)) {
        return trimmed;
    }
    if (/^#[0-9a-f]{3}$/.test(trimmed)) {
        return `#${[...trimmed.slice(1)].map((digit) => digit + digit).join("")}`;
    }
    return null;
}

/**
 * Black or white, whichever reads better on the given background.
 *
 * By WCAG relative luminance, picking the higher contrast of the two. This is
 * the text on a filled cell, not a check: whether the admin's color reads well
 * overall is theirs to judge.
 */
export function textColorFor(hex) {
    const color = normalizeHex(hex);
    if (!color) {
        return "#000000";
    }
    const [r, g, b] = [1, 3, 5].map((offset) => {
        const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? "#ffffff" : "#000000";
}

/**
 * Rewrites one column's saved colors from the old named palette to hex.
 *
 * Pure, and a no-op for anything already migrated, so it is safe on every
 * read. Gauges map from their own stronger set, and their old Theme becomes the
 * per-column color, which is where a gauge's fill color now lives.
 */
export function migrateColumnColors(attributes) {
    if (!attributes || typeof attributes !== "object") {
        return attributes;
    }
    const isGauge = isGaugeType(attributes.type);
    const next = { ...attributes };

    if (next.columnStyle && !next.columnColor) {
        const set = isGauge ? "gauge" : next.columnTextOnly ? "text" : "fill";
        next.columnColor = LEGACY_COLORS[set][next.columnStyle] || LEGACY_COLORS.fill[next.columnStyle];
    }
    delete next.columnStyle;

    if (isGauge && next.progressTheme && !next.colorMode) {
        next.colorMode = "column";
        next.columnColor = LEGACY_COLORS.gauge[next.progressTheme];
    }
    delete next.progressTheme;

    if (next.format !== undefined) {
        next.format = parseFormatRules(next.format, isGauge ? "gauge" : "fill");
    }
    return next;
}

/**
 * Every distinct color a grid uses, in a stable order, each with its slot.
 *
 * Derived from the config alone, so the grid (which sets the custom
 * properties) and buildColumns (which names the classes) agree without passing
 * anything between them.
 */
export function colorSlotsFor(fields, config) {
    const slots = new Map();
    const add = (value) => {
        const color = normalizeHex(value);
        if (color && !slots.has(color) && slots.size < MAX_COLOR_SLOTS) {
            slots.set(color, slots.size);
        }
    };
    (fields || []).forEach((field) => {
        const attributes = migrateColumnColors(config?.[field] || {});
        // A gauge draws its own fill in our template, with an inline style,
        // so it needs no slot and would only use up the cap.
        if (isGaugeType(attributes.type)) {
            return;
        }
        if (attributes.colorMode === "column") {
            add(attributes.columnColor);
        } else {
            parseFormatRules(attributes.format).forEach((rule) => add(rule.color));
        }
    });
    return slots;
}

/** The custom properties behind the slot classes, for the datatable host's style. */
export function colorVarsFor(slots) {
    return [...slots.entries()]
        .map(([color, slot]) => `--fgrid-color-${slot}: ${color}; --fgrid-color-${slot}-on: ${textColorFor(color)};`)
        .join(" ");
}

/**
 * The class that paints a color into a cell, or null when it cannot.
 *
 * A fill carries the `fgridFormat` marker, a text color `fgridFormatText`; the
 * hover rule and the link and icon rules in fgridFormatStyles.css select on
 * those. Null for a color with no slot, which is only ever one past the cap.
 */
export function colorClassFor(rule, slots) {
    const color = normalizeHex(rule?.color);
    const slot = color ? slots?.get(color) : undefined;
    if (slot === undefined) {
        return null;
    }
    return rule.textOnly ? `fgridFormatText fgridColorText_${slot}` : `${FILL_MARKER} fgridColor_${slot}`;
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

/** Bar, Ring and Circle: the displays whose fill a color paints. */
function isGaugeType(type) {
    return /^fgridProgress/.test(type || "");
}

/** One rule with its color resolved: its own hex, else its old style's. */
function migrateRule(rule, legacy) {
    const { style, ...rest } = rule;
    const color = normalizeHex(rule.color) || (style && legacyColorFor(style, rule.textOnly, legacy)) || null;
    return color ? { ...rest, color } : rest;
}

function legacyColorFor(style, textOnly, legacy) {
    if (legacy === "gauge") {
        return LEGACY_COLORS.gauge[style];
    }
    // Inverse never had a text-only form and always rendered as the fill.
    return (textOnly && LEGACY_COLORS.text[style]) || LEGACY_COLORS.fill[style];
}

function ruleMatches(rule, row, matchValue, caseSensitive) {
    const logic = rule.logic || FORMAT_LOGIC.ALL;
    if (logic === FORMAT_LOGIC.ALWAYS) {
        return true;
    }

    const conditions = asConditions(rule);
    // No conditions is "always", which is what the native editor does: "a rule
    // with no conditions defined is always set to True".
    if (!conditions.length) {
        return true;
    }

    const results = conditions.map((condition) => conditionMatches(condition, row, matchValue, caseSensitive));

    if (logic === FORMAT_LOGIC.ANY) {
        return results.some(Boolean);
    }
    if (logic === FORMAT_LOGIC.CUSTOM) {
        // An unparseable expression falls back to ALL rather than matching
        // everything: coloring every row is a louder, more confusing failure
        // than coloring none.
        const evaluated = evaluateCustomLogic(rule.customLogic, results);
        return evaluated === null ? results.every(Boolean) : evaluated;
    }
    return results.every(Boolean);
}

function conditionMatches(condition, row, matchValue, caseSensitive) {
    if (!condition?.field || !condition?.operator) {
        return false;
    }
    return matchValue(row?.[condition.field], condition, caseSensitive);
}

function asConditions(rule) {
    return Array.isArray(rule?.conditions) ? rule.conditions.filter(Boolean) : [];
}

function coerceArray(raw) {
    if (Array.isArray(raw)) {
        return raw;
    }
    if (typeof raw !== "string" || !raw.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Evaluates an expression like `1 AND (2 OR 3)` against condition results.
 *
 * Hand-parsed rather than evaluated: `eval` on an admin-supplied string is a
 * script-injection sink, and Lightning Web Security blocks it anyway.
 *
 * Returns null when the expression is malformed or references a condition that
 * does not exist, so the caller can decide what to do about it.
 */
export function evaluateCustomLogic(expression, results) {
    if (typeof expression !== "string" || !expression.trim()) {
        return null;
    }

    const tokens = expression.toUpperCase().match(/\d+|AND|OR|\(|\)/g);
    if (!tokens || tokens.join("").length !== expression.replace(/\s/g, "").toUpperCase().length) {
        // Something in the string was not a number, an operator or a bracket.
        return null;
    }

    let position = 0;
    const peek = () => tokens[position];
    const take = () => tokens[position++];

    // expression := term (OR term)*     term := factor (AND factor)*
    // OR binds loosest, matching how the native editor reads its own logic.
    function parseExpression() {
        let value = parseTerm();
        if (value === null) {
            return null;
        }
        while (peek() === "OR") {
            take();
            const right = parseTerm();
            if (right === null) {
                return null;
            }
            value = value || right;
        }
        return value;
    }

    function parseTerm() {
        let value = parseFactor();
        if (value === null) {
            return null;
        }
        while (peek() === "AND") {
            take();
            const right = parseFactor();
            if (right === null) {
                return null;
            }
            value = value && right;
        }
        return value;
    }

    function parseFactor() {
        const token = take();
        if (token === "(") {
            const value = parseExpression();
            // A missing closing bracket is malformed, not a silent success.
            return take() === ")" ? value : null;
        }
        if (!token || !/^\d+$/.test(token)) {
            return null;
        }
        // Conditions are numbered from 1 in the editor, as they are in Setup.
        const index = Number(token) - 1;
        return index >= 0 && index < results.length ? Boolean(results[index]) : null;
    }

    const value = parseExpression();
    // Trailing tokens mean the expression did not consume cleanly.
    return position === tokens.length ? value : null;
}
