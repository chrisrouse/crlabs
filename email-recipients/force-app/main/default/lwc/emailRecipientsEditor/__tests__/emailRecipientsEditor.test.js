import { createElement } from "lwc";
import EmailRecipientsEditor from "c/emailRecipientsEditor";

const INPUT_CHANGED = "configuration_editor_input_value_changed";

function build({ inputVariables = [] } = {}) {
    const element = createElement("c-email-recipients-editor", { is: EmailRecipientsEditor });
    element.builderContext = { variables: [] };
    element.inputVariables = inputVariables;
    document.body.appendChild(element);
    return element;
}

function captureInputs(element) {
    const details = [];
    element.addEventListener(INPUT_CHANGED, (event) => details.push(event.detail));
    return details;
}

function control(element, property) {
    return element.shadowRoot.querySelector(`[data-property="${property}"]`);
}

/** A value input reports typed text or a picked value, as the kit\x27s value input does. */
function changeValue(element, property, newValue, newValueDataType = "String") {
    control(element, property).dispatchEvent(
        new CustomEvent("valuechange", { detail: { name: property, newValue, newValueDataType } })
    );
}

/** A resource picker reports the reference the admin picked. */
function pickResource(element, property, newValue) {
    control(element, property).dispatchEvent(
        new CustomEvent("resourcechange", { detail: { name: property, newValue, newValueDataType: "reference" } })
    );
}

function changeNumber(element, property, value) {
    const input = control(element, property);
    input.value = value;
    input.dispatchEvent(new CustomEvent("change"));
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("field settings", () => {
    it("publishes a label as a String", async () => {
        const element = build();
        const details = captureInputs(element);

        changeValue(element, "label", "Recipients");
        await Promise.resolve();

        expect(details).toEqual([{ name: "label", newValue: "Recipients", newValueDataType: "String" }]);
    });

    it("saves required and disabled as references, so a formula or field can drive them", async () => {
        const element = build();
        const details = captureInputs(element);

        pickResource(element, "required", "{!IsRequired}");
        pickResource(element, "disabled", "{!IsLocked}");
        await Promise.resolve();

        expect(details).toEqual([
            { name: "required", newValue: "{!IsRequired}", newValueDataType: "reference" },
            { name: "disabled", newValue: "{!IsLocked}", newValueDataType: "reference" }
        ]);
    });

    it("reads a saved label back, so the panel shows what the flow holds", () => {
        const element = build({ inputVariables: [{ name: "label", value: "Cc list", valueDataType: "String" }] });

        expect(control(element, "label").value).toBe("Cc list");
    });
});

describe("address rules", () => {
    it("publishes a whole maximum as a Number", async () => {
        const element = build();
        const details = captureInputs(element);

        changeNumber(element, "maxEmails", "25");
        await Promise.resolve();

        expect(details).toEqual([{ name: "maxEmails", newValue: "25", newValueDataType: "Number" }]);
    });

    it("clears the maximum when the box is emptied, so the component uses its default", async () => {
        const element = build({ inputVariables: [{ name: "maxEmails", value: "25", valueDataType: "Number" }] });
        const details = captureInputs(element);

        changeNumber(element, "maxEmails", "");
        await Promise.resolve();

        expect(details).toEqual([{ name: "maxEmails", newValue: null, newValueDataType: "Number" }]);
    });

    it("refuses a maximum above the absolute limit", async () => {
        const element = build();
        const details = captureInputs(element);

        changeNumber(element, "maxEmails", "200");
        await Promise.resolve();

        expect(details).toEqual([]);
    });

    it("refuses a fractional or negative maximum", async () => {
        const element = build();
        const details = captureInputs(element);

        changeNumber(element, "maxEmails", "2.5");
        changeNumber(element, "maxEmails", "-1");
        await Promise.resolve();

        expect(details).toEqual([]);
    });

    it("publishes allowed and blocked domains as Strings", async () => {
        const element = build();
        const details = captureInputs(element);

        changeValue(element, "allowedDomains", "*.edu, example.com");
        changeValue(element, "blockedDomains", "*.spam.net");
        await Promise.resolve();

        expect(details).toEqual([
            { name: "allowedDomains", newValue: "*.edu, example.com", newValueDataType: "String" },
            { name: "blockedDomains", newValue: "*.spam.net", newValueDataType: "String" }
        ]);
    });
});

describe("messages", () => {
    it("publishes a custom message in place of the default", async () => {
        const element = build();
        const details = captureInputs(element);

        changeValue(element, "duplicateEmailErrorMessage", "Already on the list.");
        await Promise.resolve();

        expect(details).toEqual([
            { name: "duplicateEmailErrorMessage", newValue: "Already on the list.", newValueDataType: "String" }
        ]);
    });
});

describe("initial emails", () => {
    it("saves a picked collection as a reference, not a literal", async () => {
        const element = build();
        const details = captureInputs(element);

        pickResource(element, "value", "{!EmailList}");
        await Promise.resolve();

        expect(details).toEqual([{ name: "value", newValue: "{!EmailList}", newValueDataType: "reference" }]);
    });
});

describe("validation", () => {
    it("passes a configuration with nothing set", () => {
        expect(build().validate()).toEqual([]);
    });

    it("reports a maximum outside the allowed range", () => {
        const element = build({ inputVariables: [{ name: "maxEmails", value: "999", valueDataType: "Number" }] });

        expect(element.validate()).toEqual([
            { key: "maxEmails", errorString: "Maximum emails must be a whole number from 0 to 150." }
        ]);
    });
});
