/**
 * The row action's flow, in the platform's SLDS 2 modal.
 *
 * Replaces hand-rolled `slds-modal` markup with its own `slds-backdrop`, so the
 * chrome, backdrop, focus trap, Escape handling and close button all belong to
 * the platform — the same move the Grid Studio made.
 *
 * IT CLOSES ITSELF AND RESOLVES WITH THE OUTCOME.
 * A modal's events do not reach the component that opened it, so the obvious
 * translation would be a `notifyStatusChange` callback. Resolving `open()` is
 * better: the grid awaits one value instead of tracking modal state, and it
 * satisfies a requirement the previous version had to arrange by hand — the flow
 * must be unmounted BEFORE its result is folded in, because `lightning-flow`
 * restarts its interview if it is still on the page when it finishes.
 *
 * Resolves with `{ status, outputVariables }` on completion or `{ status: "ERROR" }`
 * on failure. Dismissing with the close button or Escape resolves `undefined`,
 * which the grid reads as cancelled.
 */
import { api } from "lwc";
import LightningModal from "lightning/modal";

export default class FgridFlowActionModal extends LightningModal {
    @api flowApiName;
    @api flowInputVariables = [];

    /**
     * Deliberately separate from the base class's own `label`.
     *
     * `LightningModal` owns `label` for the accessible name, and the caller sets
     * it through `open()`. Binding the header to a property of our own leaves no
     * question about whether the base class's copy is readable from a template.
     */
    @api headerLabel;

    /* THE CLOSE LOCK IS TWO SEPARATE THINGS, because one is not enough.
     *
     * `disableClose`, the base class's own property, passed through `open()`. It
     * blocks Escape and `close()` and DISABLES the close button -- measured in the
     * site, the inner `<button>` carries `disabled=""`. What it does not do is hide
     * it: `display` stayed `flex` and `opacity` `1`, so the X is drawn at full
     * strength and merely does nothing when clicked, which is worse than either
     * extreme.
     *
     * `hideCloseButton` below removes it from view, because nothing declarative
     * can. The button belongs to `lightning-modal-base` behind a NATIVE shadow
     * boundary: `document.querySelectorAll(".slds-modal__close").length` is 0 with
     * a modal open, so no stylesheet of ours or the site's can select it, and
     * there is no styling hook for visibility. Custom properties do cross that
     * boundary -- which is how site branding recolours it -- but cannot express
     * `display`.
     */

    /**
     * Hides the platform's close button while the modal is locked.
     *
     * REACHES INTO PLATFORM DOM WE DO NOT OWN, which is the least comfortable
     * thing in this component and is done only because the alternative is a
     * visible control that lies about being clickable.
     *
     * The path is short and not a search: this component is slotted INTO
     * `lightning-modal-base`, so its host's root node is that container's shadow
     * root, and the button is a sibling of the slot. `data-close-button` is the
     * platform's own hook, with the SLDS class as a fallback.
     *
     * In `renderedCallback` rather than once, so a re-render that restores the
     * button hides it again. Guarded on the current value so the common case is a
     * property read.
     *
     * Best effort. If Lightning Web Security blocks the traversal or the platform
     * renames the hook, the button comes back -- disabled, thanks to
     * `disableClose`, so a click still cannot discard the flow. That degradation
     * is the reason both mechanisms are used rather than this one alone.
     */
    renderedCallback() {
        if (!this.disableClose) {
            return;
        }
        try {
            const root = this.template?.host?.getRootNode?.();
            const button = root?.querySelector?.("[data-close-button], .slds-modal__close");
            if (button?.style && button.style.display !== "none") {
                button.style.display = "none";
            }
        } catch {
            // Never let chrome we do not own stop the flow from running.
        }
    }

    handleStatusChange(event) {
        const detail = event.detail || {};
        // `lightning-flow` reports this as `status`. Reading `flowStatus` instead
        // meant the handler returned early every time, so the modal was never
        // unmounted and the interview restarted, discarding the edits.
        // `flowStatus` stays as a fallback in case a future API version renames it.
        const status = detail.status ?? detail.flowStatus;

        if (status === "ERROR") {
            this.closeWithOutcome({ status: "ERROR" });
            return;
        }
        if (status === "FINISHED" || status === "FINISHED_SCREEN") {
            this.closeWithOutcome({ status, outputVariables: detail.outputVariables });
        }
    }

    /**
     * Releases the lock, then closes.
     *
     * `disableClose` blocks `close()` as well as the close button and Escape --
     * documented behaviour, confirmed in the site, and the whole reason this method
     * exists. Locking the modal and then calling `close()` directly would trap the
     * user in a modal with no way out at all, including the flow finishing
     * successfully.
     *
     * Every close goes through here so that cannot be reintroduced by adding a
     * `close()` call somewhere else.
     */
    closeWithOutcome(outcome) {
        this.disableClose = false;
        this.close(outcome);
    }
}
