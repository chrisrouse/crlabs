import {
    FORMAT_STYLE,
    FORMAT_STYLES,
    TEXT_ONLY_STYLES,
    FORMAT_LOGIC,
    parseFormatRules,
    conditionFields,
    matchFormatRule,
    formatClassFor,
    evaluateCustomLogic
} from "c/fgrid_formatRules";

/** A rule with one condition, so tests vary only what they are about. */
function rule(overrides = {}) {
    return {
        style: FORMAT_STYLE.ERROR,
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

    it("drops entries with no style, which paint nothing", () => {
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
        const rules = [rule(), rule({ style: FORMAT_STYLE.WARNING })];
        expect(conditionFields(rules)).toEqual(["Status"]);
    });

    it("is empty for rules that test nothing", () => {
        expect(conditionFields([rule({ logic: FORMAT_LOGIC.ALWAYS, conditions: [] })])).toEqual([]);
    });
});

describe("matching a row", () => {
    it("matches when the condition holds", () => {
        expect(matchFormatRule([rule()], { Status: "Overdue" })).not.toBeNull();
    });

    it("does not match when it does not", () => {
        expect(matchFormatRule([rule()], { Status: "Paid" })).toBeNull();
    });

    it("returns the FIRST matching rule, not the best or the last", () => {
        const rules = [
            rule({ style: FORMAT_STYLE.WARNING }),
            rule({ style: FORMAT_STYLE.ERROR, conditions: [{ field: "Status", operator: "isNotBlank" }] })
        ];
        expect(matchFormatRule(rules, { Status: "Overdue" }).style).toBe(FORMAT_STYLE.WARNING);
    });

    it("can test a column other than the one being formatted", () => {
        // The whole reason buildRows has to carry extra fields.
        const byOtherField = rule({ conditions: [{ field: "Status", operator: "equals", value: "Overdue" }] });
        expect(matchFormatRule([byOtherField], { Amount: 50, Status: "Overdue" })).not.toBeNull();
    });

    it("treats a rule with no conditions as always true", () => {
        // Matches the native editor: "a rule with no conditions defined is
        // always set to True".
        expect(matchFormatRule([rule({ conditions: [] })], {})).not.toBeNull();
    });

    it("honors Always regardless of the conditions", () => {
        const always = rule({ logic: FORMAT_LOGIC.ALWAYS });
        expect(matchFormatRule([always], { Status: "Paid" })).not.toBeNull();
    });

    it("requires every condition under All", () => {
        const both = rule({
            conditions: [
                { field: "Status", operator: "equals", value: "Overdue" },
                { field: "Tier", operator: "equals", value: "Gold" }
            ]
        });
        expect(matchFormatRule([both], { Status: "Overdue", Tier: "Gold" })).not.toBeNull();
        expect(matchFormatRule([both], { Status: "Overdue", Tier: "Bronze" })).toBeNull();
    });

    it("requires only one under Any", () => {
        const either = rule({
            logic: FORMAT_LOGIC.ANY,
            conditions: [
                { field: "Status", operator: "equals", value: "Overdue" },
                { field: "Tier", operator: "equals", value: "Gold" }
            ]
        });
        expect(matchFormatRule([either], { Status: "Paid", Tier: "Gold" })).not.toBeNull();
        expect(matchFormatRule([either], { Status: "Paid", Tier: "Bronze" })).toBeNull();
    });

    it("ignores a condition with no field or operator", () => {
        expect(matchFormatRule([rule({ conditions: [{ value: "x" }] })], { Status: "Overdue" })).toBeNull();
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
        expect(matchFormatRule([broken], { Status: "Overdue", Tier: "Bronze" })).toBeNull();
        expect(matchFormatRule([broken], { Status: "Overdue", Tier: "Gold" })).not.toBeNull();
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
        expect(matchFormatRule([custom], { Status: "Paid", Tier: "Gold" })).not.toBeNull();
    });
});

describe("the class a matched rule paints with", () => {
    it("gives a fill the marker as well as its variant", () => {
        // The bare marker is what the hover and focus rules select on.
        expect(formatClassFor({ style: FORMAT_STYLE.ERROR })).toBe("fgridFormat fgridFormat_error");
    });

    it("gives a text-only rule no marker", () => {
        // Text color on the hover background is perfectly legible, so there
        // is nothing to revert and reverting would discard the signal.
        expect(formatClassFor({ style: FORMAT_STYLE.SUCCESS, textOnly: true })).toBe("fgridFormatText_success");
    });

    it("falls back to the fill for a text-only inverse", () => {
        // No such class exists, deliberately: white text with no dark
        // background renders white-on-white. Emitting it would look like a
        // broken rule rather than an unavailable option.
        expect(formatClassFor({ style: FORMAT_STYLE.INVERSE, textOnly: true })).toBe("fgridFormat fgridFormat_inverse");
    });

    it("paints nothing for an unknown style", () => {
        expect(formatClassFor({ style: "chartreuse" })).toBeNull();
        expect(formatClassFor({})).toBeNull();
    });

    it("offers every fill style a class, and every text style but inverse", () => {
        FORMAT_STYLES.forEach((style) =>
            expect(formatClassFor({ value: style.value, style: style.value })).toBeTruthy()
        );
        expect(TEXT_ONLY_STYLES.map((s) => s.value)).not.toContain(FORMAT_STYLE.INVERSE);
        expect(TEXT_ONLY_STYLES).toHaveLength(FORMAT_STYLES.length - 1);
    });
});
