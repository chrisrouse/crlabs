/**
 * Screen Timer — custom property editor.
 *
 * Uses the imperative side of the Flow Config Editor Kit rather than
 * `static flowProperties`, for the same reason `fgrid_flowGridEditor` does: the
 * declarative schema recognizes only String, Number, SObject and field, so it
 * has no Boolean control, and this panel is mostly checkboxes. It also needs the
 * four duration boxes on one row, which a flat form cannot express.
 *
 * Everything else still comes from the base class — the four Flow Builder
 * inputs, the input-changed event, and `validate()`. No kit code is forked.
 */
import FlowConfigEditorBase from "c/flowConfigEditorBase";

const DIRECTION_DOWN = "Down";

/**
 * Shown when a property has never been written.
 *
 * Deliberately NOT committed on load. Displaying a default that is not saved
 * would be a lie, and writing one during initialization races Flow Builder's
 * own republishing. The screen component applies the same fallbacks, so an
 * untouched control and the runtime agree.
 *
 * The duration has no entry here on purpose: there is no safe guess for how
 * long a screen should wait, so it stays blank and `validateConfiguration`
 * insists on one.
 */
const DISPLAY_DEFAULTS = {
    showTimer: false,
    showReset: false,
    showLoader: false,
    showProgressBar: false,
    hideOnExpiry: false,
    refreshOnTimeout: false,
    warningShowIcon: false,
    warningTintProgressBar: false,
    warningStyle: "Color and Weight",
    timerDirection: DIRECTION_DOWN,
    timerStyle: "Text",
    fillDirection: "Match Timer",
    ringSize: "Medium",
    // Salesforce brand blue, and the SLDS error red for the warning. Must match the component.
    fillColor: "#0176D3",
    textColor: "#0176D3",
    warningColor: "#BA0517",
    timeoutAction: "Next",
    timeFormat: "Standard",
    messagePosition: "Below"
};

/**
 * Flow's value data types are String, Number, Boolean, Date, DateTime and
 * reference. "Integer" is a *property* type in js-meta.xml and is not one of
 * them — sending it breaks Flow Builder's element factory on save.
 */
const NUMBER_DATA_TYPE = "Number";

/** A saved or picked Flow reference, as the value inputs display it: `{!Resource}`. */
const REFERENCE_PATTERN = /^\{!.+\}$/;

