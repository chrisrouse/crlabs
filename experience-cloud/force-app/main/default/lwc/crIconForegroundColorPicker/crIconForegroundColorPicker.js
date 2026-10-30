import { LightningElement, api } from "lwc";

/**
 * Property editor for the icon foreground color. Uses crColorPicker, and names the color
 * "Foreground" in its choices.
 */
export default class CrIconForegroundColorPicker extends LightningElement {
    /** The stored color as hex, or an empty string for the default. */
    @api value;

    /**
     * Relays the picked color to the properties panel.
     * @param {CustomEvent} event The valuechange event from the color picker.
     */
    handleValueChange(event) {
        this.dispatchEvent(new CustomEvent("valuechange", { detail: event.detail }));
    }
}
