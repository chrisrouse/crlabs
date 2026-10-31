import { LightningElement, api } from "lwc";
import { formatHex, hsvToRgb, parseHex, rgbToHsv } from "./colorMath";
import { PALETTE } from "./palette";

/** Where saved colors live. Shared by every picker in the browser, so a color saved once is offered everywhere. */
const SAVED_KEY = "crlabs.colorPicker.saved";
/** Saved colors fill one row beside the + button. Past that, the oldest drops off. */
const SAVED_LIMIT = 7;
/** Shown when the value is empty or not a hex color: the site's standard text color. */
const STARTING_COLOR = "#1a1b1e";
/** Swatches per palette row, which arrow up and down move by. */
const PALETTE_COLUMNS = 6;
const CHECKERBOARD =
  "repeating-conic-gradient(#d8d8d8 0 25%, #ffffff 0 50%) 50% / 8px 8px";

const Tab = Object.freeze({ SPECTRUM: "spectrum", PALETTE: "palette" });

/**
 * Builds a swatch background that shows transparency over a checkerboard.
 * @param {string} color Any CSS color.
 * @returns {string} The background declaration.
 */
function swatchBackground(color) {
  return `background: linear-gradient(${color}, ${color}), ${CHECKERBOARD}`;
}

/**
 * @returns {string[]} The saved colors, newest first. Empty when storage is unavailable.
 */
