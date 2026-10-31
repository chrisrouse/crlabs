import { LightningElement, api } from "lwc";

/**
 * Build label for the accordion components. Bump it on each deploy, so the properties panel shows
 * whether a new version has reached the Builder.
 */
const BUILD = "Build 2026-10-31-H";

/**
 * Read-only property editor that shows the build label at the bottom of a component's properties.
 * It stores nothing, so the value is ignored.
 */
export default class CrVersionInfo extends LightningElement {
    /** Value passed by the properties panel. Not used. */
    @api value;

    /**
     * @returns {string} The build label shown in the panel.
     */
    get build() {
        return BUILD;
    }
}
