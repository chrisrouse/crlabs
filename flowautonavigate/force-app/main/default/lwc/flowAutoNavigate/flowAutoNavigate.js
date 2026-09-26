/**
 * Flow Auto Navigate — advances a Flow screen after a configured duration.
 *
 * Timing is measured against a wall-clock deadline (`Date.now()`), never by
 * accumulating a fixed amount per interval callback. The previous version added
 * 100ms per tick and treated the total as elapsed time, which is wrong twice
 * over: `setInterval` drifts under load, and browsers clamp timers to >= 1s in a
 * background tab (Chrome goes further still after a few minutes). A 65-second
 * timer could take many minutes of real time if the user switched tabs. With a
 * deadline, a throttled tab simply fires late and navigates on its next tick.
 *
 * The duration is entered as separate Days / Hours / Minutes / Seconds
 * properties and summed, so there is no string format for an admin to get wrong. Those are
 * written by the custom property editor, `c-flow-auto-navigate-editor`.
 */
import { LightningElement, api } from "lwc";
import {
    FlowAttributeChangeEvent,
    FlowNavigationNextEvent,
    FlowNavigationBackEvent,
    FlowNavigationFinishEvent
} from "lightning/flowSupport";
import { RefreshEvent } from "lightning/refresh";
import { notifyRecordUpdateAvailable } from "lightning/uiRecordApi";

/**
 * How often the deadline is checked.
 *
 * Finer than the 1s display so the cutover is not up to a second late, but
 * coarse enough that it is not re-rendering the flow screen constantly. The
 * display only changes when the whole second changes, so this ticks 4x/s while
 * re-rendering 1x/s.
 */
const TICK_MS = 250;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

export const DIRECTION = { DOWN: "Down", UP: "Up" };

/**
 * How much of the clock is shown.
 *
 * `Standard` is the original behavior and stays the default, so no configured
 * screen changes appearance. The other two are the extremes an admin might
 * want: a fixed-width clock that never reflows, or the shortest thing that
 * still reads as a time.
 */
export const TIME_FORMAT = {
    /** 00:00:40 -- every unit, always two digits. */
    FIXED: "Fixed",
    /** 0:40 -- hours drop when empty, minutes always shown. */
    STANDARD: "Standard",
    /** 40 -- every empty leading unit drops, including minutes. */
    COMPACT: "Compact"
};

export const MESSAGE_POSITION = { ABOVE: "Above", BELOW: "Below" };

export const TIMEOUT_ACTION = {
    NEXT: "Next",
    BACK: "Back",
    /** Expire in place: report the outputs and leave the screen standing. */
    STAY: "Stay"
};

/**
 * Flow's own names for the actions it reports through `availableActions`.
 *
 * Finish and Pause were offered and removed: Finish did not work in testing,
 * and Pause was not wanted. Finishing is still reachable, as the fallback
 * from Next on a last screen, which is the original behavior of this
 * component.
 */
const FLOW_ACTION = {
    [TIMEOUT_ACTION.NEXT]: "NEXT",
    [TIMEOUT_ACTION.BACK]: "BACK"
};

/**
 * How the timer looks once the warning threshold is crossed.
 *
 * Label text, the icon, and the progress-bar tint are separate properties
 * rather than variants in here, so any of them composes with any style.
 */
export const WARNING_STYLE = {
    NONE: "None",
    COLOR: "Color",
    COLOR_WEIGHT: "Color and Weight",
    PULSE: "Pulse",
    PILL: "Tinted Pill"
};

const WARNING_STYLE_CLASS = {
    [WARNING_STYLE.COLOR]: "auto-navigate__timer_color",
    [WARNING_STYLE.COLOR_WEIGHT]: "auto-navigate__timer_weight",
    [WARNING_STYLE.PULSE]: "auto-navigate__timer_pulse",
    [WARNING_STYLE.PILL]: "auto-navigate__timer_pill"
};

