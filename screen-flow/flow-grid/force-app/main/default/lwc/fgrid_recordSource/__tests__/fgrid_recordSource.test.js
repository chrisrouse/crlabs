import { referenceName, retrievedFields } from "c/fgrid_recordSource";

const CONTEXT = {
    recordLookups: [
        { name: "Get_Accounts", label: "Get Accounts", object: "Account", storeOutputAutomatically: true },
        {
            name: "Get_Some_Contacts",
            label: "Get Some Contacts",
            object: "Contact",
            storeOutputAutomatically: true,
            queriedFields: ["Name", "Email"]
        },
        {
            name: "Get_Into_Var",
            object: "Lead",
            storeOutputAutomatically: false,
            outputReference: "leadRecords",
            queriedFields: [{ name: "Company" }]
        }
    ],
    collectionProcessors: [
        { name: "Filtered_Contacts", collectionReference: "{!Get_Some_Contacts}" },
        { name: "Sorted_Filtered", collectionReference: "{!Filtered_Contacts}" }
    ]
};

describe("where the grid's records come from", () => {
    it("reads a reference with or without its {! } wrapper", () => {
        expect(referenceName("{!Get_Accounts}")).toBe("Get_Accounts");
        expect(referenceName("Get_Accounts")).toBe("Get_Accounts");
        expect(referenceName(null)).toBe("");
    });

    it("offers every field when the Get Records stores all of them", () => {
        expect(retrievedFields("{!Get_Accounts}", CONTEXT)).toEqual({
            sourceLabel: "Get Accounts",
            fields: null,
            fromGetRecords: true
        });
    });

    it("offers only the chosen fields, plus the Id every query returns", () => {
        expect(retrievedFields("{!Get_Some_Contacts}", CONTEXT).fields).toEqual(["Id", "Name", "Email"]);
    });

    it("follows the variable a Get Records stores into, and field objects", () => {
        expect(retrievedFields("{!leadRecords}", CONTEXT).fields).toEqual(["Id", "Company"]);
    });

    it("follows Filter and Sort back to the Get Records they started from", () => {
        const source = retrievedFields("{!Sorted_Filtered}", CONTEXT);
        expect(source.fields).toEqual(["Id", "Name", "Email"]);
        expect(source.sourceLabel).toBe("Get Some Contacts");
    });

    it("assumes every field for a source it cannot see into", () => {
        // A loop or a plain collection variable: restricting would hide fields
        // the records may well have.
        expect(retrievedFields("{!someCollection}", CONTEXT)).toEqual({
            sourceLabel: "someCollection",
            fields: null,
            fromGetRecords: false
        });
        expect(retrievedFields("{!Get_Accounts}", undefined).fields).toBeNull();
        expect(retrievedFields("", CONTEXT)).toEqual({ sourceLabel: "", fields: null, fromGetRecords: false });
    });

    it("does not loop forever on a Filter that points at itself", () => {
        const circular = { collectionProcessors: [{ name: "Loop", collectionReference: "{!Loop}" }] };
        expect(retrievedFields("{!Loop}", circular).fields).toBeNull();
    });
});
