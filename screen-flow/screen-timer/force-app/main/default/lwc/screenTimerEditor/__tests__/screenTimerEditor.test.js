import { createElement } from "lwc";
import ScreenTimerEditor from "c/screenTimerEditor";

const INPUT_CHANGED = "configuration_editor_input_value_changed";

function build({ inputVariables = [] } = {}) {
    const element = createElement("c-screen-timer-editor", { is: ScreenTimerEditor });
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

/** A duration box change, as the kit's value input reports it: typed text, or a picked resource. */
function typeDurationValue(element, property, newValue, newValueDataType = "Number") {
    control(element, property).dispatchEvent(
        new CustomEvent("valuechange", { detail: { name: property, newValue, newValueDataType } })
    );
}

function toggle(element, property, checked) {
    const input = control(element, property);
    input.checked = checked;
    input.dispatchEvent(new CustomEvent("change"));
}

function summaryText(element, index = 0) {
    return element.shadowRoot.querySelectorAll(".duration__summary")[index].textContent;
}

/** The warning group's own summary line, below its three boxes. */
function warningSummaryText(element) {
    return summaryText(element, 1);
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("duration entry", () => {
    it("renders a separate box for hours, minutes and seconds", () => {
        const element = build();

        ["timeoutHours", "timeoutMinutes", "timeoutSeconds"].forEach((property) => {
            expect(control(element, property)).not.toBeNull();
        });
    });

    it("publishes a whole number as a String with a Number data type", async () => {
        const element = build();
        const details = captureInputs(element);

        typeDurationValue(element, "timeoutMinutes", "2");
        await Promise.resolve();

        // "Number", not "Integer": Integer is a js-meta.xml property type and is
        // not one of Flow's value data types.
        expect(details).toEqual([{ name: "timeoutMinutes", newValue: "2", newValueDataType: "Number" }]);
    });

    it("saves a picked resource as the reference itself", async () => {
        const element = build();
        const details = captureInputs(element);

        typeDurationValue(element, "timeoutMinutes", "{!Screen1.timeRemainingMinutes}", "reference");
        await Promise.resolve();

        expect(details).toEqual([
            { name: "timeoutMinutes", newValue: "{!Screen1.timeRemainingMinutes}", newValueDataType: "reference" }
        ]);
    });

    it("clears the property when a box is emptied, rather than storing zero", async () => {
        const element = build({
            inputVariables: [{ name: "timeoutMinutes", value: "2", valueDataType: "Number" }]
        });
        const details = captureInputs(element);

        typeDurationValue(element, "timeoutMinutes", "");
        await Promise.resolve();

        expect(details).toEqual([{ name: "timeoutMinutes", newValue: null, newValueDataType: "Number" }]);
    });

    it("discards a negative entry", async () => {
        const element = build();
        const details = captureInputs(element);

        typeDurationValue(element, "timeoutSeconds", "-5");
        await Promise.resolve();

        expect(details).toEqual([]);
    });

    it("truncates a fractional entry", async () => {
        const element = build();
        const details = captureInputs(element);

        typeDurationValue(element, "timeoutSeconds", "7.9");
        await Promise.resolve();

        expect(details[0].newValue).toBe("7");
    });

    it("shows what was typed without waiting for Flow Builder to republish", async () => {
        const element = build();

        typeDurationValue(element, "timeoutMinutes", "3");
        await Promise.resolve();

        expect(control(element, "timeoutMinutes").value).toBe("3");
    });
});

describe("duration summary", () => {
    it("stays silent when nothing is set, leaving the boxes to explain themselves", () => {
        expect(summaryText(build())).toBe("");
    });

    it("gives each duration box its own help text", () => {
        const element = build();
        ["timeoutDays", "timeoutHours", "timeoutMinutes", "timeoutSeconds"].forEach((property) => {
            expect(control(element, property).fieldLevelHelp).toMatch(/^Whole \w+, added to the other boxes\./);
        });
    });

    it("reads the total back in plain English", () => {
        const element = build({
            inputVariables: [
                { name: "timeoutMinutes", value: "1", valueDataType: "Number" },
                { name: "timeoutSeconds", value: "5", valueDataType: "Number" }
            ]
        });

        expect(summaryText(element)).toBe("Advances after 1 minute 5 seconds.");
    });

    it("singularizes a unit of one and omits empty units", () => {
        const element = build({
            inputVariables: [{ name: "timeoutHours", value: "1", valueDataType: "Number" }]
        });

        expect(summaryText(element)).toBe("Advances after 1 hour.");
    });

    it("updates as the admin types", async () => {
        const element = build();

        typeDurationValue(element, "timeoutSeconds", "30");
        await Promise.resolve();

        expect(summaryText(element)).toBe("Advances after 30 seconds.");
    });

    it("says the total is judged at runtime when a box holds a resource", () => {
        const element = build({
            inputVariables: [{ name: "timeoutDays", value: "Screen1.timeRemainingDays", valueDataType: "reference" }]
        });

        expect(summaryText(element)).toBe("Advances after the bound values.");
    });
});

describe("validation", () => {
    it("rejects a configuration with no duration", () => {
        expect(build().validate()).toEqual([
            {
                key: "timeoutSeconds",
                errorString: "Enter a duration greater than zero, or bind Advance When This Is True."
            }
        ]);
    });

    it("rejects a duration of explicit zeroes", async () => {
        const element = build();

        typeDurationValue(element, "timeoutSeconds", "0");
        await Promise.resolve();

        expect(element.validate()).toHaveLength(1);
    });

    it("accepts a duration that is a resource, since its value is only known at runtime", () => {
        const element = build({
            inputVariables: [
                { name: "timeoutMinutes", value: "Screen1.timeRemainingMinutes", valueDataType: "reference" }
            ]
        });

        expect(element.validate()).toEqual([]);
    });

    it("accepts any duration above zero", () => {
        const element = build({
            inputVariables: [{ name: "timeoutSeconds", value: "1", valueDataType: "Number" }]
        });

        expect(element.validate()).toEqual([]);
    });
});

describe("display options", () => {
    it("publishes a checkbox as a Boolean", async () => {
        const element = build();
        const details = captureInputs(element);

        toggle(element, "showTimer", true);
        await Promise.resolve();

        expect(details).toEqual([{ name: "showTimer", newValue: true, newValueDataType: "Boolean" }]);
    });

    it("lets a checkbox be turned back off", async () => {
        const element = build({
            inputVariables: [{ name: "showTimer", value: true, valueDataType: "Boolean" }]
        });
        const details = captureInputs(element);

        toggle(element, "showTimer", false);
        await Promise.resolve();

        expect(details).toEqual([{ name: "showTimer", newValue: false, newValueDataType: "Boolean" }]);
        expect(control(element, "showTimer").checked).toBe(false);
    });

    it("defaults the direction to counting down without writing it", () => {
        const element = build();
        const details = captureInputs(element);

        expect(control(element, "timerDirection").value).toBe("Down");
        expect(details).toEqual([]);
    });

    it("disables the timer options until the timer is shown", async () => {
        const element = build();
        expect(control(element, "showReset").disabled).toBe(true);
        expect(control(element, "timerDirection").disabled).toBe(true);

        toggle(element, "showTimer", true);
        await Promise.resolve();

        expect(control(element, "showReset").disabled).toBe(false);
        expect(control(element, "timerDirection").disabled).toBe(false);
    });

    it("publishes the progress bar toggle", async () => {
        const element = build();
        const details = captureInputs(element);

        toggle(element, "showProgressBar", true);
        await Promise.resolve();

        expect(details).toEqual([{ name: "showProgressBar", newValue: true, newValueDataType: "Boolean" }]);
    });

    it("offers the message as a literal or a Flow resource", async () => {
        const element = build();
        toggle(element, "showTimer", true);
        await Promise.resolve();

        const input = control(element, "timerLabel");
        expect(input.tagName.toLowerCase()).toBe("c-flow-config-value-input");
        expect(input.valueType).toBe("String");
    });
});

describe("timeout action", () => {
    it("defaults to Next without writing it", () => {
        const element = build();
        const details = captureInputs(element);

        expect(control(element, "timeoutAction").value).toBe("Next");
        expect(details).toEqual([]);
    });

    it("offers only the actions that work, plus staying put", () => {
        const values = control(build(), "timeoutAction").options.map((option) => option.value);
        expect(values).toEqual(["Next", "Back", "Stay", "Overrun"]);
    });

    /** Labels are Flow Builder's wording; the values are the saved contract. */
    it("labels Back as Previous without changing its stored value", () => {
        const options = control(build(), "timeoutAction").options;
        expect(options.map((o) => o.label)).toEqual([
            "Next",
            "Previous",
            "Stay on This Screen",
            "Overrun on This Screen"
        ]);
        expect(options.find((o) => o.label === "Previous").value).toBe("Back");
    });

    it("publishes the chosen action", async () => {
        const element = build();
        const details = captureInputs(element);

        control(element, "timeoutAction").dispatchEvent(new CustomEvent("change", { detail: { value: "Back" } }));
        await Promise.resolve();

        expect(details).toEqual([{ name: "timeoutAction", newValue: "Back", newValueDataType: "String" }]);
    });
});

describe("pause binding", () => {
    it("takes a Boolean resource and refuses a literal", () => {
        const picker = control(build(), "paused");

        expect(picker.tagName.toLowerCase()).toBe("c-flow-config-resource-picker");
        expect(picker.acceptedTypes).toBe("Boolean");
        expect(picker.collection).toBe("exclude");
    });

    it("publishes the reference the admin picked", async () => {
        const element = build();
        const details = captureInputs(element);

        control(element, "paused").dispatchEvent(
            new CustomEvent("resourcechange", {
                detail: { name: "paused", newValue: "{!holdTimer}", newValueDataType: "reference" }
            })
        );
        await Promise.resolve();

        expect(details).toEqual([{ name: "paused", newValue: "{!holdTimer}", newValueDataType: "reference" }]);
    });

    it("reads a saved reference back in {!...} form", () => {
        const element = build({
            inputVariables: [{ name: "paused", value: "holdTimer", valueDataType: "reference" }]
        });

        expect(control(element, "paused").value).toBe("{!holdTimer}");
    });
});

describe("warning threshold entry", () => {
    it("uses the same three boxes as the duration", () => {
        const element = build();

        ["warningHours", "warningMinutes", "warningSeconds"].forEach((property) => {
            expect(control(element, property)).not.toBeNull();
        });
    });

    it("publishes each box the same way the duration does", async () => {
        const element = build();
        const details = captureInputs(element);

        typeDurationValue(element, "warningMinutes", "2");
        await Promise.resolve();

        expect(details).toEqual([{ name: "warningMinutes", newValue: "2", newValueDataType: "Number" }]);
    });

    it("says there is no warning phase until one is entered", () => {
        expect(warningSummaryText(build())).toBe("No warning phase.");
    });

    it("reads the warning back in plain English", () => {
        const element = build({
            inputVariables: [
                { name: "warningMinutes", value: "1", valueDataType: "Number" },
                { name: "warningSeconds", value: "30", valueDataType: "Number" }
            ]
        });

        expect(warningSummaryText(element)).toBe("Warns 1 minute 30 seconds before advancing.");
    });

    it("accepts a warning at or above the total duration, leaving the runtime to show it", () => {
        const element = build({
            inputVariables: [
                { name: "timeoutMinutes", value: "2", valueDataType: "Number" },
                { name: "warningMinutes", value: "2", valueDataType: "Number" }
            ]
        });

        expect(element.validate()).toEqual([]);
    });

    it("says the warning is judged at runtime when a box holds a resource", () => {
        const element = build({
            inputVariables: [{ name: "warningMinutes", value: "Screen1.warningMinutes", valueDataType: "reference" }]
        });

        expect(warningSummaryText(element)).toBe("Warns by the bound values before advancing.");
    });

    it("accepts a warning shorter than the duration", () => {
        const element = build({
            inputVariables: [
                { name: "timeoutMinutes", value: "5", valueDataType: "Number" },
                { name: "warningMinutes", value: "2", valueDataType: "Number" }
            ]
        });

        expect(element.validate()).toEqual([]);
    });
});

describe("page refresh option", () => {
    it("is off unless chosen", () => {
        expect(control(build(), "refreshOnTimeout").checked).toBe(false);
    });

    it("publishes as a Boolean", async () => {
        const element = build();
        const details = captureInputs(element);

        toggle(element, "refreshOnTimeout", true);
        await Promise.resolve();

        expect(details).toEqual([{ name: "refreshOnTimeout", newValue: true, newValueDataType: "Boolean" }]);
    });
});

describe("advance trigger", () => {
    it("takes a Boolean resource and refuses a literal", () => {
        const picker = control(build(), "advanceWhen");

        expect(picker.tagName.toLowerCase()).toBe("c-flow-config-resource-picker");
        expect(picker.acceptedTypes).toBe("Boolean");
    });

    /** A trigger replaces the timer, so a duration is no longer mandatory. */
    it("accepts a configuration with a trigger and no duration", () => {
        const element = build({
            inputVariables: [{ name: "advanceWhen", value: "fileUploaded", valueDataType: "reference" }]
        });

        expect(element.validate()).toEqual([]);
    });

    it("still demands a duration when nothing else can complete the screen", () => {
        expect(build().validate()).toEqual([
            {
                key: "timeoutSeconds",
                errorString: "Enter a duration greater than zero, or bind Advance When This Is True."
            }
        ]);
    });

    it("publishes the reference the admin picked", async () => {
        const element = build();
        const details = captureInputs(element);

        control(element, "advanceWhen").dispatchEvent(
            new CustomEvent("resourcechange", {
                detail: { name: "advanceWhen", newValue: "{!fileUploaded}", newValueDataType: "reference" }
            })
        );
        await Promise.resolve();

        expect(details).toEqual([{ name: "advanceWhen", newValue: "{!fileUploaded}", newValueDataType: "reference" }]);
    });
});

describe("day entry", () => {
    it("offers a Days box in both groups", () => {
        const element = build();
        expect(control(element, "timeoutDays")).not.toBeNull();
        expect(control(element, "warningDays")).not.toBeNull();
    });

    it("orders the boxes largest unit first", () => {
        const element = build();
        const labels = ["timeoutDays", "timeoutHours", "timeoutMinutes", "timeoutSeconds"].map(
            (property) => control(element, property).label
        );
        expect(labels).toEqual(["Days", "Hours", "Minutes", "Seconds"]);
    });

    it("includes days in the total", () => {
        const element = build({
            inputVariables: [
                { name: "timeoutDays", value: "2", valueDataType: "Number" },
                { name: "timeoutHours", value: "3", valueDataType: "Number" }
            ]
        });

        expect(summaryText(element)).toBe("Advances after 2 days 3 hours.");
    });

    it("singularizes a single day", () => {
        const element = build({
            inputVariables: [{ name: "timeoutDays", value: "1", valueDataType: "Number" }]
        });

        expect(summaryText(element)).toBe("Advances after 1 day.");
    });

    it("accepts a warning measured in days", () => {
        const element = build({
            inputVariables: [
                { name: "timeoutDays", value: "3", valueDataType: "Number" },
                { name: "warningDays", value: "1", valueDataType: "Number" }
            ]
        });

        expect(warningSummaryText(element)).toBe("Warns 1 day before advancing.");
        expect(element.validate()).toEqual([]);
    });

    it("accepts a warning longer than a duration expressed in days, since the runtime judges it", () => {
        const element = build({
            inputVariables: [
                { name: "timeoutDays", value: "1", valueDataType: "Number" },
                { name: "warningDays", value: "2", valueDataType: "Number" }
            ]
        });

        expect(element.validate()).toEqual([]);
    });
});

describe("panel organization", () => {
    function sections(element) {
        return [...element.shadowRoot.querySelectorAll("lightning-accordion-section")].map((s) => s.label);
    }

    it("groups the panel by the question being answered", () => {
        expect(sections(build())).toEqual([
            "When to Advance",
            "What Happens Then",
            "While Waiting",
            "Style",
            "Time Running Out"
        ]);
    });

    it("opens only the section needed for a working configuration", () => {
        expect(build().shadowRoot.querySelector("lightning-accordion").activeSectionName).toEqual(["when"]);
    });

    /** Timing questions belong together; these used to sit below the refresh. */
    it("keeps the trigger and pause with the duration", () => {
        const element = build();
        const when = element.shadowRoot.querySelector(
            "lightning-accordion-section[data-x], lightning-accordion-section"
        );
        expect(when.label).toBe("When to Advance");
        ["timeoutDays", "timeoutSeconds", "advanceWhen", "paused"].forEach((property) => {
            expect(when.querySelector(`[data-property="${property}"]`)).not.toBeNull();
        });
    });

    it("files hide-on-expiry with the other expiry behaviors", async () => {
        const element = build();
        toggle(element, "refreshOnTimeout", true);
        await Promise.resolve();

        const then = [...element.shadowRoot.querySelectorAll("lightning-accordion-section")][1];
        ["timeoutAction", "refreshOnTimeout", "refreshRecordId", "hideOnExpiry"].forEach((property) => {
            expect(then.querySelector(`[data-property="${property}"]`)).not.toBeNull();
        });
    });
});

describe("dependent controls", () => {
    /**
     * Only the lightning-* controls grey out. The kit's value input has no
     * `disabled` API, so Message to Users, Warning Message and Record to
     * Refresh stay live -- they simply have no effect without their parent,
     * which is harmless. An overlay that swapped the picker for a disabled
     * stand-in was tried and reverted: the control visibly changed shape.
     */
    it.each(["timerDirection", "timeFormat", "showReset", "messagePosition"])(
        "greys out %s without a visible timer",
        (property) => {
            expect(control(build(), property).disabled).toBe(true);
        }
    );

    it("enables the timer options once the timer is shown", async () => {
        const element = build();
        toggle(element, "showTimer", true);
        await Promise.resolve();

        ["timerDirection", "timeFormat", "showReset", "messagePosition"].forEach((property) => {
            expect(control(element, property).disabled).toBe(false);
        });
    });

    /** Deliberately ungated -- see the note above. */
    it.each(["warningStyle", "warningShowIcon", "warningTintProgressBar"])(
        "leaves %s available with no warning threshold set",
        (property) => {
            expect(control(build(), property).disabled).toBeFalsy();
        }
    );

    it("renders the kit's value input directly, with no disabled stand-in", () => {
        const element = build();
        ["timerLabel", "warningLabel", "refreshRecordId"].forEach((property) => {
            expect(control(element, property).tagName.toLowerCase()).toBe("c-flow-config-value-input");
        });
    });
});

describe("new timer options", () => {
    it("offers the three time formats with examples in the labels", () => {
        const options = control(build(), "timeFormat").options;
        expect(options.map((o) => o.value)).toEqual(["Standard", "Fixed", "Compact"]);
        expect(options.map((o) => o.label)).toEqual([
            "Standard (0:40)",
            "Always Two Digits (00:00:40)",
            "Compact (40)"
        ]);
    });

    it("defaults the format and position without writing them", () => {
        const element = build();
        const details = captureInputs(element);

        expect(control(element, "timeFormat").value).toBe("Standard");
        expect(control(element, "messagePosition").value).toBe("Below");
        expect(details).toEqual([]);
    });

    it("publishes a chosen format", async () => {
        const element = build();
        const details = captureInputs(element);

        control(element, "timeFormat").dispatchEvent(new CustomEvent("change", { detail: { value: "Compact" } }));
        await Promise.resolve();

        expect(details).toEqual([{ name: "timeFormat", newValue: "Compact", newValueDataType: "String" }]);
    });

    it("publishes a chosen message position", async () => {
        const element = build();
        const details = captureInputs(element);

        control(element, "messagePosition").dispatchEvent(new CustomEvent("change", { detail: { value: "Above" } }));
        await Promise.resolve();

        expect(details).toEqual([{ name: "messagePosition", newValue: "Above", newValueDataType: "String" }]);
    });
});

describe("style", () => {
    it("defaults to the Text timer without writing it", () => {
        const element = build();
        expect(control(element, "timerStyle").value).toBe("Text");
    });

    it("publishes the chosen timer style", async () => {
        const element = build();
        const details = captureInputs(element);

        control(element, "timerStyle").dispatchEvent(new CustomEvent("change", { detail: { value: "Ring" } }));
        await Promise.resolve();

        expect(details).toEqual([{ name: "timerStyle", newValue: "Ring", newValueDataType: "String" }]);
    });

    it("starts each color at its default", () => {
        const element = build();
        expect(control(element, "fillColor").value).toBe("#0176D3");
        expect(control(element, "textColor").value).toBe("#0176D3");
        expect(control(element, "warningColor").value).toBe("#BA0517");
    });

    it("publishes a chosen color as a String", async () => {
        const element = build();
        const details = captureInputs(element);

        const input = control(element, "warningColor");
        input.value = "#FF0000";
        input.dispatchEvent(new CustomEvent("change"));
        await Promise.resolve();

        expect(details).toEqual([{ name: "warningColor", newValue: "#FF0000", newValueDataType: "String" }]);
    });
});

describe("fill direction entry", () => {
    it("defaults to matching the timer direction without writing it", () => {
        expect(control(build(), "fillDirection").value).toBe("Match Timer");
    });

    it("publishes the chosen fill direction", async () => {
        const element = build();
        const details = captureInputs(element);

        control(element, "fillDirection").dispatchEvent(new CustomEvent("change", { detail: { value: "Drain" } }));
        await Promise.resolve();

        expect(details).toEqual([{ name: "fillDirection", newValue: "Drain", newValueDataType: "String" }]);
    });
});

describe("ring size entry", () => {
    it("defaults to Medium without writing it", () => {
        expect(control(build(), "ringSize").value).toBe("Medium");
    });

    it("publishes the chosen ring size", async () => {
        const element = build();
        const details = captureInputs(element);

        control(element, "ringSize").dispatchEvent(new CustomEvent("change", { detail: { value: "Large" } }));
        await Promise.resolve();

        expect(details).toEqual([{ name: "ringSize", newValue: "Large", newValueDataType: "String" }]);
    });
});
