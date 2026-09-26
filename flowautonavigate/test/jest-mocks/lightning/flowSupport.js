/**
 * sfdx-lwc-jest 7.9.0 stubs `lightning/flowSupport`, but its
 * `FlowAttributeChangeEvent` constructor takes no arguments and sets no
 * `detail`:
 *
 *     export class FlowAttributeChangeEvent extends CustomEvent {
 *         constructor() { super(FlowAttributeChangeEventName, {...}); }
 *     }
 *
 * The platform's carries `detail: { attributeName, value }`, and that payload is
 * the entire point of a Flow output — asserting only that *an* event fired would
 * pass just as happily on the bug this component was rewritten to fix.
 *
 * Everything else mirrors the shipped stub.
 */
export const FlowAttributeChangeEventName = "lightning__flowattributechange";
export const FlowNavigationBackEventName = "lightning__flownavigationback";
export const FlowNavigationNextEventName = "lightning__flownavigationnext";
export const FlowNavigationPauseEventName = "lightning__flownavigationpause";
export const FlowNavigationFinishEventName = "lightning__flownavigationfinish";

export class FlowAttributeChangeEvent extends CustomEvent {
    constructor(attributeName, value) {
        super(FlowAttributeChangeEventName, {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: { attributeName, value }
        });
    }
}

export class FlowNavigationBackEvent extends CustomEvent {
    constructor() {
        super(FlowNavigationBackEventName, { bubbles: true, composed: true });
    }
}

export class FlowNavigationNextEvent extends CustomEvent {
    constructor() {
        super(FlowNavigationNextEventName, { bubbles: true, composed: true });
    }
}

export class FlowNavigationPauseEvent extends CustomEvent {
    constructor() {
        super(FlowNavigationPauseEventName, { bubbles: true, composed: true });
    }
}

export class FlowNavigationFinishEvent extends CustomEvent {
    constructor() {
        super(FlowNavigationFinishEventName, { bubbles: true, composed: true });
    }
}
