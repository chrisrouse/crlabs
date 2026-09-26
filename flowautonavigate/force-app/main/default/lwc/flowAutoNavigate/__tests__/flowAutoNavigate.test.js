import { createElement } from "lwc";
import FlowAutoNavigate from "c/flowAutoNavigate";
import { notifyRecordUpdateAvailable } from "lightning/uiRecordApi";

const NEXT = "lightning__flownavigationnext";
const BACK = "lightning__flownavigationback";
const FINISH = "lightning__flownavigationfinish";
const PAUSE = "lightning__flownavigationpause";
const ATTRIBUTE_CHANGE = "lightning__flowattributechange";
const REFRESH = "lightning__refresh";

const TICK_MS = 250;

/**
 * The clock the component reads. Held separately from jest's timer queue so a
 * test can move real time and interval callbacks independently -- which is
 * exactly what a throttled background tab does.
 */
let now;

function build({ hours, minutes, seconds, availableActions = ["NEXT"], ...rest } = {}) {
    const element = createElement("c-flow-auto-navigate", { is: FlowAutoNavigate });
    element.timeoutHours = hours;
    element.timeoutMinutes = minutes;
    element.timeoutSeconds = seconds;
    element.availableActions = availableActions;
    Object.assign(element, rest);
    document.body.appendChild(element);
    return element;
}

function captureEvents(element) {
    const events = [];
    [NEXT, BACK, FINISH, PAUSE, ATTRIBUTE_CHANGE, REFRESH].forEach((type) => {
        element.addEventListener(type, (event) => events.push({ type, detail: event.detail }));
    });
    return events;
}

function types(events) {
    return events.map((event) => event.type);
}

/** Moves the clock and lets the matching number of intervals fire. */
function elapse(milliseconds) {
    now += milliseconds;
    jest.advanceTimersByTime(milliseconds);
}

beforeEach(() => {
    // The uiRecordApi stub exports a module-level jest.fn(), which survives
    // between tests; restoreAllMocks() does not touch it.
    notifyRecordUpdateAvailable.mockClear();
    now = 1_700_000_000_000;
    jest.useFakeTimers();
    jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe("navigation", () => {
    it("does not navigate before the duration has passed", () => {
        const element = build({ minutes: 1, seconds: 5 });
        const events = captureEvents(element);

        elapse(64_900);

        expect(events).toEqual([]);
    });

    it("navigates with NEXT once the duration has passed", () => {
        const element = build({ minutes: 1, seconds: 5 });
        const events = captureEvents(element);

        elapse(65_000);

        expect(events.map((event) => event.type)).toContain(NEXT);
    });

    it("sums hours, minutes and seconds", () => {
        const element = build({ hours: 1, minutes: 2, seconds: 3 });
        const events = captureEvents(element);

        // 1h 2m 3s
        elapse(3_723_000 - TICK_MS);
        expect(events).toEqual([]);

        elapse(TICK_MS);
        expect(events.map((event) => event.type)).toContain(NEXT);
    });

    it("falls back to FINISH when NEXT is unavailable", () => {
        const element = build({ seconds: 5, availableActions: ["FINISH"] });
        const events = captureEvents(element);

        elapse(5_000);

        expect(events.map((event) => event.type)).toContain(FINISH);
        expect(events.map((event) => event.type)).not.toContain(NEXT);
    });

    it("reports both outputs before navigating", () => {
        const element = build({ seconds: 5 });
        const events = captureEvents(element);

        elapse(5_000);

        // Order matters: Flow has to record the outputs while this component
        // is still mounted, so both precede the navigation event.
        expect(events).toEqual([
            { type: ATTRIBUTE_CHANGE, detail: { attributeName: "timerExpired", value: true } },
            { type: ATTRIBUTE_CHANGE, detail: { attributeName: "triggered", value: true } },
            { type: NEXT, detail: null }
        ]);
        expect(element.triggered).toBe(true);
    });

    it("navigates only once, however long the deadline stays passed", () => {
        const element = build({ seconds: 5 });
        const events = captureEvents(element);

        elapse(30_000);

        expect(events.filter((event) => event.type === NEXT)).toHaveLength(1);
    });

    it("stays inert when no duration is configured", () => {
        const element = build({});
        const events = captureEvents(element);

        elapse(600_000);

        expect(events).toEqual([]);
        expect(element.triggered).toBe(false);
    });

    it("does not navigate when neither action is available", () => {
        const element = build({ seconds: 5, availableActions: [] });
        const events = captureEvents(element);

        elapse(5_000);

        // Both outputs still report; there is simply nowhere to navigate to.
        expect(types(events)).toEqual([ATTRIBUTE_CHANGE, ATTRIBUTE_CHANGE]);
    });
});

describe("wall-clock timing", () => {
    /**
     * The regression this rewrite exists for. The old component added a fixed
     * 100ms per interval callback, so a browser that throttles timers in a
     * background tab stretched the timer by however much it throttled. Here only
     * two callbacks fire across two minutes of real time; a tick-counting
     * implementation would be at 0.5s and would never navigate.
     */
    it("navigates on the first tick after a throttled gap", () => {
        const element = build({ minutes: 1 });
        const events = captureEvents(element);

        now += 120_000;
        jest.advanceTimersByTime(TICK_MS * 2);

        expect(events.map((event) => event.type)).toContain(NEXT);
    });

    it("measures the deadline in real time, not in elapsed callbacks", () => {
        const element = build({ seconds: 10 });
        const events = captureEvents(element);

        // Callbacks fire without the clock moving: a drifting or starved timer.
        jest.advanceTimersByTime(60_000);
        expect(events).toEqual([]);

        elapse(10_000);
        expect(events.map((event) => event.type)).toContain(NEXT);
    });
});

describe("timer display", () => {
    function timerText(element) {
        return element.shadowRoot.querySelector(".auto-navigate__timer")?.textContent;
    }

    it("counts down from the configured duration by default", async () => {
        const element = build({ minutes: 1, seconds: 5, showTimer: true });
        await Promise.resolve();
        expect(timerText(element)).toBe("1:05");

        elapse(1_000);
        await Promise.resolve();
        expect(timerText(element)).toBe("1:04");
    });

    it("counts up when the direction is Up", async () => {
        const element = build({ minutes: 1, seconds: 5, showTimer: true, timerDirection: "Up" });
        await Promise.resolve();
        expect(timerText(element)).toBe("0:00");

        elapse(5_000);
        await Promise.resolve();
        expect(timerText(element)).toBe("0:05");
    });

    it("includes hours only once there are hours to show", async () => {
        const element = build({ hours: 1, seconds: 5, showTimer: true });
        await Promise.resolve();
        expect(timerText(element)).toBe("1:00:05");
    });

    it("renders nothing when the timer is hidden", async () => {
        const element = build({ seconds: 5 });
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".auto-navigate__timer")).toBeNull();
    });

    it("wraps the spinner so it cannot escape the component", async () => {
        const element = build({ seconds: 5, showLoader: true });
        await Promise.resolve();

        const loader = element.shadowRoot.querySelector(".auto-navigate__loader");
        expect(loader.classList).toContain("slds-is-relative");
        expect(loader.querySelector("lightning-spinner")).not.toBeNull();
    });
});

