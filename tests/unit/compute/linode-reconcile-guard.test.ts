import { describe, expect, it } from "vitest";

import { shouldAbortOrphanPass } from "@/lib/services/linode/reconcile";

/**
 * The orphan pass marks servers errored and CLOSES their billing meters. It
 * decides purely from "this row's linode_id is absent from the live instance
 * list", which is also exactly what a rotated/re-scoped token or a short
 * upstream page looks like. The guard exists so a visibility problem can't be
 * mistaken for a vanished fleet and bill-close everyone in one run.
 */
describe("shouldAbortOrphanPass", () => {
    describe("real drift — must NOT abort", () => {
        it.each([
            [1, 1, "the only server was genuinely deleted"],
            [1, 10, "one of ten drifted"],
            [2, 10, "two of ten drifted"],
            [2, 2, "small fleet, below the minimum"],
            [2, 3, "still below the minimum count"],
        ])("candidates=%i of %i rows — %s", (candidates, rows) => {
            expect(shouldAbortOrphanPass(candidates, rows)).toBe(false);
        });

        it("does not abort on an empty fleet", () => {
            expect(shouldAbortOrphanPass(0, 0)).toBe(false);
        });

        it("does not abort when nothing looks orphaned", () => {
            expect(shouldAbortOrphanPass(0, 500)).toBe(false);
        });
    });

    describe("lost visibility — must abort", () => {
        it("aborts when the token can no longer see the fleet at all", () => {
            // The token-swap scenario: every tracked row looks orphaned.
            expect(shouldAbortOrphanPass(200, 200)).toBe(true);
        });

        it.each([
            [3, 3],
            [5, 8],
            [50, 100],
        ])("aborts at candidates=%i of %i rows", (candidates, rows) => {
            expect(shouldAbortOrphanPass(candidates, rows)).toBe(true);
        });
    });

    describe("threshold boundary", () => {
        it("holds at exactly half once past the minimum", () => {
            expect(shouldAbortOrphanPass(5, 10)).toBe(true);
            expect(shouldAbortOrphanPass(4, 10)).toBe(false);
        });

        it("requires BOTH the ratio and the minimum", () => {
            // 100% of rows, but too few to be meaningful — a two-server
            // account really can lose both.
            expect(shouldAbortOrphanPass(2, 2)).toBe(false);
            // Same ratio, enough rows to be implausible.
            expect(shouldAbortOrphanPass(3, 3)).toBe(true);
        });
    });
});
