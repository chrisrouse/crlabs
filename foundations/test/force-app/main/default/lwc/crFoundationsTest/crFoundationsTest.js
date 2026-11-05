import { LightningElement, api } from "lwc";
import { borderDeclarations } from "c/crBorderCss";

/**
 * Test harness for the CRLabs Foundations controls in Flow Builder. Shows the picked icon in a box
 * drawn with the picked border and shadow, so a change in the panel can be checked on the screen.
 * Part of the foundations-test harness, which is deployed by path and never packaged.
 */
export default class CrFoundationsTest extends LightningElement {
    /** The picked icon, such as "utility:chevrondown". */
    @api icon;

    /** The border and shadow settings, as the JSON crBorderSettings and crShadowSettings send. */
    @api box;

    /**
     * @returns {string} The sample box's inline style.
     */
    get boxStyle() {
        let settings = {};
        try {
            settings = JSON.parse(this.box || "{}") || {};
        } catch {
            settings = {};
        }
        return borderDeclarations(settings).join("; ");
    }
}