/**
 * Seconds remaining at which a screen reader is told what is about to happen.
 *
 * The visible timer is deliberately not a live region -- a value announced every
 * second talks over everything else assistive tech is saying -- so without these
 * a screen reader user would get no warning at all before the screen moved. A
 * milestone longer than the configured duration is skipped, and the
 * announcement made when the timer starts covers durations shorter than all of
 * them.
 */
const MILESTONE_SECONDS = [60, 30, 10];

function pluralize(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "1 minute 5 seconds", for assistive text. */
function humanizeSeconds(totalSeconds) {
    const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
    const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;

    const parts = [];
    if (days > 0) {
        parts.push(pluralize(days, "day"));
    }
    if (hours > 0) {
        parts.push(pluralize(hours, "hour"));
    }
    if (minutes > 0) {
        parts.push(pluralize(minutes, "minute"));
    }
    if (seconds > 0) {
        parts.push(pluralize(seconds, "second"));
    }
    return parts.join(" ");
}

/** A non-negative whole number from a Flow Integer, which may arrive as text. */
function toCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
    }
    return Math.floor(parsed);
}

/**
 * Milliseconds from separate day, hour, minute and second boxes.
 *
 * Summed rather than treated as a clock reading, so 90 in the minutes box means
 * ninety minutes instead of being an error. Both the total duration and the
 * warning threshold are entered this way.
 */
function sumMs(days, hours, minutes, seconds) {
    const total =
        toCount(days) * SECONDS_PER_DAY +
        toCount(hours) * SECONDS_PER_HOUR +
        toCount(minutes) * SECONDS_PER_MINUTE +
        toCount(seconds);
    return total * 1000;
}

/**
 * The countdown as text, in the requested format.
 *
 * `2d 05:00:00` for a day or more -- the `d` suffix rather than a fourth
 * colon segment, because `3:00:00:00` and `3:00:00` differ only by how many
 * segments you count, which is easy to misread on a glanceable timer.
 *
 * A countdown rounds up so the configured value is visible on the first paint
 * and "0:01" stays up for its full second; elapsed time rounds down so it
 * starts at "0:00".
 */