describe("reset", () => {
    function clickReset(element) {
        element.shadowRoot.querySelector("lightning-button").dispatchEvent(new CustomEvent("click"));
    }

    it("restarts the countdown from the full duration", async () => {
        const element = build({ seconds: 10, showTimer: true, showReset: true });
        const events = captureEvents(element);

        elapse(9_000);
        clickReset(element);

        elapse(9_000);
        expect(events.map((event) => event.type)).not.toContain(NEXT);

        elapse(1_000);
        expect(events.map((event) => event.type)).toContain(NEXT);
    });

    it("clears a triggered output so a later timeout reports afresh", async () => {
        const element = build({ seconds: 5, showTimer: true, showReset: true });
        elapse(5_000);
        expect(element.triggered).toBe(true);

        await Promise.resolve();
        clickReset(element);

        expect(element.triggered).toBe(false);
    });
});

describe("timeout action", () => {
    it("goes back when Back is chosen and offered", () => {
        const element = build({ seconds: 5, timeoutAction: "Back", availableActions: ["NEXT", "BACK"] });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events)).toContain(BACK);
        expect(types(events)).not.toContain(NEXT);
    });

    /**
     * An explicit choice does not fall back. Quietly doing something other than
     * what the admin asked for is worse than doing nothing, and `triggered`
     * still reports that the timeout happened.
     */
    it("does nothing when an explicitly chosen action is unavailable", () => {
        const element = build({ seconds: 5, timeoutAction: "Back", availableActions: ["NEXT"] });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events)).toEqual([ATTRIBUTE_CHANGE, ATTRIBUTE_CHANGE]);
        expect(element.triggered).toBe(true);
    });

    /**
     * Finish and Pause were removed from the editor. A flow saved with one of
     * them still loads, and must do nothing rather than pick some other
     * action on the admin's behalf. `triggered` still reports the timeout.
     */
    it("does nothing for an action that is no longer offered", () => {
        const element = build({ seconds: 5, timeoutAction: "Finish", availableActions: ["NEXT", "FINISH"] });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events)).toEqual([ATTRIBUTE_CHANGE, ATTRIBUTE_CHANGE]);
        expect(element.triggered).toBe(true);
    });

    it("still falls back from Next to Finish on a last screen", () => {
        const element = build({ seconds: 5, timeoutAction: "Next", availableActions: ["FINISH"] });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events)).toContain(FINISH);
    });
});

describe("pause", () => {
    it("does not run while paused from the start", () => {
        const element = build({ seconds: 5, paused: true });
        const events = captureEvents(element);

        elapse(60_000);

        expect(events).toEqual([]);
    });

    it("resumes with the time it had left, not the full duration", () => {
        const element = build({ seconds: 10 });
        const events = captureEvents(element);

        elapse(8_000);
        element.paused = true;

        // Real time passes while held; none of it should count.
        elapse(60_000);
        expect(events).toEqual([]);

        element.paused = false;
        elapse(1_900);
        expect(types(events)).not.toContain(NEXT);

        elapse(100);
        expect(types(events)).toContain(NEXT);
    });

    it("freezes the display while paused", async () => {
        const element = build({ seconds: 30, showTimer: true });
        elapse(5_000);
        await Promise.resolve();
        const frozen = element.shadowRoot.querySelector(".auto-navigate__timer").textContent;

        element.paused = true;
        elapse(10_000);
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".auto-navigate__timer").textContent).toBe(frozen);
    });

    it("ignores a pause set before it ever started", () => {
        const element = build({ seconds: 5, paused: true });
        const events = captureEvents(element);

        element.paused = false;
        elapse(5_000);

        expect(types(events)).toContain(NEXT);
    });
});

