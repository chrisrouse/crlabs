import { buildColumns, buildSampleRows, inferType, defaultLabel } from "c/fgrid_gridModel";

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

    it("maps width, alignment, and icon onto datatable shapes", () => {
        const [column] = buildColumns(["Name"], {
            Name: { width: 220, align: "right", icon: "standard:account" }
        });
        expect(column.initialWidth).toBe(220);
        expect(column.cellAttributes).toEqual({ alignment: "right", iconName: "standard:account" });
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
