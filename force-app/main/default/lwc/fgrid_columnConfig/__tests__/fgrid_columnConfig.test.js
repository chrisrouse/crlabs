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

/** The drilled-in column's way back to the list, when one is open. */
function backButton(element) {
    return [...element.shadowRoot.querySelectorAll("lightning-button")].find((b) => b.label === "All Columns");
}

/**
 * Opens a column's settings from the list, going back to the list first when
 * another column is open. Label, width, alignment and the flags live there
 * now, with everything the old drawer held.
 */
async function openDrawer(element, field) {
    const back = backButton(element);
    if (back) {
        back.click();
        await Promise.resolve();
    }
    element.shadowRoot.querySelector(`.colrow[data-field="${field}"]`).click();
    await Promise.resolve();
}

/** Opens a rule's card for editing; one rule edits at a time. */
async function openRule(element, index = 0) {
    const toggles = [...element.shadowRoot.querySelectorAll("lightning-button[data-rule-key]")];
    toggles[index].click();
    await Promise.resolve();
}

/** A drawer control identified by its role rather than its position. */
function role(element, field, name) {
    return element.shadowRoot.querySelector(`[data-field="${field}"][data-role="${name}"]`);
}

const cellIn = (element, field) => role(element, field, "type");

/** Currency's single Decimal places input, which carries no data-attribute. */
function decimalsInput(element, field) {
    return [...element.shadowRoot.querySelectorAll(`lightning-input[data-field="${field}"]`)].find(
        (input) => input.label === "Decimal places"
    );
}

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

        expect(element.shadowRoot.querySelectorAll(".colrow")).toHaveLength(2);
    });

    it("prompts for columns when none are selected", async () => {
        const element = build({ columnFields: null });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".colrow")).toBeNull();
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
        expect(element.shadowRoot.querySelectorAll(".colrow")).toHaveLength(1);
    });

    it("hydrates saved attributes into the controls", async () => {
        const element = build({ columnConfig: '{"Name":{"label":"Account","width":220,"wrap":true}}' });
        await Promise.resolve();
        await openDrawer(element, "Name");

        expect(cell(element, "Name", "label").value).toBe("Account");
        expect(cell(element, "Name", "width").value).toBe(220);
        expect(cell(element, "Name", "wrap").checked).toBe(true);
    });
});

describe("writing attributes", () => {
    it("emits JSON keyed by field API name", async () => {
        const element = build();
        await Promise.resolve();
        await openDrawer(element, "Name");
        const emitted = onChange(element);

        const input = cell(element, "Name", "label");
        input.value = "Account";
        input.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0])).toEqual({ Name: { label: "Account" } });
    });

    it("coerces a numeric attribute to a number, not a string", async () => {
        const element = build();
        await Promise.resolve();
        await openDrawer(element, "Name");
        const emitted = onChange(element);

        const input = cell(element, "Name", "width");
        input.value = "180";
        input.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0]).Name.width).toBe(180);
    });

    it("merges into existing attributes rather than replacing them", async () => {
        const element = build({ columnConfig: '{"Name":{"label":"Account"}}' });
        await Promise.resolve();
        await openDrawer(element, "Name");
        const emitted = onChange(element);

        const input = cell(element, "Name", "width");
        input.value = "180";
        input.dispatchEvent(new CustomEvent("change"));

        expect(JSON.parse(emitted[0]).Name).toEqual({ label: "Account", width: 180 });
    });

    it("drops an attribute when it is cleared, and the column when it empties", async () => {
        const element = build({ columnConfig: '{"Name":{"label":"Account"}}' });
        await Promise.resolve();
        await openDrawer(element, "Name");
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
        await openDrawer(element, "Name");
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
        await openDrawer(element, "Name");
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

        [...element.shadowRoot.querySelectorAll("lightning-button")]
            .find((button) => button.label === "Reset All Attributes")
            .click();

        expect(emitted[0]).toBeNull();
    });
});