describe("progress bar", () => {
    function fill(element) {
        return element.shadowRoot.querySelector(".auto-navigate__bar-fill");
    }

    function width(element) {
        return fill(element).style.width;
    }

    it("is absent unless asked for", async () => {
        const element = build({ seconds: 10 });
        await Promise.resolve();
        expect(fill(element)).toBeNull();
    });

    it("depletes as a countdown runs", async () => {
        const element = build({ seconds: 10, showProgressBar: true });
        await Promise.resolve();
        expect(width(element)).toBe("100%");

        // 47.5, not 50: the bar is aimed one tick ahead so the CSS transition
        // arrives at the truth rather than trailing it.
        elapse(5_000);
        await Promise.resolve();
        expect(width(element)).toBe("47.5%");
    });

    it("fills when the timer counts up", async () => {
        const element = build({ seconds: 10, showProgressBar: true, timerDirection: "Up" });
        await Promise.resolve();
        expect(width(element)).toBe("0%");

        elapse(5_000);
        await Promise.resolve();
        expect(width(element)).toBe("52.5%");
    });

    it("keeps moving when the timer itself is hidden", async () => {
        const element = build({ seconds: 10, showProgressBar: true });
        elapse(5_000);
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".auto-navigate__timer")).toBeNull();
        expect(width(element)).toBe("47.5%");
    });

    /**
     * The reported bug: at 0:00 the bar still had a second of travel left, so
     * it was visibly running while `timerExpired` was already true and the
     * next component had appeared.
     */
    it("reaches empty exactly as the clock reaches zero", async () => {
        const element = build({ seconds: 10, showProgressBar: true, timeoutAction: "Stay" });

        // One tick out, the target is already 0: the transition covers that
        // last gap and lands on empty at the same moment the clock does.
        elapse(10_000 - TICK_MS);
        await Promise.resolve();
        expect(width(element)).toBe("0%");

        elapse(TICK_MS);
        await Promise.resolve();
        expect(element.timerExpired).toBe(true);
        expect(width(element)).toBe("0%");
    });

    it("starts full rather than a tick short", async () => {
        const element = build({ seconds: 10, showProgressBar: true });
        await Promise.resolve();
        expect(width(element)).toBe("100%");
    });

    /**
     * The bar is ours rather than lightning-progress-bar precisely so a
     * transition can live on the fill; the base component's is unreachable
     * from this shadow root.
     */
    it("owns its fill element so CSS can animate it", async () => {
        const element = build({ seconds: 10, showProgressBar: true });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector("lightning-progress-bar")).toBeNull();
        expect(fill(element).classList).toContain("slds-progress-bar__value");
    });

    it("drops the transition for the frame a reset lands on, then restores it", async () => {
        const element = build({ seconds: 10, showProgressBar: true, showTimer: true, showReset: true });

        elapse(5_000);
        await Promise.resolve();
        expect(fill(element).classList).not.toContain("auto-navigate__bar-fill_instant");

        element.shadowRoot.querySelector("lightning-button").dispatchEvent(new CustomEvent("click"));
        await Promise.resolve();
        expect(fill(element).classList).toContain("auto-navigate__bar-fill_instant");
        expect(width(element)).toBe("100%");

        elapse(TICK_MS);
        await Promise.resolve();
        expect(fill(element).classList).not.toContain("auto-navigate__bar-fill_instant");
    });

    it("is hidden from assistive tech, which hears milestones instead", async () => {
        const element = build({ seconds: 10, showProgressBar: true });
        await Promise.resolve();
        expect(element.shadowRoot.querySelector(".auto-navigate__progress").getAttribute("aria-hidden")).toBe("true");
    });
});

describe("screen reader announcements", () => {
    function announcement(element) {
        return element.shadowRoot.querySelector(".slds-assistive-text").textContent;
    }

    it("says how long the screen will wait, up front", async () => {
        const element = build({ minutes: 1, seconds: 5 });
        await Promise.resolve();
        expect(announcement(element)).toBe("This screen advances in 1 minute 5 seconds.");
    });

    it("announces even when the timer is not displayed", async () => {
        const element = build({ seconds: 10 });
        await Promise.resolve();
        expect(announcement(element)).toBe("This screen advances in 10 seconds.");
    });

    it("warns at each milestone as it is crossed", async () => {
        const element = build({ minutes: 1, seconds: 5 });

        elapse(5_000);
        await Promise.resolve();
        expect(announcement(element)).toBe("1 minute remaining.");

        elapse(30_000);
        await Promise.resolve();
        expect(announcement(element)).toBe("30 seconds remaining.");

        elapse(20_000);
        await Promise.resolve();
        expect(announcement(element)).toBe("10 seconds remaining.");
    });

    it("skips a milestone longer than the whole duration", async () => {
        const element = build({ seconds: 30 });

        elapse(25_000);
        await Promise.resolve();

        expect(announcement(element)).toBe("10 seconds remaining.");
    });

    /**
     * Only the transitions matter. A milestone re-announced on every tick would
     * show up here as the same text appearing, disappearing and returning; the
     * text settling once and staying put is what a screen reader needs.
     */
    it("moves through each milestone once and does not go back", async () => {
        const element = build({ seconds: 30 });

        /** Advances five seconds and reports what a screen reader would hear. */
        const step = async () => {
            elapse(5_000);
            await Promise.resolve();
            return announcement(element);
        };

        // Six sequential five-second steps across the whole thirty seconds.
        const seen = [await step(), await step(), await step(), await step(), await step(), await step()];
        const transitions = seen.filter((text, index) => text !== seen[index - 1]);

        expect(transitions).toEqual(["This screen advances in 30 seconds.", "10 seconds remaining."]);
    });
});

