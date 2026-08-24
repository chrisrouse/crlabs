import { createElement } from "lwc";
import FgridColumnConfig from "c/fgrid_columnConfig";

function build({ columnFields = '["Name","AnnualRevenue"]', columnConfig = null, compact = false } = {}) {
    const element = createElement("c-fgrid_column-config", { is: FgridColumnConfig });
    element.columnFields = columnFields;
    element.columnConfig = columnConfig;
    element.compact = compact;
    document.body.appendChild(element);
    return element;
}

/** Captures the single outbound event. */
function onChange(element) {
    const emitted = [];
    element.addEventListener("columnconfigchange", (e) => emitted.push(e.detail.value));
    return emitted;
}

function cell(element, field, attribute) {
    return element.shadowRoot.querySelector(`[data-field="${field}"][data-attribute="${attribute}"]`);
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("rendering", () => {
    it("renders one editable row per selected field", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelectorAll("tbody tr")).toHaveLength(2);
    });

    it("prompts for columns when none are selected", async () => {
        const element = build({ columnFields: null });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("tbody")).toBeNull();
        expect(element.shadowRoot.textContent).toContain("Select columns first");
    });

    it("renders a read-only summary in compact mode", async () => {
        const element = build({ compact: true, columnConfig: '{"Name":{"width":200}}' });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("table")).toBeNull();
        expect(element.shadowRoot.textContent).toContain("width: 200");
    });

    it("survives malformed JSON in either property", async () => {
        const element = build({ columnFields: "not json", columnConfig: "{broken" });
        await Promise.resolve();

        // A single bare field name is a legitimate value, so it renders one row.
        expect(element.shadowRoot.querySelectorAll("tbody tr")).toHaveLength(1);
    });

    it("hydrates saved attributes into the controls", async () => {
        const element = build({ columnConfig: '{"Name":{"label":"Account","width":220,"wrap":true}}' });
        await Promise.resolve();

        expect(cell(element, "Name", "label").value).toBe("Account");
        expect(cell(element, "Name", "width").value).toBe(220);
        expect(cell(element, "Name", "wrap").checked).toBe(true);
    });
});

describe("writing attributes", () => {
    it("emits JSON keyed by field API name", async () => {
        const element = build();
        await Promise.resolve();
        const emitted = onChange(element);

        const input = cell(element, "Name", "label");
        input.value = "Account";
        input.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0])).toEqual({ Name: { label: "Account" } });
    });

    it("coerces a numeric attribute to a number, not a string", async () => {
        const element = build();
        await Promise.resolve();
        const emitted = onChange(element);

        const input = cell(element, "Name", "width");
        input.value = "180";
        input.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0]).Name.width).toBe(180);
    });

    it("merges into existing attributes rather than replacing them", async () => {
        const element = build({ columnConfig: '{"Name":{"label":"Account"}}' });
        await Promise.resolve();
        const emitted = onChange(element);

        const input = cell(element, "Name", "width");
        input.value = "180";
        input.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0]).Name).toEqual({ label: "Account", width: 180 });
    });

    it("drops an attribute when it is cleared, and the column when it empties", async () => {
        const element = build({ columnConfig: '{"Name":{"label":"Account"}}' });
        await Promise.resolve();
        const emitted = onChange(element);

        const input = cell(element, "Name", "label");
        input.value = "";
        input.dispatchEvent(new CustomEvent("change"));

        // Nothing left to persist at all.
        expect(emitted[0]).toBeNull();
    });

    it("stores an unchecked flag as absent rather than false", async () => {
        const element = build({ columnConfig: '{"Name":{"edit":true,"width":100}}' });
        await Promise.resolve();
        const emitted = onChange(element);

        const input = cell(element, "Name", "edit");
        input.checked = false;
        input.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0]).Name).toEqual({ width: 100 });
    });

    it("prunes attributes for fields that are no longer selected", async () => {
        const element = build({
            columnFields: '["Name"]',
            columnConfig: '{"Name":{"width":100},"Industry":{"width":50}}'
        });
        await Promise.resolve();
        const emitted = onChange(element);

        const input = cell(element, "Name", "width");
        input.value = "120";
        input.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0])).toEqual({ Name: { width: 120 } });
    });

    it("clears every attribute on reset all", async () => {
        const element = build({ columnConfig: '{"Name":{"width":100}}' });
        await Promise.resolve();
        const emitted = onChange(element);

        element.shadowRoot.querySelector(".grid__toolbar lightning-button").click();

        expect(emitted[0]).toBeNull();
    });
});

describe("advanced attributes", () => {
    it("expands and collapses the advanced block for one column", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".grid__advanced")).toBeNull();

        element.shadowRoot.querySelector('.grid__cell-actions lightning-button[data-field="Name"]').click();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".grid__advanced")).not.toBeNull();
    });

    it("parses a valid JSON blob into an object", async () => {
        const element = build();
        await Promise.resolve();
        element.shadowRoot.querySelector('.grid__cell-actions lightning-button[data-field="Name"]').click();
        await Promise.resolve();
        const emitted = onChange(element);

        const textarea = cell(element, "Name", "typeAttribs");
        textarea.value = '{"currencyCode":"EUR"}';
        textarea.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0]).Name.typeAttribs).toEqual({ currencyCode: "EUR" });
    });

    it("reports invalid JSON without emitting a change", async () => {
        const element = build();
        await Promise.resolve();
        element.shadowRoot.querySelector('.grid__cell-actions lightning-button[data-field="Name"]').click();
        await Promise.resolve();
        const emitted = onChange(element);

        const textarea = cell(element, "Name", "typeAttribs");
        textarea.setCustomValidity = jest.fn();
        textarea.reportValidity = jest.fn();
        textarea.value = "{broken";
        textarea.dispatchEvent(new CustomEvent("change"));

        expect(textarea.setCustomValidity).toHaveBeenCalledWith("Not valid JSON.");
        expect(emitted).toHaveLength(0);
    });
});
