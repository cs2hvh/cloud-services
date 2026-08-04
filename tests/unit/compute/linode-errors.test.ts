import { describe, expect, it } from "vitest";

import { sanitizeProviderMessage } from "@/lib/services/compute/providers/linode/errors";
import { validateRootPassword } from "@/lib/services/compute/providers/linode/create";

const FALLBACK = "Something went wrong. Please try again.";

describe("sanitizeProviderMessage", () => {
    describe("provider disclosure", () => {
        // docs/LINODE_COMPUTE.md: the provider must never appear in a customer
        // surface. Upstream reasons are written for the account holder and leak
        // it freely, so every path out of here has to be scrubbed.
        it("never leaks the provider name for the message that exposed the bug", () => {
            const out = sanitizeProviderMessage("Linode busy.", FALLBACK);
            expect(out.toLowerCase()).not.toContain("linode");
        });

        it("scrubs the provider name from otherwise useful validation text", () => {
            const out = sanitizeProviderMessage("Linode label must be unique", FALLBACK);
            expect(out.toLowerCase()).not.toContain("linode");
            expect(out).toContain("label must be unique");
        });

        it("scrubs plural and mixed-case forms", () => {
            for (const raw of ["LINODES are limited", "linode failed", "Akamai rejected it"]) {
                const out = sanitizeProviderMessage(raw, FALLBACK).toLowerCase();
                expect(out).not.toContain("linode");
                expect(out).not.toContain("akamai");
            }
        });

        it("does not mangle unrelated words containing the substring", () => {
            // Word-boundary anchored, so this must survive intact.
            expect(sanitizeProviderMessage("Disk resize failed", FALLBACK)).toBe(
                "Disk resize failed"
            );
        });
    });

    describe("actionable translations", () => {
        it("turns a busy instance into instructions", () => {
            const out = sanitizeProviderMessage("Linode busy.", FALLBACK);
            expect(out).toMatch(/busy/i);
            expect(out).toMatch(/try again/i);
        });

        it("explains missing stats rather than echoing the API", () => {
            const out = sanitizeProviderMessage("Stats are unavailable at this time.", FALLBACK);
            expect(out).toMatch(/metrics/i);
        });

        it("softens not-found", () => {
            expect(sanitizeProviderMessage("Not found", FALLBACK)).toMatch(/no longer available/i);
        });

        it("explains a rejected password without leaking internal field names", () => {
            // Real upstream text: our validator accepts passwords the provider's
            // strength check rejects, and the raw reason names API fields.
            const raw =
                "root_pass: Password does not meet strength requirement.; Must provide valid root_pass, authorized_keys, or authorized_users";
            const out = sanitizeProviderMessage(raw, FALLBACK);
            expect(out).toMatch(/strong enough/i);
            expect(out).not.toMatch(/authorized_keys|authorized_users|root_pass/);
        });

        it("hides a reseller billing problem from the customer", () => {
            const out = sanitizeProviderMessage(
                "Cannot create new Linodes with an outstanding balance on your account",
                FALLBACK
            );
            expect(out).not.toMatch(/outstanding balance/i);
            expect(out.toLowerCase()).not.toContain("linode");
            expect(out).toMatch(/try again later|contact support/i);
        });
    });

    describe("fallback", () => {
        it.each([undefined, "", "   "])("uses the fallback for %p", (input) => {
            expect(sanitizeProviderMessage(input as string | undefined, FALLBACK)).toBe(FALLBACK);
        });

        it("passes through a clean message unchanged", () => {
            const clean = "Root password must be 11-128 characters long.";
            expect(sanitizeProviderMessage(clean, FALLBACK)).toBe(clean);
        });
    });
});

describe("validateRootPassword", () => {
    // The deploy form accepts anything meeting length + character classes, but
    // the provider also rejects repetitive passwords — so a password the wizard
    // shows as valid could still fail after a full provisioning round trip.
    it("rejects a password that repeats one character", () => {
        expect(validateRootPassword("Qa1!aaaaaaaaaa")).toMatch(/four or more times/i);
    });

    it.each(["Qa1!Xk29vTbz4mQw", "Str0ng&Passw0rd!x", "aB3$kLm9qRt2"])(
        "accepts %s",
        (pass) => {
            expect(validateRootPassword(pass)).toBeNull();
        }
    );

    it("still enforces length and character classes", () => {
        expect(validateRootPassword("short")).toMatch(/11-128/);
        expect(validateRootPassword("aaaaaaaaaaaaaa")).toMatch(/at least two of|four or more/i);
    });

    it("allows up to three repeats, which providers accept", () => {
        expect(validateRootPassword("Qa1!aaabbbccc")).toBeNull();
    });
});
