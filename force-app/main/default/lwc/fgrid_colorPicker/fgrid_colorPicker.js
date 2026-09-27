/**
 * Color control for every color setting in the column panel.
 *
 * The SLDS Color Picker blueprint, rendered in our own markup:
 * https://www.lightningdesignsystem.com/2e1ef8501/p/67c0e9-color-picker
 * A swatch button and a hex field, and a popover with a Default tab of preset
 * swatches and a Custom tab of saturation/brightness range, hue slider and
 * Hex/R/G/B inputs. Cancel discards, Done commits.
 *
 * NOT lightning-input type="color". Its Default tab is commented out in the
 * shipped component ("Remove until raptor tabset is supported") and it takes
 * no palette, so it cannot show presets inside its own popover, which is the
 * whole point here. Measured in repro/datatable-custom-color/.
 *
 * The selector opens INLINE, in the page flow under the swatch, rather than
 * floating. A floating version was built and failed twice in the org where
 * it passed in Jest: `position: fixed` lands relative to the Studio modal,
 * which has a transform, and the outside-click test misread every press.
 * lightning-input avoids both with the private lightning/positionLibrary,
 * which we cannot import. Inline cannot detach, drift or clip, and matches the
 * icon picker's Browse panel in the same drawer.
 *
 * Only an invalid hex is flagged. Whether a color reads well on the grid is
 * the admin's call, by decision.
 *
 * Emits `colorchange` with `detail.value` as `#rrggbb`, lower case.
 */
import { LightningElement, api } from "lwc";
import { normalizeHex } from "c/fgrid_formatRules";

/**
 * The blueprint's Default tab, in its order: four rows of seven, light to
 * dark. `#5ebbff` appears twice in the blueprint and is kept twice, so the rows
 * line up by hue as they do there.
 */
const SWATCHES = [
    "#e3abec",
    "#c2dbf7",
    "#9fd6ff",
    "#9de7da",
    "#9df0c0",
    "#fff099",
    "#fed49a",
    "#d073e0",
    "#86baf3",
    "#5ebbff",
    "#44d8be",
    "#3be282",
    "#ffe654",
    "#ffb758",
    "#bd35bd",
    "#5779c1",
    "#5ebbff",
    "#00aea9",
    "#3cba4c",
    "#f5bc25",
    "#f99221",
    "#580d8c",
    "#001970",
    "#0a2399",
    "#0b7477",
    "#0b6b50",
    "#b67e11",
    "#b85d0d"
];

/** Swatches per row, which Up and Down move by. */
const PER_ROW = 7;

/** What the popover starts on when nothing is set: the blueprint's own. */
const FALLBACK_COLOR = "#5679c0";

/** The SLDS guidance's own wording for a bad value. */
const INVALID_MESSAGE = "Invalid color code. Please enter a hex code like #FFFFFF.";

const TABS = { DEFAULT: "default", CUSTOM: "custom" };

export default class FgridColorPicker extends LightningElement {
    @api label;
    @api fieldLevelHelp;

    @api
    get value() {
        return this._value;
    }
    set value(next) {
        this._value = normalizeHex(next) || "";
        this.summaryText = this._value;
        this.summaryError = "";
    }

    _value = "";

    /** What the summary field shows, which may be a half-typed value. */
    summaryText = "";
    summaryError = "";

    isOpen = false;
    activeTab = TABS.DEFAULT;

    /** The color being chosen in the popover, committed only by Done. */
    draft = FALLBACK_COLOR;
    /** Hue is held apart from the draft: at zero saturation or brightness the
     *  RGB no longer says which hue it was, and the slider must not jump. */
    hue = 0;
    customError = "";

    /** The swatch that takes Tab, and that the arrow keys move from. */
    focusIndex = null;

    _dragging = false;

    /* ------------------------------------------------------------------ *
     * Summary
     * ------------------------------------------------------------------ */

    get summarySwatchStyle() {
        return `background: ${this._value || FALLBACK_COLOR}`;
    }

    get summaryAssistiveText() {
        return `Choose a color. Current color: ${this._value || "none"}`;
    }

    get summaryClass() {
        return `slds-form-element slds-color-picker__summary${this.summaryError ? " slds-has-error" : ""}`;
    }

    handleSummaryInput(event) {
        this.summaryText = event.target.value;
    }

    /** `change`, not `input`: a finished answer, so a half-typed value is not
     *  flagged while it is still being typed. */
    handleSummaryChange(event) {
        const color = normalizeHex(event.target.value);
        if (!color) {
            this.summaryError = INVALID_MESSAGE;
            return;
        }
        this.summaryError = "";
        this.commit(color);
    }

    handleToggle() {
        if (this.isOpen) {
            this.close(false);
        } else {
            this.open();
        }
    }

    /* ------------------------------------------------------------------ *
     * Popover lifecycle
     * ------------------------------------------------------------------ */

