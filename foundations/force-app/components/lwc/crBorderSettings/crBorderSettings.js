import { LightningElement, api } from "lwc";
import { NO_BORDER } from "c/crBorderCss";

/** Units for border weight. CSS doesn't accept % for border width, so it isn't offered. */
const WEIGHT_UNITS = ["px", "rem"];

/** Radius slider range in pixels, matching Experience Builder's own Border Radius control. */
const MAX_RADIUS_PX = 150;

/**
 * Border settings for a property editor: Border Color, Weight, Line Style, Sides, Border Radius (a
 * 0–150 px slider), and Rounded Corners, which shows once the radius is above 0. Reads and sends
 * the same object that crBorderCss turns into CSS, so a component can store it as is.
 *
 * Settings it doesn't edit, such as the shadow, are passed back unchanged. One object can feed both
 * this and crShadowSettings.
 *
 * It adds no space around itself: give it the same spacing class as the other fields beside it.
 *
 * Sends borderchange with `{ value }`, the whole object with the one changed setting.
 *
 * @example
 * <c-cr-border-settings value={appearance.containerBorder} onborderchange={handleBorderChange}></c-cr-border-settings>
 */
export default class CrBorderSettings extends LightningElement {
  /** What an unset Border Color falls back to, such as "Faint Line". Shown on the color row. */
  @api defaultColorLabel;

  _value = { ...NO_BORDER };

  /**
   * The border settings. Missing settings read as no border.
   * @param {object} newValue The stored settings.
   */
  @api
  set value(newValue) {
    this._value = { ...NO_BORDER, ...(newValue || {}) };
  }
  get value() {
    return this._value;
  }

  get weightUnits() {
    return WEIGHT_UNITS;
  }

  get maxRadius() {
    return MAX_RADIUS_PX;
  }

  /**
   * @returns {boolean} Whether the corners are rounded, which shows Rounded Corners.
   */
  get hasRadius() {
    return parseFloat(this._value.radius) > 0;
  }

  /**
   * Stores the changed setting and sends the whole object.
   * @param {CustomEvent} event A change from one field, with the setting's name on the field.
   */
  handleFieldChange(event) {
    this.update(event.currentTarget.dataset.field, event.detail.value);
  }

  /**
   * Changes one setting and sends the whole object.
   * @param {string} field The setting, such as "radius".
   * @param {*} value The new value.
   */
  update(field, value) {
    this._value = { ...this._value, [field]: value };
    this.dispatchEvent(
      new CustomEvent("borderchange", { detail: { value: this._value } })
    );
  }
}