describe("teardown", () => {
    it("stops its interval when removed", () => {
        const element = build({ seconds: 5 });
        const events = captureEvents(element);
        const clearSpy = jest.spyOn(global, "clearInterval");

        document.body.removeChild(element);
        expect(clearSpy).toHaveBeenCalled();

        elapse(60_000);
        expect(events).toEqual([]);
    });
});

describe("timerExpired output", () => {
    function attributeChanges(events) {
        return events.filter((event) => event.type === ATTRIBUTE_CHANGE).map((event) => event.detail);
    }

    it("reports both outputs as false up front", async () => {
        const element = createElement("c-flow-auto-navigate", { is: FlowAutoNavigate });
        const seen = [];
        element.addEventListener(ATTRIBUTE_CHANGE, (event) => seen.push(event.detail));
        element.timeoutSeconds = 5;
        document.body.appendChild(element);
        await Promise.resolve();

        expect(seen).toEqual([
            { attributeName: "triggered", value: false },
            { attributeName: "timerExpired", value: false }
        ]);
    });

    it("goes true alongside triggered when the screen advances", () => {
        const element = build({ seconds: 5 });
        const events = captureEvents(element);

        elapse(5_000);

        expect(attributeChanges(events)).toEqual([
            { attributeName: "timerExpired", value: true },
            { attributeName: "triggered", value: true }
        ]);
        expect(element.timerExpired).toBe(true);
    });

    it("stays false while the timer is still running", () => {
        const element = build({ seconds: 10 });
        elapse(5_000);
        expect(element.timerExpired).toBe(false);
    });
});

describe("staying on the screen", () => {
    it("expires without navigating anywhere", () => {
        const element = build({ seconds: 5, timeoutAction: "Stay" });
        const events = captureEvents(element);

        elapse(30_000);

        // Expiry only -- Stay never claims it advanced anything.
        expect(types(events)).toEqual([ATTRIBUTE_CHANGE]);
        expect(element.timerExpired).toBe(true);
    });

    /**
     * The whole point of Stay: the two outputs diverge, so something on the
     * same screen can key off expiry while the screen is still standing.
     */
    it("reports expiry without claiming it advanced the screen", () => {
        const element = build({ seconds: 5, timeoutAction: "Stay" });

        elapse(5_000);

        expect(element.timerExpired).toBe(true);
        expect(element.triggered).toBe(false);
    });

    it("keeps the timer on screen at zero", async () => {
        const element = build({ seconds: 5, timeoutAction: "Stay", showTimer: true });

        elapse(5_000);
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".auto-navigate__timer").textContent).toContain("0:00");
    });
});

describe("warning threshold", () => {
    function timer(element) {
        return element.shadowRoot.querySelector(".auto-navigate__timer");
    }

    function label(element) {
        return element.shadowRoot.querySelector("lightning-formatted-rich-text")?.value;
    }

    it("does nothing without a threshold", async () => {
        const element = build({ seconds: 10, showTimer: true, warningStyle: "Color and Weight" });
        elapse(9_000);
        await Promise.resolve();

        expect(timer(element).className).toBe("auto-navigate__timer");
    });

    it("switches on only once the threshold is crossed", async () => {
        const element = build({
            seconds: 10,
            showTimer: true,
            warningSeconds: 4,
            warningStyle: "Color and Weight"
        });

        elapse(5_000);
        await Promise.resolve();
        expect(timer(element).className).not.toContain("auto-navigate__timer_weight");

        elapse(1_000);
        await Promise.resolve();
        expect(timer(element).className).toContain("auto-navigate__timer_weight");
    });

    it.each([
        ["Color", "auto-navigate__timer_color"],
        ["Color and Weight", "auto-navigate__timer_weight"],
        ["Pulse", "auto-navigate__timer_pulse"],
        ["Tinted Pill", "auto-navigate__timer_pill"]
    ])("applies the %s style", async (warningStyle, expected) => {
        const element = build({ seconds: 10, showTimer: true, warningSeconds: 5, warningStyle });

        elapse(5_000);
        await Promise.resolve();

        expect(timer(element).className).toContain(expected);
    });

    /**
     * Guards the contract the editor relies on: it shows "Color and Weight" as
     * the default without committing it, so the runtime fallback has to be the
     * same value or the panel lies about what an unconfigured screen will do.
     */
    it("defaults to the style the editor displays", async () => {
        const element = build({ seconds: 10, showTimer: true, warningSeconds: 5 });

        elapse(5_000);
        await Promise.resolve();

        expect(timer(element).className).toContain("auto-navigate__timer_weight");
    });

    it("leaves the timer alone when the style is No Change", async () => {
        const element = build({ seconds: 10, showTimer: true, warningSeconds: 5, warningStyle: "None" });

        elapse(5_000);
        await Promise.resolve();

        expect(timer(element).className).toBe("auto-navigate__timer");
    });

    it("swaps the message for the warning wording", async () => {
        const element = build({
            seconds: 10,
            showTimer: true,
            warningSeconds: 5,
            timerLabel: "please wait",
            warningLabel: "Advancing soon"
        });

        await Promise.resolve();
        expect(label(element)).toBe("please wait");

        elapse(5_000);
        await Promise.resolve();
        expect(label(element)).toBe("Advancing soon");
    });

    it("keeps the original message when no warning wording is given", async () => {
        const element = build({ seconds: 10, showTimer: true, warningSeconds: 5, timerLabel: "please wait" });

        elapse(5_000);
        await Promise.resolve();

        expect(label(element)).toBe("please wait");
    });

    it("shows the icon only during the warning, and only when asked", async () => {
        const element = build({ seconds: 10, showTimer: true, warningSeconds: 5, warningShowIcon: true });

        await Promise.resolve();
        expect(element.shadowRoot.querySelector("lightning-icon")).toBeNull();

        elapse(5_000);
        await Promise.resolve();
        expect(element.shadowRoot.querySelector("lightning-icon")).not.toBeNull();
    });

    it("tints the progress bar independently of the timer style", async () => {
        const element = build({
            seconds: 10,
            showProgressBar: true,
            warningSeconds: 5,
            warningStyle: "None",
            warningTintProgressBar: true
        });

        elapse(5_000);
        await Promise.resolve();

        // The tint class has to land on an ancestor of a fill element we own.
        // Setting it on a lightning-progress-bar wrapper did nothing, because
        // the hook never crossed into the base component's shadow root.
        const wrapper = element.shadowRoot.querySelector(".auto-navigate__progress");
        expect(wrapper.className).toContain("auto-navigate__progress_warning");
        expect(wrapper.querySelector(".auto-navigate__bar-fill")).not.toBeNull();
    });

    it("leaves the bar untinted unless asked", async () => {
        const element = build({ seconds: 10, showProgressBar: true, warningSeconds: 5, warningStyle: "Pulse" });

        elapse(5_000);
        await Promise.resolve();

        expect(element.shadowRoot.querySelector(".auto-navigate__progress").className).not.toContain(
            "auto-navigate__progress_warning"
        );
    });

    it("clears the warning when the timer is reset", async () => {
        const element = build({
            seconds: 10,
            showTimer: true,
            showReset: true,
            warningSeconds: 5,
            warningStyle: "Color and Weight"
        });

        elapse(6_000);
        await Promise.resolve();
        expect(timer(element).className).toContain("auto-navigate__timer_weight");

        element.shadowRoot.querySelector("lightning-button").dispatchEvent(new CustomEvent("click"));
        await Promise.resolve();

        expect(timer(element).className).not.toContain("auto-navigate__timer_weight");
    });
});