function readSaved() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter((color) => parseHex(color)).slice(0, SAVED_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/**
 * An inline color picker: a Spectrum tab (saturation and brightness square, hue and opacity
 * sliders, Hex, R, G, B and Opacity fields), a Palette tab with the SLDS 2 color families, and a
 * row of saved colors under both.
 *
 * Sends colorchange with `{ value }`, a lowercase "#rrggbb", or "#rrggbbaa" below full opacity.
 * It sends only when a drag or key press ends, because every sent value refreshes the Builder canvas.
 *
 * @example
 * <c-cr-color-picker label="Header Background" value={color} oncolorchange={handleColorChange}></c-cr-color-picker>
 */
export default class CrColorPicker extends LightningElement {
  /** Name of the color being picked, used to label the controls for assistive technology. */
  @api label = "Color";

  _activeTab = Tab.SPECTRUM;
  // The hue is kept on its own, so a gray or black color doesn't reset it to red.
  _hue = 0;
  _saturation = 0;
  _brightness = 0;
  _opacity = 100;
  _dragging;
  _keyChanged = false;
  _lastSent;
  _paletteFocus = 0;
  _saved = [];
  _value = "";

  /**
   * The color as hex. Setting it moves the controls, unless it is the value this picker just
   * sent: re-reading that would round the hue away.
   * @type {string}
   */
  @api
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = value || "";
    const color = parseHex(this._value) || parseHex(STARTING_COLOR);
    if (this._dragging || formatHex(color, color.a) === this._lastSent) {
      return;
    }
    this._lastSent = formatHex(color, color.a);
    this.applyColor(color);
  }

  connectedCallback() {
    this._saved = readSaved();
  }

  // ---- Tabs ----

  get isSpectrum() {
    return this._activeTab === Tab.SPECTRUM;
  }

  get isPalette() {
    return this._activeTab === Tab.PALETTE;
  }

  get spectrumTabClass() {
    return this.tabClass(Tab.SPECTRUM);
  }

  get paletteTabClass() {
    return this.tabClass(Tab.PALETTE);
  }

  get spectrumSelected() {
    return String(this.isSpectrum);
  }

  get paletteSelected() {
    return String(this.isPalette);
  }

  get spectrumTabIndex() {
    return this.isSpectrum ? "0" : "-1";
  }

  get paletteTabIndex() {
    return this.isPalette ? "0" : "-1";
  }

  tabClass(tab) {
    return `picker__tab${this._activeTab === tab ? " is-active" : ""}`;
  }

  handleTabClick(event) {
    this._activeTab = event.currentTarget.dataset.tab;
  }

  /**
   * Left and right arrows move between the tabs, as the tabs pattern expects.
   * @param {KeyboardEvent} event The key press on a tab.
   */
  handleTabKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    this._activeTab = this.isSpectrum ? Tab.PALETTE : Tab.SPECTRUM;
    this.template.querySelector(`[data-tab="${this._activeTab}"]`).focus();
  }

  // ---- Spectrum ----

  get rgb() {
    return hsvToRgb(this._hue, this._saturation, this._brightness);
  }

  get solidColor() {
    return formatHex(this.rgb);
  }

  get currentValue() {
    return formatHex(this.rgb, this._opacity);
  }

  get areaStyle() {
    return `background: linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, hsl(${this._hue} 100% 50%))`;
  }

  get areaThumbStyle() {
    return `left: ${this._saturation * 100}%; top: ${(1 - this._brightness) * 100}%; background: ${this.solidColor}`;
  }

  get areaValueNow() {
    return Math.round(this._saturation * 100);
  }

  get areaValueText() {
    return `Saturation ${Math.round(this._saturation * 100)}%, brightness ${Math.round(this._brightness * 100)}%`;
  }

  get areaLabel() {
    return `${this.label} saturation and brightness`;
  }

  get hueLabel() {
    return `${this.label} hue`;
  }

  get opacityLabel() {
    return `${this.label} opacity`;
  }

  get hueValue() {
    return Math.round(this._hue);
  }

  get hueValueText() {
    return `${this.hueValue} degrees`;
  }

  get hueThumbStyle() {
    return `left: ${(this._hue / 360) * 100}%; background: hsl(${this._hue} 100% 50%)`;
  }

  get opacity() {
    return Math.round(this._opacity);
  }

  get opacityText() {
    return `${this.opacity}%`;
  }

  get opacityTrackStyle() {
    return `--cr-picker-solid: ${this.solidColor}`;
  }

  get opacityThumbStyle() {
    return `left: ${this._opacity}%; background: ${this.solidColor}`;
  }

  get previewStyle() {
    return swatchBackground(this.currentValue);
  }

  get hexText() {
    return this.solidColor.slice(1).toUpperCase();
  }

  get red() {
    return this.rgb.r;
  }

  get green() {
    return this.rgb.g;
  }

  get blue() {
    return this.rgb.b;
  }

  /**
   * Starts a drag on the square or a slider and moves the color to the pointer.
   * @param {PointerEvent} event The press.
   */
  handlePointerDown(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus();
    this._dragging = event.currentTarget.dataset.control;
    this.moveTo(event);
  }

  handlePointerMove(event) {
    if (this._dragging === event.currentTarget.dataset.control) {
      this.moveTo(event);
    }
  }

  /**
   * Ends the drag and sends the color.
   */
  handlePointerUp() {
    if (this._dragging) {
      this._dragging = undefined;
      this.commit();
    }
  }

  /**
   * Moves the dragged control to the pointer.
   * @param {PointerEvent} event The press or move.
   */
  moveTo(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - box.left) / (box.width || 1));
    const y = clamp((event.clientY - box.top) / (box.height || 1));
    const control = event.currentTarget.dataset.control;
    if (control === "area") {
      this._saturation = x;
      this._brightness = 1 - y;
    } else if (control === "hue") {
      this._hue = x * 360;
    } else {
      this._opacity = Math.round(x * 100);
    }
  }

  /**
   * Arrow keys nudge the square or slider; Shift and Page Up/Down take bigger steps, Home and
   * End go to the ends. The color is sent when the key comes up.
   * @param {KeyboardEvent} event The key press.
   */
  handleSliderKeydown(event) {
    const control = event.currentTarget.dataset.control;
    const step = event.shiftKey ? 10 : 1;
    const moves = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowDown: [0, -step],
      ArrowUp: [0, step],
      PageDown: [0, -10],
      PageUp: [0, 10]
    };
    if (control !== "area" && (event.key === "Home" || event.key === "End")) {
      const end = event.key === "End";
      if (control === "hue") {
        this._hue = end ? 359 : 0;
      } else {
        this._opacity = end ? 100 : 0;
      }
    } else if (moves[event.key]) {
      const [across, up] = moves[event.key];
      if (control === "area") {
        this._saturation = clamp(this._saturation + across / 100);
        this._brightness = clamp(this._brightness + up / 100);
      } else if (control === "hue") {
        // A one-dimensional slider moves the same way for either arrow pair.
        this._hue = clamp(this._hue + across + up, 0, 359);
      } else {
        this._opacity = clamp(this._opacity + across + up, 0, 100);
      }
    } else {
      return;
    }
    event.preventDefault();
    this._keyChanged = true;
  }

  handleSliderKeyup() {
    if (this._keyChanged) {
      this._keyChanged = false;
      this.commit();
    }
  }

  /**
   * Applies a typed Hex, R, G, B or Opacity value, then rewrites the field in its tidy form,
   * which also puts back anything that wasn't valid.
   * @param {Event} event The change event from a field.
   */
  handleFieldChange(event) {
    const field = event.target.dataset.field;
    const text = event.target.value.trim();
    const number = parseInt(text, 10);
    if (field === "hex") {
      const color = parseHex(text);
      if (color) {
        // Typed hex sets the color, not its opacity, unless it carries one.
        this.applyColor({
          ...color,
          a: text.replace("#", "").length === 8 ? color.a : this._opacity
        });
      }
    } else if (field === "opacity") {
      if (!Number.isNaN(number)) {
        this._opacity = clamp(number, 0, 100);
      }
    } else if (!Number.isNaN(number)) {
      this.applyColor({
        ...this.rgb,
        [field]: clamp(number, 0, 255),
        a: this._opacity
      });
    }
    event.target.value = {
      hex: this.hexText,
      r: this.red,
      g: this.green,
      b: this.blue,
      opacity: this.opacityText
    }[field];
    this.commit();
  }

  // ---- Palette ----

  /**
   * @returns {object[]} The palette families, each with its swatches marked when they match the
   * current color. Only one swatch is a tab stop; arrow keys move between them.
   */
  get paletteFamilies() {
    const current = this.solidColor;
    let index = 0;
    return PALETTE.map((family) => ({
      name: family.name,
      label: family.label,
      headingId: `palette-${family.name}`,
      swatches: family.shades.map(([grade, hex]) => {
        const swatchIndex = index++;
        return {
          key: `${family.name}-${grade}`,
          hex,
          index: swatchIndex,
          label: `${family.label} ${grade}`,
          style: `background: ${hex}`,
          pressed: String(hex === current),
          tabIndex: swatchIndex === this._paletteFocus ? "0" : "-1"
        };
      })
    }));
  }

  handleSwatchClick(event) {
    this._paletteFocus = Number(event.currentTarget.dataset.index);
    // A palette color keeps the opacity already set.
    this.applyColor({
      ...parseHex(event.currentTarget.dataset.hex),
      a: this._opacity
    });
    this.commit();
  }

  /**
   * Arrow keys move through the palette: left and right by one, up and down by a row.
   * @param {KeyboardEvent} event The key press on a swatch.
   */
  handleSwatchKeydown(event) {
    const moves = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -PALETTE_COLUMNS,
      ArrowDown: PALETTE_COLUMNS
    };
    if (!moves[event.key]) {
      return;
    }
    event.preventDefault();
    const last = PALETTE.length * PALETTE_COLUMNS * 2 - 1;
    this._paletteFocus = clamp(
      Number(event.currentTarget.dataset.index) + moves[event.key],
      0,
      last
    );
    this.template
      .querySelector(`[data-index="${this._paletteFocus}"]`)
      ?.focus();
  }

  // ---- Saved ----

  get savedSwatches() {
    return this._saved.map((color) => ({
      key: color,
      color,
      label: `Use saved color ${color}`,
      style: swatchBackground(color)
    }));
  }

  get saveLabel() {
    return `Save ${this.currentValue}`;
  }

  handleSavedClick(event) {
    this.applyColor(parseHex(event.currentTarget.dataset.color));
    this.commit();
  }

  /**
   * Saves the current color at the front of the row. Saving it again moves it to the front.
   */
  handleSave() {
    const color = this.currentValue;
    this._saved = [
      color,
      ...this._saved.filter((saved) => saved !== color)
    ].slice(0, SAVED_LIMIT);
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(this._saved));
    } catch {
      // Storage can be off or full. The color stays saved until the panel closes.
    }
  }

  // ---- Shared ----

  /**
   * Moves the controls to a color. A gray or black color keeps the hue it had.
   * @param {{r: number, g: number, b: number, a: number}} color Channels 0 to 255, opacity 0 to 100.
   */
  applyColor(color) {
    const { h, s, v } = rgbToHsv(color);
    if (s > 0 && v > 0) {
      this._hue = h;
    }
    this._saturation = s;
    this._brightness = v;
    this._opacity = color.a ?? 100;
  }

  /**
   * Sends the color, unless it is the one sent last.
   */
  commit() {
    const value = this.currentValue;
    if (value === this._lastSent) {
      return;
    }
    this._lastSent = value;
    this._value = value;
    this.dispatchEvent(new CustomEvent("colorchange", { detail: { value } }));
  }
}

function clamp(number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, number));
}