    open() {
        this.draft = this._value || FALLBACK_COLOR;
        this.hue = hsvFromHex(this.draft).h;
        this.customError = "";
        this.activeTab = TABS.DEFAULT;
        this.focusIndex = null;
        this.isOpen = true;
        // Focus moves into the selector once it has rendered.
        Promise.resolve().then(() => this.focusCurrentSwatch());
    }

    close(focusButton = true) {
        this.isOpen = false;
        this.stopDrag();
        if (focusButton) {
            this.template.querySelector(".slds-color-picker__summary-button")?.focus();
        }
    }

    disconnectedCallback() {
        if (this.isOpen) {
            this.close(false);
        }
    }

    handlePopoverKeydown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.close();
        }
    }

    handleCancel() {
        this.close();
    }

    handleDone() {
        this.commit(this.draft);
        this.close();
    }

    commit(color) {
        this.summaryText = color;
        if (color === this._value) {
            return;
        }
        this._value = color;
        this.dispatchEvent(new CustomEvent("colorchange", { detail: { value: color } }));
    }

    /* ------------------------------------------------------------------ *
     * Tabs
     * ------------------------------------------------------------------ */

    get isDefaultTab() {
        return this.activeTab === TABS.DEFAULT;
    }

    get isCustomTab() {
        return this.activeTab === TABS.CUSTOM;
    }

    get defaultTabItemClass() {
        return `slds-tabs_default__item${this.isDefaultTab ? " slds-is-active" : ""}`;
    }

    get customTabItemClass() {
        return `slds-tabs_default__item${this.isCustomTab ? " slds-is-active" : ""}`;
    }

    get defaultTabSelected() {
        return String(this.isDefaultTab);
    }

    get customTabSelected() {
        return String(this.isCustomTab);
    }

    get defaultTabIndex() {
        return this.isDefaultTab ? "0" : "-1";
    }

    get customTabIndex() {
        return this.isCustomTab ? "0" : "-1";
    }

    handleTabClick(event) {
        event.preventDefault();
        this.activeTab = event.currentTarget.dataset.tab;
    }

    /** Left and Right move between the two tabs, per the ARIA tabs pattern. */
    handleTabKeydown(event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            return;
        }
        event.preventDefault();
        this.activeTab = this.isDefaultTab ? TABS.CUSTOM : TABS.DEFAULT;
        Promise.resolve().then(() => this.template.querySelector(`[data-tab="${this.activeTab}"]`)?.focus());
    }

    /* ------------------------------------------------------------------ *
     * Default tab
     * ------------------------------------------------------------------ */

    get swatches() {
        const selected = SWATCHES.indexOf(this.draft);
        const focus = this.focusIndex ?? (selected >= 0 ? selected : 0);
        return SWATCHES.map((color, index) => ({
            key: `swatch-${index}`,
            index,
            color,
            style: `background: ${color}`,
            // Only the first of the two #5ebbff is marked, so one option is
            // ever selected.
            selected: index === selected ? "true" : "false",
            className:
                index === selected
                    ? "slds-color-picker__swatch-trigger fgridColorPicker__selected"
                    : "slds-color-picker__swatch-trigger",
            tabIndex: index === focus ? "0" : "-1"
        }));
    }

    focusCurrentSwatch() {
        this.template.querySelector('.slds-color-picker__swatch-trigger[tabindex="0"]')?.focus();
    }

    handleSwatchClick(event) {
        event.preventDefault();
        const index = Number(event.currentTarget.dataset.index);
        this.focusIndex = index;
        this.setDraft(SWATCHES[index]);
    }

    /** Arrow keys move, Enter and Space pick, per the SLDS accessibility spec. */
    handleSwatchKeydown(event) {
        const from = Number(event.target.dataset.index);
        if (!Number.isFinite(from)) {
            return;
        }
        const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: PER_ROW, ArrowUp: -PER_ROW };
        if (event.key in moves) {
            event.preventDefault();
            const to = Math.max(0, Math.min(SWATCHES.length - 1, from + moves[event.key]));
            this.focusIndex = to;
            Promise.resolve().then(() => this.template.querySelector(`[data-index="${to}"]`)?.focus());
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.setDraft(SWATCHES[from]);
        }
    }

    /* ------------------------------------------------------------------ *
     * Custom tab
     * ------------------------------------------------------------------ */

    get hsv() {
        const { s, v } = hsvFromHex(this.draft);
        return { h: this.hue, s, v };
    }

    get rangeStyle() {
        return `background: hsl(${this.hue}, 100%, 50%)`;
    }

    get indicatorStyle() {
        const { s, v } = this.hsv;
        return `bottom: ${v}%; left: ${s}%`;
    }

    get indicatorText() {
        const { s, v } = this.hsv;
        return `Saturation: ${s}%. Brightness: ${v}%.`;
    }

    get draftSwatchStyle() {
        return `background: ${this.draft}`;
    }

    get rgb() {
        return rgbFromHex(this.draft);
    }

    get customHexClass() {
        return `slds-form-element slds-color-picker__input-custom-hex${this.customError ? " slds-has-error" : ""}`;
    }

    handleRangePointerDown(event) {
        event.preventDefault();
        this._dragging = true;
        this.pickFromPointer(event);
        window.addEventListener("pointermove", this.handleRangePointerMove);
        window.addEventListener("pointerup", this.handleRangePointerUp);
        this.template.querySelector(".slds-color-picker__range-indicator")?.focus();
    }

    handleRangePointerMove = (event) => {
        if (this._dragging) {
            this.pickFromPointer(event);
        }
    };

    handleRangePointerUp = () => {
        this.stopDrag();
    };

    stopDrag() {
        this._dragging = false;
        window.removeEventListener("pointermove", this.handleRangePointerMove);
        window.removeEventListener("pointerup", this.handleRangePointerUp);
    }

    pickFromPointer(event) {
        const range = this.template.querySelector(".slds-color-picker__custom-range");
        const rect = range?.getBoundingClientRect();
        if (!rect || !rect.width || !rect.height) {
            return;
        }
        const s = clamp(Math.round(((event.clientX - rect.left) / rect.width) * 100), 0, 100);
        const v = clamp(Math.round((1 - (event.clientY - rect.top) / rect.height) * 100), 0, 100);
        this.setDraft(hexFromHsv(this.hue, s, v), true);
    }

    /** Arrows move 1%, with Shift 10%, per the blueprint's instructions. */
    handleIndicatorKeydown(event) {
        const step = event.shiftKey ? 10 : 1;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        const move = moves[event.key];
        if (!move) {
            return;
        }
        event.preventDefault();
        const { s, v } = this.hsv;
        this.setDraft(hexFromHsv(this.hue, clamp(s + move[0], 0, 100), clamp(v + move[1], 0, 100)), true);
    }

    handleHueInput(event) {
        const { s, v } = this.hsv;
        this.hue = clamp(Number(event.target.value), 0, 360);
        this.setDraft(hexFromHsv(this.hue, s, v), true);
    }

    handleCustomHexChange(event) {
        const color = normalizeHex(event.target.value);
        if (!color) {
            this.customError = INVALID_MESSAGE;
            return;
        }
        this.setDraft(color);
    }

    handleRgbChange(event) {
        const channel = event.target.dataset.channel;
        const rgb = { ...this.rgb, [channel]: clamp(Math.round(Number(event.target.value) || 0), 0, 255) };
        event.target.value = rgb[channel];
        this.setDraft(hexFromRgb(rgb));
    }

    /**
     * Sets the color being chosen. The hue follows it, except when the
     * change came from the range itself, where the hue is already right and
     * recomputing it from a gray would snap the slider to red.
     */
    setDraft(color, keepHue = false) {
        this.draft = color;
        this.customError = "";
        if (!keepHue) {
            const { h, s } = hsvFromHex(color);
            if (s > 0) {
                this.hue = h;
            }
        }
    }
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function rgbFromHex(hex) {
    const color = normalizeHex(hex) || FALLBACK_COLOR;
    return {
        red: parseInt(color.slice(1, 3), 16),
        green: parseInt(color.slice(3, 5), 16),
        blue: parseInt(color.slice(5, 7), 16)
    };
}

