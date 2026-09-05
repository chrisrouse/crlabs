/**
 * Local stub for `lightning/modal`.
 *
 * sfdx-lwc-jest 7.9.0 -- the latest release -- ships stubs for `modalBody`,
 * `modalFooter` and `modalHeader` but NOT for `modal` itself, so `LightningModal`
 * cannot be imported under test without this. The component's docs describe
 * shorthand selectors on an official stub (`modalBody$`, `closeValue`, and so on),
 * which suggests one is meant to exist; it is not in the package. Delete this file
 * and the moduleNameMapper entry in jest.config.js if a later release adds it.
 *
 * What the real base class provides, and this reproduces:
 *   - a static `open(props)` that assigns props to a new instance, mounts it, and
 *     returns a promise resolving to whatever `close(result)` was given
 *   - an instance `close(result)` that resolves that promise and unmounts
 *   - `disableClose`, which blocks `close()`
 *
 * The pending resolvers live in module scope rather than on the element, because
 * LWC bridges only `@api` members between a host element and its component
 * instance -- anything else assigned to the host is invisible to `close()`. A
 * stack rather than a single slot, so a modal opened from a modal still resolves
 * in the right order.
 *
 * The shorthand query selectors are deliberately omitted: nothing here uses them,
 * and stubbing an API we do not exercise would invite tests that pass against the
 * stub's behaviour rather than the platform's.
 */
import { LightningElement, api, createElement } from "lwc";

const pending = [];

export default class LightningModal extends LightningElement {
    static open(props = {}) {
        const element = createElement("c-lightning-modal-stub", { is: this });
        Object.assign(element, props);
        document.body.appendChild(element);

        return new Promise((resolve) => {
            pending.push({ element, resolve });
        });
    }

    @api size;
    @api description;
    @api label;
    @api disableClose = false;

    close(result) {
        if (this.disableClose) {
            return;
        }
        const entry = pending.pop();
        if (!entry) {
            return;
        }
        entry.element.parentNode?.removeChild(entry.element);
        entry.resolve(result);
    }
}
