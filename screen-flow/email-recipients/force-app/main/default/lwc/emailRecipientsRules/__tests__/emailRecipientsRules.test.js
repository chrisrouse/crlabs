import {
    ABSOLUTE_MAX_EMAILS,
    REASON,
    compileDomainRules,
    domainReason,
    evaluateEntries,
    parseMaxEmails,
    describeRejections,
    splitEntries
} from "c/emailRecipientsRules";

const NO_RULES = compileDomainRules("", "");

describe("parseMaxEmails", () => {
    it("uses the absolute maximum when blank or invalid", () => {
        expect(parseMaxEmails(undefined)).toBe(ABSOLUTE_MAX_EMAILS);
        expect(parseMaxEmails(null)).toBe(ABSOLUTE_MAX_EMAILS);
        expect(parseMaxEmails("")).toBe(ABSOLUTE_MAX_EMAILS);
        expect(parseMaxEmails("   ")).toBe(ABSOLUTE_MAX_EMAILS);
        expect(parseMaxEmails("abc")).toBe(ABSOLUTE_MAX_EMAILS);
        expect(parseMaxEmails(-3)).toBe(ABSOLUTE_MAX_EMAILS);
        expect(parseMaxEmails(2.5)).toBe(ABSOLUTE_MAX_EMAILS);
    });

    it("accepts a configured value, including zero, and caps it at the absolute maximum", () => {
        expect(parseMaxEmails(0)).toBe(0);
        expect(parseMaxEmails("5")).toBe(5);
        expect(parseMaxEmails(999)).toBe(ABSOLUTE_MAX_EMAILS);
    });
});

describe("splitEntries", () => {
    it("returns nothing for text with no addresses, so it can stay ordinary text", () => {
        expect(splitEntries("hello there")).toEqual([]);
        expect(splitEntries("")).toEqual([]);
    });

    it("splits on commas, semicolons, pipes, spaces and line breaks", () => {
        expect(splitEntries("a@x.com,b@x.com;c@x.com|d@x.com e@x.com\nf@x.com")).toEqual([
            "a@x.com",
            "b@x.com",
            "c@x.com",
            "d@x.com",
            "e@x.com",
            "f@x.com"
        ]);
    });

    it("reads addresses inside angle brackets, with a display name in front", () => {
        expect(splitEntries("Jane Doe <jane@x.com>, Bob <bob@x.com>")).toEqual(["jane@x.com", "bob@x.com"]);
    });

    it("keeps tokens that contain an @ even when they are not valid, so they are reported", () => {
        expect(splitEntries("not@valid@x")).toEqual(["not@valid@x"]);
    });
});

describe("domainReason", () => {
    it("accepts everything when no domain rules are set", () => {
        expect(domainReason("a@anything.org", NO_RULES)).toBeNull();
    });

    it("matches exact domains without regard to case", () => {
        const rules = compileDomainRules("Example.com", "");
        expect(domainReason("a@EXAMPLE.com", rules)).toBeNull();
        expect(domainReason("a@other.com", rules)).toBe(REASON.ALLOWED_DOMAIN);
    });

    it("matches wildcards in any position", () => {
        const rules = compileDomainRules("*.edu, *google*", "");
        expect(domainReason("a@school.edu", rules)).toBeNull();
        expect(domainReason("a@mail.google.com", rules)).toBeNull();
        expect(domainReason("a@yahoo.com", rules)).toBe(REASON.ALLOWED_DOMAIN);
    });

    it("treats regex characters in a domain literally", () => {
        const rules = compileDomainRules("", "a+b.com");
        expect(domainReason("x@a+b.com", rules)).toBe(REASON.BLOCKED_DOMAIN);
        expect(domainReason("x@aab.com", rules)).toBeNull();
    });

    it("checks blocked before allowed, so a blocked domain reports as blocked", () => {
        const rules = compileDomainRules("x.com", "x.com");
        expect(domainReason("a@x.com", rules)).toBe(REASON.BLOCKED_DOMAIN);
    });
});

