import {
    COLUMN_TYPES,
    typeOptionsFor,
    canChangeType,
    attributeGroupFor,
    isNumeric,
    ATTRIBUTE_GROUP,
    CURRENCY_DISPLAYS,
    BADGE_DISPLAY,
    supportsBadge,
    displayValueFor,
    resolveDisplay
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
            // Every real type, plus Badge, which is a display rather than one
            // of them and is added alongside the picklist it decorates.
            expect(typeOptionsFor(displayType)).toHaveLength(COLUMN_TYPES.length + 1);
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

describe("badge is a display, not a data type", () => {
    it("offers Badge to a picklist, right after the picklist itself", () => {
        // They read as alternatives, which is how an admin thinks about it.
        const values = valuesFor("PICKLIST");
        expect(values).toEqual(["fgridPicklist", BADGE_DISPLAY, "text"]);
    });

    it("offers Badge to a multi-select picklist too", () => {
        expect(valuesFor("MULTIPICKLIST")).toContain(BADGE_DISPLAY);
    });

    it("does not offer Badge where nothing of ours can draw one", () => {
        // Plain text uses the datatable's own type, which has no template of
        // ours to put a badge in.
        ["CURRENCY", "DATETIME", "STRING", "BOOLEAN", "REFERENCE"].forEach((displayType) =>
            expect(valuesFor(displayType)).not.toContain(BADGE_DISPLAY)
        );
    });

    it("splits Badge back into a real type and a flag", () => {
        expect(resolveDisplay(BADGE_DISPLAY, "PICKLIST")).toEqual({ type: "fgridPicklist", badge: true });
        expect(resolveDisplay(BADGE_DISPLAY, "MULTIPICKLIST")).toEqual({ type: "fgridMultiPicklist", badge: true });
    });

    it("leaves a real type alone, and clears the flag", () => {
        expect(resolveDisplay("text", "PICKLIST")).toEqual({ type: "text", badge: false });
    });

    it("round-trips a stored type and flag back to the list value", () => {
        expect(displayValueFor("fgridPicklist", true)).toBe(BADGE_DISPLAY);
        expect(displayValueFor("fgridPicklist", false)).toBe("fgridPicklist");
        // A stray flag on a type that cannot draw one must not hide the type.
        expect(displayValueFor("text", true)).toBe("text");
    });

    it("knows which types can draw a badge", () => {
        expect(supportsBadge("fgridPicklist")).toBe(true);
        expect(supportsBadge("fgridMultiPicklist")).toBe(true);
        expect(supportsBadge("text")).toBe(false);
    });
});
