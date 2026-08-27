import {
    buildColumns,
    buildSampleRows,
    inferType,
    defaultLabel,
    searchRows,
    filterRows,
    filterKindFor,
    isFilterActive,
    describeFilter,
    resolveDatePreset,
    operatorsFor,
    defaultOperatorFor,
    FILTER_KIND,
    FILTER_OPERATOR,
    paginationItems,
    rowsPerPageOptions
} from "c/fgrid_gridModel";

describe("inferType", () => {
    it("honors an explicit override over any guess", () => {
        expect(inferType("AnnualRevenue", "text")).toBe("text");
    });

    it("guesses from the leaf of a relationship path", () => {
        expect(inferType("Owner.Email")).toBe("email");
    });

    it.each([
        ["AnnualRevenue", "currency"],
        ["NumberOfEmployees", "number"],
        ["Website", "url"],
        ["Phone", "phone"],
        ["CreatedDate", "date"],
        ["IsDeleted", "boolean"],
        ["Name", "text"]
    ])("maps %s to %s", (field, expected) => {
        expect(inferType(field)).toBe(expected);
    });
});

describe("defaultLabel", () => {
    it("humanizes camel case", () => {
        expect(defaultLabel("AnnualRevenue")).toBe("Annual Revenue");
    });

    it("strips the custom field suffix", () => {
        expect(defaultLabel("Deal_Size__c")).toBe("Deal Size");
    });

    it("uses the leaf of a relationship path", () => {
        expect(defaultLabel("Owner.Alias")).toBe("Alias");
    });
});

