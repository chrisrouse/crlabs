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
 * Stored shape, under `columnConfig[fieldPath].format`:
 *
 *   [
 *     {
 *       style: "error",                  // a FORMAT_STYLE key
 *       textOnly: false,                 // colour the text, not the cell
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
 */
import { matchesFilter } from "c/fgrid_gridModel";

/**
 * The palette, named by MEANING rather than by colour.
 *
 * Measured across five surfaces: the same semantic renders green, teal or pale
 * mint depending on the theme, so a control labelled "Green" would be lying
 * four times out of five. `inverse` is the high-contrast option and inverts in
 * dark mode, so it is not "Dark" either. See repro/datatable-cell-colour/.
 */
export const FORMAT_STYLE = {
    SUCCESS: "success",
    WARNING: "warning",
    ERROR: "error",
    ACCENT: "accent",
    NEUTRAL: "neutral",
    INVERSE: "inverse"
};

/** Fill options, in the order the editor should offer them. */
export const FORMAT_STYLES = [
    { label: "Success", value: FORMAT_STYLE.SUCCESS },
    { label: "Warning", value: FORMAT_STYLE.WARNING },
    { label: "Error", value: FORMAT_STYLE.ERROR },
    { label: "Accent", value: FORMAT_STYLE.ACCENT },
    { label: "Neutral", value: FORMAT_STYLE.NEUTRAL },
    { label: "Inverse", value: FORMAT_STYLE.INVERSE }
];

/**
 * Styles with a text-only variant.
 *
 * `inverse` is absent on purpose. Its text colour is white, and without the
 * dark background it is meaningless — measured rendering white-on-white, the
 * value simply gone, on three of four surfaces.
 */
export const TEXT_ONLY_STYLES = FORMAT_STYLES.filter((style) => style.value !== FORMAT_STYLE.INVERSE);

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
export function parseFormatRules(raw) {
    const parsed = coerceArray(raw);
    return parsed.filter((rule) => rule && typeof rule === "object" && rule.style);
}

/**
 * Every field path the rules read, so `buildRows` can carry them.
 *
 * A rule may test a column that is not displayed — colouring Amount by Status
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
export function matchFormatRule(rules, row, caseSensitive = false) {
    const parsed = parseFormatRules(rules);
    for (const rule of parsed) {
        if (ruleMatches(rule, row, caseSensitive)) {
            return rule;
        }
    }
    return null;
}

/**
 * The class string for a matched rule, or null if it paints nothing.
 *
 * A fill carries the marker as well as its variant; the marker is what the
 * hover and focus rules in fgridFormatStyles.css select on.
 */
export function formatClassFor(rule) {
    const style = rule?.style;
    if (!style || !FORMAT_STYLES.some((option) => option.value === style)) {
        return null;
    }
    // A text-only inverse has no class in the stylesheet, deliberately. Fall
    // back to the fill rather than emitting a class that does not exist, which
    // would render as no formatting at all and look like a bug in the rule.
    if (rule.textOnly && style !== FORMAT_STYLE.INVERSE) {
        return `fgridFormatText_${style}`;
    }
    return `${FILL_MARKER} fgridFormat_${style}`;
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

function ruleMatches(rule, row, caseSensitive) {
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

    const results = conditions.map((condition) => conditionMatches(condition, row, caseSensitive));

    if (logic === FORMAT_LOGIC.ANY) {
        return results.some(Boolean);
    }
    if (logic === FORMAT_LOGIC.CUSTOM) {
        // An unparseable expression falls back to ALL rather than matching
        // everything: colouring every row is a louder, more confusing failure
        // than colouring none.
        const evaluated = evaluateCustomLogic(rule.customLogic, results);
        return evaluated === null ? results.every(Boolean) : evaluated;
    }
    return results.every(Boolean);
}

function conditionMatches(condition, row, caseSensitive) {
    if (!condition?.field || !condition?.operator) {
        return false;
    }
    return matchesFilter(row?.[condition.field], condition, caseSensitive);
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
