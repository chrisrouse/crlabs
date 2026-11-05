/**
 * Foundations Test — custom property editor. Hosts the icon picker and the Border and Shadow
 * settings at Flow Builder's panel width. Part of the foundations-test harness, which is deployed by
 * path and never packaged.
 *
 * Uses the imperative side of the Flow Config Editor Kit: the controls are our own, and only the
 * Flow Builder inputs and the input-changed event come from the base class.
 */
import FlowConfigEditorBase from "c/flowConfigEditorBase";

export default class CrFoundationsTestEditor extends FlowConfigEditorBase {
    /**
     * @returns {string} The saved icon name, or empty.
     */
    get icon() {
        return this.input("icon", "");
    }

    /**
     * @returns {object} The saved border and shadow settings. Missing or unreadable reads as none.
     */
    get box() {
        try {
            return JSON.parse(this.input("box", "") || "{}") || {};
        } catch {
            return {};
        }
    }

    /**
     * Saves the picked icon.
     * @param {CustomEvent} event The valuechange event from the icon picker.
     */
    handleIconChange(event) {
        this.setInput("icon", event.detail.value, "String");
    }

    /**
     * Saves the border and shadow settings, which both controls send as one object.
     * @param {CustomEvent} event The borderchange or shadowchange event.
     */
    handleBoxChange(event) {
        this.setInput("box", JSON.stringify(event.detail.value), "String");
    }
}