describe("buildColumns", () => {
    it("returns an empty list for no fields", () => {
        expect(buildColumns(null)).toEqual([]);
        expect(buildColumns([])).toEqual([]);
    });

    it("preserves field order", () => {
        const columns = buildColumns(["Industry", "Name", "AnnualRevenue"]);
        expect(columns.map((c) => c.fieldName)).toEqual(["Industry", "Name", "AnnualRevenue"]);
    });

    it("derives a label when none is configured and uses the override when there is", () => {
        const [derived, overridden] = buildColumns(["AnnualRevenue", "Name"], { Name: { label: "Account" } });
        expect(derived.label).toBe("Annual Revenue");
        expect(overridden.label).toBe("Account");
    });

    it("maps alignment and icon onto datatable shapes", () => {
        const [column] = buildColumns(["Name"], {
            Name: { align: "right", icon: "standard:account" }
        });
        expect(column.cellAttributes).toEqual({ alignment: "right", iconName: "standard:account" });
    });

    it("locks a width unless the column is flexible", () => {
        // fixedWidth cannot be dragged and overrides initialWidth; that is exactly
        // what "not flexible" means, and what the Flex checkbox now controls.
        const [locked] = buildColumns(["Name"], { Name: { width: 220 } });
        expect(locked.fixedWidth).toBe(220);
        expect(locked.initialWidth).toBeUndefined();

        const [flexible] = buildColumns(["Name"], { Name: { width: 220, flex: true } });
        expect(flexible.initialWidth).toBe(220);
        expect(flexible.fixedWidth).toBeUndefined();
    });

    it("wraps text by default, and only on types that support it", () => {
        expect(buildColumns(["Name"])[0].wrapText).toBe(true);
        expect(buildColumns(["Name"], { Name: { wrap: false } })[0].wrapText).toBe(false);
        // Wrapping is unsupported for these, so the property is not set at all.
        expect(buildColumns(["Flag"], { Flag: { type: "boolean" } })[0].wrapText).toBeUndefined();
        expect(buildColumns(["Due"], { Due: { type: "date-local" } })[0].wrapText).toBeUndefined();
    });

    it("gives every column a unique columnKey, even on the same field", () => {
        const columns = buildColumns(["Name", "Name"]);
        expect(columns[0].columnKey).not.toBe(columns[1].columnKey);
    });

    it("carries step and linkify into typeAttributes", () => {
        const [amount] = buildColumns(["Amount"], { Amount: { type: "currency", step: 0.001 } });
        expect(amount.typeAttributes.step).toBe(0.001);
        const [notes] = buildColumns(["Notes"], { Notes: { linkify: true } });
        expect(notes.typeAttributes.linkify).toBe(true);
    });

    it("shows the read-only lock only when asked, and only on read-only columns", () => {
        const [plain] = buildColumns(["Name"], {}, { readOnlyIcon: true });
        expect(plain.displayReadOnlyIcon).toBe(true);
        const [editable] = buildColumns(["Name"], { Name: { edit: true } }, { readOnlyIcon: true });
        expect(editable.displayReadOnlyIcon).toBeUndefined();
        const [off] = buildColumns(["Name"], {}, {});
        expect(off.displayReadOnlyIcon).toBeUndefined();
    });

    it("turns scale into fraction-digit type attributes", () => {
        const [column] = buildColumns(["AnnualRevenue"], { AnnualRevenue: { scale: 2 } });
        expect(column.typeAttributes).toEqual({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });

    it("keeps scale 0 rather than treating it as unset", () => {
        const [column] = buildColumns(["AnnualRevenue"], { AnnualRevenue: { scale: 0 } });
        expect(column.typeAttributes).toEqual({ minimumFractionDigits: 0, maximumFractionDigits: 0 });
    });

    it("omits initialWidth when width is absent or zero", () => {
        expect(buildColumns(["Name"])[0].initialWidth).toBeUndefined();
        expect(buildColumns(["Name"], { Name: { width: 0 } })[0].initialWidth).toBeUndefined();
    });

    it("carries edit and wrap flags through", () => {
        const [column] = buildColumns(["Name"], { Name: { edit: true, wrap: true } });
        expect(column.editable).toBe(true);
        expect(column.wrapText).toBe(true);
    });

    it("disables sorting and default actions when header actions are hidden", () => {
        const [column] = buildColumns(["Name"], {}, { hideHeaderActions: true });
        expect(column.sortable).toBe(false);
        expect(column.hideDefaultActions).toBe(true);
    });

    it("merges custom type and cell attribute blobs", () => {
        const [column] = buildColumns(["Amount"], {
            Amount: { typeAttribs: { currencyCode: "EUR" }, cellAttribs: { class: "slds-theme_shade" } }
        });
        expect(column.typeAttributes).toEqual({ currencyCode: "EUR" });
        expect(column.cellAttributes).toEqual({ class: "slds-theme_shade" });
    });

    it("spreads other attributes onto the column itself", () => {
        const [column] = buildColumns(["Description"], {
            Description: { otherAttribs: { wrapTextMaxLines: 5 } }
        });
        expect(column.wrapTextMaxLines).toBe(5);
    });

    it("ignores a non-object attribute blob rather than throwing", () => {
        const [column] = buildColumns(["Name"], { Name: { typeAttribs: "not json", otherAttribs: 42 } });
        expect(column.typeAttributes).toBeUndefined();
        expect(column.label).toBe("Name");
    });
});

describe("buildSampleRows", () => {
    it("fabricates the requested number of rows", () => {
        expect(buildSampleRows(["Name"], {}, 4)).toHaveLength(4);
    });

    it("gives every row a unique key on the configured key field", () => {
        const rows = buildSampleRows(["Name"], {}, 5, "Code__c");
        const keys = rows.map((row) => row.Code__c);
        expect(new Set(keys).size).toBe(5);
    });

    it("populates every requested field", () => {
        const [row] = buildSampleRows(["Name", "AnnualRevenue", "Website"], {}, 1);
        expect(row.Name).toEqual(expect.any(String));
        expect(row.AnnualRevenue).toEqual(expect.any(Number));
        expect(row.Website).toContain("https://");
    });

    it("is deterministic, so the preview does not churn between renders", () => {
        const fields = ["Name", "CreatedDate", "AnnualRevenue"];
        expect(buildSampleRows(fields, {}, 3)).toEqual(buildSampleRows(fields, {}, 3));
    });

    it("respects a type override when generating a value", () => {
        const [row] = buildSampleRows(["Code"], { Code: { type: "currency" } }, 1);
        expect(typeof row.Code).toBe("number");
    });

    it("tolerates no fields", () => {
        expect(buildSampleRows(null, {}, 2)).toHaveLength(2);
    });
});

describe("searchRows", () => {
    const COLUMNS = [{ fieldName: "FirstName" }, { fieldName: "LastName" }, { fieldName: "Company" }];
    const ROWS = [
        { FirstName: "Chris", LastName: "Smith", Company: "Amplify" },
        { FirstName: "Dana", LastName: "Smith", Company: "Globex" },
        { FirstName: "Chris", LastName: "Jones", Company: "Smith Ltd" }
    ];

    it("matches a name split across two columns", () => {
        // The reason tokenising exists: "Chris Smith" is in no single field when
        // FirstName and LastName are separate columns.
        const found = searchRows(ROWS, COLUMNS, "Chris Smith");
        expect(found.map((row) => row.Company)).toContain("Amplify");
    });

    it("ignores the order the words are typed in", () => {
        expect(searchRows(ROWS, COLUMNS, "Smith Chris")).toEqual(searchRows(ROWS, COLUMNS, "Chris Smith"));
    });

    it("leaves single-word search behaving exactly as before", () => {
        expect(searchRows(ROWS, COLUMNS, "smith")).toHaveLength(3);
        expect(searchRows(ROWS, COLUMNS, "globex")).toHaveLength(1);
    });

    it("requires every word to match something", () => {
        expect(searchRows(ROWS, COLUMNS, "Chris Umbrella")).toHaveLength(0);
    });

    it("accepts words matching across different columns", () => {
        // The documented tradeoff: Chris + Jones + "Smith Ltd" also qualifies.
        expect(searchRows(ROWS, COLUMNS, "Chris Smith")).toHaveLength(2);
    });

    it("returns every row for a blank term", () => {
        expect(searchRows(ROWS, COLUMNS, "   ")).toHaveLength(3);
    });

    it("searches the displayed text of a lookup, not the stored Id", () => {
        const columns = [{ fieldName: "AccountId", fgridTextField: "AccountId__fgridLookupLabel" }];
        const rows = [{ AccountId: "001xx000003DGb2AAG", AccountId__fgridLookupLabel: "Acme Corporation" }];
        expect(searchRows(rows, columns, "Acme")).toHaveLength(1);
    });
});

describe("searchRows across name column shapes", () => {
    // Both shapes are common on a Contact grid and both must find the same person,
    // whether the name lives in one field or two.
    const FULL = [{ fieldName: "Name" }];
    const SPLIT = [{ fieldName: "FirstName" }, { fieldName: "LastName" }];
    const BOTH = [{ fieldName: "Name" }, { fieldName: "FirstName" }, { fieldName: "LastName" }];

    const fullRows = [{ Name: "Chris Smith" }, { Name: "Dana Jones" }];
    const splitRows = [{ FirstName: "Chris", LastName: "Smith" }];
    const bothRows = [{ Name: "Chris Smith", FirstName: "Chris", LastName: "Smith" }];

    it("matches a single Full Name field", () => {
        expect(searchRows(fullRows, FULL, "Chris Smith")).toHaveLength(1);
    });

    it("matches Full Name in either word order", () => {
        expect(searchRows(fullRows, FULL, "Smith Chris")).toHaveLength(1);
    });

    it("still matches a partial word", () => {
        expect(searchRows(fullRows, FULL, "Chris Smi")).toHaveLength(1);
    });

    it("matches split columns too", () => {
        expect(searchRows(splitRows, SPLIT, "Chris Smith")).toHaveLength(1);
    });

    it("matches when both shapes are present, without duplicating the row", () => {
        expect(searchRows(bothRows, BOTH, "Chris Smith")).toHaveLength(1);
    });

    it("does not combine words from different rows", () => {
        // "Chris" is only in row one and "Jones" only in row two, so neither row
        // holds both words and nothing matches. Picking a surname that exists in
        // the data is the point — a word absent everywhere would pass for the wrong
        // reason and prove nothing about cross-row matching.
        expect(searchRows(fullRows, FULL, "Chris Jones")).toHaveLength(0);
    });
});

describe("searchRows phrase mode", () => {
    const SPLIT = [{ fieldName: "FirstName" }, { fieldName: "LastName" }];
    const FULL = [{ fieldName: "Name" }];
    const splitRows = [{ FirstName: "Chris", LastName: "Smith" }];
    const fullRows = [{ Name: "Chris Smith" }];

    it("cannot match a name split across columns, by design", () => {
        expect(searchRows(splitRows, SPLIT, "Chris Smith", false, false)).toHaveLength(0);
    });

    it("still matches a phrase inside one column", () => {
        expect(searchRows(fullRows, FULL, "Chris Smith", false, false)).toHaveLength(1);
    });

    it("is order-sensitive, unlike word mode", () => {
        expect(searchRows(fullRows, FULL, "Smith Chris", false, false)).toHaveLength(0);
        expect(searchRows(fullRows, FULL, "Smith Chris", false, true)).toHaveLength(1);
    });

    it("treats a single word the same as word mode", () => {
        expect(searchRows(splitRows, SPLIT, "rouse", false, false)).toEqual(
            searchRows(splitRows, SPLIT, "rouse", false, true)
        );
    });

    it("defaults to word mode when the flag is omitted", () => {
        expect(searchRows(splitRows, SPLIT, "Chris Smith")).toHaveLength(1);
    });
});

describe("filter kinds and operators", () => {
    it("picks the right filter kind from the column type", () => {
        expect(filterKindFor({ type: "text" })).toBe(FILTER_KIND.TEXT);
        expect(filterKindFor({ type: "fgridPicklist" })).toBe(FILTER_KIND.PICKLIST);
        expect(filterKindFor({ type: "fgridMultiPicklist" })).toBe(FILTER_KIND.PICKLIST);
        expect(filterKindFor({ type: "date-local" })).toBe(FILTER_KIND.DATE);
        expect(filterKindFor({ type: "currency" })).toBe(FILTER_KIND.NUMBER);
        expect(filterKindFor({ type: "boolean" })).toBe(FILTER_KIND.BOOLEAN);
        // A lookup filters as text, on its displayed name.
        expect(filterKindFor({ type: "fgridLookup" })).toBe(FILTER_KIND.TEXT);
    });

    it("offers blank operators on every kind except checkbox", () => {
        // A Salesforce checkbox is never null, so "is blank" could never match.
        [FILTER_KIND.TEXT, FILTER_KIND.PICKLIST, FILTER_KIND.NUMBER, FILTER_KIND.DATE].forEach((kind) => {
            const values = operatorsFor(kind).map((option) => option.value);
            expect(values).toContain(FILTER_OPERATOR.BLANK);
            expect(values).toContain(FILTER_OPERATOR.NOT_BLANK);
        });
        expect(operatorsFor(FILTER_KIND.BOOLEAN).map((o) => o.value)).toEqual([FILTER_OPERATOR.EQUALS]);
    });

    it("offers relative date operators only on dates", () => {
        expect(operatorsFor(FILTER_KIND.DATE).map((o) => o.value)).toContain(FILTER_OPERATOR.LAST_30);
        expect(operatorsFor(FILTER_KIND.NUMBER).map((o) => o.value)).not.toContain(FILTER_OPERATOR.LAST_30);
    });

    it("defaults text to contains and everything else to equals", () => {
        expect(defaultOperatorFor(FILTER_KIND.TEXT)).toBe(FILTER_OPERATOR.CONTAINS);
        expect(defaultOperatorFor(FILTER_KIND.NUMBER)).toBe(FILTER_OPERATOR.EQUALS);
    });
});

describe("filterRows", () => {
    const ROWS = [
        { Industry: "Electronics", Revenue: 139, Created: "2026-08-20T23:45:00.000Z", Active: true },
        { Industry: "Apparel", Revenue: 350, Created: "2026-01-05", Active: false },
        { Industry: "Construction", Revenue: 950, Created: "2026-08-25", Active: true },
        { Industry: null, Revenue: null, Created: null, Active: false }
    ];
    const filter = (path, spec) => filterRows(ROWS, { [path]: spec });

    it("matches any selected picklist value", () => {
        const found = filter("Industry", {
            kind: FILTER_KIND.PICKLIST,
            operator: FILTER_OPERATOR.EQUALS,
            values: ["Electronics", "Apparel"]
        });
        expect(found.map((r) => r.Industry)).toEqual(["Electronics", "Apparel"]);
    });

    it("inverts a picklist match for is-none-of", () => {
        const found = filter("Industry", {
            kind: FILTER_KIND.PICKLIST,
            operator: FILTER_OPERATOR.NOT_EQUALS,
            values: ["Electronics"]
        });
        expect(found.map((r) => r.Industry)).toEqual(["Apparel", "Construction"]);
    });

    it("matches one value of a multi-select picklist", () => {
        const rows = [{ Tags: "Hot;Warm" }, { Tags: "Cold" }];
        const spec = { kind: FILTER_KIND.PICKLIST, operator: FILTER_OPERATOR.EQUALS, values: ["Warm"] };
        expect(filterRows(rows, { Tags: spec })).toHaveLength(1);
    });

    it.each([
        [FILTER_OPERATOR.EQUALS, 350, ["Apparel"]],
        [FILTER_OPERATOR.NOT_EQUALS, 350, ["Electronics", "Construction"]],
        [FILTER_OPERATOR.GREATER, 350, ["Construction"]],
        [FILTER_OPERATOR.GREATER_EQUAL, 350, ["Apparel", "Construction"]],
        [FILTER_OPERATOR.LESS, 350, ["Electronics"]],
        [FILTER_OPERATOR.LESS_EQUAL, 350, ["Electronics", "Apparel"]]
    ])("applies the number operator %s", (operator, value, expected) => {
        const found = filter("Revenue", { kind: FILTER_KIND.NUMBER, operator, value });
        expect(found.map((r) => r.Industry)).toEqual(expected);
    });

    it("compares dates on the date part, so a late-in-day datetime still matches", () => {
        // 2026-08-20T23:45Z would fall outside a naive comparison against the bare
        // date "2026-08-20".
        const found = filter("Created", {
            kind: FILTER_KIND.DATE,
            operator: FILTER_OPERATOR.EQUALS,
            value: "2026-08-20"
        });
        expect(found.map((r) => r.Industry)).toEqual(["Electronics"]);
    });

    it("uses the range a relative date operator resolved to", () => {
        const found = filter("Created", {
            kind: FILTER_KIND.DATE,
            operator: FILTER_OPERATOR.LAST_30,
            from: "2026-07-27",
            to: "2026-08-25"
        });
        expect(found.map((r) => r.Industry)).toEqual(["Electronics", "Construction"]);
    });

    it("filters booleans on true or false", () => {
        expect(
            filter("Active", { kind: FILTER_KIND.BOOLEAN, operator: FILTER_OPERATOR.EQUALS, value: true })
        ).toHaveLength(2);
        expect(
            filter("Active", { kind: FILTER_KIND.BOOLEAN, operator: FILTER_OPERATOR.EQUALS, value: false })
        ).toHaveLength(2);
    });

    it.each([
        [FILTER_OPERATOR.EQUALS, "electronics", ["Electronics"]],
        [FILTER_OPERATOR.NOT_EQUALS, "electronics", ["Apparel", "Construction"]],
        [FILTER_OPERATOR.CONTAINS, "con", ["Construction"]],
        [FILTER_OPERATOR.NOT_CONTAINS, "con", ["Electronics", "Apparel"]],
        [FILTER_OPERATOR.STARTS_WITH, "app", ["Apparel"]]
    ])("applies the text operator %s", (operator, value, expected) => {
        const found = filter("Industry", { kind: FILTER_KIND.TEXT, operator, value });
        expect(found.map((r) => r.Industry)).toEqual(expected);
    });

    it("finds blank and non-blank rows", () => {
        const blank = filter("Industry", { kind: FILTER_KIND.TEXT, operator: FILTER_OPERATOR.BLANK });
        expect(blank).toHaveLength(1);
        const filled = filter("Industry", { kind: FILTER_KIND.TEXT, operator: FILTER_OPERATOR.NOT_BLANK });
        expect(filled).toHaveLength(3);
    });

    it("excludes blank rows from every value-bearing operator", () => {
        // A blank cannot satisfy a comparison, including a negated one.
        expect(
            filter("Industry", { kind: FILTER_KIND.TEXT, operator: FILTER_OPERATOR.NOT_EQUALS, value: "zzz" })
        ).toHaveLength(3);
    });

    it("ignores a filter that would not narrow anything", () => {
        expect(isFilterActive({ kind: FILTER_KIND.PICKLIST, operator: FILTER_OPERATOR.EQUALS, values: [] })).toBe(
            false
        );
        expect(isFilterActive({ kind: FILTER_KIND.NUMBER, operator: FILTER_OPERATOR.EQUALS, value: "" })).toBe(false);
        expect(isFilterActive({ kind: FILTER_KIND.TEXT, operator: FILTER_OPERATOR.BLANK })).toBe(true);
        expect(isFilterActive({ kind: FILTER_KIND.BOOLEAN, operator: FILTER_OPERATOR.EQUALS, value: false })).toBe(
            true
        );
        expect(isFilterActive({ kind: FILTER_KIND.TEXT, value: "no operator" })).toBe(false);
        expect(
            filterRows(ROWS, { Industry: { kind: FILTER_KIND.PICKLIST, operator: FILTER_OPERATOR.EQUALS, values: [] } })
        ).toHaveLength(4);
    });

    it("still accepts a bare string as a contains filter", () => {
        // Shape used before filters carried operators.
        expect(filterRows(ROWS, { Industry: "elect" })).toHaveLength(1);
    });

    it("combines filters on different columns with AND", () => {
        const filters = {
            Active: { kind: FILTER_KIND.BOOLEAN, operator: FILTER_OPERATOR.EQUALS, value: true },
            Revenue: { kind: FILTER_KIND.NUMBER, operator: FILTER_OPERATOR.GREATER, value: 500 }
        };
        expect(filterRows(ROWS, filters).map((r) => r.Industry)).toEqual(["Construction"]);
    });

    it("resolves date presets against an injected today", () => {
        const today = new Date("2026-08-25T12:00:00.000Z");
        expect(resolveDatePreset(FILTER_OPERATOR.TODAY, today)).toEqual({ from: "2026-08-25", to: "2026-08-25" });
        expect(resolveDatePreset(FILTER_OPERATOR.LAST_30, today)).toEqual({ from: "2026-07-27", to: "2026-08-25" });
        expect(resolveDatePreset(FILTER_OPERATOR.THIS_YEAR, today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
        expect(resolveDatePreset("nonsense", today)).toEqual({ from: null, to: null });
    });
});

describe("describeFilter", () => {
    it("reads as a sentence for the pill", () => {
        expect(
            describeFilter("Industry", {
                kind: FILTER_KIND.PICKLIST,
                operator: FILTER_OPERATOR.EQUALS,
                values: ["Apparel"]
            })
        ).toBe("Industry is one of Apparel");
        expect(
            describeFilter("Revenue", { kind: FILTER_KIND.NUMBER, operator: FILTER_OPERATOR.GREATER, value: 500 })
        ).toBe("Revenue greater than 500");
        expect(
            describeFilter("Active", { kind: FILTER_KIND.BOOLEAN, operator: FILTER_OPERATOR.EQUALS, value: false })
        ).toBe("Active equals False");
    });

    it("omits the value for operators that do not take one", () => {
        expect(describeFilter("Industry", { kind: FILTER_KIND.TEXT, operator: FILTER_OPERATOR.BLANK })).toBe(
            "Industry is blank"
        );
        expect(
            describeFilter("Created", { kind: FILTER_KIND.DATE, operator: FILTER_OPERATOR.LAST_30, from: "a", to: "b" })
        ).toBe("Created is in the last 30 days");
    });

    it("counts rather than lists a long picklist selection", () => {
        const many = { kind: FILTER_KIND.PICKLIST, operator: FILTER_OPERATOR.EQUALS, values: ["a", "b", "c", "d"] };
        expect(describeFilter("Industry", many)).toBe("Industry is one of 4 values");
    });
});

describe("paginationItems", () => {
    const render = (current, total) =>
        paginationItems(current, total)
            .map((item) => (item.isGap ? "…" : String(item.page)))
            .join(" ");

    it("shows every page up to the truncation threshold", () => {
        // Eight is the point at which truncating stops saving width, so below it
        // nothing is hidden.
        expect(render(3, 7)).toBe("1 2 3 4 5 6 7");
        expect(render(4, 8)).toBe("1 2 3 4 5 6 7 8");
    });

    it("truncates on the right on the first page", () => {
        expect(render(1, 32)).toBe("1 2 3 4 … 32");
    });

    it("truncates on both sides in the middle", () => {
        // Window leans one before, two after.
        expect(render(5, 32)).toBe("1 … 4 5 6 7 … 32");
    });

    it("truncates on the left on the last page", () => {
        expect(render(32, 32)).toBe("1 … 29 30 31 32");
    });

    it("never renders an ellipsis that hides nothing", () => {
        // At page 2 the window starts at 1, so there is no left gap to mark.
        expect(render(2, 32)).toBe("1 2 3 4 … 32");
        // Symmetrically at the far end.
        expect(render(31, 32)).toBe("1 … 29 30 31 32");
    });

    it("never exceeds eight slots", () => {
        for (let total = 9; total <= 60; total += 1) {
            for (let page = 1; page <= total; page += 1) {
                expect(paginationItems(page, total).length).toBeLessThanOrEqual(8);
            }
        }
    });

    it("always includes the first and last page", () => {
        const items = paginationItems(17, 40)
            .filter((item) => !item.isGap)
            .map((item) => item.page);
        expect(items).toContain(1);
        expect(items).toContain(40);
    });

    it("marks exactly one page current, and clamps a page out of range", () => {
        expect(paginationItems(5, 32).filter((item) => item.isCurrent)).toHaveLength(1);
        expect(paginationItems(99, 10).find((item) => item.isCurrent).page).toBe(10);
        expect(paginationItems(0, 10).find((item) => item.isCurrent).page).toBe(1);
    });

    it("survives nonsense input", () => {
        expect(render(1, 0)).toBe("1");
        expect(render(undefined, undefined)).toBe("1");
    });
});

describe("rowsPerPageOptions", () => {
    const values = (...args) => rowsPerPageOptions(...args).map((option) => Number(option.value));

    it("offers the fixed steps", () => {
        expect(values(10, null)).toEqual([10, 25, 50, 100]);
    });

    it("drops options above the row cap, since each would yield one page", () => {
        expect(values(10, 30)).toEqual([10, 25]);
    });

    it("includes the admin's own page size when it is not a step", () => {
        // Otherwise the select cannot represent 15 and would silently change it.
        expect(values(15, null)).toEqual([10, 15, 25, 50, 100]);
    });

    it("never returns an empty list, even below the smallest step", () => {
        expect(values(5, 5)).toEqual([5]);
        expect(values(50, 3)).toEqual([3]);
    });
});
