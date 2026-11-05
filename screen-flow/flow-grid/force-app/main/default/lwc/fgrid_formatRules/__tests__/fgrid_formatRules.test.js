import {
    FORMAT_LOGIC,
    MAX_COLOR_SLOTS,
    parseFormatRules,
    conditionFields,
    matchFormatRule,
    evaluateCustomLogic,
    normalizeHex,
    textColorFor,
    migrateColumnColors,
    colorSlotsFor,
    colorVarsFor,
    colorClassFor
} from "c/fgrid_formatRules";
import { matchesFilter } from "c/fgrid_gridModel";

/**
 * The matcher is injected rather than imported, so gridModel can call back
 * into this module while building rows without the two importing each other.
 * These tests pass the REAL one, so they exercise the same operator semantics
 * the grid does instead of a stand-in that could drift.
 */
const match = (rules, row) => matchFormatRule(rules, row, matchesFilter);

const RED = "#ba0517";
const ORANGE = "#f99221";

/** A rule with one condition, so tests vary only what they are about. */
function rule(overrides = {}) {
    return {
        color: RED,
        logic: FORMAT_LOGIC.ALL,
        conditions: [{ field: "Status", kind: "text", operator: "equals", value: "Overdue" }],
        ...overrides
    };
}

describe("reading stored rules", () => {
    it("reads an array and a JSON string alike", () => {
        expect(parseFormatRules([rule()])).toHaveLength(1);
        expect(parseFormatRules(JSON.stringify([rule()]))).toHaveLength(1);
    });

    it("reads nothing from nothing", () => {
        [null, undefined, "", "   ", "{}", "[]"].forEach((raw) => {
            expect(parseFormatRules(raw)).toEqual([]);
        });
    });

    it("drops malformed JSON rather than throwing", () => {
        // An admin's broken rule is a configuration problem. An unformatted
        // grid reports it better than a crash in front of a site visitor.
        expect(parseFormatRules("[{oops")).toEqual([]);
    });

    it("drops entries with no color, which paint nothing", () => {
        expect(parseFormatRules([rule(), { conditions: [] }, null])).toHaveLength(1);
    });
});

describe("which fields the rows must carry", () => {
    it("collects every field the conditions test", () => {
        const rules = [
            rule({ conditions: [{ field: "Status", operator: "equals", value: "A" }] }),
            rule({ conditions: [{ field: "Owner.Alias", operator: "equals", value: "B" }] })
        ];
        expect(conditionFields(rules).sort()).toEqual(["Owner.Alias", "Status"]);
    });

    it("deduplicates, so buildRows is not asked for a field twice", () => {
        const rules = [rule(), rule({ color: ORANGE })];
        expect(conditionFields(rules)).toEqual(["Status"]);
    });

    it("is empty for rules that test nothing", () => {
        expect(conditionFields([rule({ logic: FORMAT_LOGIC.ALWAYS, conditions: [] })])).toEqual([]);
    });
});

describe("matching a row", () => {
    it("matches when the condition holds", () => {
        expect(match([rule()], { Status: "Overdue" })).not.toBeNull();
    });

    it("does not match when it does not", () => {
        expect(match([rule()], { Status: "Paid" })).toBeNull();
    });

    it("returns the FIRST matching rule, not the best or the last", () => {
        const rules = [
            rule({ color: ORANGE }),
            rule({ color: RED, conditions: [{ field: "Status", operator: "isNotBlank" }] })
        ];
        expect(match(rules, { Status: "Overdue" }).color).toBe(ORANGE);
    });

    it("can test a column other than the one being formatted", () => {
        // The whole reason buildRows has to carry extra fields.
        const byOtherField = rule({ conditions: [{ field: "Status", operator: "equals", value: "Overdue" }] });
        expect(match([byOtherField], { Amount: 50, Status: "Overdue" })).not.toBeNull();
    });

    it("treats a rule with no conditions as always true", () => {
        // Matches the native editor: "a rule with no conditions defined is
        // always set to True".
        expect(match([rule({ conditions: [] })], {})).not.toBeNull();
    });

    it("honors Always regardless of the conditions", () => {
        const always = rule({ logic: FORMAT_LOGIC.ALWAYS });
        expect(match([always], { Status: "Paid" })).not.toBeNull();
    });

    it("requires every condition under All", () => {
        const both = rule({
            conditions: [
                { field: "Status", operator: "equals", value: "Overdue" },
                { field: "Tier", operator: "equals", value: "Gold" }
            ]
        });
        expect(match([both], { Status: "Overdue", Tier: "Gold" })).not.toBeNull();
        expect(match([both], { Status: "Overdue", Tier: "Bronze" })).toBeNull();
    });

    it("requires only one under Any", () => {
        const either = rule({
            logic: FORMAT_LOGIC.ANY,
            conditions: [
                { field: "Status", operator: "equals", value: "Overdue" },
                { field: "Tier", operator: "equals", value: "Gold" }
            ]
        });
        expect(match([either], { Status: "Paid", Tier: "Gold" })).not.toBeNull();
        expect(match([either], { Status: "Paid", Tier: "Bronze" })).toBeNull();
    });

    it("ignores a condition with no field or operator", () => {
        expect(match([rule({ conditions: [{ value: "x" }] })], { Status: "Overdue" })).toBeNull();
    });
});