describe("warning threshold entry", () => {
    function timer(element) {
        return element.shadowRoot.querySelector(".auto-navigate__timer");
    }

    /** The reason this is three boxes: a long screen wants a long warning. */
    it("accepts a warning measured in minutes", async () => {
        const element = build({ minutes: 5, showTimer: true, warningMinutes: 2 });

        // 2:59 left -- still inside the first three minutes.
        elapse(121_000);
        await Promise.resolve();
        expect(timer(element).className).not.toContain("auto-navigate__timer_weight");

        // 2:00 left -- the threshold.
        elapse(59_000);
        await Promise.resolve();
        expect(timer(element).className).toContain("auto-navigate__timer_weight");
    });

    it("sums the warning boxes the same way as the duration", async () => {
        const element = build({
            minutes: 10,
            showTimer: true,
            warningMinutes: 1,
            warningSeconds: 30
        });

        // 91 seconds left.
        elapse(509_000);
        await Promise.resolve();
        expect(timer(element).className).not.toContain("auto-navigate__timer_weight");

        // 90 seconds left.
        elapse(1_000);
        await Promise.resolve();
        expect(timer(element).className).toContain("auto-navigate__timer_weight");
    });

    it("treats an hours-only warning as a real threshold", async () => {
        const element = build({ hours: 2, showTimer: true, warningHours: 1 });

        elapse(3_600_000);
        await Promise.resolve();

        expect(timer(element).className).toContain("auto-navigate__timer_weight");
    });
});

describe("bottom spacing", () => {
    function content(element) {
        return element.shadowRoot.querySelector(".auto-navigate__content");
    }

    /**
     * Flow wraps each of its own screen fields in `container
     * slds-m-bottom_x-small`, but that div belongs to flowruntime-lwc-field.
     * We reproduce the margin so this component sits in the same rhythm as the
     * fields around it.
     */
    it("carries the same bottom margin Flow gives its own fields", async () => {
        const element = build({ seconds: 10, showTimer: true });
        await Promise.resolve();

        expect(content(element).classList).toContain("slds-m-bottom_x-small");
    });

    it.each([
        ["the timer", { showTimer: true }],
        ["the progress bar", { showProgressBar: true }],
        ["the loader", { showLoader: true }]
    ])("spaces the component when %s is shown", async (_label, options) => {
        const element = build({ seconds: 10, ...options });
        await Promise.resolve();

        expect(content(element)).not.toBeNull();
    });

    it("adds no phantom gap when the component advances silently", async () => {
        const element = build({ seconds: 10 });
        await Promise.resolve();

        expect(content(element)).toBeNull();
        // The announcement still renders; slds-assistive-text takes no space.
        expect(element.shadowRoot.querySelector(".slds-assistive-text")).not.toBeNull();
    });
});

