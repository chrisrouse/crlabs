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
    rowsPerPageOptions,
    buildRows,
    percentToFraction,
    fractionToPercent,
    sortRows,
    BLANKS_FIRST_ACTION_NAME,
    PICKLIST_SELECTED_SUFFIX,
    PICKLIST_OPTIONS_SUFFIX,
    PICKLIST_LOCKED_SUFFIX,
    MASTER_RECORD_TYPE_ID
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

    it("treats a width as a starting width that still reflows", () => {
        // Never fixedWidth. An exact width refuses to reflow, so narrowing the window
        // past the sum of the pinned columns forces horizontal overflow. A stored
        // `flex` value is ignored: it meant "no width of its own", which an empty
        // Width field already says.
        const [column] = buildColumns(["Name"], { Name: { width: 220 } });
        expect(column.initialWidth).toBe(220);
        expect(column.fixedWidth).toBeUndefined();

        const [ignored] = buildColumns(["Name"], { Name: { width: 220, flex: false } });
        expect(ignored.initialWidth).toBe(220);
        expect(ignored.fixedWidth).toBeUndefined();
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

describe("editability", () => {
    const describeFor = (extra) => ({ Field: { label: "Field", dataType: "text", ...extra } });

    it("lets the column config opt a field in", () => {
        const [column] = buildColumns(
            ["Field"],
            { Field: { edit: true } },
            {
                describeByPath: describeFor({ isEditable: true })
            }
        );
        expect(column.editable).toBe(true);
    });

    it("refuses a record Id even when the config asks for it", () => {
        // A working text box over an 18-character key. Apex reports ID as
        // non-editable; the config used to override that outright.
        const [column] = buildColumns(
            ["Id"],
            { Id: { edit: true } },
            {
                describeByPath: { Id: { label: "Account ID", dataType: "text", displayType: "ID", isEditable: false } }
            }
        );
        expect(column.editable).toBe(false);
    });

    it("allows an updateable Date, which the datatable can edit after all", () => {
        // A line in the component reference claims dates cannot be inline-edited.
        // Observed behaviour says otherwise: the picker opens and the edit commits.
        const [column] = buildColumns(
            ["Due"],
            { Due: { edit: true } },
            {
                describeByPath: {
                    Due: { label: "Due", dataType: "date-local", displayType: "DATE", isEditable: true }
                }
            }
        );
        expect(column.editable).toBe(true);
    });

    it("refuses an audit field, because it is not updateable", () => {
        // CreatedDate, LastModifiedDate and SystemModstamp all report isUpdateable
        // false, so no extra type list is needed to keep them read-only. Confirmed by
        // describe in the org.
        const [column] = buildColumns(
            ["CreatedDate"],
            { CreatedDate: { edit: true } },
            {
                describeByPath: {
                    CreatedDate: {
                        label: "Created Date",
                        dataType: "date",
                        displayType: "DATETIME",
                        isEditable: false
                    }
                }
            }
        );
        expect(column.editable).toBe(false);
    });

    it("refuses a formula or auto-number field", () => {
        const [column] = buildColumns(
            ["Field"],
            { Field: { edit: true } },
            {
                describeByPath: describeFor({ isEditable: false })
            }
        );
        expect(column.editable).toBe(false);
    });

    it("still trusts the config when there is no describe to check against", () => {
        // A user-defined object, or the Studio preview before Apex answers.
        const [column] = buildColumns(["Anything"], { Anything: { edit: true } }, {});
        expect(column.editable).toBe(true);
    });

    it("keeps forceReadOnly absolute", () => {
        const [column] = buildColumns(
            ["Field"],
            { Field: { edit: true } },
            {
                describeByPath: describeFor({ isEditable: true }),
                forceReadOnly: true
            }
        );
        expect(column.editable).toBe(false);
    });
});

describe("long text columns", () => {
    const longText = (extra = {}) => ({
        Description: {
            label: "Description",
            dataType: "text",
            displayType: "TEXTAREA",
            isEditable: true,
            isLongText: true,
            length: 32000,
            ...extra
        }
    });

    it("uses the textarea cell when editable, bounded by the field length", () => {
        // The datatable's own text editor is a single line, which would flatten the
        // newlines out of a long text field and save it back that way.
        const [column] = buildColumns(["Description"], { Description: { edit: true } }, { describeByPath: longText() });
        expect(column.type).toBe("fgridLongText");
        expect(column.typeAttributes.maxLength).toBe(32000);
    });

    it("stays plain text when not editable", () => {
        // Read-only, the custom cell would add a render path for no visible gain.
        const [column] = buildColumns(["Description"], {}, { describeByPath: longText() });
        expect(column.type).toBe("text");
    });

    it("leaves rich text read-only, since Apex reports it non-editable", () => {
        // Rich text stores HTML; a plain textarea would re-save raw markup.
        const [column] = buildColumns(
            ["Body"],
            { Body: { edit: true } },
            {
                describeByPath: {
                    Body: {
                        label: "Body",
                        dataType: "text",
                        displayType: "TEXTAREA",
                        isEditable: false,
                        isLongText: false
                    }
                }
            }
        );
        expect(column.editable).toBe(false);
        expect(column.type).toBe("text");
    });
});

describe("percent scaling", () => {
    const columns = buildColumns(["Margin"], { Margin: { type: "percent" } });

    it("divides a stored percent for display", () => {
        // Salesforce stores 25 for 25%; the datatable's percent type multiplies by
        // 100 to render, so an unconverted 25 would show as 2500%.
        const [row] = buildRows([{ Id: "a", Margin: 25 }], columns, "Id");
        expect(row.Margin).toBe(0.25);
    });

    it("round-trips through the display and back", () => {
        expect(fractionToPercent(percentToFraction(25))).toBe(25);
        expect(fractionToPercent(0.075)).toBeCloseTo(7.5);
    });

    it("leaves a blank percent alone rather than turning it into zero", () => {
        const [row] = buildRows([{ Id: "a", Margin: null }], columns, "Id");
        expect(row.Margin).toBeNull();
    });

    it("passes a non-numeric value through untouched", () => {
        expect(percentToFraction("n/a")).toBe("n/a");
        expect(fractionToPercent(undefined)).toBe(undefined);
    });

    it("does not touch a currency or number column", () => {
        const money = buildColumns(["Amount"], { Amount: { type: "currency" } });
        const [row] = buildRows([{ Id: "a", Amount: 25 }], money, "Id");
        expect(row.Amount).toBe(25);
    });
});

describe("time columns", () => {
    const describeTime = { Start__c: { label: "Start", dataType: "text", displayType: "TIME", isEditable: true } };

    it("uses the time cell, so the raw value is never rendered", () => {
        // A Time arrives from Apex as 14:30:00.000Z, which a text cell shows verbatim.
        const [column] = buildColumns(["Start__c"], {}, { describeByPath: describeTime });
        expect(column.type).toBe("fgridTime");
    });

    it("uses the time cell even when read-only", () => {
        // Unlike picklists, a read-only Time is not indistinguishable from text.
        const [column] = buildColumns(["Start__c"], { Start__c: { edit: false } }, { describeByPath: describeTime });
        expect(column.type).toBe("fgridTime");
        expect(column.editable).toBe(false);
    });

    it("leaves the stored value untouched for the cell to format", () => {
        // Nothing is formatted here: the display template hands the raw value to
        // lightning-formatted-time. Leaving it alone is also what keeps sorting
        // correct, since HH:mm:ss orders lexically.
        const columns = buildColumns(["Start__c"], {}, { describeByPath: describeTime });
        const [row] = buildRows([{ Id: "a", Start__c: "14:30:00.000Z" }], columns, "Id");
        expect(row.Start__c).toBe("14:30:00.000Z");
    });

    it("adds no synthetic row fields for a time column", () => {
        const columns = buildColumns(["Start__c"], {}, { describeByPath: describeTime });
        const [row] = buildRows([{ Id: "a", Start__c: "14:30:00.000Z" }], columns, "Id");
        expect(Object.keys(row).filter((key) => key.includes("fgridTime"))).toEqual([]);
    });
});

describe("date and datetime formatting", () => {
    const datetime = { When__c: { label: "When", dataType: "date", displayType: "DATETIME", isEditable: true } };
    const dateOnly = { Due__c: { label: "Due", dataType: "date-local", displayType: "DATE", isEditable: true } };

    it("shows the time on a Datetime column", () => {
        // With no typeAttributes the component uses a medium DATE format, so a
        // Datetime rendered as "Apr 18, 2024" and the time was invisible.
        const [column] = buildColumns(["When__c"], {}, { describeByPath: datetime });
        expect(column.type).toBe("date");
        expect(column.typeAttributes).toMatchObject({ hour: "2-digit", minute: "2-digit" });
    });

    it("lets an admin's typeAttribs win over the datetime defaults", () => {
        const [column] = buildColumns(
            ["When__c"],
            { When__c: { typeAttribs: { year: "2-digit" } } },
            { describeByPath: datetime }
        );
        expect(column.typeAttributes.year).toBe("2-digit");
        expect(column.typeAttributes.hour).toBeUndefined();
    });

    it("leaves a plain Date column on date-local with no typeAttributes", () => {
        // date-local performs no timezone conversion, which is what keeps a
        // YYYY-MM-DD value showing the same day everywhere.
        const [column] = buildColumns(["Due__c"], {}, { describeByPath: dateOnly });
        expect(column.type).toBe("date-local");
        expect(column.typeAttributes).toBeUndefined();
    });

    it("moves a formatted Date column to date and pins it to UTC", () => {
        // date-local ignores typeAttributes, so custom formatting means switching to
        // `date` — which converts to the user's zone and can show the wrong day
        // unless the timezone is pinned, exactly as the reference prescribes.
        const [column] = buildColumns(
            ["Due__c"],
            { Due__c: { typeAttribs: { month: "long" } } },
            { describeByPath: dateOnly }
        );
        expect(column.type).toBe("date");
        expect(column.typeAttributes).toMatchObject({ month: "long", timeZone: "UTC" });
    });

    it("does not override a timezone the admin set deliberately", () => {
        const [column] = buildColumns(
            ["Due__c"],
            { Due__c: { typeAttribs: { timeZone: "America/New_York" } } },
            { describeByPath: dateOnly }
        );
        expect(column.typeAttributes.timeZone).toBe("America/New_York");
    });
});

describe("datetime timezone", () => {
    const datetime = { When__c: { label: "When", dataType: "date", displayType: "DATETIME", isEditable: true } };

    it("renders a Datetime in the user's Salesforce timezone", () => {
        // Not the browser's. The two disagree whenever a laptop clock differs from
        // the user record, and the cell would be out by the difference.
        const [column] = buildColumns(
            ["When__c"],
            {},
            { describeByPath: datetime, userTimeZone: "America/Los_Angeles" }
        );
        expect(column.typeAttributes.timeZone).toBe("America/Los_Angeles");
    });

    it("lets an explicit timezone win over the user's", () => {
        const [column] = buildColumns(
            ["When__c"],
            { When__c: { typeAttribs: { timeZone: "UTC" } } },
            { describeByPath: datetime, userTimeZone: "America/Los_Angeles" }
        );
        expect(column.typeAttributes.timeZone).toBe("UTC");
    });

    it("omits the timezone when the org did not supply one", () => {
        const [column] = buildColumns(["When__c"], {}, { describeByPath: datetime });
        expect(column.typeAttributes.timeZone).toBeUndefined();
    });
});

describe("read-only lock reflects configuration, not the preview", () => {
    const describeFor = {
        Name: { label: "Name", dataType: "text", isEditable: true },
        CreatedDate: { label: "Created", dataType: "date", isEditable: false }
    };

    it("locks only the columns that are not configured as editable", () => {
        const [name, created] = buildColumns(
            ["Name", "CreatedDate"],
            { Name: { edit: true } },
            { describeByPath: describeFor, readOnlyIcon: true }
        );

        expect(name.displayReadOnlyIcon).toBeUndefined();
        expect(created.displayReadOnlyIcon).toBe(true);
    });

    it("keeps those same locks in the Studio preview", () => {
        // The preview forces every column read-only because it cannot edit anything,
        // which used to put a lock on all of them — including a column the admin had
        // just ticked Edit on.
        const [name, created] = buildColumns(
            ["Name", "CreatedDate"],
            { Name: { edit: true } },
            { describeByPath: describeFor, readOnlyIcon: true, forceReadOnly: true }
        );

        expect(name.editable).toBe(false);
        expect(name.displayReadOnlyIcon).toBeUndefined();
        expect(created.displayReadOnlyIcon).toBe(true);
    });
});

describe("an editable Name column is not linked", () => {
    // A link column's fieldName is rewritten to the generated URL field, and the
    // inline editor binds to fieldName — so linking an editable Name column put the
    // record URL in the edit box, and saving would have written it over the name.
    const nameDescribe = { Name: { label: "Name", dataType: "text", isEditable: true, isNameField: true } };

    it("links the Name field when it is read-only", () => {
        const [column] = buildColumns(["Name"], {}, { describeByPath: nameDescribe, linkNameField: true });

        expect(column.type).toBe("url");
        expect(column.fieldName).not.toBe("Name");
    });

    it("keeps the real field when the admin ticked Edit", () => {
        const [column] = buildColumns(
            ["Name"],
            { Name: { edit: true } },
            { describeByPath: nameDescribe, linkNameField: true }
        );

        expect(column.fieldName).toBe("Name");
        expect(column.type).not.toBe("url");
        expect(column.editable).toBe(true);
    });

    it("makes the same choice in the Studio preview", () => {
        // The preview forces every column read-only, so testing column.editable here
        // would have linked it in the preview and not at runtime.
        const [column] = buildColumns(
            ["Name"],
            { Name: { edit: true } },
            { describeByPath: nameDescribe, linkNameField: true, forceReadOnly: true }
        );

        expect(column.fieldName).toBe("Name");
        expect(column.type).not.toBe("url");
    });
});

describe("sorting ignores case", () => {
    // Not a setting. Comparing raw strings compares character codes, which puts every
    // capitalised value ahead of every lowercase one, and no end-user reason to want
    // that was found.
    const rows = [{ Name: "Zebra" }, { Name: "acme corp" }, { Name: "Bahringer" }];

    it("orders text the way a reader expects", () => {
        expect(sortRows(rows, "Name", "asc").map((r) => r.Name)).toEqual(["acme corp", "Bahringer", "Zebra"]);
    });

    it("reverses cleanly", () => {
        expect(sortRows(rows, "Name", "desc").map((r) => r.Name)).toEqual(["Zebra", "Bahringer", "acme corp"]);
    });

    it("leaves numbers alone", () => {
        const numeric = [{ N: 10 }, { N: 2 }, { N: 33 }];
        expect(sortRows(numeric, "N", "asc").map((r) => r.N)).toEqual([2, 10, 33]);
    });
});

describe("show blanks first", () => {
    const rows = [{ Name: "Zebra" }, { Name: null }, { Name: "acme" }, { Name: "" }];

    it("sends blanks to the bottom by default, in both directions", () => {
        // Blanks are grouped rather than sorted, so reversing does not scatter them
        // through the middle.
        expect(sortRows(rows, "Name", "asc").map((r) => r.Name)).toEqual(["acme", "Zebra", null, ""]);
        expect(sortRows(rows, "Name", "desc").map((r) => r.Name)).toEqual(["Zebra", "acme", null, ""]);
    });

    it("sends them to the top when asked", () => {
        expect(sortRows(rows, "Name", "asc", true).map((r) => r.Name)).toEqual([null, "", "acme", "Zebra"]);
        expect(sortRows(rows, "Name", "desc", true).map((r) => r.Name)).toEqual([null, "", "Zebra", "acme"]);
    });

    it("offers the action on any sortable column, ticked only where it is on", () => {
        const describeFor = { Name: { label: "Name", dataType: "text", isSortable: true } };
        const [plain] = buildColumns(["Name"], {}, { describeByPath: describeFor });
        const [ticked] = buildColumns(["Name"], {}, { describeByPath: describeFor, blanksFirstFields: ["Name"] });

        const find = (column) => column.actions.find((a) => a.name === BLANKS_FIRST_ACTION_NAME);
        expect(find(plain).checked).toBe(false);
        expect(find(ticked).checked).toBe(true);
    });

    it("offers no actions at all when header actions are hidden", () => {
        const [column] = buildColumns(
            ["Name"],
            {},
            { describeByPath: { Name: { label: "Name", dataType: "text" } }, hideHeaderActions: true }
        );
        expect(column.actions).toBeUndefined();
    });
});

describe("picklist options are the active values only", () => {
    // Matching a record page: a stored value that has since been deactivated is not
    // offered, and changing away from it is one-way unless the user cancels. The old
    // behaviour injected it into that row's own list, which is why options used to be
    // addressed per row at all.
    const describeFor = {
        Rating: {
            label: "Rating",
            dataType: "picklist",
            displayType: "PICKLIST",
            isEditable: true,
            picklistOptions: [
                { label: "Hot", value: "Hot" },
                { label: "Warm", value: "Warm" }
            ]
        }
    };

    it("offers the active values as one list on the column", () => {
        const [column] = buildColumns(
            ["Rating"],
            { Rating: { edit: true } },
            { describeByPath: describeFor, allowNone: false }
        );

        expect(column.type).toBe("fgridPicklist");
        expect(column.typeAttributes.options).toEqual([
            { label: "Hot", value: "Hot" },
            { label: "Warm", value: "Warm" }
        ]);
    });

    it("does not offer a stored value that is no longer active", () => {
        const [column] = buildColumns(["Rating"], { Rating: { edit: true } }, { describeByPath: describeFor });
        const [row] = buildRows([{ Id: "a", Rating: "Retired" }], [column], "Id");

        expect(column.typeAttributes.options.map((o) => o.value)).not.toContain("Retired");
        // And no per-row option list is built any more.
        expect(Object.keys(row).some((key) => key.includes("Options"))).toBe(false);
    });

    it("puts --None-- at the top when it is allowed, and omits it when not", () => {
        const allowed = buildColumns(
            ["Rating"],
            { Rating: { edit: true } },
            { describeByPath: describeFor, allowNone: true }
        )[0];
        expect(allowed.typeAttributes.options[0]).toEqual({ label: "--None--", value: "" });

        const hidden = buildColumns(
            ["Rating"],
            { Rating: { edit: true } },
            { describeByPath: describeFor, allowNone: false }
        )[0];
        expect(hidden.typeAttributes.options.map((o) => o.value)).not.toContain("");
    });

    it("still splits a multi-select's stored value per row", () => {
        const multi = {
            Tags: {
                label: "Tags",
                dataType: "picklist",
                displayType: "MULTIPICKLIST",
                isEditable: true,
                picklistOptions: [
                    { label: "A", value: "A" },
                    { label: "B", value: "B" }
                ]
            }
        };
        const [column] = buildColumns(["Tags"], { Tags: { edit: true } }, { describeByPath: multi });
        const [row] = buildRows([{ Id: "a", Tags: "A;B" }], [column], "Id");

        expect(row["Tags" + PICKLIST_SELECTED_SUFFIX]).toEqual(["A", "B"]);
        // No --None-- for a checkbox group: clearing every box already says that.
        expect(column.typeAttributes.options.map((o) => o.value)).toEqual(["A", "B"]);
    });
});

describe("record-type and dependent picklists", () => {
    const describeFor = {
        Type: {
            label: "Type",
            dataType: "picklist",
            displayType: "PICKLIST",
            isEditable: true,
            picklistOptions: [
                { label: "Retail", value: "Retail" },
                { label: "Wholesale", value: "Wholesale" }
            ]
        },
        SubType: {
            label: "Sub Type",
            dataType: "picklist",
            displayType: "PICKLIST",
            isEditable: true,
            controllerField: "Type",
            picklistOptions: [
                { label: "Shop", value: "Shop" },
                { label: "Depot", value: "Depot" }
            ]
        }
    };
    const config = { Type: { edit: true }, SubType: { edit: true } };

    // One UI API payload: values narrowed to the record type, plus validFor indexing
    // into controllerValues.
    const payload = {
        SubType: {
            controllerValues: { Retail: 0, Wholesale: 1 },
            values: [
                { label: "Shop", value: "Shop", validFor: [0] },
                { label: "Depot", value: "Depot", validFor: [1] }
            ]
        }
    };
    const context = {
        recordTypeFor: (record) => record?.RecordTypeId || MASTER_RECORD_TYPE_ID,
        valuesFor: (recordTypeId, field) => (recordTypeId === "012A" ? payload[field] : null)
    };

    function build(options = {}) {
        return buildColumns(["Type", "SubType"], config, {
            describeByPath: describeFor,
            allowNone: false,
            ...options
        });
    }

    it("marks a dependent column with the chosen icon", () => {
        const [, subType] = build({ dependentPicklistIcon: "utility:hierarchy" });
        expect(subType.iconName).toBe("utility:hierarchy");
    });

    it("leaves an independent column unmarked", () => {
        const [type] = build({ dependentPicklistIcon: "utility:hierarchy" });
        expect(type.iconName).toBeUndefined();
    });

    it("keeps options on the column when nothing can vary per row", () => {
        const [type] = buildColumns(["Type"], { Type: { edit: true } }, { describeByPath: { Type: describeFor.Type } });
        expect(Array.isArray(type.typeAttributes.options)).toBe(true);
    });

    it("moves them to a row field once a column is dependent", () => {
        const [, subType] = build();
        expect(subType.typeAttributes.options.fieldName).toBe("SubType" + PICKLIST_OPTIONS_SUFFIX);
    });

    it("narrows a dependent picklist to its controlling value", () => {
        const columns = build();
        const [retail, wholesale] = buildRows(
            [
                { Id: "a", RecordTypeId: "012A", Type: "Retail" },
                { Id: "b", RecordTypeId: "012A", Type: "Wholesale" }
            ],
            columns,
            "Id",
            context
        );

        expect(retail["SubType" + PICKLIST_OPTIONS_SUFFIX].map((o) => o.value)).toEqual(["Shop"]);
        expect(wholesale["SubType" + PICKLIST_OPTIONS_SUFFIX].map((o) => o.value)).toEqual(["Depot"]);
    });

    it("locks the cell when the controlling field is blank", () => {
        const columns = build();
        const [row] = buildRows([{ Id: "a", RecordTypeId: "012A", Type: null }], columns, "Id", context);

        expect(row["SubType" + PICKLIST_OPTIONS_SUFFIX]).toEqual([]);
        expect(row["SubType" + PICKLIST_LOCKED_SUFFIX]).toBe(true);
    });

    it("names the controlling field in the locked placeholder", () => {
        const [, subType] = build();
        expect(subType.typeAttributes.lockedText).toBe("Set Type first");
    });

    it("shares one array between rows that resolve the same way", () => {
        // The cache is keyed by record type, field and controlling value, so a grid of
        // 2000 rows builds a handful of arrays rather than 2000.
        const columns = build();
        const rows = buildRows(
            [
                { Id: "a", RecordTypeId: "012A", Type: "Retail" },
                { Id: "b", RecordTypeId: "012A", Type: "Retail" }
            ],
            columns,
            "Id",
            context
        );

        expect(rows[0]["SubType" + PICKLIST_OPTIONS_SUFFIX]).toBe(rows[1]["SubType" + PICKLIST_OPTIONS_SUFFIX]);
    });

    it("falls back to the describe values when no payload answers", () => {
        // An unfetched record type, or a field missing from the payload: show the
        // unfiltered list rather than an empty one nobody asked for.
        const columns = build();
        const [row] = buildRows([{ Id: "a", RecordTypeId: "012ZZZ", Type: "Retail" }], columns, "Id", context);

        expect(row["SubType" + PICKLIST_OPTIONS_SUFFIX].map((o) => o.value)).toEqual(["Shop", "Depot"]);
        expect(row["SubType" + PICKLIST_LOCKED_SUFFIX]).toBe(false);
    });
});