describe("evaluateEntries", () => {
    it("accepts valid addresses in order", () => {
        const { accepted, rejected } = evaluateEntries(["a@x.com", "b@y.org"], { rules: NO_RULES, maxEmails: 10 });
        expect(accepted).toEqual(["a@x.com", "b@y.org"]);
        expect(rejected).toEqual([]);
    });

    it("rejects malformed addresses as format errors, keeping the text as given", () => {
        const { accepted, rejected } = evaluateEntries(["bob", "a@b", "ok@x.com", "a@@x.com"], {
            rules: NO_RULES,
            maxEmails: 10
        });
        expect(accepted).toEqual(["ok@x.com"]);
        expect(rejected).toEqual([
            { email: "bob", reason: REASON.FORMAT },
            { email: "a@b", reason: REASON.FORMAT },
            { email: "a@@x.com", reason: REASON.FORMAT }
        ]);
    });

    it("drops blank candidates without rejecting them", () => {
        const { accepted, rejected } = evaluateEntries(["", "   ", "ok@x.com"], { rules: NO_RULES, maxEmails: 10 });
        expect(accepted).toEqual(["ok@x.com"]);
        expect(rejected).toEqual([]);
    });

    it("treats duplicates case-insensitively, against the list and within the batch", () => {
        const { accepted, rejected } = evaluateEntries(["A@x.com", "a@X.com", "b@x.com"], {
            existing: ["a@x.com"],
            rules: NO_RULES,
            maxEmails: 10
        });
        expect(accepted).toEqual(["b@x.com"]);
        expect(rejected.map((entry) => entry.reason)).toEqual([REASON.DUPLICATE, REASON.DUPLICATE]);
    });

    it("applies the limit to the whole list, counting what is already there", () => {
        const { accepted, rejected } = evaluateEntries(["c@x.com", "d@x.com", "e@x.com"], {
            existing: ["a@x.com", "b@x.com"],
            rules: NO_RULES,
            maxEmails: 4
        });
        expect(accepted).toEqual(["c@x.com", "d@x.com"]);
        expect(rejected).toEqual([{ email: "e@x.com", reason: REASON.LIMIT }]);
    });

    it("accepts nothing when the limit is zero", () => {
        const { accepted, rejected } = evaluateEntries(["a@x.com"], { rules: NO_RULES, maxEmails: 0 });
        expect(accepted).toEqual([]);
        expect(rejected).toEqual([{ email: "a@x.com", reason: REASON.LIMIT }]);
    });

    it("rejects addresses on blocked and disallowed domains, each with its reason", () => {
        const rules = compileDomainRules("x.com", "spam.x.com");
        const { accepted, rejected } = evaluateEntries(["a@x.com", "b@spam.x.com", "c@y.com"], {
            rules,
            maxEmails: 10
        });
        expect(accepted).toEqual(["a@x.com"]);
        expect(rejected).toEqual([
            { email: "b@spam.x.com", reason: REASON.BLOCKED_DOMAIN },
            { email: "c@y.com", reason: REASON.ALLOWED_DOMAIN }
        ]);
    });

    it("handles a long batch, counting duplicates of accepted addresses and the rest as limit", () => {
        // 150 accepted. Repeats of accepted addresses are duplicates (300 here: two more passes over
        // them). Everything else over the limit is a limit rejection, including repeats of addresses
        // that were turned away.
        const candidates = Array.from({ length: 5000 }, (_, index) => `user${index % 2000}@x.com`);
        const { accepted, rejected } = evaluateEntries(candidates, { rules: NO_RULES, maxEmails: 150 });
        const count = (reason) => rejected.filter((entry) => entry.reason === reason).length;
        expect(accepted).toHaveLength(150);
        expect(count(REASON.DUPLICATE)).toBe(300);
        expect(count(REASON.LIMIT)).toBe(4550);
    });
});

describe("describeRejections", () => {
    it("names each rejected address with its reason, in the order given", () => {
        const rejected = [
            { email: "bob", reason: REASON.FORMAT },
            { email: "ann@x.com", reason: REASON.DUPLICATE }
        ];
        expect(describeRejections(rejected, { maxEmails: 5 })).toEqual([
            "bob: Not a valid email address.",
            "ann@x.com: This email has already been added."
        ]);
    });

    it("uses a custom message in place of the default for its reason", () => {
        const custom = { [REASON.FORMAT]: "  Check that address.  " };
        expect(describeRejections([{ email: "bob", reason: REASON.FORMAT }], { custom, maxEmails: 5 })).toEqual([
            "bob: Check that address."
        ]);
    });

    it("ignores blank custom text", () => {
        const custom = { [REASON.DUPLICATE]: "   " };
        expect(describeRejections([{ email: "a@x.com", reason: REASON.DUPLICATE }], { custom, maxEmails: 5 })).toEqual([
            "a@x.com: This email has already been added."
        ]);
    });

    it("summarizes limit rejections in one line, with the maximum and the count", () => {
        const rejected = [
            { email: "e@x.com", reason: REASON.LIMIT },
            { email: "f@x.com", reason: REASON.LIMIT }
        ];
        expect(describeRejections(rejected, { maxEmails: 5 })).toEqual([
            "You can only add up to 5 email addresses. 2 were not added."
        ]);
    });

    it("names at most the listLimit addresses, then says how many more were left out", () => {
        const rejected = ["a", "b", "c"].map((email) => ({ email, reason: REASON.FORMAT }));
        expect(describeRejections(rejected, { maxEmails: 5, listLimit: 2 })).toEqual([
            "a: Not a valid email address.",
            "b: Not a valid email address.",
            "and 1 more could not be added."
        ]);
    });
});