describe("advanced attributes", () => {
    it("opens one column from the list, and goes back to the list", async () => {
        const element = build();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".detail")).toBeNull();

        await openDrawer(element, "Name");
        expect(element.shadowRoot.querySelector(".detail")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".colrow")).toBeNull();

        backButton(element).click();
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".detail")).toBeNull();
        expect(element.shadowRoot.querySelectorAll(".colrow")).toHaveLength(2);
    });

    it("steps to the next and previous column without going back", async () => {
        const element = build();
        await Promise.resolve();
        await openDrawer(element, "Name");
        const step = (direction) =>
            element.shadowRoot.querySelector(`lightning-button-icon[data-direction="${direction}"]`);

        // The first column has nowhere before it.
        expect(step("-1").disabled).toBe(true);
        step("1").click();
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".detail__field").textContent).toBe("AnnualRevenue");
        expect(step("1").disabled).toBe(true);
    });

    it("keeps only one drawer open at a time", async () => {
        // Single panel by decision: two open drawers in a modal is more
        // scrolling than context.
        const element = build();
        await Promise.resolve();

        await openDrawer(element, "Name");
        await Promise.resolve();
        await openDrawer(element, "AnnualRevenue");
        await Promise.resolve();

        expect(element.shadowRoot.querySelectorAll(".detail")).toHaveLength(1);
    });

    it("no longer offers the raw JSON boxes", async () => {
        // Removed 2026-09-26. Cell, type and other attributes were an API, not
        // a configuration surface. Everything they were used for now has a
        // control: formatting has the rule editor, icons have a picker, and
        // hideLabel has a checkbox.
        const element = build();
        await Promise.resolve();
        await openDrawer(element, "Name");
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

    it("offers a currency field only the display it can use", async () => {
        // Money shows as money. The alternatives all make the column worse.
        const element = buildTyped();
        await Promise.resolve();
        await openDrawer(element, "Amount");
        await Promise.resolve();

        expect(cellIn(element, "Amount").options.map((option) => option.value)).toEqual(["currency"]);
    });

    it("shows decimals for a currency and hides them for text", async () => {
        const element = buildTyped();
        await Promise.resolve();

        await openDrawer(element, "Amount");
        await Promise.resolve();
        expect(decimalsInput(element, "Amount")).not.toBeNull();

        await openDrawer(element, "Amount");
        await Promise.resolve();
        await openDrawer(element, "Name");
        await Promise.resolve();
        expect(decimalsInput(element, "Name")).toBeUndefined();
        expect(cell(element, "Name", "linkify")).not.toBeNull();
    });

    it("caps decimal places at what the field itself stores", async () => {
        // Showing more places than the field holds invents precision: a
        // 2-place field rendered to 5 reads $1.20000.
        const element = buildTyped();
        element.describeByPath = {
            Amount: { dataType: "currency", displayType: "CURRENCY", scale: 2 },
            Name: { dataType: "text", displayType: "STRING" }
        };
        await Promise.resolve();
        await openDrawer(element, "Amount");
        await Promise.resolve();

        const input = decimalsInput(element, "Amount");
        expect(input.max).toBe(2);
        expect(input.min).toBe("0");
    });

    it("clamps a typed value that ignores the cap", async () => {
        // min and max on the input are advisory; a pasted value still lands.
        const element = buildTyped();
        element.describeByPath = { Amount: { dataType: "currency", displayType: "CURRENCY", scale: 2 } };
        await Promise.resolve();
        await openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        const input = decimalsInput(element, "Amount");
        input.value = "9";
        input.dispatchEvent(new CustomEvent("change"));
        expect(JSON.parse(emitted[0]).Amount.maxDecimals).toBe(2);

        input.value = "-3";
        input.dispatchEvent(new CustomEvent("change"));
        expect(JSON.parse(emitted[1]).Amount.maxDecimals).toBe(0);
    });

    it("writes one value to both fraction bounds", async () => {
        // Equal bounds is what "always show N decimals" means: $1,234.50, not
        // $1,234.5.
        const element = buildTyped();
        await Promise.resolve();
        await openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        const input = decimalsInput(element, "Amount");
        input.value = "4";
        input.dispatchEvent(new CustomEvent("change"));

        const saved = JSON.parse(emitted[0]).Amount;
        expect(saved.minDecimals).toBe(4);
        expect(saved.maxDecimals).toBe(4);
    });

    it("withholds the currency code until the org is multi-currency", async () => {
        // A code picker where there is only one currency configures nothing.
        const element = buildTyped();
        await Promise.resolve();
        await openDrawer(element, "Amount");
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
        await openDrawer(element, "Amount");
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
        await openDrawer(element, "Stage");
        await Promise.resolve();

        expect(cellIn(element, "Stage").options.map((option) => option.value)).toContain("badge");
        expect(cell(element, "Stage", "badge")).toBeNull();
    });

    it("stores Badge as the real type plus a flag", async () => {
        const element = buildPicklist();
        await Promise.resolve();
        await openDrawer(element, "Stage");
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
        await openDrawer(element, "Stage");
        await Promise.resolve();

        expect(cellIn(element, "Stage").value).toBe("badge");
    });

    it("clears the flag when another display is chosen", async () => {
        const element = buildPicklist('{"Stage":{"type":"fgridPicklist","badge":true}}');
        await Promise.resolve();
        await openDrawer(element, "Stage");
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

    it("keeps rules out of the list and shows them in the column", async () => {
        // The list shows only the flags compared across columns, by decision.
        const element = buildRules(ruleConfig);
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".rule")).toBeNull();

        await openDrawer(element, "Amount");
        expect(element.shadowRoot.querySelectorAll(".rule")).toHaveLength(1);
    });

    it("adds a rule, seeded with a condition on its own column", async () => {
        const element = buildRules('{"Amount":{"colorMode":"conditional"}}');
        await Promise.resolve();
        await openDrawer(element, "Amount");
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
        await openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        role(element, "Amount", "color-mode").dispatchEvent(new CustomEvent("change", { detail: { value: "column" } }));

        const saved = JSON.parse(emitted[0]).Amount;
        expect(saved.format).toBeUndefined();
        expect(saved.colorMode).toBe("column");
    });

    it("drops the column color when the mode leaves Per column", async () => {
        const element = buildRules('{"Amount":{"colorMode":"column","columnColor":"#2e844a"}}');
        await Promise.resolve();
        await openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        role(element, "Amount", "color-mode").dispatchEvent(
            new CustomEvent("change", { detail: { value: "conditional" } })
        );

        expect(JSON.parse(emitted[0]).Amount.columnColor).toBeUndefined();
    });

    const picker = (element, field) => element.shadowRoot.querySelector(`c-fgrid_color-picker[data-field="${field}"]`);

    it("saves the per-column color the picker reports", async () => {
        const element = buildRules('{"Amount":{"colorMode":"column"}}');
        await Promise.resolve();
        await openDrawer(element, "Amount");
        await Promise.resolve();
        const emitted = onChange(element);

        picker(element, "Amount").dispatchEvent(new CustomEvent("colorchange", { detail: { value: "#ad1071" } }));

        expect(JSON.parse(emitted[0]).Amount.columnColor).toBe("#ad1071");
    });

    it("saves a rule's color, and rewrites an old named style as it does", async () => {
        const element = buildRules(ruleConfig);
        await Promise.resolve();
        await openDrawer(element, "Amount");
        await openRule(element);
        // The old "error" arrives already as its hex.
        expect(picker(element, "Amount").value).toBe("#fddde3");
        // The other half of the gauge test below: an ordinary column offers it.
        const labels = [...element.shadowRoot.querySelectorAll("lightning-input")].map((input) => input.label);
        expect(labels).toContain("Text only");
        const emitted = onChange(element);

        picker(element, "Amount").dispatchEvent(new CustomEvent("colorchange", { detail: { value: "#218638" } }));

        const [rule] = JSON.parse(emitted[0]).Amount.format;
        expect(rule.color).toBe("#218638");
        expect(rule.style).toBeUndefined();
    });

    it("edits one rule at a time, and opens a new rule for editing", async () => {
        const twoRules = JSON.stringify({
            Amount: {
                colorMode: "conditional",
                format: [
                    { color: "#ba0517", conditions: [{ field: "Amount" }] },
                    { color: "#2e844a", conditions: [{ field: "Amount" }] }
                ]
            }
        });
        const element = buildRules(twoRules);
        await Promise.resolve();
        await openDrawer(element, "Amount");
        expect(element.shadowRoot.querySelectorAll(".rule__body")).toHaveLength(0);

        await openRule(element, 0);
        await openRule(element, 1);
        expect(element.shadowRoot.querySelectorAll(".rule__body")).toHaveLength(1);
        const toggles = [...element.shadowRoot.querySelectorAll("lightning-button[data-rule-key]")];
        expect(toggles.map((toggle) => toggle.label)).toEqual(["Edit", "Done"]);
    });

    it("offers no Text only on a gauge, whose color is its fill", async () => {
        const element = build({
            columnFields: '["Complete"]',
            columnConfig: JSON.stringify({
                Complete: { type: "fgridProgressBar", colorMode: "conditional", format: [{ color: "#ba0517" }] }
            })
        });
        await Promise.resolve();
        await openDrawer(element, "Complete");
        await openRule(element);
        const labels = [...element.shadowRoot.querySelectorAll("lightning-input")].map((input) => input.label);
        expect(labels).not.toContain("Text only");
        expect(picker(element, "Complete")).not.toBeNull();
    });
});

