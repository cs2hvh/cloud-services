/**
 * Customers must never be shown upstream error text.
 *
 * WHY THIS EXISTS
 *
 * A customer opened /dashboard/services/gpu/deploy and was shown a raw provider
 * schema-validation dump naming the upstream and its API path. The route looked
 * innocent — `error: result.error || "Unable to list pods"`. The leak was a
 * layer down: the SERVICE set `ServiceResult.error` to `e.message`, so the
 * provider's text travelled straight through a fallback that only applied when
 * the message happened to be empty.
 *
 * WHERE THE INVARIANT LIVES, and why this test checks the service layer
 *
 * The first version of this test scanned routes for `error: result.error` and
 * reported 142 of them. That was the wrong question: whether forwarding
 * `result.error` leaks depends on what the SERVICE put there, which a
 * route-level scan cannot see. Once the services are clean, forwarding is
 * correct — and until they are, no amount of route-level patching helps,
 * because the next route will forward it too.
 *
 * So the rule is enforced where the value is ASSIGNED:
 *
 *   A ServiceResult.error must never be a raw error value.
 *
 * That is checkable locally, has no cross-file reasoning, and fixing a
 * violation fixes every caller at once.
 *
 * WHAT IS STILL ALLOWED
 *
 * Server-side logging keeps the raw text — console.error and logError are
 * exempt and encouraged. The operator can debug; the customer cannot see the
 * plumbing. Where a message is genuinely actionable (a capacity refusal tells
 * you to retry; a stack trace does not) use customerSafeErrorMessage(), which
 * rewrites rather than hides.
 *
 * IF THIS FAILS on code you just wrote: log the raw error, then return
 * GENERIC_SERVICE_ERROR. Do not add yourself to the allowlist.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, match: (f: string) => boolean): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // absent in this checkout — not a failure
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full, match));
    else if (match(entry)) out.push(full);
  }
  return out;
}

const isSource = (f: string) => f.endsWith(".ts") && !f.includes(".test.");
const rel = (f: string) => f.replace(/\\/g, "/");

/** Comment, log line, or already-sanitised — not a customer-visible value. */
function isExempt(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    /console\.(error|warn|log|info|debug)/.test(t) ||
    /logError\s*\(/.test(t) ||
    /GENERIC_SERVICE_ERROR|sanitizeError|sanitizeAuthError|customerSafeErrorMessage/.test(t)
  );
}

describe("service layers never put raw error text in a customer-visible field", () => {
  /**
   * `error:` assigned an expression derived from a caught error.
   *
   * Deliberately narrow — it matches the VALUE of an `error:` field, not any
   * mention of `.message`. A broad scan would flag every console.error in the
   * codebase and teach people to ignore the test, which is worse than no test.
   */
  const RAW_ERROR_VALUE =
    /^\s*error:\s*(?:\w+\s+instanceof\s+Error\s*\?\s*)?\w+\??\.message|^\s*error:\s*String\(\s*\w+\s*\)/;

  const files = walk("lib/services", isSource);

  it("finds service files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no service assigns a raw error value to ServiceResult.error", () => {
    const findings: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (isExempt(line)) return;
          if (RAW_ERROR_VALUE.test(line)) {
            findings.push(`${rel(file)}:${i + 1}\n    ${line.trim()}`);
          }
        });
    }

    expect(
      findings,
      `\n${findings.length} service site(s) put a raw error value where a customer can see it.\n` +
        `Log the raw error, then return GENERIC_SERVICE_ERROR — or\n` +
        `customerSafeErrorMessage() where the detail is genuinely actionable.\n\n` +
        findings.join("\n\n") +
        "\n"
    ).toEqual([]);
  });
});

describe("customer-facing routes do not return raw error text directly", () => {
  /**
   * Routes that skip the service layer and hand a caught error straight back.
   *
   * Two constraints, both learned by getting it wrong first:
   *
   * 1. The key must be in VALUE position — preceded by `{` or `,`. Without
   *    that, a ternary matches: `e instanceof Error ? e.message : String(e)`
   *    reads as `message: String(e)` because the ternary's own colon looks
   *    like an object key. That produced two false positives on local variable
   *    assignments that never reach a response.
   *
   * 2. Only the canonical caught-error identifiers (e/err/error/ex). Matching
   *    any `.message` flagged `failure.message` from mapLinodeFlowError —
   *    which already calls sanitizeProviderMessage and falls back to hardcoded
   *    copy — and `AppOperationError.message`, a vetted customer-facing class.
   *    Whether a message is vetted is not visible syntactically, so the pattern
   *    stays narrow rather than crying wolf.
   *
   * `issue.message` is excluded on purpose: those are Zod validation messages,
   * written for the person filling in the form ("Expected string, received
   * number"). They describe the REQUEST, not our infrastructure, and hiding
   * them would make validation errors useless.
   */
  const RAW_IN_RESPONSE =
    /[{,]\s*(?:error|message)\s*:\s*(?:(?:\w+\s+instanceof\s+Error\s*\?\s*)?(?:e|err|error|ex)\??\.message|String\(\s*(?:e|err|error|ex)\s*\))/;

  /**
   * Routes whose dynamic message is deliberate and vetted.
   *
   * May shrink. Adding to it needs a reason that is not "the test is annoying"
   * — every entry can show a customer our plumbing.
   */
  const ALLOWED = new Set<string>([
    // AppOperationError is a customer-facing error class carrying its own
    // vetted message and status code — the allowlist pattern, not a leak. The
    // catch-all beside it already calls sanitizeError.
    "app/api/services/platform-apps/rollback/route.ts",
  ]);

  const files = ["app/api/services", "app/api/v1"].flatMap((d) =>
    walk(d, (f) => f === "route.ts")
  );

  it("finds routes to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no route returns a caught error's message to the client", () => {
    const findings: string[] = [];
    for (const file of files) {
      if (ALLOWED.has(rel(file))) continue;
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (isExempt(line)) return;
          if (RAW_IN_RESPONSE.test(line)) {
            findings.push(`${rel(file)}:${i + 1}\n    ${line.trim()}`);
          }
        });
    }

    expect(
      findings,
      `\n${findings.length} route(s) return a caught error's message to the client.\n` +
        `Log it and return GENERIC_SERVICE_ERROR instead.\n\n` +
        findings.join("\n\n") +
        "\n"
    ).toEqual([]);
  });

  it("the allowlist does not grow silently", () => {
    // A ratchet. Raise this deliberately, in the same commit that adds an
    // entry, so it shows up in review rather than drifting upward.
    expect(ALLOWED.size).toBeLessThanOrEqual(1);
  });
});