describe("hide when time runs out", () => {
    function content(element) {
        return element.shadowRoot.querySelector(".auto-navigate__content");
    }

    it("stays visible while the timer runs", async () => {
        const element = build({ seconds: 10, showTimer: true, hideOnExpiry: true, timeoutAction: "Stay" });

        elapse(5_000);
        await Promise.resolve();

        expect(content(element).classList).not.toContain("auto-navigate__content_hidden");
    });

    /**
     * Hidden but still occupying its space -- the point of the option is that
     * nothing below the timer jumps up at the moment it expires.
     */
    it("hides without collapsing once the timer expires", async () => {
        const element = build({ seconds: 10, showTimer: true, hideOnExpiry: true, timeoutAction: "Stay" });

        elapse(10_000);
        await Promise.resolve();

        expect(content(element)).not.toBeNull();
        expect(content(element).classList).toContain("auto-navigate__content_hidden");
    });

    it("leaves the timer on screen when the option is off", async () => {
        const element = build({ seconds: 10, showTimer: true, timeoutAction: "Stay" });

        elapse(10_000);
        await Promise.resolve();

        expect(content(element).classList).not.toContain("auto-navigate__content_hidden");
    });

    it("comes back when the timer is reset", async () => {
        const element = build({
            seconds: 10,
            showTimer: true,
            showReset: true,
            hideOnExpiry: true,
            timeoutAction: "Stay"
        });

        elapse(10_000);
        await Promise.resolve();
        expect(content(element).classList).toContain("auto-navigate__content_hidden");

        // Reset is inside the hidden block, so a flow would drive this from
        // elsewhere -- but the component must still recover cleanly.
        element.shadowRoot.querySelector("lightning-button").dispatchEvent(new CustomEvent("click"));
        await Promise.resolve();

        expect(content(element).classList).not.toContain("auto-navigate__content_hidden");
    });
});

describe("page refresh", () => {
    it("does not refresh unless asked", () => {
        const element = build({ seconds: 5 });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events)).not.toContain(REFRESH);
    });

    it("does not refresh before the timer expires", () => {
        const element = build({ seconds: 10, refreshOnTimeout: true });
        const events = captureEvents(element);

        elapse(9_000);

        expect(types(events)).not.toContain(REFRESH);
    });

    /**
     * RefreshView API rather than the console-only `refreshTab()`: one
     * dispatch covers console tabs, ordinary record pages and Experience
     * Cloud, and it refreshes in place instead of reloading, so a flow on the
     * refreshed page survives.
     */
    it("dispatches a RefreshEvent on expiry", () => {
        const element = build({ seconds: 5, refreshOnTimeout: true });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events)).toContain(REFRESH);
    });

    it("refreshes before navigating, while still mounted", () => {
        const element = build({ seconds: 5, refreshOnTimeout: true });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events).indexOf(REFRESH)).toBeLessThan(types(events).indexOf(NEXT));
    });

    it("bubbles and crosses the shadow boundary so a container can catch it", () => {
        build({ seconds: 5, refreshOnTimeout: true });
        const caught = [];
        document.body.addEventListener(REFRESH, (event) => caught.push(event));

        elapse(5_000);

        expect(caught).toHaveLength(1);
        expect(caught[0].bubbles).toBe(true);
        expect(caught[0].composed).toBe(true);
    });

    it("refreshes once, however long the deadline stays passed", () => {
        const element = build({ seconds: 5, refreshOnTimeout: true });
        const events = captureEvents(element);

        elapse(60_000);

        expect(types(events).filter((t) => t === REFRESH)).toHaveLength(1);
    });

    /** Staying put plus refresh is the polling case: refresh, screen remains. */
    it("refreshes while staying on the screen", () => {
        const element = build({ seconds: 5, refreshOnTimeout: true, timeoutAction: "Stay" });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events)).toContain(REFRESH);
        expect(types(events)).not.toContain(NEXT);
    });
});

describe("record refresh in Experience Cloud", () => {
    const RECORD_ID = "001000000000001AAA";

    /**
     * An LWR site page with a standard Record Detail kept showing the stale
     * value: RefreshEvent fires, but nothing on that page registered a refresh
     * handler, so nothing listens. Notifying LDS reaches the record's wire
     * directly, independent of the refresh tree.
     */
    it("notifies LDS for the configured record", () => {
        const element = build({ seconds: 5, refreshOnTimeout: true, refreshRecordId: RECORD_ID });
        const events = captureEvents(element);

        elapse(5_000);

        expect(notifyRecordUpdateAvailable).toHaveBeenCalledWith([{ recordId: RECORD_ID }]);
        // Both mechanisms fire; they cover different containers.
        expect(types(events)).toContain(REFRESH);
    });

    it("still fires the view refresh when no record is given", () => {
        const element = build({ seconds: 5, refreshOnTimeout: true });
        const events = captureEvents(element);

        elapse(5_000);

        expect(notifyRecordUpdateAvailable).not.toHaveBeenCalled();
        expect(types(events)).toContain(REFRESH);
    });

    it("does not notify LDS when refreshing is off", () => {
        build({ seconds: 5, refreshRecordId: RECORD_ID });

        elapse(5_000);

        expect(notifyRecordUpdateAvailable).not.toHaveBeenCalled();
    });

    it("notifies once, however long the deadline stays passed", () => {
        build({ seconds: 5, refreshOnTimeout: true, refreshRecordId: RECORD_ID });

        elapse(60_000);

        expect(notifyRecordUpdateAvailable).toHaveBeenCalledTimes(1);
    });

    /** A failed re-fetch must not block the screen from advancing. */
    it("navigates even if the LDS notification rejects", () => {
        notifyRecordUpdateAvailable.mockRejectedValueOnce(new Error("no access"));
        const element = build({ seconds: 5, refreshOnTimeout: true, refreshRecordId: RECORD_ID });
        const events = captureEvents(element);

        elapse(5_000);

        expect(types(events)).toContain(NEXT);
    });
});

