import { LightningElement, api } from "lwc";

/** Pixels per rem, for showing a length stored in rem on the pixel slider. */
const PX_PER_REM = 16;

/**
 * A length setting in whole pixels, drawn as an SLDS slider from 0 to max with the range under the
 * label and the value beside the track, like Experience Builder's own Border Radius control.
 *
 * The value shown follows a drag, but is sent only when the slider is released or moved with the
 * keyboard, because every sent value refreshes the Builder canvas. lightning-slider sends on every
 * step of a drag, which is why this doesn't use it.
 *
 * Sends measurechange with `{ value }`, a CSS length such as "12px", the same as crMeasureInput.
 *
 * @example
 * <c-cr-pixel-slider label="Border Radius" max="150" value={radius} onmeasurechange={handleChange}></c-cr-pixel-slider>
 */
export default class CrPixelSlider extends LightningElement {
    /** Name of the setting, shown above the slider. */
    @api label;

    /** Largest number of pixels. */
    @api max = 100;

    /** The stored CSS length, such as "12px". A length in rem is shown in pixels. */
    @api value = "0px";

    _dragging;

    /**
     * @returns {string} The range shown under the label.
     */
    get rangeLabel() {
        return `(0–${this.max} px)`;
    }

    /**
     * @returns {string} The number's fixed width: room for the largest value's digits.
     */
    get valueStyle() {
        return `width: ${String(this.max).length}ch`;
    }

    /**
     * The value in whole pixels, kept within the range. While the slider is dragged, the dragged
     * value shows.
     * @returns {number}
     */
    get pixels() {
        if (this._dragging !== undefined) {
            return this._dragging;
        }
        const length = String(this.value || "0px");
        const number = parseFloat(length) || 0;
        const px = /rem$/i.test(length) ? number * PX_PER_REM : number;
        return Math.min(Number(this.max), Math.max(0, Math.round(px)));
    }

    /**
     * Shows the value while the slider is dragged, without sending it.
     * @param {Event} event The input event from the slider.
     */
    handleInput(event) {
        this._dragging = Number(event.target.value);
    }

    /**
     * Sends the value when the slider is released or moved with the keyboard.
     * @param {Event} event The change event from the slider.
     */
    handleChange(event) {
        event.stopPropagation();
        this._dragging = undefined;
        this.dispatchEvent(
            new CustomEvent("measurechange", {
                detail: { value: `${event.target.value}px` }
            })
        );
    }
}
