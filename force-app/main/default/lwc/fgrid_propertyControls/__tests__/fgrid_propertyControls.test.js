import { createElement } from "lwc";
import FgridPropertyControls from "c/fgrid_propertyControls";
import { SECTIONS } from "c/fgrid_propertySchema";

const COLUMNS_SECTION = SECTIONS.find((section) => section.name === "columns");

const CONTEXT = {
    recordLookups: [
        { name: "Get_All", object: "Account", storeOutputAutomatically: true },
        { name: "Get_Some", object: "Account", queriedFields: ["Id", "Name", "AccountNumber"] }
    ]
};

function build(records) {
    const element = createElement("c-fgrid-property-controls", { is: FgridPropertyControls });
    element.section = COLUMNS_SECTION;
    element.values = { records, columnFields: '["Name"]', objectApiName: "Account" };
    element.objectApiName = "Account";
    element.builderContext = CONTEXT;
    document.body.appendChild(element);
    return element;
}

const picker = (element) => element.shadowRoot.querySelector("c-flow-config-field-picker");

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("the Columns picker offers only what the records carry", () => {
    it("limits a Get Records with chosen fields to those fields, with no relationships", async () => {
        const element = build("{!Get_Some}");
        await Promise.resolve();
        expect(JSON.parse(picker(element).availableFields)).toEqual(["Id", "Name", "AccountNumber"]);
        expect(picker(element).maxRelationshipDepth).toBe(0);
    });

    it("offers every field of a Get Records that stores all, but still no relationships", async () => {
        // A Get Records never returns parent fields, even with all fields stored.
        const element = build("{!Get_All}");
        await Promise.resolve();
        expect(picker(element).availableFields).toBe("");
        expect(picker(element).maxRelationshipDepth).toBe(0);
    });

    it("leaves a source it cannot trace unrestricted", async () => {
        const element = build("{!fromApex}");
        await Promise.resolve();
        expect(picker(element).availableFields).toBe("");
        expect(picker(element).maxRelationshipDepth).toBe(5);
    });
});
