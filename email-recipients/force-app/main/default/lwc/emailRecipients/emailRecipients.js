import { LightningElement, api } from "lwc";
import { FlowAttributeChangeEvent } from "lightning/flowSupport";
import {
    REASON,
    compileDomainRules,
    evaluateEntries,
    parseMaxEmails,
    describeRejections,
    splitEntries
} from "c/emailRecipientsRules";

/**
 * Email Recipients: collects validated email addresses for a Flow screen.
 *
 * The list is the only state. Every change goes through the rules module, and
 * outputs are published only when the list actually changes. Nothing here uses
 * timers: initial values are applied when the component connects, once Flow has
 * set its properties.
 */
export default class EmailRecipients extends LightningElement {
    // Defaults here match the editor's displayed defaults, so an untouched
    // configuration and the runtime agree.
    @api label = "Email";
    @api placeholder = "Enter an email address";
    @api helpText;
    @api required = false;
    @api disabled = false;
    @api maxEmails;
    @api allowedDomains;
    @api blockedDomains;
    @api invalidEmailErrorMessage;
    @api allowedDomainsErrorMessage;
    @api blockedDomainsErrorMessage;
    @api maxEmailsErrorMessage;
    @api duplicateEmailErrorMessage;

    _value;
    _connected = false;
    _entries = [];
    _emails = [];
    _nextKey = 0;
    _hasError = false;
    _pendingMessages = null;
    _announcement = "";
    _rules = null;
    _rulesSource = null;

    /** Initial addresses from the flow. Applied on connect, and again if set later. */
    @api
    get value() {
        return this._value;
    }

    set value(newValue) {
        this._value = newValue;
        if (this._connected) {
            this.seedFromValue();
        }
    }

    /** Output: the addresses as a collection. */
    @api
    get emailCollection() {
        return this._emails;
    }

    /** Output: the addresses as one comma-delimited string, for Send Email. */
    @api
    get emailList() {
        return this._emails.join(",");
    }

    connectedCallback() {
        this._connected = true;
        this.seedFromValue();
    }

    disconnectedCallback() {
        this._connected = false;
    }

    // ========================
    // Derived state
    // ========================

    get effectiveMax() {
        return parseMaxEmails(this.maxEmails);
    }

    /** Compiled once per pair of domain lists, not on every check. */
    get rules() {
        const source = `${this.allowedDomains || ""}|${this.blockedDomains || ""}`;
        if (source !== this._rulesSource) {
            this._rulesSource = source;
            this._rules = compileDomainRules(this.allowedDomains, this.blockedDomains);
        }
        return this._rules;
    }

    get customMessages() {
        return {
            [REASON.FORMAT]: this.invalidEmailErrorMessage,
            [REASON.BLOCKED_DOMAIN]: this.blockedDomainsErrorMessage,
            [REASON.ALLOWED_DOMAIN]: this.allowedDomainsErrorMessage,
            [REASON.DUPLICATE]: this.duplicateEmailErrorMessage,
            [REASON.LIMIT]: this.maxEmailsErrorMessage
        };
    }

    get entries() {
        return this._entries;
    }

    get pillItems() {
        return this._entries.map((entry) => ({ key: entry.key, name: entry.key, label: entry.label }));
    }

    get hasEntries() {
        return this._entries.length > 0;
    }

    get requiredInput() {
        return this.required && !this.hasEntries;
    }

    get announcement() {
        return this._announcement;
    }

    get inputElement() {
        return this.template.querySelector('[data-role="entry"]');
    }

    // ========================
    // Adding and removing
    // ========================

    /** Applies the list from the flow, replacing whatever was there. */
    seedFromValue() {
        const values = Array.isArray(this._value) ? this._value : [];
        const { accepted, rejected } = evaluateEntries(values, {
            rules: this.rules,
            maxEmails: this.effectiveMax
        });
        this.replaceEntries(accepted);
        this.showMessages(this.messagesFor(rejected));
    }

    /**
     * Runs candidates through the rules and adds what passes.
     * @param {string[]} candidates
     * @returns {number} how many were added
     */
    addCandidates(candidates) {
        const { accepted, rejected } = evaluateEntries(candidates, {
            existing: this._emails,
            rules: this.rules,
            maxEmails: this.effectiveMax
        });
        if (accepted.length > 0) {
            this._entries = [...this._entries, ...accepted.map((email) => this.createEntry(email))];
            this.commitEntries();
            this.announce(accepted.length === 1 ? `${accepted[0]} added.` : `${accepted.length} addresses added.`);
        }
        // Rejected addresses stay in the field, so the user can see and fix exactly what failed.
        this.setInputText(rejected.map((entry) => entry.email).join(", "));
        this.showMessages(this.messagesFor(rejected));
        return accepted.length;
    }

