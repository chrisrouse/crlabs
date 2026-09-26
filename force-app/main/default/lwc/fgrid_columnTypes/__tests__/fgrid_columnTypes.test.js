import {
    COLUMN_TYPES,
    typeOptionsFor,
    canChangeType,
    attributeGroupFor,
    isNumeric,
    ATTRIBUTE_GROUP,
    CURRENCY_DISPLAYS
} from "c/fgrid_columnTypes";

const valuesFor = (displayType) => typeOptionsFor(displayType).map((option) => option.value);

describe("what a field may be displayed as", () => {
    it("never offers a Date/Time a currency or a checkbox", () => {
        // The case Chris named: nonsense options are how an admin ends up with
        // a broken column and no idea why.
        expect(valuesFor("DATETIME")).not.toContain("currency");
        expect(valuesFor("DATETIME")).not.toContain("boolean");
    });

    it("puts the natural display first", () => {
        expect(valuesFor("DATETIME")[0]).toBe("date");
        expect(valuesFor("DATE")[0]).toBe("date-local");
        expect(valuesFor("CURRENCY")[0]).toBe("currency");
        expect(valuesFor("REFERENCE")[0]).toBe("fgridLookup");
    });

    it("always allows text, because any value can be printed", () => {
        ["CURRENCY", "DATETIME", "BOOLEAN", "PICKLIST", "REFERENCE", "PERCENT"].forEach((displayType) => {
            expect(valuesFor(displayType)).toContain("text");
        });
    });

    it("lets numbers move between the three numeric displays", () => {
        expect(valuesFor("DOUBLE")).toEqual(expect.arrayContaining(["number", "currency", "percent"]));
    });

    it("does not offer to format a String as a number", () => {
        // A text field holding digits is not a number, and rendering it as one
        // produces a column of NaN.
        expect(valuesFor("STRING")).not.toContain("number");
        expect(valuesFor("STRING")).not.toContain("currency");
        // Contact types stay, because a text field often holds one.
        expect(valuesFor("STRING")).toEqual(expect.arrayContaining(["email", "phone", "url"]));
    });

    it("offers everything when there is no describe", () => {
        // The user-defined-object case: nothing can be ruled out, and refusing
        // to guess beats guessing wrong.
        [undefined, null, "", "SOMETHING_NEW"].forEach((displayType) => {
            expect(typeOptionsFor(displayType)).toHaveLength(COLUMN_TYPES.length);
        });
    });

    it("is case insensitive about the describe's value", () => {
        expect(valuesFor("datetime")).toEqual(valuesFor("DATETIME"));
    });

    it("reports when a field has no alternative display", () => {
        expect(canChangeType("ID")).toBe(false);
        expect(canChangeType("ENCRYPTEDSTRING")).toBe(false);
        expect(canChangeType("CURRENCY")).toBe(true);
    });
});

describe("which settings a display implies", () => {
    it("separates currency from plain numbers", () => {
        // Currency adds a code and a display mode that mean nothing for an
        // Integer, and an inert currency picker beside one is noise.
        expect(attributeGroupFor("currency")).toBe(ATTRIBUTE_GROUP.CURRENCY);
        expect(attributeGroupFor("number")).toBe(ATTRIBUTE_GROUP.NUMBER);
        expect(attributeGroupFor("percent")).toBe(ATTRIBUTE_GROUP.NUMBER);
    });

    it("groups the rest by family", () => {
        expect(attributeGroupFor("text")).toBe(ATTRIBUTE_GROUP.TEXT);
        expect(attributeGroupFor("fgridLongText")).toBe(ATTRIBUTE_GROUP.TEXT);
        expect(attributeGroupFor("date-local")).toBe(ATTRIBUTE_GROUP.DATE);
        expect(attributeGroupFor("fgridMultiPicklist")).toBe(ATTRIBUTE_GROUP.PICKLIST);
        expect(attributeGroupFor("fgridLookup")).toBe(ATTRIBUTE_GROUP.LOOKUP);
    });

    it("has no settings for the displays that need none", () => {
        expect(attributeGroupFor("boolean")).toBe(ATTRIBUTE_GROUP.NONE);
        expect(attributeGroupFor("email")).toBe(ATTRIBUTE_GROUP.NONE);
    });

    it("treats exactly the numeric displays as numeric", () => {
        ["currency", "number", "percent"].forEach((type) => expect(isNumeric(type)).toBe(true));
        ["text", "date", "boolean", "fgridLookup"].forEach((type) => expect(isNumeric(type)).toBe(false));
    });
});

describe("currency display options", () => {
    it("uses lightning-formatted-number's own values", () => {
        expect(CURRENCY_DISPLAYS.map((option) => option.value)).toEqual(["symbol", "code", "name"]);
    });
});