function isFlowReference(value) {
    return typeof value === "string" && REFERENCE_PATTERN.test(value.trim());
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

const DURATION_PROPERTIES = ["timeoutDays", "timeoutHours", "timeoutMinutes", "timeoutSeconds"];
const WARNING_PROPERTIES = ["warningDays", "warningHours", "warningMinutes", "warningSeconds"];

/** Multiplier per box, in the order the property lists above declare them. */
const UNIT_SECONDS = [SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, 1];

function pluralize(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "1 minute 5 seconds" — the summary an admin reads back to check their entry. */
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

export default class ScreenTimerEditor extends FlowConfigEditorBase {
    /**
     * Open on load. Only the duration is needed for a working configuration,
     * so the rest start collapsed rather than making the panel a long scroll.
     */
    initialSections = ["when"];

    /**
     * Optimistic values, keyed by property.
     *
     * Every getter reads through here before falling back to `input()`, so a
     * control shows what was just typed instead of waiting on Flow Builder to
     * republish `inputVariables`.
     */
    pending = {};

    /* ------------------------------------------------------------------ *
     * Value resolution
     * ------------------------------------------------------------------ */

    resolve(name) {
        if (Object.prototype.hasOwnProperty.call(this.pending, name)) {
            const pendingValue = this.pending[name];
            return pendingValue === null || pendingValue === undefined
                ? (DISPLAY_DEFAULTS[name] ?? null)
                : pendingValue;
        }
        return this.input(name, DISPLAY_DEFAULTS[name] ?? null);
    }

    commit(name, value, dataType) {
        this.pending = { ...this.pending, [name]: value };
        if (value === null || value === undefined) {
            this.clearInput(name, dataType);
        } else {
            this.setInput(name, value, dataType);
        }
    }

    /**
     * Retires optimistic values as Flow Builder confirms them, one property at
     * a time, on PRESENCE rather than on matching values.
     *
     * Dropping `pending` wholesale on any republish loses keys Flow Builder has
     * not echoed yet, which reads back as the display default — the bug that
     * made a checkbox impossible to uncheck in `fgrid_flowGridEditor`.
     */
    configurationChanged(source) {
        super.configurationChanged(source);
        if (source !== "inputVariables" || !Object.keys(this.pending).length) {
            return;
        }
        const remaining = {};
        Object.keys(this.pending).forEach((name) => {
            if (!this.inputVariable(name)) {
                remaining[name] = this.pending[name];
            }
        });
        this.pending = remaining;
    }

    /* ------------------------------------------------------------------ *
     * Controls
     * ------------------------------------------------------------------ */

    get timeoutDays() {
        return this.resolve("timeoutDays");
    }

    get timeoutHours() {
        return this.resolve("timeoutHours");
    }

    get timeoutMinutes() {
        return this.resolve("timeoutMinutes");
    }

    get timeoutSeconds() {
        return this.resolve("timeoutSeconds");
    }

    /** Tells a duration box whether it holds a typed number or a resource. */
    durationDataType(name) {
        return isFlowReference(this.resolve(name)) ? "reference" : NUMBER_DATA_TYPE;
    }

    get timeoutDaysDataType() {
        return this.durationDataType("timeoutDays");
    }

    get timeoutHoursDataType() {
        return this.durationDataType("timeoutHours");
    }

    get timeoutMinutesDataType() {
        return this.durationDataType("timeoutMinutes");
    }

    get timeoutSecondsDataType() {
        return this.durationDataType("timeoutSeconds");
    }

    get showTimer() {
        return Boolean(this.resolve("showTimer"));
    }

    get showReset() {
        return Boolean(this.resolve("showReset"));
    }

    get showLoader() {
        return Boolean(this.resolve("showLoader"));
    }

    get showProgressBar() {
        return Boolean(this.resolve("showProgressBar"));
    }

    get hideOnExpiry() {
        return Boolean(this.resolve("hideOnExpiry"));
    }

    get refreshOnTimeout() {
        return Boolean(this.resolve("refreshOnTimeout"));
    }

    get refreshRecordId() {
        return this.resolve("refreshRecordId");
    }

    get refreshRecordIdDataType() {
        return this.inputDataType("refreshRecordId", null);
    }

    get timeoutAction() {
        return this.resolve("timeoutAction");
    }

    get actionOptions() {
        return [
            // Labels only. The stored values stay Next/Back/Stay so renaming
            // a label never touches a saved flow.
            { label: "Next", value: "Next" },
            { label: "Previous", value: "Back" },
            { label: "Stay on This Screen", value: "Stay" },
            { label: "Overrun on This Screen", value: "Overrun" }
        ];
    }

    /* ---- Time running out ---- */

    get warningDays() {
        return this.resolve("warningDays");
    }

    get warningHours() {
        return this.resolve("warningHours");
    }

    get warningMinutes() {
        return this.resolve("warningMinutes");
    }

    get warningSeconds() {
        return this.resolve("warningSeconds");
    }

    get warningDaysDataType() {
        return this.durationDataType("warningDays");
    }

    get warningHoursDataType() {
        return this.durationDataType("warningHours");
    }

    get warningMinutesDataType() {
        return this.durationDataType("warningMinutes");
    }

    get warningSecondsDataType() {
        return this.durationDataType("warningSeconds");
    }

    /** As `durationBound`, for the warning boxes. */
    get warningBound() {
        return WARNING_PROPERTIES.some((name) => isFlowReference(this.resolve(name)));
    }

    get warningSummary() {
        if (this.warningBound) {
            return this.warningTotalSeconds > 0
                ? `Warns ${humanizeSeconds(this.warningTotalSeconds)} plus the bound values before advancing.`
                : "Warns by the bound values before advancing.";
        }
        if (this.warningTotalSeconds <= 0) {
            return "No warning phase.";
        }
        return `Warns ${humanizeSeconds(this.warningTotalSeconds)} before advancing.`;
    }

    get warningSummaryClass() {
        const base = "duration__summary slds-text-body_small slds-m-top_xx-small";
        return this.warningTotalSeconds > 0 || this.warningBound ? base : `${base} slds-text-color_weak`;
    }

    get warningStyle() {
        return this.resolve("warningStyle");
    }

    get warningLabel() {
        return this.resolve("warningLabel");
    }

    get warningLabelDataType() {
        return this.inputDataType("warningLabel", null);
    }

    get warningShowIcon() {
        return Boolean(this.resolve("warningShowIcon"));
    }

    get warningTintProgressBar() {
        return Boolean(this.resolve("warningTintProgressBar"));
    }

    get timeFormat() {
        return this.resolve("timeFormat");
    }

    /** Examples in the labels: a format is far easier to recognise than read. */
    get timeFormatOptions() {
        return [
            { label: "Standard (0:40)", value: "Standard" },
            { label: "Always Two Digits (00:00:40)", value: "Fixed" },
            { label: "Compact (40)", value: "Compact" }
        ];
    }

    get messagePosition() {
        return this.resolve("messagePosition");
    }

    get messagePositionOptions() {
        return [
            { label: "Below the Timer", value: "Below" },
            { label: "Above the Timer", value: "Above" }
        ];
    }

    get warningStyleOptions() {
        return [
            { label: "No Change", value: "None" },
            { label: "Color", value: "Color" },
            { label: "Color and Weight", value: "Color and Weight" },
            { label: "Pulse", value: "Pulse" },
            { label: "Tinted Pill", value: "Tinted Pill" }
        ];
    }

    /**
     * The warning controls are deliberately NOT gated on a threshold.
     *
     * They do nothing without one, which is harmless, and greying them would
     * have to be inconsistent: the kit's value input cannot be disabled, so
     * Warning Message would stay live while its neighbours greyed out. Leaving
     * all of them available is the only uniform option that does not involve
     * swapping controls in and out as the admin types.
     */
    get warningTotalSecondsSet() {
        return this.warningTotalSeconds > 0;
    }

    /** Held as a `{!Reference}`, which is the form the resource picker expects. */
    resolveReference(name) {
        if (Object.prototype.hasOwnProperty.call(this.pending, name)) {
            return this.pending[name];
        }
        return this.reference(name, null);
    }

    get paused() {
        return this.resolveReference("paused");
    }

    get advanceWhen() {
        return this.resolveReference("advanceWhen");
    }

    get timerDirection() {
        return this.resolve("timerDirection");
    }

    get timerLabel() {
        return this.resolve("timerLabel");
    }

    get timerLabelDataType() {
        return this.inputDataType("timerLabel", null);
    }

    /* ---- Style ---- */

    get timerStyle() {
        return this.resolve("timerStyle");
    }

    get timerStyleOptions() {
        return [
            { label: "Text", value: "Text" },
            { label: "Ring", value: "Ring" },
            { label: "Bar", value: "Bar" },
            { label: "Pill", value: "Pill" }
        ];
    }

    get fillDirection() {
        return this.resolve("fillDirection");
    }

    get fillDirectionOptions() {
        return [
            { label: "Match Timer Direction", value: "Match Timer" },
            { label: "Drain", value: "Drain" },
            { label: "Fill", value: "Fill" }
        ];
    }

    get ringSize() {
        return this.resolve("ringSize");
    }

    get ringSizeOptions() {
        return [
            { label: "Small", value: "Small" },
            { label: "Medium", value: "Medium" },
            { label: "Large", value: "Large" }
        ];
    }

    get fillColor() {
        return this.resolve("fillColor");
    }

    get textColor() {
        return this.resolve("textColor");
    }

    get warningColor() {
        return this.resolve("warningColor");
    }

    /** Unset means the Warning Color, so the overrun follows it until someone picks one. */
    get overrunColor() {
        return this.resolve("overrunColor") || this.warningColor;
    }

    get directionOptions() {
        return [
            { label: "Count Down to Zero", value: DIRECTION_DOWN },
            { label: "Count Up from Zero", value: "Up" }
        ];
    }

    /** The reset button and direction only mean anything with a visible timer. */
    get timerOptionsDisabled() {
        return !this.showTimer;
    }

    /** Sums one Hours / Minutes / Seconds trio into whole seconds. */
    sumSeconds(properties) {
        return properties.reduce((total, name, index) => {
            const parsed = Number(this.resolve(name));
            return total + (Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) * UNIT_SECONDS[index] : 0);
        }, 0);
    }

    /**
     * True when any duration box holds a resource. Its value only exists at
     * runtime, so the total here counts the typed boxes alone and the editor
     * cannot judge the whole duration.
     */
    get durationBound() {
        return DURATION_PROPERTIES.some((name) => isFlowReference(this.resolve(name)));
    }

    get totalSeconds() {
        return this.sumSeconds(DURATION_PROPERTIES);
    }

    get warningTotalSeconds() {
        return this.sumSeconds(WARNING_PROPERTIES);
    }

    get durationSummary() {
        if (this.durationBound) {
            return this.totalSeconds > 0
                ? `Advances after ${humanizeSeconds(this.totalSeconds)} plus the bound values.`
                : "Advances after the bound values.";
        }
        return this.totalSeconds > 0 ? `Advances after ${humanizeSeconds(this.totalSeconds)}.` : "";
    }

    get durationSummaryClass() {
        const base = "duration__summary slds-text-body_small slds-m-top_xx-small";
        return this.totalSeconds > 0 || this.durationBound ? base : `${base} slds-text-color_weak`;
    }

    /* ------------------------------------------------------------------ *
     * Change handling
     * ------------------------------------------------------------------ */

    /**
     * A whole number of hours, minutes or seconds — or nothing.
     *
     * Blank clears the property rather than storing 0, so "no hours" and "not
     * answered yet" stay distinguishable. Published as a string with a "Number"
     * data type, which is what the kit's own number input sends; Flow stores the
     * literal as text and coerces it against the declared Integer property.
     */
    handleDuration(event) {
        this.commitCount(event.target.dataset.property, event.target.value);
    }

    /**
     * A duration box holds a typed number or a resource. A resource is saved as
     * the reference itself; a typed value goes through the same rules as above.
     */
    handleDurationValue(event) {
        const { name, newValue, newValueDataType } = event.detail;
        if (newValueDataType === "reference" || isFlowReference(newValue)) {
            this.commit(name, newValue, "reference");
            this.clearErrors();
            return;
        }
        this.commitCount(name, newValue);
    }

    commitCount(property, raw) {
        if (raw === "" || raw === null || raw === undefined) {
            this.commit(property, null, NUMBER_DATA_TYPE);
            this.clearErrors();
            return;
        }

        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
            return;
        }
        this.commit(property, String(Math.trunc(parsed)), NUMBER_DATA_TYPE);
        this.clearErrors();
    }

    handleCheckbox(event) {
        this.commit(event.target.dataset.property, event.target.checked, "Boolean");
    }

    /** A color input's hex value, as the editor writes it. */
    handleColor(event) {
        this.commit(event.target.dataset.property, event.target.value, "String");
    }

    /** Every combobox writes a String; the property comes off the dataset. */
    handleSelect(event) {
        this.commit(event.target.dataset.property, event.detail.value, "String");
    }

    /**
     * Both Boolean inputs are resource-only: a hardcoded value would pause the
     * timer forever, or fire the trigger on load. The property comes off the
     * event so one handler serves both pickers.
     */
    handleResourceChange(event) {
        const { name, newValue, newValueDataType } = event.detail;
        this.commit(name, newValue, newValueDataType || "reference");
    }

    /** The value input carries its own data type; this may be a Flow reference. */
    handleValueChange(event) {
        const { name, newValue, newValueDataType } = event.detail;
        this.commit(name, newValue, newValueDataType || "String");
    }

    /* ------------------------------------------------------------------ *
     * Validation
     * ------------------------------------------------------------------ */

    validateConfiguration() {
        // A duration is only required when nothing else can complete the
        // screen. With Advance When This Is True bound, the trigger is the
        // timer, and a duration is an optional backstop.
        if (this.totalSeconds <= 0 && !this.durationBound) {
            if (this.advanceWhen) {
                return [];
            }
            // Anchored on Seconds because it is the field an admin filling this
            // in for the first time is most likely to reach for.
            return [
                {
                    key: "timeoutSeconds",
                    errorString: "Enter a duration greater than zero, or bind Advance When This Is True."
                }
            ];
        }

        return [];
    }
}
