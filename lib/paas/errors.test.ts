import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CustomerError,
  customerError,
  isCustomerError,
  toCustomerFacing,
  buildFailureMessage,
  GENERIC,
} from "./errors.ts";

/* ══════════════════════════════════════════════════════════════════════
   Part 1 — the seam itself
   ══════════════════════════════════════════════════════════════════════ */

test("ONLY A CustomerError KEEPS ITS TEXT", () => {
  // The allowlist, stated as a test. Everything below is a real string this
  // platform can produce, and not one of them may reach a customer.
  const leaks = [
    new Error("[cloudflare] POST /zones/abc/custom_hostnames -> 403: 10000 Authentication error"),
    new Error("[r2] PUT builds/dpl-x/image.tar -> 403: SignatureDoesNotMatch"),
    new Error("[k8s] /etc/ahura/kubeconfig is not a recognised LKE kubeconfig"),
    new Error("LinodeError: POST /linode/instances: Account limit reached"),
    new Error("[paas/db] GET projects?select=* -> 500: relation does not exist"),
    "a bare string thrown by something careless",
    { weird: "not an Error at all" },
    null,
    undefined,
  ];

  for (const leak of leaks) {
    const shown = toCustomerFacing(leak, "build");
    const detail = typeof leak === "object" && leak !== null ? String((leak as Error).message ?? "") : String(leak);
    if (detail) {
      assert.ok(
        !shown.message.includes(detail),
        `the original text survived: ${shown.message}`,
      );
    }
    assert.equal(shown.code, "internal_error");
    assert.ok(shown.reference, "a withheld failure must give the customer something to quote");
    assert.ok(shown.message.includes(shown.reference!), "the reference must be in the message");
  }
});

test("a CustomerError passes through untouched, because that is the point", () => {
  const e = customerError("nothing_to_build", "This repository has no build script.");
  const shown = toCustomerFacing(e, "build");
  assert.equal(shown.message, "This repository has no build script.");
  assert.equal(shown.code, "nothing_to_build");
  assert.equal(shown.reference, undefined, "nothing was withheld, so there is nothing to reference");
});

test("the check survives losing the prototype", () => {
  // The deploy path crosses module boundaries, and the sweeps cross process
  // boundaries. An error that has been serialised is no longer an instance of
  // anything, and instanceof alone would silently start withholding messages
  // that were written to be shown.
  const rehydrated = JSON.parse(
    JSON.stringify({ message: "Your build failed.", customerFacing: true, code: "build_failed" }),
  );
  assert.equal(isCustomerError(rehydrated), true);
  assert.equal(toCustomerFacing(rehydrated).message, "Your build failed.");

  // And it must not be fooled by something that merely looks similar.
  assert.equal(isCustomerError({ message: "x" }), false);
  assert.equal(isCustomerError({ customerFacing: true }), false);
  assert.equal(isCustomerError(new Error("x")), false);
});

test("two failures never share a reference", () => {
  // A reference that is a hash of the message would collapse every occurrence
  // of one failure into one id, and support would get a ticket matching a
  // thousand log lines. It identifies THIS failure at THIS moment.
  const refs = new Set(
    Array.from({ length: 200 }, () => toCustomerFacing(new Error("same message every time")).reference),
  );
  assert.ok(refs.size > 190, `references collided: only ${refs.size} distinct out of 200`);
});

test("a build failure the customer caused says so; one we caused does not", () => {
  const theirs = buildFailureMessage("root directory not found in repository");
  assert.match(theirs.message, /root directory/i);
  assert.equal(theirs.reference, undefined);

  for (const ours of ["apt update failed", "package install failed", "buildkit download failed", "buildkitd did not start", "image upload failed"]) {
    const shown = buildFailureMessage(ours);
    assert.ok(!shown.message.includes(ours), `"${ours}" reached the customer`);
    assert.ok(shown.reference, `"${ours}" gave the customer nothing to quote`);
  }
});

test("A NEW BUILD FAILURE IS WITHHELD UNTIL SOMEBODY DECIDES IT IS SAFE", () => {
  // The allowlist doing its job: a string is not trusted because it is new.
  // If someone adds a `fail '...'` to the build script and forgets this table,
  // the customer gets the generic form rather than whatever was written.
  const shown = buildFailureMessage("some brand new failure nobody classified");
  assert.ok(!shown.message.includes("brand new"));
  assert.ok(shown.reference);
});

test("an empty build error is a timeout, not a mystery", () => {
  for (const empty of [null, undefined, "", "   "]) {
    const shown = buildFailureMessage(empty);
    assert.equal(shown.code, "build_timeout");
  }
});

/* ══════════════════════════════════════════════════════════════════════
   Part 2 — the rule, enforced across the files that face customers
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Words that describe OUR infrastructure.
 *
 * A customer cannot act on any of them, and together they map the platform for
 * anyone who can trigger a failure. This list is a backstop for the allowlist
 * above, not the mechanism — it catches a hand-written string in a route that
 * never went through the seam.
 */
