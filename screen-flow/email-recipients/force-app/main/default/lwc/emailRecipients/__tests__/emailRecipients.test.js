import { createElement } from "lwc";
import EmailRecipients from "c/emailRecipients";

function build(props = {}) {
    const element = createElement("c-email-recipients", { is: EmailRecipients });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

function entryInput(element) {
    return element.shadowRoot.querySelector('[data-role="entry"]');
}

// The input's validity methods are spied on its class once, so every instance, including ones
// rendered before a test can reach them, reports what the component asked it to show.
const validity = {};

beforeAll(() => {
    const probe = build();
    const input = entryInput(probe);
    ["setCustomValidity", "reportValidity"].forEach((name) => {
        // Spy on the class that defines the method, so every instance that inherits it is covered.
        let owner = Object.getPrototypeOf(input);
        while (owner && !Object.prototype.hasOwnProperty.call(owner, name)) {
            owner = Object.getPrototypeOf(owner);
        }
        validity[name] = jest.spyOn(owner, name).mockImplementation(() => true);
    });
    document.body.removeChild(probe);
});

beforeEach(() => {
    validity.setCustomValidity.mockClear();
    validity.reportValidity.mockClear();
});

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

function type(element, text) {
    const input = entryInput(element);
    input.value = text;
    return input;
}

function press(element, key, text) {
    const input = type(element, text);
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    return input;
}

function pillContainer(element) {
    return element.shadowRoot.querySelector("lightning-pill-container");
}

function paste(element, text) {
    const event = new CustomEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
    entryInput(element).dispatchEvent(event);
    return event;
}

/** The message most recently shown on the input, or undefined when none has been shown. */
function shownMessage() {
    const calls = validity.setCustomValidity.mock.calls;
    return calls.length ? calls[calls.length - 1][0] : undefined;
}

describe("typed entry", () => {
    it("adds an address on Enter and clears the input", () => {
        const element = build();
        const input = press(element, "Enter", "ann@x.com");

        expect(element.emailList).toBe("ann@x.com");
        expect(element.emailCollection).toEqual(["ann@x.com"]);
        expect(pillContainer(element)).not.toBeNull();
        expect(input.value).toBe("");
    });

    it("adds an address on Space, without typing the space", () => {
        const element = build();
        const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
        type(element, "ann@x.com").dispatchEvent(event);

        expect(element.emailList).toBe("ann@x.com");
        expect(event.defaultPrevented).toBe(true);
    });

    it("leaves Tab to move focus, but still adds the address", () => {
        const element = build();
        const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
        type(element, "ann@x.com").dispatchEvent(event);

        expect(element.emailList).toBe("ann@x.com");
        expect(event.defaultPrevented).toBe(false);
    });

    it("adds the typed address when the field loses focus", () => {
        const element = build();
        type(element, "ann@x.com").dispatchEvent(new CustomEvent("blur"));

        expect(element.emailList).toBe("ann@x.com");
    });

    it("refuses a malformed address, keeps the text, and shows the format message", () => {
        const element = build();
        const input = press(element, "Enter", "not-an-email");

        expect(element.emailList).toBe("");
        expect(input.value).toBe("not-an-email");
        expect(shownMessage()).toBe("not-an-email: Not a valid email address.");
    });

    it("uses a custom invalid-email message in place of the default", () => {
        const element = build({ invalidEmailErrorMessage: "Check that address." });
        press(element, "Enter", "nope");

        expect(shownMessage()).toBe("nope: Check that address.");
    });

    it("clears a shown message as soon as the user types again", () => {
        const element = build();
        press(element, "Enter", "nope");
        validity.setCustomValidity.mockClear();

        entryInput(element).dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

        expect(validity.setCustomValidity).toHaveBeenCalledWith("");
    });

    it("does nothing when disabled", () => {
        const element = build({ disabled: true });
        const input = press(element, "Enter", "ann@x.com");

        expect(element.emailList).toBe("");
        expect(input.value).toBe("ann@x.com");
    });
});

describe("paste", () => {
    it("splits pasted addresses and adds each one", () => {
        const element = build();
        const event = paste(element, "ann@x.com, bob@x.com; Cy <cy@x.com>");

        expect(event.defaultPrevented).toBe(true);
        expect(element.emailList).toBe("ann@x.com,bob@x.com,cy@x.com");
    });

    it("lets ordinary text paste through unchanged", () => {
        const element = build();
        const event = paste(element, "just some words");

        expect(event.defaultPrevented).toBe(false);
        expect(element.emailList).toBe("");
    });

    it("reports duplicates and refusals from a single paste", () => {
        const element = build();
        press(element, "Enter", "ann@x.com");
        paste(element, "ann@x.com, bob@x.com, nope@");

        expect(element.emailList).toBe("ann@x.com,bob@x.com");
        expect(entryInput(element).value).toBe("ann@x.com, nope@");
        expect(shownMessage()).toBe("ann@x.com: This email has already been added. nope@: Not a valid email address.");
    });
});

describe("duplicates", () => {
    it("does not add the same address twice, whatever its case", () => {
        const element = build();
        press(element, "Enter", "Ann@X.com");
        press(element, "Enter", "ann@x.com");

        expect(element.emailCollection).toEqual(["Ann@X.com"]);
    });

    it("uses a custom duplicate message", () => {
        const element = build({ duplicateEmailErrorMessage: "Already on the list." });
        press(element, "Enter", "ann@x.com");
        press(element, "Enter", "ann@x.com");

        expect(shownMessage()).toBe("ann@x.com: Already on the list.");
    });
});

describe("limits and domains", () => {
    it("stops at the maximum and says how many were left out", () => {
        const element = build({ maxEmails: 2 });
        paste(element, "a@x.com, b@x.com, c@x.com");

        expect(element.emailCollection).toEqual(["a@x.com", "b@x.com"]);
        expect(shownMessage()).toBe("You can only add up to 2 email addresses. 1 was not added.");
    });

    it("uses a custom maximum message", () => {
        const element = build({ maxEmails: 1, maxEmailsErrorMessage: "Only one, please." });
        press(element, "Enter", "a@x.com");
        press(element, "Enter", "b@x.com");

        expect(shownMessage()).toBe("Only one, please.");
    });

    it("refuses domains outside the allowed list", () => {
        const element = build({ allowedDomains: "x.com" });
        press(element, "Enter", "ann@y.com");

        expect(element.emailList).toBe("");
        expect(shownMessage()).toBe("ann@y.com: This email domain is not in the allowed list.");
    });

    it("refuses blocked domains, including wildcard matches", () => {
        const element = build({ blockedDomains: "*.spam.net" });
        press(element, "Enter", "ann@mail.spam.net");

        expect(element.emailList).toBe("");
        expect(shownMessage()).toBe("ann@mail.spam.net: This email domain is not allowed.");
    });

    it("applies the rules to the initial values too", () => {
        const element = build({ value: ["ann@x.com", "ann@x.com", "bob@y.com"], allowedDomains: "x.com" });

        expect(element.emailCollection).toEqual(["ann@x.com"]);
    });
});

describe("initial values", () => {
    it("starts with the values from the flow", () => {
        const element = build({ value: ["ann@x.com", "bob@x.com"] });

        expect(element.emailList).toBe("ann@x.com,bob@x.com");
    });

    it("shows a message about refused initial values once rendered", () => {
        const element = build({ value: ["ann@x.com", "not-valid"] });

        expect(element.emailList).toBe("ann@x.com");
        expect(shownMessage()).toBe("not-valid: Not a valid email address.");
    });

    it("replaces the list when the flow sets the value later", () => {
        const element = build({ value: ["ann@x.com"] });
        element.value = ["bob@x.com"];

        expect(element.emailList).toBe("bob@x.com");
    });
});

describe("removing and clearing", () => {
    it("removes an address when its pill is removed", () => {
        // Keys are issued in order, so the first address seeded is email-1.
        const element = build({ value: ["ann@x.com", "bob@x.com"] });
        const item = { name: "email-1" };
        pillContainer(element).dispatchEvent(new CustomEvent("itemremove", { detail: { item } }));

        expect(element.emailCollection).toEqual(["bob@x.com"]);
    });

    it("clears every address through the public method", () => {
        const element = build({ value: ["ann@x.com"] });
        element.clearEmails();

        expect(element.emailCollection).toEqual([]);
    });

    it("replaces the list through the public method, applying the rules", () => {
        const element = build({ maxEmails: 1 });
        element.setEmails(["ann@x.com", "bob@x.com"]);

        expect(element.emailCollection).toEqual(["ann@x.com"]);
    });
});

describe("disabled", () => {
    it("shows the addresses as plain text, with no way to remove them", () => {
        const element = build({ value: ["ann@x.com"], disabled: true });

        expect(pillContainer(element)).toBeNull();
        expect(element.shadowRoot.querySelector("li").textContent).toBe("ann@x.com");
    });
});

describe("labels and help", () => {
    it("shows the help text beside the label", () => {
        const element = build({ label: "Recipients", helpText: "Separate with commas." });
        const help = element.shadowRoot.querySelector("lightning-helptext");

        expect(help.content).toBe("Separate with commas.");
        expect(element.shadowRoot.querySelector(".slds-form-element__label").textContent).toContain("Recipients");
    });

    it("marks the input required only while it is empty", async () => {
        const element = build({ required: true });
        expect(entryInput(element).required).toBe(true);

        press(element, "Enter", "ann@x.com");
        await Promise.resolve();
        expect(entryInput(element).required).toBe(false);
    });
});

describe("Flow validation", () => {
    it("reports a required field with no addresses", () => {
        const element = build({ required: true });
        const result = element.validate();

        expect(result).toEqual({ isValid: false, errorMessage: "Please enter at least one email address." });
        expect(element.checkValidity()).toBe(false);
    });

    it("passes a required field once it has an address", () => {
        const element = build({ required: true, value: ["ann@x.com"] });

        expect(element.validate()).toEqual({ isValid: true });
        expect(element.checkValidity()).toBe(true);
    });

    it("lets an optional, empty field through", () => {
        const element = build();

        expect(element.reportValidity()).toBe(true);
    });
});

describe("rejected entries", () => {
    it("keeps rejected addresses in the field, so the user can see and fix them", () => {
        const element = build();
        paste(element, "ann@x.com, bad@x, bob@x.com");

        expect(element.emailCollection).toEqual(["ann@x.com", "bob@x.com"]);
        expect(entryInput(element).value).toBe("bad@x");
    });

    it("clears the field when every entry was accepted", () => {
        const element = build();
        paste(element, "ann@x.com, bob@x.com");

        expect(entryInput(element).value).toBe("");
    });

    it("names only the first few rejected addresses, then says how many more there are", () => {
        const element = build();
        paste(element, "a@x, b@x, c@x, d@x, e@x, f@x, g@x");

        expect(shownMessage()).toContain("a@x: Not a valid email address.");
        expect(shownMessage()).toContain("and 2 more could not be added.");
    });
});
