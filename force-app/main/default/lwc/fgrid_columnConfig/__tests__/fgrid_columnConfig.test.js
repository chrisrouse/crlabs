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

/** Clicks a row's Settings button, which toggles its inline drawer. */
function openDrawer(element, field) {
    const buttons = [...element.shadowRoot.querySelectorAll(`lightning-button[data-field="${field}"]`)];
    // The drawer toggle is the row's own button; Reset this column lives
    // INSIDE the drawer and carries the same data-field.
    buttons[0].click();
}

/** A drawer control identified by its role rather than its position. */
function role(element, field, name) {
    return element.shadowRoot.querySelector(`[data-field="${field}"][data-role="${name}"]`);
}

const cellIn = (element, field) => role(element, field, "type");

/** Clicks the drawer button with a given label for a column. */
function clickButton(element, field, label) {
    const button = [...element.shadowRoot.querySelectorAll(`lightning-button[data-field="${field}"]`)].find(
        (candidate) => candidate.label === label
    );
    button.click();
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

    it("renders only a column count in compact mode", async () => {
        const element = build({ compact: true, columnConfig: '{"Name":{"width":200}}' });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("table")).toBeNull();
        expect(element.shadowRoot.textContent).toContain("columns");
        // Per-column detail is deliberately absent: listing every attribute grew a
        // full screen tall on a real grid and pushed the rest of the property panel
        // out of reach. The detail lives in the Studio's editable table.
        expect(element.shadowRoot.textContent).not.toContain("width: 200");
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
    it("opens and closes one column's drawer", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".drawer")).toBeNull();

        openDrawer(element, "Name");
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".drawer")).not.toBeNull();

        openDrawer(element, "Name");
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".drawer")).toBeNull();
    });

    it("keeps only one drawer open at a time", async () => {
        // Single panel by decision: two open drawers in a modal is more
        // scrolling than context.
        const element = build();
        await Promise.resolve();

        openDrawer(element, "Name");
        await Promise.resolve();
        openDrawer(element, "AnnualRevenue");
        await Promise.resolve();

        expect(element.shadowRoot.querySelectorAll(".drawer")).toHaveLength(1);
    });

    it("no longer offers the raw JSON boxes", async () => {
        // Removed 2026-09-26. Cell, type and other attributes were an API, not
        // a configuration surface. Everything they were used for now has a
        // control: formatting has the rule editor, icons have a picker, and
        // hideLabel has a checkbox.
        const element = build();
        await Promise.resolve();
        openDrawer(element, "Name");
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("lightning-textarea")).toBeNull();
    });
});

describe("the drawer is type-aware", () => {
    /** A grid whose Amount column the describe reports as a currency. */
    function buildTyped(config = null) {
        const element = build({ columnFields: '["Amount","Name"]', columnConfig: config });
        element.describeByPath = {
            Amount: { dataType: "currency", displayType: "CURRENCY", label: "Amount" },
            Name: { dataType: "text", displayType: "STRING", label: "Name" }
        };
        return element;
    }

    it("offers a currency field only the displays it can use", async () => {
        const element = buildTyped();
        await Promise.resolve();
        openDrawer(element, "Amount");
        await Promise.resolve();

        const values = cellIn(element, "Amount").options.map((option) => option.value);
        expect(values).toEqual(expect.arrayContaining(["currency", "number", "percent", "text"]));
        expect(values).not.toContain("boolean");
        expect(values).not.toContain("date");
    });

    it("shows decimals for a currency and hides them for text", async () => {
        const element = buildTyped();
        await Promise.resolve();

        openDrawer(element, "Amount");
        await Promise.resolve();
        expect(cell(element, "Amount", "minDecimals")).not.toBeNull();

        openDrawer(element, "Amount");
        await Promise.resolve();
        openDrawer(element, "Name");
        await Promise.resolve();
        expect(cell(element, "Name", "minDecimals")).toBeNull();
        expect(cell(element, "Name", "linkify")).not.toBeNull();
    });

    it("withholds the currency code until the org is multi-currency", async () => {
        // A code picker where there is only one currency configures nothing.
        const element = buildTyped();
        await Promise.resolve();
        openDrawer(element, "Amount");
        await Promise.resolve();
        expect(cell(element, "Amount", "currencyCode")).toBeNull();

        element.multiCurrency = true;
        element.currencyCodes = ["USD", "EUR"];
        await Promise.resolve();
        expect(cell(element, "Amount", "currencyCode")).not.toBeNull();
    });

    it("clears the number settings when the type stops being numeric", async () => {
        // A currency code left on a column now shown as text is inert, but it
        // reappears if the admin switches back and looks like a setting they
        // never made.
        const element = buildTyped('{"Amount":{"type":"currency","minDecimals":2,"currencyCode":"EUR"}}');
        await Promise.resolve();
        openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        cellIn(element, "Amount").dispatchEvent(new CustomEvent("change", { detail: { value: "text" } }));

        const saved = JSON.parse(emitted[0]).Amount;
        expect(saved.type).toBe("text");
        expect(saved.minDecimals).toBeUndefined();
        expect(saved.currencyCode).toBeUndefined();
    });
});

