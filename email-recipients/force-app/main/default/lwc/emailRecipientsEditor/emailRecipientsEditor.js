import FlowConfigEditorBase from "c/flowConfigEditorBase";

const NUMBER_DATA_TYPE = "Number";
const ABSOLUTE_MAX_EMAILS = 150;

/**
 * Configuration panel for Email Recipients, built on the Flow Config Editor Kit.
 *
 * Settings are grouped by the question an admin is answering: what the field
 * looks like, which addresses it accepts, what it says when one is refused, and
 * the starting list. Defaults match the component's, and are not written until
 * an admin changes them.
 */
export default class EmailRecipientsEditor extends FlowConfigEditorBase {
    /** Open on load: the field itself is what every configuration needs. */
    initialSections = ["field"];

    /** Shown at the foot of the panel. Bump it with each change, so a build can be confirmed in Flow Builder. */
    buildVersion = "Version 0.1.0 · build 2026-10-28.3";

    /** Optimistic values, so a control shows what was just entered. */
    pending = {};

    // ========================
    // Value resolution
    // ========================

    resolve(name, fallback = null) {
        if (Object.prototype.hasOwnProperty.call(this.pending, name)) {
            const pendingValue = this.pending[name];
            return pendingValue === null || pendingValue === undefined ? fallback : pendingValue;
        }
        return this.input(name, fallback);
    }

    resolveReference(name) {
        if (Object.prototype.hasOwnProperty.call(this.pending, name)) {
            return this.pending[name];
        }
        return this.reference(name, null);
    }

    commit(name, value, dataType) {
        this.pending = { ...this.pending, [name]: value };
        if (value === null || value === undefined || value === "") {
            this.clearInput(name, dataType);
        } else {
            this.setInput(name, value, dataType);
        }
    }

    /** Retires an optimistic value once Flow Builder has echoed the property back. */
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

    // ========================
    // Controls
    // ========================

    get label() {
        return this.resolve("label");
    }

    get labelDataType() {
        return this.inputDataType("label", null);
    }

    get placeholder() {
        return this.resolve("placeholder");
    }

    get placeholderDataType() {
        return this.inputDataType("placeholder", null);
    }

    get helpText() {
        return this.resolve("helpText");
    }

    get helpTextDataType() {
        return this.inputDataType("helpText", null);
    }

    /** Resource-only: the value is a Boolean the flow decides at runtime, so it is kept as a reference. */
    get requiredReference() {
        return this.resolveReference("required");
    }

    get disabledReference() {
        return this.resolveReference("disabled");
    }

    get maxEmails() {
        return this.resolve("maxEmails");
    }

    get allowedDomains() {
        return this.resolve("allowedDomains");
    }

    get allowedDomainsDataType() {
        return this.inputDataType("allowedDomains", null);
    }

    get blockedDomains() {
        return this.resolve("blockedDomains");
    }

    get blockedDomainsDataType() {
        return this.inputDataType("blockedDomains", null);
    }

    get invalidEmailErrorMessage() {
        return this.resolve("invalidEmailErrorMessage");
    }

    get invalidEmailErrorMessageDataType() {
        return this.inputDataType("invalidEmailErrorMessage", null);
    }

    get allowedDomainsErrorMessage() {
        return this.resolve("allowedDomainsErrorMessage");
    }

    get allowedDomainsErrorMessageDataType() {
        return this.inputDataType("allowedDomainsErrorMessage", null);
    }

    get blockedDomainsErrorMessage() {
        return this.resolve("blockedDomainsErrorMessage");
    }

    get blockedDomainsErrorMessageDataType() {
        return this.inputDataType("blockedDomainsErrorMessage", null);
    }

    get maxEmailsErrorMessage() {
        return this.resolve("maxEmailsErrorMessage");
    }

    get maxEmailsErrorMessageDataType() {
        return this.inputDataType("maxEmailsErrorMessage", null);
    }

    get duplicateEmailErrorMessage() {
        return this.resolve("duplicateEmailErrorMessage");
    }

    get duplicateEmailErrorMessageDataType() {
        return this.inputDataType("duplicateEmailErrorMessage", null);
    }

    get initialEmails() {
        return this.resolveReference("value");
    }

    get maxEmailsHelp() {
        return `Leave blank for the default of ${ABSOLUTE_MAX_EMAILS}. Accepts 0 to ${ABSOLUTE_MAX_EMAILS}.`;
    }

    // ========================
    // Change handling
    // ========================

    /** A value input reports typed text or a picked resource; both are kept as given. */
    handleValueChange(event) {
        const { name, newValue, newValueDataType } = event.detail;
        this.commit(name, newValue, newValueDataType || "String");
    }

    /** The initial list is a collection resource, so it is saved as a reference. */
    handleResourceChange(event) {
        const { name, newValue, newValueDataType } = event.detail;
        this.commit(name, newValue, newValueDataType || "reference");
    }

    /** Blank clears the maximum, so the component uses its default. Anything out of range is refused. */
    handleMaxEmails(event) {
        const raw = event.target.value;
        if (raw === "" || raw === null || raw === undefined) {
            this.commit("maxEmails", null, NUMBER_DATA_TYPE);
            this.clearError("maxEmails");
            return;
        }
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > ABSOLUTE_MAX_EMAILS) {
            return;
        }
        this.commit("maxEmails", String(parsed), NUMBER_DATA_TYPE);
        this.clearError("maxEmails");
    }

    // ========================
    // Validation
    // ========================

    validateConfiguration() {
        const max = this.maxEmails;
        if (max !== null && max !== undefined && max !== "") {
            const parsed = Number(max);
            if (!Number.isInteger(parsed) || parsed < 0 || parsed > ABSOLUTE_MAX_EMAILS) {
                return [
                    {
                        key: "maxEmails",
                        errorString: `Maximum emails must be a whole number from 0 to ${ABSOLUTE_MAX_EMAILS}.`
                    }
                ];
            }
        }
        return [];
    }
}