describe("custom logic", () => {
    const T = [true, false, true];

    it("evaluates AND and OR", () => {
        expect(evaluateCustomLogic("1 AND 3", T)).toBe(true);
        expect(evaluateCustomLogic("1 AND 2", T)).toBe(false);
        expect(evaluateCustomLogic("2 OR 3", T)).toBe(true);
    });

    it("honors brackets over the default precedence", () => {
        // Without brackets OR binds loosest, so these must differ.
        expect(evaluateCustomLogic("1 AND 2 OR 3", T)).toBe(true);
        expect(evaluateCustomLogic("1 AND (2 OR 3)", T)).toBe(true);
        expect(evaluateCustomLogic("(1 AND 2) OR 2", T)).toBe(false);
    });

    it("numbers conditions from 1, as the editor shows them", () => {
        expect(evaluateCustomLogic("1", [true])).toBe(true);
        expect(evaluateCustomLogic("0", [true])).toBeNull();
    });

    it("is case insensitive and tolerates spacing", () => {
        expect(evaluateCustomLogic("  1   and   3  ", T)).toBe(true);
        expect(evaluateCustomLogic("1 Or 2", T)).toBe(true);
    });

    it("returns null for anything malformed", () => {
        ["", "   ", "1 AND", "AND 1", "(1 AND 2", "1 AND 9", "1 XOR 2", "alert(1)", "1;2"].forEach((expression) => {
            expect(evaluateCustomLogic(expression, T)).toBeNull();
        });
    });

    it("falls back to All when the expression is unusable", () => {
        // Coloring every row is a louder, more confusing failure than
        // coloring none, so a broken expression must not become Always.
        const broken = rule({
            logic: FORMAT_LOGIC.CUSTOM,
            customLogic: "1 AND (2",
            conditions: [
                { field: "Status", operator: "equals", value: "Overdue" },
                { field: "Tier", operator: "equals", value: "Gold" }
            ]
        });
        expect(match([broken], { Status: "Overdue", Tier: "Bronze" })).toBeNull();
        expect(match([broken], { Status: "Overdue", Tier: "Gold" })).not.toBeNull();
    });

    it("drives a real rule when it is well formed", () => {
        const custom = rule({
            logic: FORMAT_LOGIC.CUSTOM,
            customLogic: "1 OR 2",
            conditions: [
                { field: "Status", operator: "equals", value: "Overdue" },
                { field: "Tier", operator: "equals", value: "Gold" }
            ]
        });
        expect(match([custom], { Status: "Paid", Tier: "Gold" })).not.toBeNull();
    });
});

describe("picked colors", () => {
    it("normalizes a hex, including the short form, and rejects anything else", () => {
        expect(normalizeHex("#AD1071")).toBe("#ad1071");
        expect(normalizeHex(" #abc ")).toBe("#aabbcc");
        // Only a hex may reach a style attribute, so nothing else survives.
        ["red", "#12345", "#1234567", "url(x)", "", null, undefined, 42].forEach((value) =>
            expect(normalizeHex(value)).toBeNull()
        );
    });

    it("writes white on a dark fill and black on a light one", () => {
        expect(textColorFor("#ad1071")).toBe("#ffffff");
        expect(textColorFor("#218638")).toBe("#ffffff");
        expect(textColorFor("#fff099")).toBe("#000000");
        expect(textColorFor("nonsense")).toBe("#000000");
    });
});

