import { createElement } from "lwc";
import CrColorPicker from "c/crColorPicker";
import { formatHex, hsvToRgb, parseHex, rgbToHsv } from "../colorMath";

const SAVED_KEY = "crlabs.colorPicker.saved";

describe("colorMath", () => {
  it("reads 3, 6 and 8 digit hex, with or without #", () => {
    expect(parseHex("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 100 });
    expect(parseHex("0B5CAB")).toEqual({ r: 11, g: 92, b: 171, a: 100 });
    expect(parseHex("#0b5cab80")).toEqual({ r: 11, g: 92, b: 171, a: 50 });
    expect(parseHex("blue")).toBeNull();
  });

  it("writes 6-digit hex at full opacity and 8-digit below it, as crColorRow does", () => {
    expect(formatHex({ r: 11, g: 92, b: 171 })).toBe("#0b5cab");
    expect(formatHex({ r: 11, g: 92, b: 171 }, 50)).toBe("#0b5cab80");
    expect(formatHex({ r: 11, g: 92, b: 171 }, 0)).toBe("#0b5cab00");
  });

  it("round-trips through HSV", () => {
    const rgb = { r: 11, g: 92, b: 171 };
    const { h, s, v } = rgbToHsv(rgb);
    expect(hsvToRgb(h, s, v)).toEqual(rgb);
  });
});

describe("c-cr-color-picker", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    window.localStorage.clear();
  });

  const render = (value = "#0b5cab") => {
    const element = createElement("c-cr-color-picker", { is: CrColorPicker });
    element.label = "Header Background";
    element.value = value;
    document.body.appendChild(element);
    const sent = [];
    element.addEventListener("colorchange", (event) =>
      sent.push(event.detail.value)
    );
    return { element, sent };
  };
  const $ = (element, selector) => element.shadowRoot.querySelector(selector);
  const field = (element, name) => $(element, `[data-field="${name}"]`);
  const key = (target, type, keyName, options = {}) =>
    target.dispatchEvent(
      new KeyboardEvent(type, { key: keyName, bubbles: true, ...options })
    );

  it("opens on Spectrum with the value in the fields", () => {
    const { element } = render("#0b5cab80");

    expect(
      $(element, '[data-tab="spectrum"]').getAttribute("aria-selected")
    ).toBe("true");
    expect(field(element, "hex").value).toBe("0B5CAB");
    expect(field(element, "r").value).toBe("11");
    expect(field(element, "g").value).toBe("92");
    expect(field(element, "b").value).toBe("171");
    expect(field(element, "opacity").value).toBe("50%");
  });

  it("sends a key-driven change only when the key comes up", async () => {
    const { element, sent } = render("#0b5cab");
    const hue = $(element, '[data-control="hue"]');

    key(hue, "keydown", "ArrowRight");
    key(hue, "keydown", "ArrowRight");
    await Promise.resolve();
    expect(sent).toEqual([]);

    key(hue, "keyup", "ArrowRight");
    expect(sent).toHaveLength(1);
    expect(hue.getAttribute("aria-valuenow")).toBe(
      String(Math.round(rgbToHsv(parseHex("#0b5cab")).h + 2))
    );
  });

  it("sends opacity as 8-digit hex", () => {
    const { element, sent } = render("#0b5cab");
    const opacity = $(element, '[data-control="opacity"]');

    key(opacity, "keydown", "PageDown");
    key(opacity, "keyup", "PageDown");

    expect(sent).toEqual(["#0b5cabe6"]);
  });

  it("sends a drag only on release", () => {
    const { element, sent } = render("#0b5cab");
    const area = $(element, '[data-control="area"]');
    area.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100
    });
    const pointer = (type, x, y) =>
      area.dispatchEvent(
        new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })
      );

    pointer("pointerdown", 100, 0);
    pointer("pointermove", 50, 50);
    expect(sent).toEqual([]);

    pointer("pointerup", 50, 50);
    expect(sent).toHaveLength(1);
    expect(parseHex(sent[0])).toEqual(expect.objectContaining({ a: 100 }));
  });

  it("keeps the hue when the color goes gray", async () => {
    const { element } = render("#0b5cab");
    const hueBefore = $(element, '[data-control="hue"]').getAttribute(
      "aria-valuenow"
    );

    element.value = "#808080";
    await Promise.resolve();

    expect(
      $(element, '[data-control="hue"]').getAttribute("aria-valuenow")
    ).toBe(hueBefore);
  });

  it("takes a typed hex and tidies the field", async () => {
    const { element, sent } = render("#0b5cab80");
    const hex = field(element, "hex");

    hex.value = "#e3066a";
    hex.dispatchEvent(new CustomEvent("change"));
    await Promise.resolve();

    expect(sent).toEqual(["#e3066a80"]);
    expect(hex.value).toBe("E3066A");
  });

  it("puts back a field that isn't valid", () => {
    const { element, sent } = render("#0b5cab");
    const red = field(element, "r");

    red.value = "lots";
    red.dispatchEvent(new CustomEvent("change"));

    expect(sent).toEqual([]);
    expect(red.value).toBe("11");
  });

  it("picks a palette color, keeps the opacity, and marks the match", async () => {
    const { element, sent } = render("#00000080");
    $(element, '[data-tab="palette"]').click();
    await Promise.resolve();

    $(element, '[data-hex="#0176d3"]').click();
    await Promise.resolve();

    expect(sent).toEqual(["#0176d380"]);
    expect(
      $(element, '[data-hex="#0176d3"]').getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("moves through the palette with arrow keys, one tab stop at a time", async () => {
    const { element } = render();
    $(element, '[data-tab="palette"]').click();
    await Promise.resolve();

    const swatches = element.shadowRoot.querySelectorAll(
      ".picker__palette .picker__swatch"
    );
    expect(swatches).toHaveLength(156);
    expect(
      [...swatches].filter((swatch) => swatch.tabIndex === 0)
    ).toHaveLength(1);

    key(swatches[0], "keydown", "ArrowDown");
    await Promise.resolve();
    expect(element.shadowRoot.activeElement.dataset.index).toBe("6");
  });

  it("saves the current color, newest first, in local storage", async () => {
    const { element } = render("#0b5cab");

    $(element, ".picker__swatch_add").click();
    element.value = "#e3066a";
    await Promise.resolve();
    $(element, ".picker__swatch_add").click();
    await Promise.resolve();

    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY))).toEqual([
      "#e3066a",
      "#0b5cab"
    ]);
    const saved = element.shadowRoot.querySelectorAll(
      ".picker__saved [data-color]"
    );
    expect([...saved].map((swatch) => swatch.dataset.color)).toEqual([
      "#e3066a",
      "#0b5cab"
    ]);
  });

  it("drops the oldest saved color past seven", () => {
    window.localStorage.setItem(
      SAVED_KEY,
      JSON.stringify([
        "#000001",
        "#000002",
        "#000003",
        "#000004",
        "#000005",
        "#000006",
        "#000007"
      ])
    );
    const { element } = render("#0b5cab");

    $(element, ".picker__swatch_add").click();

    const stored = JSON.parse(window.localStorage.getItem(SAVED_KEY));
    expect(stored).toHaveLength(7);
    expect(stored[0]).toBe("#0b5cab");
    expect(stored).not.toContain("#000007");
  });

  it("uses a saved color, opacity included", () => {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(["#2e844a80"]));
    const { element, sent } = render("#0b5cab");

    $(element, '[data-color="#2e844a80"]').click();

    expect(sent).toEqual(["#2e844a80"]);
  });

  it("switches tabs with the arrow keys", async () => {
    const { element } = render();

    key($(element, '[data-tab="spectrum"]'), "keydown", "ArrowRight");
    await Promise.resolve();

    expect(
      $(element, '[data-tab="palette"]').getAttribute("aria-selected")
    ).toBe("true");
    expect($(element, ".picker__palette")).not.toBeNull();
  });
});
