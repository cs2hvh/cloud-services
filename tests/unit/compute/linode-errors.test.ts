import { describe, expect, it } from "vitest";

import { sanitizeProviderMessage } from "@/lib/services/compute/providers/linode/errors";

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