describe("badge is chosen from the type list", () => {
    function buildPicklist(config = null) {
        const element = build({ columnFields: '["Stage"]', columnConfig: config });
        element.describeByPath = { Stage: { dataType: "fgridPicklist", displayType: "PICKLIST" } };
        return element;
    }

    it("offers Badge beside Picklist rather than as a separate checkbox", async () => {
        const element = buildPicklist();
        await Promise.resolve();
        openDrawer(element, "Stage");
        await Promise.resolve();

        expect(cellIn(element, "Stage").options.map((option) => option.value)).toContain("badge");
        expect(cell(element, "Stage", "badge")).toBeNull();
    });

    it("stores Badge as the real type plus a flag", async () => {
        const element = buildPicklist();
        await Promise.resolve();
        openDrawer(element, "Stage");
        await Promise.resolve();
        const emitted = onChange(element);

        cellIn(element, "Stage").dispatchEvent(new CustomEvent("change", { detail: { value: "badge" } }));

        const saved = JSON.parse(emitted[0]).Stage;
        expect(saved.type).toBe("fgridPicklist");
        expect(saved.badge).toBe(true);
    });

    it("shows Badge as the selected display when the flag is stored", async () => {
        const element = buildPicklist('{"Stage":{"type":"fgridPicklist","badge":true}}');
        await Promise.resolve();
        openDrawer(element, "Stage");
        await Promise.resolve();

        expect(cellIn(element, "Stage").value).toBe("badge");
    });

    it("clears the flag when another display is chosen", async () => {
        const element = buildPicklist('{"Stage":{"type":"fgridPicklist","badge":true}}');
        await Promise.resolve();
        openDrawer(element, "Stage");
        await Promise.resolve();
        const emitted = onChange(element);

        cellIn(element, "Stage").dispatchEvent(new CustomEvent("change", { detail: { value: "text" } }));

        const saved = JSON.parse(emitted[0]).Stage;
        expect(saved.type).toBe("text");
        expect(saved.badge).toBeUndefined();
    });
});

describe("color mode and rules", () => {
    function buildRules(config = null) {
        const element = build({ columnFields: '["Amount","Status"]', columnConfig: config });
        element.describeByPath = { Amount: { dataType: "currency", displayType: "CURRENCY" } };
        return element;
    }

    const ruleConfig = JSON.stringify({
        Amount: { colorMode: "conditional", format: [{ style: "error", conditions: [{ field: "Amount" }] }] }
    });

    it("counts the rules in the grid without letting them be edited there", async () => {
        const element = buildRules(ruleConfig);
        await Promise.resolve();
        expect(element.shadowRoot.textContent).toContain("1 rule");
    });

    it("adds a rule, seeded with a condition on its own column", async () => {
        const element = buildRules('{"Amount":{"colorMode":"conditional"}}');
        await Promise.resolve();
        openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        clickButton(element, "Amount", "Add rule");

        const saved = JSON.parse(emitted[0]).Amount;
        expect(saved.format).toHaveLength(1);
        // Seeded against the column being formatted, which is the common case;
        // the field picker can still point it anywhere.
        expect(saved.format[0].conditions[0].field).toBe("Amount");
    });

    it("drops the rules when the mode leaves Conditional", async () => {
        // The two modes are exclusive, so leaving both stored would invite
        // "which one won".
        const element = buildRules(ruleConfig);
        await Promise.resolve();
        openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        role(element, "Amount", "color-mode").dispatchEvent(new CustomEvent("change", { detail: { value: "column" } }));

        const saved = JSON.parse(emitted[0]).Amount;
        expect(saved.format).toBeUndefined();
        expect(saved.colorMode).toBe("column");
    });

    it("drops the column style when the mode leaves Per column", async () => {
        const element = buildRules('{"Amount":{"colorMode":"column","columnStyle":"success"}}');
        await Promise.resolve();
        openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        role(element, "Amount", "color-mode").dispatchEvent(
            new CustomEvent("change", { detail: { value: "conditional" } })
        );

        expect(JSON.parse(emitted[0]).Amount.columnStyle).toBeUndefined();
    });
});
