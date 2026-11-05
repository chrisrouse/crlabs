import { LightningElement, api } from "lwc";

const OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" }
];

/**
 * A line style setting: one button per style, each drawing a sample of its line. Sends stylechange
 * with the chosen CSS border style.
 */
export default class CrBorderStylePicker extends LightningElement {
  /** Name of the setting, shown above the buttons. */
  @api label = "Border Style";

  _value = "solid";

  /**
   * The stored CSS border style. An empty value reads as solid.
   * @param {string} newValue The stored style.
   */
  @api
  set value(newValue) {
    this._value = newValue || "solid";
  }
  get value() {
    return this._value;
  }

  /**
   * @returns {Array<object>} The style buttons, with the chosen one pressed.
   */
  get options() {
    return OPTIONS.map((option) => ({
      ...option,
      pressed: String(this._value === option.value),
      previewClass: `preview preview-${option.value}`
    }));
  }

  /**
   * Stores the clicked style and tells the parent, unless it was already chosen.
   * @param {Event} event The click on a style button.
   */
  handleSelect(event) {
    const value = event.currentTarget.dataset.value;
    if (value === this._value) {
      return;
    }
    this._value = value;
    this.dispatchEvent(new CustomEvent("stylechange", { detail: { value } }));
  }
}