describe("color slots", () => {
    const config = {
        Amount: { colorMode: "column", columnColor: "#AD1071" },
        Status: { colorMode: "conditional", format: [rule(), rule({ color: ORANGE }), rule({ color: "#ad1071" })] },
        Complete: { type: "fgridProgressBar", colorMode: "column", columnColor: "#00aea9" }
    };

    it("gives each distinct color one slot, in field order", () => {
        const slots = colorSlotsFor(["Amount", "Status", "Complete"], config);
        expect([...slots.entries()]).toEqual([
            ["#ad1071", 0],
            [RED, 1],
            [ORANGE, 2]
        ]);
    });

    it("leaves gauges out, since they paint their fill inline", () => {
        expect(colorSlotsFor(["Complete"], config).size).toBe(0);
    });

    it("stops at the cap rather than inventing classes the stylesheet lacks", () => {
        const many = Array.from({ length: MAX_COLOR_SLOTS + 5 }, (_, index) => `F${index}`);
        const wide = Object.fromEntries(
            many.map((field, index) => [
                field,
                { colorMode: "column", columnColor: `#${index.toString(16).padStart(6, "0")}` }
            ])
        );
        const slots = colorSlotsFor(many, wide);
        expect(slots.size).toBe(MAX_COLOR_SLOTS);
        expect(colorClassFor({ color: "#00002c" }, slots)).toBeNull();
    });

    it("sets each slot's color and the text that reads on it", () => {
        const vars = colorVarsFor(new Map([["#ad1071", 0]]));
        expect(vars).toBe("--fgrid-color-0: #ad1071; --fgrid-color-0-on: #ffffff;");
    });

    it("names the slot class, with the marker the hover and link rules select on", () => {
        const slots = new Map([[RED, 3]]);
        expect(colorClassFor({ color: RED }, slots)).toBe("fgridFormat fgridColor_3");
        expect(colorClassFor({ color: RED, textOnly: true }, slots)).toBe("fgridFormatText fgridColorText_3");
        expect(colorClassFor({ color: ORANGE }, slots)).toBeNull();
        expect(colorClassFor({}, slots)).toBeNull();
    });

    it("declares exactly as many slots in the stylesheet as it hands out", () => {
        // Read from source: a slot class the CSS does not declare paints
        // nothing, silently, which is the failure this guards.
        /* eslint-disable no-undef -- Node globals, reading the stylesheet from disk. */
        const fs = require("fs");
        const path = require("path");
        const css = fs.readFileSync(path.join(__dirname, "../../../staticresources/fgridFormatStyles.css"), "utf8");
        /* eslint-enable no-undef */
        const fills = new Set([...css.matchAll(/\.fgridColor_(\d+)\s*\{/g)].map((m) => m[1]));
        const texts = new Set([...css.matchAll(/\.fgridColorText_(\d+)\s*\{/g)].map((m) => m[1]));
        expect(fills.size).toBe(MAX_COLOR_SLOTS);
        expect(texts.size).toBe(MAX_COLOR_SLOTS);
        expect(fills.has(String(MAX_COLOR_SLOTS - 1))).toBe(true);
    });
});

describe("configs saved with the old named palette", () => {
    it("turns a rule's style into the hex it used to render", () => {
        const [fill, text, inverseText] = parseFormatRules([
            { style: "error", conditions: [] },
            { style: "success", textOnly: true, conditions: [] },
            // Inverse never had a text-only form and rendered as the fill.
            { style: "inverse", textOnly: true, conditions: [] }
        ]);
        expect(fill).toEqual({ color: "#fddde3", conditions: [] });
        expect(text.color).toBe("#056764");
        expect(inverseText.color).toBe("#032d60");
    });

    it("keeps a color already picked, and drops an unknown style", () => {
        expect(parseFormatRules([{ style: "error", color: "#123456" }])[0].color).toBe("#123456");
        expect(parseFormatRules([{ style: "chartreuse" }])).toEqual([]);
    });

    it("turns a column style into a column color", () => {
        expect(migrateColumnColors({ colorMode: "column", columnStyle: "neutral" })).toEqual({
            colorMode: "column",
            columnColor: "#e5e5e5"
        });
        expect(
            migrateColumnColors({ colorMode: "column", columnStyle: "warning", columnTextOnly: true }).columnColor
        ).toBe("#8c4b02");
    });

    it("turns a gauge's Theme into its per-column fill, from the gauge set", () => {
        expect(migrateColumnColors({ type: "fgridProgressRing", progressTheme: "success" })).toEqual({
            type: "fgridProgressRing",
            colorMode: "column",
            columnColor: "#2e844a"
        });
        const rules = migrateColumnColors({ type: "fgridProgressBar", format: [{ style: "error" }] }).format;
        expect(rules[0].color).toBe("#ba0517");
    });

    it("changes nothing on a config that is already migrated", () => {
        const current = { colorMode: "conditional", format: [{ color: RED, logic: "always" }] };
        expect(migrateColumnColors(migrateColumnColors(current))).toEqual(current);
    });
});
