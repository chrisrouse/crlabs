import { LightningElement, api } from "lwc";
import { NO_BORDER } from "c/crBorderCss";

/** Shadow size is a blur in pixels, up to a broad, soft shadow. */
const MAX_SHADOW_PX = 30;

/**
 * Shadow settings for a property editor: Shadow Size (a 0–30 px slider), and once it is above 0, Shadow Color and
 * Shadow Sides. Reads and sends the same object that crBorderCss turns into CSS, so a component can
 * store it as is. An unset shadow color draws in the border's color.
 *
 * Settings it doesn't edit, such as the border, are passed back unchanged. One object can feed both
 * this and crBorderSettings.
 *
 * It adds no space around itself: give it the same spacing class as the other fields beside it.
 *
 * Sends shadowchange with `{ value }`, the whole object with the one changed setting.
 *
 * @example
 * <c-cr-shadow-settings value={appearance.containerBorder} onshadowchange={handleShadowChange}></c-cr-shadow-settings>
 */
export default class CrShadowSettings extends LightningElement {
  _value = { ...NO_BORDER };

  /**
   * The shadow settings. Missing settings read as no shadow.
   * @param {object} newValue The stored settings.
   */
  @api
  set value(newValue) {
    this._value = { ...NO_BORDER, ...(newValue || {}) };
  }
  get value() {
    return this._value;
  }

  get maxShadow() {
    return MAX_SHADOW_PX;
  }

  /**
   * @returns {boolean} Whether a shadow is drawn, which shows its color and sides.
   */
  get hasShadow() {
    return parseFloat(this._value.shadow) > 0;
  }

  /**
   * Stores the changed setting and sends the whole object.
   * @param {CustomEvent} event A change from one field, with the setting's name on the field.
   */
  handleFieldChange(event) {
    const field = event.currentTarget.dataset.field;
    this._value = { ...this._value, [field]: event.detail.value };
    this.dispatchEvent(
      new CustomEvent("shadowchange", { detail: { value: this._value } })
    );
  }
}