const FORBIDDEN = [
  "linode", "cloudflare", "kubeconfig", "kubernetes", "kubectl", "buildkit",
  "postgrest", "supabase", "nodebalancer", "traefik", "skopeo", "gvisor",
  "namespace", "presigned", "runtimeclass", "ingress", "configmap",
  "service role", "row-level", "stack trace", "econnrefused", "enotfound",
];

/** Repo-relative roots whose strings are read by customers. */
const ROOTS = [
  "app/api/v2",
  "components/v2",
  "app/dashboard/services/apps",
];

/** Helpers whose string arguments are rendered to a customer. */
const SINKS = [
  "apiError(", "invalid(", "conflict(", "notEnabled(", "notFound(",
  "setError(", "setLoadError(", "setBranchError(", "setSubmitError(", "setMessage(",
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Strip comments so a code comment mentioning Linode is not a violation. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ");
}

/**
 * Every string literal inside a call to one of the sinks.
 *
 * Scans forward from the sink to its matching close paren, tracking nesting,
 * so a message assembled from several concatenated pieces is caught whole
 * rather than only its first fragment.
 */
function customerStrings(src: string): string[] {
  const code = stripComments(src);
  const found: string[] = [];

  for (const sink of SINKS) {
    let at = 0;
    for (;;) {
      const i = code.indexOf(sink, at);
      if (i < 0) break;
      at = i + sink.length;

      let depth = 1;
      let j = at;
      for (; j < code.length && depth > 0; j++) {
        const c = code[j];
        if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (c === '"' || c === "'" || c === "`") {
          const quote = c;
          let k = j + 1;
          let buf = "";
          while (k < code.length && code[k] !== quote) {
            if (code[k] === "\\") k++;
            else buf += code[k];
            k++;
          }
          found.push(buf);
          j = k;
        }
      }
    }
  }
  return found;
}

test("NO CUSTOMER-FACING MESSAGE NAMES OUR INFRASTRUCTURE", () => {
  const violations: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      for (const literal of customerStrings(src)) {
        const hay = literal.toLowerCase();
        for (const word of FORBIDDEN) {
          if (hay.includes(word)) {
            violations.push(`${file}\n    "${literal.slice(0, 110)}"\n    contains: ${word}`);
          }
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `customer-facing text naming our infrastructure:\n\n${violations.join("\n\n")}\n`,
  );
});

test("the scanner actually reads the files it claims to", () => {
  // The guard above is worthless if ROOTS is wrong or walk() returns nothing —
  // it would pass by finding no files at all. This is the coverage check that
  // stops it going vacuous, which is a failure this project has met before.
  const files = ROOTS.flatMap((r) => walk(r));
  assert.ok(files.length > 40, `only ${files.length} files scanned — ROOTS is probably wrong`);

  const strings = files.flatMap((f) => customerStrings(readFileSync(f, "utf8")));
  assert.ok(strings.length > 60, `only ${strings.length} customer strings found — SINKS is probably wrong`);
});

test("the scanner catches a violation when there is one", () => {
  // Proving the detector, not the codebase. Without this, "no violations" and
  // "cannot detect violations" are the same green tick.
  const planted = `
    export function GET() {
      return apiError("internal", "The Linode API rejected the request.", 500);
    }
  `;
  const hits = customerStrings(planted).filter((s) =>
    FORBIDDEN.some((w) => s.toLowerCase().includes(w)),
  );
  assert.equal(hits.length, 1, "the scanner missed a planted violation");
});

test("a comment mentioning our vendors is not a violation", () => {
  // Otherwise the rule would push authors to stop explaining themselves, and
  // the comments in this codebase are load-bearing.
  const src = `
    // Cloudflare returns 409 when the hostname already exists on another zone.
    /* The Linode API is eventually consistent here. */
    return apiError("conflict", "That domain is already in use.", 409);
  `;
  const hits = customerStrings(src).filter((s) =>
    FORBIDDEN.some((w) => s.toLowerCase().includes(w)),
  );
  assert.deepEqual(hits, []);
});

test("the generic messages say whose fault it is and what to do next", () => {
  for (const [kind, text] of Object.entries(GENERIC)) {
    assert.ok(text.length > 30, `${kind} is too terse to be useful`);
    for (const word of FORBIDDEN) {
      assert.ok(!text.toLowerCase().includes(word), `${kind} names ${word}`);
    }
    // Every one must point somewhere: try again, or talk to a person.
    assert.match(
      text,
      /try again|refresh|contact support/i,
      `${kind} tells the customer nothing to do`,
    );
  }
});

test("CustomerError is an Error, so nothing downstream has to special-case it", () => {
  const e = customerError("x", "y");
  assert.ok(e instanceof Error);
  assert.equal(e.message, "y");
  assert.equal(new CustomerError("a", "b").code, "a");
});
