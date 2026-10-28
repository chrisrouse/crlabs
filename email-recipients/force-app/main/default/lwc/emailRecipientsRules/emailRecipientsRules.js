/**
 * Rules for Email Recipients: parsing, validation, duplicates and limits.
 *
 * Typed entries, pasted text and initial values all go through evaluateEntries,
 * so one set of rules and messages applies everywhere. Nothing here touches the
 * DOM, which keeps the rules testable on their own.
 */

export const ABSOLUTE_MAX_EMAILS = 150;
const MAX_EMAIL_LENGTH = 254;

/** Why an entry was turned away. Also the order the messages are listed in. */
export const REASON = Object.freeze({
    FORMAT: "format",
    BLOCKED_DOMAIN: "blockedDomain",
    ALLOWED_DOMAIN: "allowedDomain",
    DUPLICATE: "duplicate",
    LIMIT: "limit"
});

const REASON_ORDER = [REASON.FORMAT, REASON.BLOCKED_DOMAIN, REASON.ALLOWED_DOMAIN, REASON.DUPLICATE, REASON.LIMIT];

/**
 * Local part and domain without spaces or separators, then a dot and a TLD of two
 * or more letters. No nested quantifiers, so a long non-matching string cannot
 * cause heavy backtracking.
 */
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/**
 * The maximum for this component, from the configured value. Blank or invalid
 * means the absolute maximum. Anything above the absolute maximum is capped.
 * @param {string|number|undefined} value
 * @returns {number}
 */
export function parseMaxEmails(value) {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        return ABSOLUTE_MAX_EMAILS;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        return ABSOLUTE_MAX_EMAILS;
    }
    return Math.min(parsed, ABSOLUTE_MAX_EMAILS);
}

/** Lower-cased, trimmed entries from a comma-separated list. */
function splitDomainList(text) {
    if (typeof text !== "string") {
        return [];
    }
    return text
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item !== "");
}

/** A wildcard pattern such as *.edu or *google*, escaped everywhere except the asterisks. */
function toDomainMatcher(item) {
    if (!item.includes("*")) {
        return { exact: item, regex: null };
    }
    const source = item.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return { exact: item, regex: new RegExp(`^${source}$`) };
}

/**
 * Compiles the allowed and blocked lists once, so checking each entry does not
 * rebuild them.
 * @param {string} allowedDomains comma-separated, may contain wildcards
 * @param {string} blockedDomains comma-separated, may contain wildcards
 * @returns {{allowed: Array, blocked: Array}}
 */
export function compileDomainRules(allowedDomains, blockedDomains) {
    return {
        allowed: splitDomainList(allowedDomains).map(toDomainMatcher),
        blocked: splitDomainList(blockedDomains).map(toDomainMatcher)
    };
}

function matchesDomain(domain, matcher) {
    return matcher.regex ? matcher.regex.test(domain) : domain === matcher.exact;
}

/**
 * The domain rule an address breaks, if any. Blocked is checked first, so an
 * address that is both blocked and not allowed reports as blocked.
 * @returns {string|null} a REASON, or null when the domain is acceptable
 */
export function domainReason(email, rules) {
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    if (rules.blocked.some((matcher) => matchesDomain(domain, matcher))) {
        return REASON.BLOCKED_DOMAIN;
    }
    if (rules.allowed.length > 0 && !rules.allowed.some((matcher) => matchesDomain(domain, matcher))) {
        return REASON.ALLOWED_DOMAIN;
    }
    return null;
}

/**
 * Pulls email addresses out of free text, in the order they appear. Addresses in
 * angle brackets (with or without a display name) are read as they are; any other
 * token containing an @ counts, when separated by spaces, commas, semicolons or pipes.
 * Returns an empty array when nothing looks like an address, so the caller can
 * treat the text as ordinary text.
 * @param {string} text
 * @returns {string[]}
 */
export function splitEntries(text) {
    if (typeof text !== "string") {
        return [];
    }
    const entries = [];
    const token = /<([^<>\s]+@[^<>\s]+)>|[^\s,;|<>]+/g;
    let match;
    while ((match = token.exec(text)) !== null) {
        const candidate = match[1] !== undefined ? match[1] : match[0];
        if (candidate.includes("@")) {
            entries.push(candidate);
        }
    }
    return entries;
}

/**
 * Runs candidates through the rules in a fixed order: format, blocked domain,
 * allowed domain, duplicate, then limit. Each candidate is judged once.
 *
 * @param {string[]} candidates raw entries, in the order they were given
 * @param {object} options
 * @param {string[]} [options.existing] addresses already in the list
 * @param {{allowed: Array, blocked: Array}} options.rules from compileDomainRules
 * @param {number} options.maxEmails the limit for the whole list
 * @returns {{accepted: string[], counts: Object<string, number>}}
 *   accepted addresses in order, and how many candidates each reason turned away
 */
export function evaluateEntries(candidates, { existing = [], rules, maxEmails }) {
    const accepted = [];
    const counts = {};
    const seen = new Set(existing.map((email) => email.toLowerCase()));
    const slots = Math.max(0, maxEmails - existing.length);

    const reject = (reason) => {
        counts[reason] = (counts[reason] || 0) + 1;
    };

    candidates.forEach((candidate) => {
        const email = typeof candidate === "string" ? candidate.trim() : "";
        if (email === "") {
            return;
        }
        if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
            reject(REASON.FORMAT);
            return;
        }
        const domainProblem = domainReason(email, rules);
        if (domainProblem) {
            reject(domainProblem);
            return;
        }
        const key = email.toLowerCase();
        if (seen.has(key)) {
            reject(REASON.DUPLICATE);
            return;
        }
        if (accepted.length >= slots) {
            reject(REASON.LIMIT);
            return;
        }
        seen.add(key);
        accepted.push(email);
    });

    return { accepted, counts };
}

function defaultMessage(reason, count, maxEmails) {
    const one = count === 1;
    switch (reason) {
        case REASON.FORMAT:
            return one ? "Please enter a valid email address." : `${count} entries are not valid email addresses.`;
        case REASON.BLOCKED_DOMAIN:
            return one ? "This email domain is not allowed." : `${count} emails use domains that are not allowed.`;
        case REASON.ALLOWED_DOMAIN:
            return one
                ? "This email domain is not in the allowed list."
                : `${count} emails use domains that are not in the allowed list.`;
        case REASON.DUPLICATE:
            return one ? "This email has already been added." : `${count} duplicate emails were skipped.`;
        case REASON.LIMIT:
            return `You can only add up to ${maxEmails} email addresses. ${count} ${one ? "was" : "were"} not added.`;
        default:
            return "";
    }
}

/**
 * The messages to show for a set of rejections, one per reason, in REASON order.
 * A custom message replaces the default text for its reason.
 * @param {Object<string, number>} counts from evaluateEntries
 * @param {object} options
 * @param {Object<string, string>} [options.custom] custom text keyed by REASON
 * @param {number} options.maxEmails
 * @returns {string[]}
 */
export function rejectionMessages(counts, { custom = {}, maxEmails }) {
    return REASON_ORDER.filter((reason) => counts[reason] > 0).map((reason) => {
        const text = custom[reason];
        if (typeof text === "string" && text.trim() !== "") {
            return text.trim();
        }
        return defaultMessage(reason, counts[reason], maxEmails);
    });
}