    /** Commits text typed or left in the input: one or more addresses, or a single entry to reject. */
    commitText(text) {
        const candidates = splitEntries(text);
        this.addCandidates(candidates.length > 0 ? candidates : [text.trim()]);
    }

    replaceEntries(emails) {
        this._entries = emails.map((email) => this.createEntry(email));
        this.commitEntries();
    }

    createEntry(label) {
        this._nextKey += 1;
        return { key: `email-${this._nextKey}`, label };
    }

    /** Refreshes the output lists and tells Flow about the change. */
    commitEntries() {
        this._emails = this._entries.map((entry) => entry.label);
        const emailList = this._emails.join(",");
        this.dispatchEvent(new FlowAttributeChangeEvent("emailCollection", this._emails));
        this.dispatchEvent(new FlowAttributeChangeEvent("emailList", emailList));
        this.dispatchEvent(new CustomEvent("emailschanged", { detail: { emails: this._emails, emailList } }));
    }

    // ========================
    // Messages
    // ========================

    messagesFor(rejected) {
        return describeRejections(rejected, { custom: this.customMessages, maxEmails: this.effectiveMax });
    }

    /**
     * Shows messages through the input's own validity, so the field is marked
     * invalid and the message is linked to it. Also announced politely.
     */
    showMessages(messages) {
        const text = messages.join(" ");
        this._hasError = messages.length > 0;
        const input = this.inputElement;
        if (input) {
            input.setCustomValidity(text);
            input.reportValidity();
        } else {
            // Initial values are applied before the first render, so the input does not exist yet.
            this._pendingMessages = messages;
        }
        if (text) {
            this.announce(text);
        }
    }

    /** Shows messages raised before the input existed, once, after the first render. */
    renderedCallback() {
        if (this._pendingMessages) {
            const messages = this._pendingMessages;
            this._pendingMessages = null;
            this.showMessages(messages);
        }
    }

    clearErrors() {
        if (this._hasError) {
            this.showMessages([]);
        }
    }

    announce(text) {
        this._announcement = text;
    }

    setInputText(text) {
        const input = this.inputElement;
        if (input) {
            input.value = text;
        }
    }

    // ========================
    // Event handlers
    // ========================

    handleKeyDown(event) {
        if (this.disabled) {
            return;
        }
        this.clearErrors();
        if (event.key === "Enter" || event.key === " " || event.key === "Tab") {
            const text = event.target.value;
            if (text && text.trim()) {
                if (event.key !== "Tab") {
                    // Enter would submit the form and Space would type a blank; neither should land.
                    event.preventDefault();
                }
                this.commitText(text);
            }
        }
    }

    handleBlur(event) {
        if (this.disabled) {
            return;
        }
        const text = event.target.value;
        if (text && text.trim()) {
            this.commitText(text);
        }
    }

    /** Pasted addresses are split and added; anything else pastes as ordinary text. */
    handlePaste(event) {
        if (this.disabled) {
            return;
        }
        const text = event.clipboardData ? event.clipboardData.getData("text") : "";
        const candidates = splitEntries(text);
        if (candidates.length === 0) {
            return;
        }
        event.preventDefault();
        this.addCandidates(candidates);
    }

    handleRemove(event) {
        if (this.disabled) {
            return;
        }
        const item = event.detail && event.detail.item ? event.detail.item : event.detail;
        const removed = this._entries.find((entry) => entry.key === (item && item.name));
        if (!removed) {
            return;
        }
        this._entries = this._entries.filter((entry) => entry !== removed);
        this.commitEntries();
        this.announce(`${removed.label} removed.`);
    }

    // ========================
    // Flow validation and public API
    // ========================

    /** The first problem with the list, or an empty string when it is valid. */
    validationMessage() {
        if (this.required && !this.hasEntries) {
            return "Please enter at least one email address.";
        }
        if (this._emails.length > this.effectiveMax) {
            return this.customMessages[REASON.LIMIT] || `You can only add up to ${this.effectiveMax} email addresses.`;
        }
        return "";
    }

    @api
    checkValidity() {
        return this.validationMessage() === "";
    }

    @api
    reportValidity() {
        const message = this.validationMessage();
        this.showMessages(message ? [message] : []);
        return message === "";
    }

    /** Flow's validation entry point: reports the result and whether the screen may continue. */
    @api
    validate() {
        const message = this.validationMessage();
        this.showMessages(message ? [message] : []);
        return message ? { isValid: false, errorMessage: message } : { isValid: true };
    }

    @api
    clearEmails() {
        if (this.disabled) {
            return;
        }
        this.replaceEntries([]);
        this.clearErrors();
    }

    @api
    setEmails(emailArray) {
        if (!Array.isArray(emailArray)) {
            return;
        }
        const { accepted, rejected } = evaluateEntries(emailArray, {
            rules: this.rules,
            maxEmails: this.effectiveMax
        });
        this.replaceEntries(accepted);
        this.showMessages(this.messagesFor(rejected));
    }
}