describe("advancing on an external trigger", () => {
    /**
     * The upload case: no timer at all, advance as soon as another component
     * reports it is done.
     */
    it("advances with no duration configured", () => {
        const element = build({ availableActions: ["NEXT"] });
        const events = captureEvents(element);

        elapse(600_000);
        expect(events).toEqual([]);

        element.advanceWhen = true;

        expect(types(events)).toContain(NEXT);
    });

    it("advances immediately when the trigger is already true on load", () => {
        // Completion happens inside connectedCallback, so the listener has to
        // be attached before the element is appended or it misses everything.
        const element = createElement("c-flow-auto-navigate", { is: FlowAutoNavigate });
        element.availableActions = ["NEXT"];
        element.advanceWhen = true;
        const seen = [];
        element.addEventListener(NEXT, () => seen.push(NEXT));
        document.body.appendChild(element);

        expect(element.triggered).toBe(true);
        expect(seen).toEqual([NEXT]);
    });

    it("beats a running timer when it fires first", () => {
        const element = build({ seconds: 60 });
        const events = captureEvents(element);

        elapse(5_000);
        element.advanceWhen = true;

        expect(types(events)).toContain(NEXT);
    });

    /** A duration alongside a trigger is a backstop, and still works. */
    it("still expires on the timer when the trigger never fires", () => {
        const element = build({ seconds: 10 });
        const events = captureEvents(element);

        elapse(10_000);

        expect(types(events)).toContain(NEXT);
    });

    it("completes only once when the trigger fires after the timer", () => {
        const element = build({ seconds: 5 });
        const events = captureEvents(element);

        elapse(5_000);
        element.advanceWhen = true;

        expect(types(events).filter((t) => t === NEXT)).toHaveLength(1);
    });

    it("runs the configured action, not just Next", () => {
        const element = build({ timeoutAction: "Back", availableActions: ["NEXT", "BACK"] });
        const events = captureEvents(element);

        element.advanceWhen = true;

        expect(types(events)).toContain(BACK);
        expect(types(events)).not.toContain(NEXT);
    });

    it("refreshes on the trigger too", () => {
        const element = build({ refreshOnTimeout: true, refreshRecordId: "001000000000001AAA" });
        const events = captureEvents(element);

        element.advanceWhen = true;

        expect(types(events)).toContain(REFRESH);
        expect(notifyRecordUpdateAvailable).toHaveBeenCalledWith([{ recordId: "001000000000001AAA" }]);
    });

    it("stays on the screen when told to, reporting the outputs", () => {
        const element = build({ timeoutAction: "Stay" });
        const events = captureEvents(element);

        element.advanceWhen = true;

        expect(element.timerExpired).toBe(true);
        expect(types(events)).not.toContain(NEXT);
    });

    it("does nothing while the trigger stays false", () => {
        const element = build({});
        const events = captureEvents(element);

        element.advanceWhen = false;
        elapse(600_000);

        expect(events).toEqual([]);
    });
});

describe("durations of a day or more", () => {
    function timerText(element) {
        return element.shadowRoot.querySelector(".auto-navigate__timer").textContent;
    }

    function announcement(element) {
        return element.shadowRoot.querySelector(".slds-assistive-text").textContent;
    }

    function buildDays({ days, hours, minutes, seconds, ...rest }) {
        const element = createElement("c-flow-auto-navigate", { is: FlowAutoNavigate });
        element.timeoutDays = days;
        element.timeoutHours = hours;
        element.timeoutMinutes = minutes;
        element.timeoutSeconds = seconds;
        element.availableActions = ["NEXT"];
        Object.assign(element, rest);
        document.body.appendChild(element);
        return element;
    }

    /**
     * The `d` suffix rather than a fourth colon segment: `3:00:00:00` and
     * `3:00:00` differ only by segment count, which is easy to misread.
     */
    it.each([
        [{ days: 3 }, "3d 00:00:00"],
        [{ days: 2, hours: 5 }, "2d 05:00:00"],
        [{ hours: 25 }, "1d 01:00:00"],
        [{ hours: 24 }, "1d 00:00:00"],
        [{ days: 1, hours: 2, minutes: 3, seconds: 4 }, "1d 02:03:04"]
    ])("renders %j as %s", async (config, expected) => {
        const element = buildDays({ ...config, showTimer: true });
        await Promise.resolve();
        expect(timerText(element)).toBe(expected);
    });

    /** Below a day nothing changes, so existing screens look the same. */
    it.each([
        [{ hours: 23, minutes: 59 }, "23:59:00"],
        [{ minutes: 90 }, "1:30:00"],
        [{ minutes: 1, seconds: 5 }, "1:05"]
    ])("leaves %j unchanged as %s", async (config, expected) => {
        const element = buildDays({ ...config, showTimer: true });
        await Promise.resolve();
        expect(timerText(element)).toBe(expected);
    });

    it("carries days into the hours box rather than rolling over", async () => {
        // 48 in Hours is still two days; boxes are summed, not a clock reading.
        const element = buildDays({ hours: 48, showTimer: true });
        await Promise.resolve();
        expect(timerText(element)).toBe("2d 00:00:00");
    });

    it("counts down across a day boundary", async () => {
        const element = buildDays({ days: 1, seconds: 1, showTimer: true });
        await Promise.resolve();
        expect(timerText(element)).toBe("1d 00:00:01");

        elapse(2_000);
        await Promise.resolve();
        expect(timerText(element)).toBe("23:59:59");
    });

    it("announces days in words", async () => {
        const element = buildDays({ days: 2, hours: 3 });
        await Promise.resolve();
        expect(announcement(element)).toBe("This screen advances in 2 days 3 hours.");
    });

    it("singularizes one day", async () => {
        const element = buildDays({ days: 1 });
        await Promise.resolve();
        expect(announcement(element)).toBe("This screen advances in 1 day.");
    });

    it("still fires at the right moment", () => {
        const element = buildDays({ days: 1 });
        const events = captureEvents(element);

        elapse(86_400_000 - TICK_MS);
        expect(events).toEqual([]);

        elapse(TICK_MS);
        expect(types(events)).toContain(NEXT);
    });
});