describe("All Columns", () => {
    async function openMenu(element) {
        element.shadowRoot.querySelector(".bulk__button").click();
        await Promise.resolve();
    }
    const item = (element, flag) => element.shadowRoot.querySelector(`.bulk__item[data-flag="${flag}"]`);

    it("shows each flag as all, some or none, with a count", async () => {
        const element = build({ columnConfig: '{"Name":{"edit":true}}' });
        await Promise.resolve();
        await openMenu(element);

        expect(item(element, "edit").getAttribute("aria-checked")).toBe("mixed");
        expect(item(element, "edit").textContent).toContain("1/2");
        expect(item(element, "edit").title).toBe("Editable: Turn on for all columns. Currently on for 1 of 2.");
        expect(item(element, "filter").getAttribute("aria-checked")).toBe("false");
        // Sort and Wrap default on, so an untouched grid has them on everywhere.
        expect(item(element, "sort").getAttribute("aria-checked")).toBe("true");
        expect(item(element, "sort").title).toContain("Turn off for all columns");
    });

    it("turns a flag on for every column unless all have it", async () => {
        const element = build({ columnConfig: '{"Name":{"edit":true}}' });
        await Promise.resolve();
        await openMenu(element);
        const emitted = onChange(element);

        item(element, "edit").click();
        expect(JSON.parse(emitted[0])).toEqual({ Name: { edit: true }, AnnualRevenue: { edit: true } });
    });

    it("writes Sort and Wrap as the opt-out their checkboxes store", async () => {
        const element = build({ columnConfig: '{"Name":{"width":100}}' });
        await Promise.resolve();
        await openMenu(element);
        const emitted = onChange(element);

        item(element, "sort").click();
        expect(JSON.parse(emitted[0])).toEqual({ Name: { width: 100, sort: false }, AnnualRevenue: { sort: false } });
    });

    it("skips a gauge for Editable, and says so", async () => {
        const element = build({
            columnFields: '["Name","Complete"]',
            columnConfig: '{"Complete":{"type":"fgridProgressBar"}}'
        });
        await Promise.resolve();
        await openMenu(element);
        expect(item(element, "edit").textContent).toContain("0/1");
        expect(item(element, "edit").title).toContain("1 can't be edited");
        const emitted = onChange(element);

        item(element, "edit").click();
        const saved = JSON.parse(emitted[0]);
        expect(saved.Name.edit).toBe(true);
        expect(saved.Complete.edit).toBeUndefined();
    });

    it("closes on Escape", async () => {
        const element = build();
        await Promise.resolve();
        await openMenu(element);
        element.shadowRoot
            .querySelector(".bulk")
            .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".bulk__menu")).toBeNull();
    });
});