function formatDuration(milliseconds, roundUp, format) {
    const totalSeconds = roundUp ? Math.ceil(milliseconds / 1000) : Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
    const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;

    const pad = (value) => String(value).padStart(2, "0");
    const fixed = format === TIME_FORMAT.FIXED;

    // Once days are shown the clock is full width regardless, so hours are
    // padded in every format -- `2d 5:00:00` reads as a mistake.
    if (days > 0) {
        return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    if (fixed) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    if (format === TIME_FORMAT.COMPACT && minutes === 0) {
        return `${seconds}`;
    }
    return `${minutes}:${pad(seconds)}`;
}

export default class FlowAutoNavigate extends LightningElement {
    /** Supplied by Flow; tells us which navigation actions are possible. */
    @api availableActions = [];

    @api timeoutDays;
    @api timeoutHours;
    @api timeoutMinutes;
    @api timeoutSeconds;
    @api timeoutAction = TIMEOUT_ACTION.NEXT;

    @api showTimer = false;
    @api showReset = false;
    @api showLoader = false;
    @api showProgressBar = false;
    /**
     * Hide the component once the timer expires, keeping its footprint.
     *
     * This is one of two ways to hide it, and the difference is space. A Flow
     * visibility condition on `timerExpired` also works and removes the
     * component, so whatever is below it moves up. This property applies
     * `visibility: hidden` instead, so the timer disappears while the rest of
     * the screen stays exactly where it was.
     */
    @api hideOnExpiry = false;

    /**
     * Refresh the surrounding page when the timer expires.
     *
     * Uses RefreshView API (`lightning/refresh`), which the LWC guide names as
     * the replacement for Aura's `force:refreshView`, and which the module
     * reference lists as supported in Lightning Experience, Experience Builder
     * Sites, the Salesforce mobile app, Lightning Out and standalone apps.
     * One dispatch therefore covers console tabs, ordinary record pages and
     * Experience Cloud, rather than the console-only `refreshTab()` path.
     *
     * It refreshes registered components in place. It is NOT a page reload, so
     * a flow running on the refreshed page keeps its state -- unlike
     * `refreshTab()` or `location.reload()`, either of which would restart an
     * embedded flow mid-run.
     */
    @api refreshOnTimeout = false;

    /**
     * Optional record to re-fetch alongside the refresh, usually the flow's
     * own `recordId`.
     *
     * `RefreshEvent` only reaches components that registered a refresh
     * handler. That covers Lightning Experience, where the standard record
     * page components participate, but an LWR Experience Cloud page with a
     * standard Record Detail on it kept showing the stale value -- the event
     * fires and nothing is listening.
     *
     * `notifyRecordUpdateAvailable` does not depend on the refresh tree at
     * all. Per its reference, it "considers the record data wired by all
     * instantiated components" and re-emits to every wire using that record
     * id, so it reaches an LDS-backed Record Detail directly.
     */
    @api refreshRecordId;
    @api timerLabel;
    @api timerDirection = DIRECTION.DOWN;
    @api timeFormat = TIME_FORMAT.STANDARD;
    @api messagePosition = MESSAGE_POSITION.BELOW;

    /** Time-running-out treatment. Inert while the threshold sums to zero.
     *  Entered as Days / Hours / Minutes / Seconds, like the total duration. */
    @api warningDays;
    @api warningHours;
    @api warningMinutes;
    @api warningSeconds;
    /** Must match the editor's displayed default, or an untouched control and
     *  the runtime disagree about what an unwritten property means. */
    @api warningStyle = WARNING_STYLE.COLOR_WEIGHT;
    @api warningLabel;
    @api warningShowIcon = false;
    @api warningTintProgressBar = false;

    timeDisplay = "";
    progressValue = 100;
    announcement = "";
    warningActive = false;
    /** Suppresses the fill transition for the frame a reset lands on. */
    snapBar = true;

    _triggered = false;
    _timerExpired = false;
    _advanceWhen = false;
    _paused = false;
    _started = false;
    _deadline = 0;
    _durationMs = 0;
    _remainingMs = null;
    _intervalId = null;
    _expired = false;
    _announced = new Set();

    /**
     * Output: true once this component advanced the screen itself.
     *
     * Getter-only. Flow reads an output through the property but is told about
     * the change by `FlowAttributeChangeEvent`; assigning to one's own `@api`
     * property is the anti-pattern `@lwc/lwc/no-api-reassignments` exists for,
     * and is why the previous version's output never reliably reached the flow.
     */
    @api
    get triggered() {
        return this._triggered;
    }

    /**
     * Output: true once the timer reached zero, whether or not the screen
     * moved.
     *
     * Distinct from `triggered`, which means *this component advanced the
     * screen*. With On Timeout set to Stay on This Screen the two diverge --
     * `timerExpired` goes true and `triggered` stays false -- and that is the
     * combination that makes this usable as a reactive trigger: the screen is
     * still standing, so a Message conditioned on it can actually paint.
     */
    @api
    get timerExpired() {
        return this._timerExpired;
    }

    /**
     * Input: holds the timer without losing the time already served.
     *
     * Written as a setter so a reactive screen can drive it mid-screen -- bind
     * it to a Flow formula or a checkbox on the same screen and the timer stops
     * and starts as that value changes. Before `connectedCallback` this only
     * records the flag; `start()` honors it.
     */
    /**
     * Reactive: run the On Timeout action as soon as this becomes true,
     * without waiting for the timer.
     *
     * Bind a Flow Boolean or another component's output -- a file upload's
     * content document link arriving, a callout finishing, a checkbox being
     * ticked. The timer then becomes optional: leave the duration blank to
     * advance purely on the trigger, or set one as a backstop, in which case
     * whichever fires first wins.
     *
     * Same setter mechanism as `paused`, which is verified working under Flow
     * reactive screens.
     */
    @api
    get advanceWhen() {
        return this._advanceWhen;
    }
    set advanceWhen(value) {
        const next = Boolean(value);
        if (next === this._advanceWhen) {
            return;
        }
        this._advanceWhen = next;
        // Before `start()` this only records the flag; `start()` honors it.
        if (this._started && next) {
            this.expire();
        }
    }

    @api
    get paused() {
        return this._paused;
    }
    set paused(value) {
        const next = Boolean(value);
        if (next === this._paused) {
            return;
        }
        this._paused = next;
        if (!this._started) {
            return;
        }
        if (next) {
            this.pause();
        } else {
            this.resume();
        }
    }

    /**
     * Both outputs are reported as false up front rather than left unassigned.
     * A Decision reading an output Flow was never told about happens to
     * evaluate the way you want, but only because an unset Boolean is falsy --
     * stating it makes the contract explicit instead of incidental.
     */
    connectedCallback() {
        this.dispatchEvent(new FlowAttributeChangeEvent("triggered", false));
        this.dispatchEvent(new FlowAttributeChangeEvent("timerExpired", false));
        this.start();
    }

    disconnectedCallback() {
        this.stop();
    }

    /* ------------------------------------------------------------------ *
     * Timing
     * ------------------------------------------------------------------ */

    /** Configured duration in milliseconds. Zero means "not configured". */
    get durationMs() {
        return sumMs(this.timeoutDays, this.timeoutHours, this.timeoutMinutes, this.timeoutSeconds);
    }

    get isCountdown() {
        return this.timerDirection !== DIRECTION.UP;
    }

    /**
     * An unconfigured duration leaves the component inert rather than
     * defaulting to something the admin never chose. The screen still renders
     * and the user can navigate by hand; silently advancing on a guessed
     * interval would be worse than not advancing at all.
     */
    start() {
        this._durationMs = this.durationMs;
        this._started = true;

        // Already true when the screen loaded: complete without ever ticking.
        if (this._advanceWhen) {
            this.expire();
            return;
        }

        // No duration is not an error when a trigger is configured -- the
        // component simply waits for it instead of for the clock.
        if (this._durationMs <= 0) {
            return;
        }
        this._deadline = Date.now() + this._durationMs;
        this._remainingMs = this._paused ? this._durationMs : null;
        this.snapBar = true;
        this.announcement = `This screen advances in ${humanizeSeconds(this._durationMs / 1000)}.`;
        this.refresh();
        if (!this._paused) {
            this.run();
        }
    }

    run() {
        this.stop();
        // `no-async-operation` guards against timers outliving their component.
        // This one is cleared in `disconnectedCallback`, on pause, and again as
        // soon as it navigates, so it cannot outlive this screen.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._intervalId = setInterval(() => this.tick(), TICK_MS);
    }

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }

    /** Banks the time left so resuming continues rather than restarting. */
    pause() {
        if (this._durationMs <= 0 || this._expired) {
            return;
        }
        this._remainingMs = Math.max(0, this._deadline - Date.now());
        this.stop();
    }

    resume() {
        if (this._durationMs <= 0 || this._expired) {
            return;
        }
        this._deadline = Date.now() + (this._remainingMs ?? this._durationMs);
        this._remainingMs = null;
        this.refresh();
        this.run();
    }

    tick() {
        // Cleared here rather than in renderedCallback: by the first tick the
        // reset has painted, and assigning reactive state from a render hook
        // to undo a render is a loop waiting to happen.
        this.snapBar = false;
        this.refresh();
        if (Date.now() >= this._deadline) {
            this.expire();
        }
    }

    /** Milliseconds remaining at which the warning treatment switches on. */
    get warningMs() {
        return sumMs(this.warningDays, this.warningHours, this.warningMinutes, this.warningSeconds);
    }

    /**
     * Recomputes everything the template shows, at most once a second.
     *
     * The progress bar is gated on the same whole-second change as the text so
     * a hidden timer does not leave the bar frozen, and so neither one drives a
     * re-render faster than 1Hz.
     */
    refresh() {
        const remaining =
            this._paused && this._remainingMs !== null ? this._remainingMs : Math.max(0, this._deadline - Date.now());

        this.checkMilestones(remaining);

        // Outside the whole-second gate below: the threshold is expressed in
        // seconds so it lands on a second boundary anyway, and assigning only
        // on change means this cannot cost an extra render.
        const warning = this.warningMs > 0 && remaining <= this.warningMs;
        if (warning !== this.warningActive) {
            this.warningActive = warning;
        }

        const shown = this.isCountdown ? remaining : this._durationMs - remaining;
        const nextText = formatDuration(shown, this.isCountdown, this.timeFormat);
        if (nextText !== this.timeDisplay) {
            this.timeDisplay = nextText;
        }

        if (this.showProgressBar) {
            const next = this.progressFor(remaining);
            if (next !== this.progressValue) {
                this.progressValue = next;
            }
        }
    }

    /**
     * Where the bar should be pointed, one tick ahead of now.
     *
     * A CSS transition animates *toward* the value it is given, so a target of
     * "where we are" leaves the bar permanently one period behind -- which is
     * why it still had a second of travel left when the clock read 0:00. Aiming
     * one period ahead means the animation arrives exactly as that moment
     * does, and the bar lands on empty at 0:00.
     *
     * The first paint is the exception: there is nothing to animate from yet,
     * so it takes the true value and the lead starts from the next tick.
     */
    progressFor(remaining) {
        const lead = this.snapBar ? remaining : Math.max(0, remaining - TICK_MS);
        const percentRemaining = this._durationMs > 0 ? (lead / this._durationMs) * 100 : 0;
        const value = this.isCountdown ? percentRemaining : 100 - percentRemaining;
        // One decimal is finer than the eye and finer than a pixel on any
        // realistic bar width, while still collapsing redundant renders.
        return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
    }

    /**
     * Announces each milestone once. A throttled tab can cross several at once,
     * in which case the smallest wins -- which is the one worth hearing.
     */
    checkMilestones(remainingMs) {
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        MILESTONE_SECONDS.forEach((milestone) => {
            if (this._announced.has(milestone) || this._durationMs <= milestone * 1000) {
                return;
            }
            if (remainingSeconds <= milestone) {
                this._announced.add(milestone);
                this.announcement = `${humanizeSeconds(milestone)} remaining.`;
            }
        });
    }

    /**
     * Reports expiry and, unless told to stay, advances the screen. Once.
     *
     * The guard matters: the deadline stays passed, so without it every
     * subsequent tick between dispatch and the screen actually tearing down
     * would fire another navigation event.
     *
     * Attribute changes are dispatched before the navigation event so Flow
     * records the outputs while this component is still mounted.
     */
    expire() {
        if (this._expired) {
            return;
        }
        this._expired = true;
        this.stop();

        this._timerExpired = true;
        this.dispatchEvent(new FlowAttributeChangeEvent("timerExpired", true));

        // Before any navigation, so the surrounding container receives it
        // while this component is still mounted.
        if (this.refreshOnTimeout) {
            this.triggerPageRefresh();
        }

        if (this.timeoutAction === TIMEOUT_ACTION.STAY) {
            // Nothing else to do: the screen stands, `timerExpired` is true,
            // and anything on the screen conditioned on it can now render.
            this.refresh();
            return;
        }

        this._triggered = true;
        this.dispatchEvent(new FlowAttributeChangeEvent("triggered", true));

        const event = this.navigationEvent();
        if (event) {
            this.dispatchEvent(event);
        }
    }

    /**
     * The event for the configured action, or null when Flow does not offer it.
     *
     * Next falls back to Finish, because that is the last-screen case and is
     * the original behavior of this component. An explicitly chosen Back does
     * not fall back -- silently doing something other than what the admin
     * asked for is worse than doing nothing.
     */
    navigationEvent() {
        const action = this.timeoutAction || TIMEOUT_ACTION.NEXT;
        const offered = this.availableActions || [];

        if (action === TIMEOUT_ACTION.NEXT) {
            if (offered.includes("NEXT")) {
                return new FlowNavigationNextEvent();
            }
            return offered.includes("FINISH") ? new FlowNavigationFinishEvent() : null;
        }

        if (action === TIMEOUT_ACTION.BACK && offered.includes(FLOW_ACTION[action])) {
            return new FlowNavigationBackEvent();
        }
        return null;
    }

    /**
     * Two mechanisms, because one does not cover every container.
     *
     * `RefreshEvent` refreshes the view wherever something registered a
     * refresh handler; `notifyRecordUpdateAvailable` refreshes any LDS wire on
     * a given record whether or not anything registered. Firing both is not
     * redundant work in any meaningful sense -- LDS re-emits only where the
     * data actually changed.
     */
    triggerPageRefresh() {
        this.dispatchEvent(new RefreshEvent());

        if (!this.refreshRecordId) {
            return;
        }
        // Not awaited: the screen may navigate immediately, and LDS completes
        // the re-fetch independently of this component. Caught so a failed
        // refresh cannot surface as an unhandled rejection -- there is no
        // useful recovery from here, and it must not block navigation.
        notifyRecordUpdateAvailable([{ recordId: this.refreshRecordId }]).catch(() => {
            // intentionally ignored
        });
    }

    /* ------------------------------------------------------------------ *
     * Interaction
     * ------------------------------------------------------------------ */

    handleReset() {
        this.stop();
        this._expired = false;
        this._triggered = false;
        this._timerExpired = false;
        this._announced = new Set();
        this.warningActive = false;
        this.dispatchEvent(new FlowAttributeChangeEvent("triggered", false));
        this.dispatchEvent(new FlowAttributeChangeEvent("timerExpired", false));
        this.start();
    }

    /* ------------------------------------------------------------------ *
     * Presentation
     * ------------------------------------------------------------------ */

    get timerClass() {
        const warningClass = this.warningActive ? WARNING_STYLE_CLASS[this.warningStyle] : null;
        return warningClass ? `auto-navigate__timer ${warningClass}` : "auto-navigate__timer";
    }

    get progressClass() {
        const base = "auto-navigate__progress slds-m-top_x-small";
        return this.warningActive && this.warningTintProgressBar ? `${base} auto-navigate__progress_warning` : base;
    }

    get barStyle() {
        return `width: ${this.progressValue}%;`;
    }

    /**
     * The fill animates between the 1Hz updates via a 1s linear transition, so
     * it reads as continuous motion rather than a step a second.
     *
     * Reset is the exception: the width jumps the whole way back, and letting
     * that transition would play a one-second rewind. `snapBar` drops the
     * transition for the frame that lands, and the next tick restores it.
     */
    get barFillClass() {
        const base = "slds-progress-bar__value auto-navigate__bar-fill";
        return this.snapBar ? `${base} auto-navigate__bar-fill_instant` : base;
    }

    /** The warning wording replaces the usual message, if one was given. */
    get displayLabel() {
        return this.warningActive && this.warningLabel ? this.warningLabel : this.timerLabel;
    }

    get messageAbove() {
        return Boolean(this.displayLabel) && this.messagePosition === MESSAGE_POSITION.ABOVE;
    }

    get messageBelow() {
        return Boolean(this.displayLabel) && this.messagePosition !== MESSAGE_POSITION.ABOVE;
    }

    get showWarningIcon() {
        return Boolean(this.warningActive && this.warningShowIcon);
    }

    /**
     * Whether anything occupying space renders.
     *
     * Gates the bottom margin, so a component set to advance silently does not
     * push its neighbor down by half a rem for nothing.
     */
    get hasVisibleContent() {
        return Boolean(this.showTimer || this.showProgressBar || this.showLoader);
    }

    /**
     * `visibility: hidden` rather than removing the element, so the space it
     * occupied is kept and nothing below it jumps up when the timer expires.
     */
    get contentClass() {
        const base = "auto-navigate__content slds-m-bottom_x-small";
        return this.hideOnExpiry && this._timerExpired ? `${base} auto-navigate__content_hidden` : base;
    }

    get loaderAlternativeText() {
        return this.timerLabel || "Waiting to continue";
    }
}