function hexFromRgb({ red, green, blue }) {
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Hue 0-360, saturation and brightness 0-100, rounded to whole units. */
function hsvFromHex(hex) {
    const { red, green, blue } = rgbFromHex(hex);
    const [r, g, b] = [red / 255, green / 255, blue / 255];
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    let h = 0;
    if (delta) {
        if (max === r) {
            h = ((g - b) / delta) % 6;
        } else if (max === g) {
            h = (b - r) / delta + 2;
        } else {
            h = (r - g) / delta + 4;
        }
    }
    return {
        h: Math.round((h * 60 + 360) % 360),
        s: max ? Math.round((delta / max) * 100) : 0,
        v: Math.round(max * 100)
    };
}

function hexFromHsv(h, s, v) {
    const saturation = s / 100;
    const brightness = v / 100;
    const chroma = brightness * saturation;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = brightness - chroma;
    const sector = Math.floor((h % 360) / 60);
    const [r, g, b] = [
        [chroma, x, 0],
        [x, chroma, 0],
        [0, chroma, x],
        [0, x, chroma],
        [x, 0, chroma],
        [chroma, 0, x]
    ][sector];
    return hexFromRgb({
        red: Math.round((r + m) * 255),
        green: Math.round((g + m) * 255),
        blue: Math.round((b + m) * 255)
    });
}