describe("the column list", () => {
    it("names a column's type even when its own options do not include it", async () => {
        // A picklist describe offers picklist displays; a column still shown as
        // text read "text", raw, in the list.
        const element = build({ columnFields: '["Industry"]' });
        element.describeByPath = { Industry: { dataType: "text", displayType: "PICKLIST", label: "Industry" } };
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".colrow__meta").textContent).toBe("Industry · Text");
    });
});

describe("reordering the column list", () => {
    const TYPE = "application/x-fgrid-field";
    const row = (element, field) => element.shadowRoot.querySelector(`.colrow[data-field="${field}"]`);

    function dragEvent(type, field, clientY = 0) {
        const event = new CustomEvent(type, { bubbles: true, cancelable: true });
        event.clientY = clientY;
        event.dataTransfer = { types: [TYPE], getData: () => field, setData: jest.fn(), dropEffect: "" };
        return event;
    }

    function order(emitted) {
        return JSON.parse(emitted[emitted.length - 1]);
    }

    function onFields(element) {
        const emitted = [];
        element.addEventListener("columnfieldschange", (event) => emitted.push(event.detail.value));
        return emitted;
    }

    it("moves a dragged row below the row it is dropped on the lower half of", async () => {
        const element = build({ columnFields: '["A","B","C"]' });
        await Promise.resolve();
        const emitted = onFields(element);
        const target = row(element, "C");
        target.getBoundingClientRect = () => ({ top: 0, height: 20 });

        target.dispatchEvent(dragEvent("dragover", "A", 15));
        await Promise.resolve();
        expect(row(element, "C").className).toContain("colrow_drop-after");
        target.dispatchEvent(dragEvent("drop", "A", 15));
        expect(order(emitted)).toEqual(["B", "C", "A"]);
    });

    it("inserts a field dragged in from elsewhere above the row on its upper half", async () => {
        const element = build({ columnFields: '["A","B"]' });
        await Promise.resolve();
        const emitted = onFields(element);
        const target = row(element, "B");
        target.getBoundingClientRect = () => ({ top: 0, height: 20 });

        target.dispatchEvent(dragEvent("dragover", "Z", 5));
        target.dispatchEvent(dragEvent("drop", "Z", 5));
        expect(order(emitted)).toEqual(["A", "Z", "B"]);
    });

    it("moves the focused row with Alt and an arrow key", async () => {
        const element = build({ columnFields: '["A","B","C"]' });
        await Promise.resolve();
        const emitted = onFields(element);

        row(element, "B").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }));
        expect(order(emitted)).toEqual(["B", "A", "C"]);
        // Nowhere to go past the ends, and a plain arrow does nothing.
        row(element, "A").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }));
        row(element, "A").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(emitted).toHaveLength(1);
    });
});

describe("hiding a column", () => {
    it("saves Hidden from the column's settings, and marks it in the list", async () => {
        const element = build({ columnConfig: '{"Name":{"hidden":true}}' });
        await Promise.resolve();
        expect(element.shadowRoot.querySelector('.colrow[data-field="Name"]').textContent).toContain("Hidden");
        expect(element.shadowRoot.querySelector('.colrow[data-field="AnnualRevenue"]').textContent).not.toContain(
            "Hidden"
        );

        await openDrawer(element, "AnnualRevenue");
        const emitted = onChange(element);
        const hidden = cell(element, "AnnualRevenue", "hidden");
        hidden.checked = true;
        hidden.dispatchEvent(new CustomEvent("change"));
        expect(JSON.parse(emitted[0]).AnnualRevenue).toEqual({ hidden: true });
    });
});
