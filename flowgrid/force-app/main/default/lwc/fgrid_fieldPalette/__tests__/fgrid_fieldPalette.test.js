import { createElement } from "lwc";
import FgridFieldPalette from "c/fgrid_fieldPalette";
import { getObjectInfo } from "lightning/uiObjectInfoApi";

const ACCOUNT = {
    apiName: "Account",
    label: "Account",
    fields: {
        Id: { apiName: "Id", label: "Account ID", dataType: "String" },
        Name: { apiName: "Name", label: "Account Name", dataType: "String" },
        Industry: { apiName: "Industry", label: "Industry", dataType: "Picklist" },
        AnnualRevenue: { apiName: "AnnualRevenue", label: "Annual Revenue", dataType: "Currency" }
    }
};

const CONTEXT = {
    recordLookups: [
        { name: "Get_Accounts", label: "Get Accounts", object: "Account", storeOutputAutomatically: true },
        { name: "Get_Some", label: "Get Some", object: "Account", queriedFields: ["Name", "Industry"] }
    ]
};

function build(props = {}) {
    const element = createElement("c-fgrid-field-palette", { is: FgridFieldPalette });
    Object.assign(element, {
        objectApiName: "Account",
        recordsValue: "{!Get_Accounts}",
        builderContext: CONTEXT,
        columnFields: '["Name"]',
        ...props
    });
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT);
    return element;
}

const flush = () => Promise.resolve();
const rows = (element) => [...element.shadowRoot.querySelectorAll(".palette__row")];
const labels = (element) => rows(element).map((row) => row.querySelector(".palette__label").textContent);

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("c-fgrid_field-palette", () => {
    it("lists every field, by label, when the Get Records stores all of them", async () => {
        const element = build();
        await flush();
        expect(labels(element)).toEqual(["Account ID", "Account Name", "Annual Revenue", "Industry"]);
        expect(element.shadowRoot.querySelector(".palette__scope").textContent).toContain("Get Accounts");
        expect(element.shadowRoot.querySelector(".palette__scope").textContent).toContain("All fields");
    });

    it("lists only what a Get Records with chosen fields retrieves", async () => {
        const element = build({ recordsValue: "{!Get_Some}" });
        await flush();
        expect(labels(element)).toEqual(["Account ID", "Account Name", "Industry"]);
        expect(element.shadowRoot.querySelector(".palette__scope").textContent).toContain("3 fields retrieved");
    });

    it("warns about a column the Get Records does not retrieve", async () => {
        const element = build({ recordsValue: "{!Get_Some}", columnFields: '["Name","AnnualRevenue","Owner.Name"]' });
        await flush();
        const warning = element.shadowRoot.querySelector(".palette__warning");
        // A relationship path cannot be judged from the queried fields, so it is left alone.
        // A Get Records never returns parent fields, so Owner.Name is flagged too.
        expect(warning.textContent).toContain("2 columns are not retrieved by Get Some");
        expect(warning.textContent).toContain("AnnualRevenue, Owner.Name");
        expect(warning.textContent).toContain("will be empty");
    });

    it("flags a relationship column even when all fields are stored", async () => {
        const element = build({ columnFields: '["Name","Owner.Name"]' });
        await flush();
        expect(element.shadowRoot.querySelector(".palette__warning").textContent).toContain("Owner.Name");
    });

    it("judges nothing for records it cannot trace to a Get Records", async () => {
        // An Apex action's records may well carry parent fields.
        const element = build({ recordsValue: "{!fromApex}", columnFields: '["Name","Owner.Name"]' });
        await flush();
        expect(element.shadowRoot.querySelector(".palette__warning")).toBeNull();
    });

    it("carries the field when a row is dragged", async () => {
        const element = build();
        await flush();
        const data = {};
        const event = new CustomEvent("dragstart");
        event.dataTransfer = { setData: (type, value) => (data[type] = value), effectAllowed: "" };
        const row = rows(element).find((candidate) => candidate.dataset.field === "Industry");
        expect(row.getAttribute("draggable")).toBe("true");
        row.dispatchEvent(event);
        expect(data["application/x-fgrid-field"]).toBe("Industry");
    });

    it("marks the fields already in use", async () => {
        const element = build();
        await flush();
        const name = rows(element).find((row) => row.dataset.field === "Name");
        expect(name.getAttribute("aria-pressed")).toBe("true");
        expect(
            rows(element)
                .find((row) => row.dataset.field === "Industry")
                .getAttribute("aria-pressed")
        ).toBe("false");
    });

    it("adds a field to the end, and takes the last one away as null", async () => {
        const element = build();
        await flush();
        const emitted = [];
        element.addEventListener("columnfieldschange", (event) => emitted.push(event.detail.value));

        rows(element)
            .find((row) => row.dataset.field === "Industry")
            .click();
        rows(element)
            .find((row) => row.dataset.field === "Name")
            .click();
        expect(emitted).toEqual(['["Name","Industry"]', null]);
    });

    it("filters by label or API name", async () => {
        const element = build();
        await flush();
        const search = element.shadowRoot.querySelector("lightning-input");
        search.value = "revenue";
        search.dispatchEvent(new CustomEvent("change"));
        await flush();
        expect(labels(element)).toEqual(["Annual Revenue"]);
    });

    it("says where to start when there is no object yet", async () => {
        const element = build({ objectApiName: null });
        await flush();
        expect(rows(element)).toHaveLength(0);
        expect(element.shadowRoot.textContent).toContain("Choose a record collection on the Data tab");
    });
});
