/**
 * Every `typeAttributes.x` a cell template reads must be DECLARED.
 *
 * `lightning-datatable` passes a custom type only the type attributes named in
 * its `customTypes` entry and drops the rest, with no warning. A template
 * binding an undeclared one therefore renders `undefined` — which cost a real
 * bug: `badgeClass` was bound but never declared, so a badged picklist lost
 * both its badge styling and its conditional color while the cell-colored path
 * kept working, making it look like a formatting problem rather than a
 * plumbing one.
 *
 * Read from SOURCE rather than by importing the component. The templates are
 * compiled to modules by the time Jest sees them, so the binding is no longer
 * inspectable; the text is what states the contract.
 */
/* eslint-disable no-undef -- Node globals; this test reads source from disk
   rather than importing a compiled module, so it runs in Jest's Node scope. */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(DIR, "fgrid_customDatatable.js"), "utf8");

/** Templates belonging to each custom type, by file prefix. */
const TEMPLATES = {
    fgridPicklist: ["picklistDisplay.html", "picklistEdit.html"],
    fgridMultiPicklist: ["multiPicklistDisplay.html", "multiPicklistEdit.html"],
    fgridLookup: ["lookupDisplay.html", "lookupEdit.html"],
    fgridLongText: ["longTextDisplay.html", "longTextEdit.html"],
    fgridTime: ["timeDisplay.html", "timeEdit.html"]
};

/** The attribute names declared for one custom type. */
function declaredFor(type) {
    const block = new RegExp(`${type}:\\s*\\{[\\s\\S]*?typeAttributes:\\s*\\[([^\\]]*)\\]`).exec(SOURCE);
    if (!block) {
        return null;
    }
    return block[1]
        .split(",")
        .map((entry) => entry.trim().replace(/['"]/g, ""))
        .filter(Boolean);
}

/** Every `typeAttributes.x` the given templates bind. */
function boundBy(files) {
    const used = new Set();
    files.forEach((file) => {
        const markup = fs.readFileSync(path.join(DIR, file), "utf8");
        for (const match of markup.matchAll(/typeAttributes\.([a-zA-Z0-9_]+)/g)) {
            used.add(match[1]);
        }
    });
    return [...used];
}

describe("custom cell types declare every attribute their templates read", () => {
    Object.entries(TEMPLATES).forEach(([type, files]) => {
        it(`${type} declares what its templates bind`, () => {
            const declared = declaredFor(type);
            expect(declared).not.toBeNull();
            boundBy(files).forEach((attribute) => expect(declared).toContain(attribute));
        });
    });

    it("declares the badge pair, which a badged picklist cannot render without", () => {
        ["fgridPicklist", "fgridMultiPicklist"].forEach((type) => {
            expect(declaredFor(type)).toEqual(expect.arrayContaining(["badge", "badgeClass"]));
        });
    });
});
