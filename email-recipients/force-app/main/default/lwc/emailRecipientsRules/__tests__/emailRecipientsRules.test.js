import {
    ABSOLUTE_MAX_EMAILS,
    REASON,
    compileDomainRules,
    domainReason,
    evaluateEntries,
    parseMaxEmails,
    rejectionMessages,
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
        const { accepted, counts } = evaluateEntries(["a@x.com", "b@y.org"], { rules: NO_RULES, maxEmails: 10 });
        expect(accepted).toEqual(["a@x.com", "b@y.org"]);
        expect(counts).toEqual({});
    });

    it("rejects malformed addresses and counts them as format errors", () => {
        const { accepted, counts } = evaluateEntries(["bob", "a@b", "ok@x.com", "a@@x.com"], {
            rules: NO_RULES,
            maxEmails: 10
        });
        expect(accepted).toEqual(["ok@x.com"]);
        expect(counts[REASON.FORMAT]).toBe(3);
    });

    it("drops blank candidates without counting them", () => {
        const { accepted, counts } = evaluateEntries(["", "   ", "ok@x.com"], { rules: NO_RULES, maxEmails: 10 });
        expect(accepted).toEqual(["ok@x.com"]);
        expect(counts).toEqual({});
    });

    it("treats duplicates case-insensitively, against the list and within the batch", () => {
        const { accepted, counts } = evaluateEntries(["A@x.com", "a@X.com", "b@x.com"], {
            existing: ["a@x.com"],
            rules: NO_RULES,
            maxEmails: 10
        });
        expect(accepted).toEqual(["b@x.com"]);
        expect(counts[REASON.DUPLICATE]).toBe(2);
    });

    it("applies the limit to the whole list, counting what is already there", () => {
        const { accepted, counts } = evaluateEntries(["c@x.com", "d@x.com", "e@x.com"], {
            existing: ["a@x.com", "b@x.com"],
            rules: NO_RULES,
            maxEmails: 4
        });
        expect(accepted).toEqual(["c@x.com", "d@x.com"]);
        expect(counts[REASON.LIMIT]).toBe(1);
    });

    it("accepts nothing when the limit is zero", () => {
        const { accepted, counts } = evaluateEntries(["a@x.com"], { rules: NO_RULES, maxEmails: 0 });
        expect(accepted).toEqual([]);
        expect(counts[REASON.LIMIT]).toBe(1);
    });

    it("rejects addresses on blocked and disallowed domains", () => {
        const rules = compileDomainRules("x.com", "spam.x.com");
        const { accepted, counts } = evaluateEntries(["a@x.com", "b@spam.x.com", "c@y.com"], {
            rules,
            maxEmails: 10
        });
        expect(accepted).toEqual(["a@x.com"]);
        expect(counts[REASON.BLOCKED_DOMAIN]).toBe(1);
        expect(counts[REASON.ALLOWED_DOMAIN]).toBe(1);
    });

    it("handles a long batch, counting duplicates of accepted addresses and the rest as limit", () => {
        // 150 accepted. Repeats of accepted addresses are duplicates (300 here: two more passes over
        // them). Everything else over the limit is a limit rejection, including repeats of addresses
        // that were turned away.
        const candidates = Array.from({ length: 5000 }, (_, index) => `user${index % 2000}@x.com`);
        const { accepted, counts } = evaluateEntries(candidates, { rules: NO_RULES, maxEmails: 150 });
        expect(accepted).toHaveLength(150);
        expect(counts[REASON.DUPLICATE]).toBe(300);
        expect(counts[REASON.LIMIT]).toBe(4550);
    });
});

describe("rejectionMessages", () => {
    it("describes one reason in singular", () => {
        expect(rejectionMessages({ [REASON.FORMAT]: 1 }, { maxEmails: 5 })).toEqual([
            "Please enter a valid email address."
        ]);
    });

    it("describes several rejections of one reason in plural", () => {
        expect(rejectionMessages({ [REASON.DUPLICATE]: 3 }, { maxEmails: 5 })).toEqual([
            "3 duplicate emails were skipped."
        ]);
    });

    it("states the maximum and how many were left out", () => {
        expect(rejectionMessages({ [REASON.LIMIT]: 2 }, { maxEmails: 5 })).toEqual([
            "You can only add up to 5 email addresses. 2 were not added."
        ]);
    });

    it("replaces a default with custom text, and ignores blank custom text", () => {
        const custom = { [REASON.FORMAT]: "  Check that address.  ", [REASON.DUPLICATE]: "   " };
        expect(rejectionMessages({ [REASON.FORMAT]: 1, [REASON.DUPLICATE]: 1 }, { custom, maxEmails: 5 })).toEqual([
            "Check that address.",
            "This email has already been added."
        ]);
    });

    it("lists messages in a fixed order, whatever order the counts were built in", () => {
        const counts = { [REASON.LIMIT]: 1, [REASON.FORMAT]: 1 };
        expect(rejectionMessages(counts, { maxEmails: 5 })[0]).toBe("Please enter a valid email address.");
    });
});