describe("time format", () => {
    function render(config) {
        const element = createElement("c-flow-auto-navigate", { is: FlowAutoNavigate });
        element.timeoutHours = config.hours;
        element.timeoutMinutes = config.minutes;
        element.timeoutSeconds = config.seconds;
        element.timeoutDays = config.days;
        element.timeFormat = config.timeFormat;
        element.showTimer = true;
        element.availableActions = ["NEXT"];
        document.body.appendChild(element);
        return element;
    }

    function text(element) {
        return element.shadowRoot.querySelector(".auto-navigate__timer").textContent;
    }

    /** The default is the original behavior, so no existing screen shifts. */
    it.each([
        [{ seconds: 40 }, "0:40"],
        [{ minutes: 5, seconds: 45 }, "5:45"],
        [{ minutes: 30, seconds: 45 }, "30:45"],
        [{ hours: 9, minutes: 45, seconds: 40 }, "9:45:40"]
    ])("Standard renders %j as %s", async (config, expected) => {
        const element = render(config);
        await Promise.resolve();
        expect(text(element)).toBe(expected);
    });

    it.each([
        [{ seconds: 40 }, "00:00:40"],
        [{ minutes: 5, seconds: 45 }, "00:05:45"],
        [{ minutes: 30, seconds: 45 }, "00:30:45"],
        [{ hours: 9, minutes: 45, seconds: 40 }, "09:45:40"],
        [{ hours: 12, minutes: 45, seconds: 30 }, "12:45:30"]
    ])("Fixed renders %j as %s", async (config, expected) => {
        const element = render({ ...config, timeFormat: "Fixed" });
        await Promise.resolve();
        expect(text(element)).toBe(expected);
    });

    it.each([
        [{ seconds: 40 }, "40"],
        [{ minutes: 5, seconds: 45 }, "5:45"],
        [{ minutes: 30, seconds: 45 }, "30:45"],
        [{ hours: 9, minutes: 45, seconds: 40 }, "9:45:40"],
        [{ hours: 12, minutes: 45, seconds: 30 }, "12:45:30"]
    ])("Compact renders %j as %s", async (config, expected) => {
        const element = render({ ...config, timeFormat: "Compact" });
        await Promise.resolve();
        expect(text(element)).toBe(expected);
    });

    it("keeps Fixed at a constant width as the clock shrinks", async () => {
        const element = render({ minutes: 1, seconds: 1, timeFormat: "Fixed" });
        await Promise.resolve();
        const widths = new Set([text(element).length]);

        elapse(30_000);
        await Promise.resolve();
        widths.add(text(element).length);

        elapse(30_000);
        await Promise.resolve();
        widths.add(text(element).length);

        expect([...widths]).toEqual([8]);
    });

    it("lets Compact collapse to bare seconds as it shrinks", async () => {
        const element = render({ minutes: 1, seconds: 5, timeFormat: "Compact" });
        await Promise.resolve();
        expect(text(element)).toBe("1:05");

        elapse(25_000);
        await Promise.resolve();
        expect(text(element)).toBe("40");
    });

    /** Days always pad the hours: `2d 5:00:00` reads as a mistake. */
    it.each(["Standard", "Fixed", "Compact"])("pads the hours after a day in %s", async (timeFormat) => {
        const element = render({ days: 2, hours: 5, timeFormat });
        await Promise.resolve();
        expect(text(element)).toBe("2d 05:00:00");
    });
});

describe("message position", () => {
    function build2(rest) {
        const element = createElement("c-flow-auto-navigate", { is: FlowAutoNavigate });
        element.timeoutSeconds = 30;
        element.showTimer = true;
        element.timerLabel = "please wait";
        element.availableActions = ["NEXT"];
        Object.assign(element, rest);
        document.body.appendChild(element);
        return element;
    }

    /** Reads the rendered order of the timer and the message. */
    function order(element) {
        return [...element.shadowRoot.querySelectorAll(".auto-navigate__timer, lightning-formatted-rich-text")].map(
            (node) => (node.classList.contains("auto-navigate__timer") ? "timer" : "message")
        );
    }

    it("puts the message below the timer by default", async () => {
        const element = build2({});
        await Promise.resolve();
        expect(order(element)).toEqual(["timer", "message"]);
    });

    it("puts the message above the timer when asked", async () => {
        const element = build2({ messagePosition: "Above" });
        await Promise.resolve();
        expect(order(element)).toEqual(["message", "timer"]);
    });

    it("renders the message once, not in both slots", async () => {
        const element = build2({ messagePosition: "Above" });
        await Promise.resolve();
        expect(element.shadowRoot.querySelectorAll("lightning-formatted-rich-text")).toHaveLength(1);
    });

    it("positions the warning message the same way", async () => {
        const element = build2({
            messagePosition: "Above",
            warningSeconds: 30,
            warningLabel: "Advancing soon"
        });
        await Promise.resolve();

        expect(order(element)).toEqual(["message", "timer"]);
        expect(element.shadowRoot.querySelector("lightning-formatted-rich-text").value).toBe("Advancing soon");
    });
});
