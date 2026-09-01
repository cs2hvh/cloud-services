/**
 * Build-log sanitisation, for logs that are about to be shown to a customer.
 *
 * THE HOLE THIS CLOSES IS REAL AND WAS OPEN. `buildCloneUrl()` in
 * lib/paas/github/client.ts returns
 *
 *     https://x-access-token:<installation-token>@github.com/<owner>/<repo>.git
 *
 * and lib/paas/build/vm.ts hands that straight to `git clone`. The build script
 * never echoes it and does not run under `set -x`, but git's own stderr on a
 * failed clone can quote the remote URL — and nothing downstream removed it.
 * The log route served whatever R2 held, verbatim, to every team member.
 *
 * ALLOWLIST FIRST, PATTERNS SECOND. This is the part v1 got right and the audit
 * told us to carry over: entire pipeline stages the customer has no business
 * reading are dropped wholesale, rather than scanned line by line for things
 * that look secret.
 *
 * The ordering matters because a pattern list is a denylist, and a denylist is
 * a bet that you thought of everything. We did not think of everything — the
 * first version of this defence thought of GitHub tokens and not of the
 * presigned R2 URLs in the upload stage, which are capability URLs that grant
 * exactly the write access the whole build-VM design exists to withhold.
 * Dropping the stage catches those whether or not anyone enumerated them.
 *
 * Patterns still run, over the stages that survive, because a customer's own
 * build can print a credential and that stage must remain readable. Two layers,
 * neither trusted alone.
 *
 * DEFAULT DENY. A stage marker this module does not recognise is dropped, not
 * passed through. When someone adds a stage to the build script and forgets to
 * classify it here, the failure is a customer missing output and filing a bug —
 * not a credential reaching them silently.
 */

/**
 * What a stage's raw output may do.
 *
 * `marker-only` keeps the stage's own marker line and drops everything after
 * it. It exists for a stage whose marker is informative but whose body runs
 * commands carrying credentials — the reader still sees that the stage
 * happened, and learns nothing about what it did.
 */
export type StagePolicy = "show" | "drop" | "marker-only";

/**
 * The build script's stages, in the order it emits them, mirroring the markers
 * in lib/paas/build/vm.ts. If that script changes, this must change with it —
 * the test suite asserts every marker the script emits is classified here.
 */
export const STAGES: Array<{ marker: RegExp; name: string; policy: StagePolicy; why: string }> = [
  {
    marker: /^=== ahura build (\S+) ===$/,
    name: "header",
    policy: "show",
    why:
      "Carries the deployment ref and nothing else. The ref is already the " +
      "customer's own identifier for this build, shown in the URL they opened.",
  },
  {
    marker: /^--- clone ---$/,
    name: "clone",
    policy: "drop",
    why:
      "The clone URL carries a live installation token, and git prints the " +
      "remote URL in its own error output. Nothing here helps a customer that " +
      "the controlled ERROR line does not.",
  },
  {
    marker: /^--- checkout ---$/,
    name: "checkout",
    policy: "marker-only",
    why:
      "Added when webhook deploys began building a SPECIFIC commit rather than " +
      "the branch tip. The marker shows the stage ran; the body is dropped for " +
      "the same reason the clone stage is — git talks to the remote here and " +
      "prints it in its own error output. The requested sha is echoed INSIDE " +
      "the body and therefore not shown, which costs nothing: it is recorded " +
      "on the deployment row and displayed in the UI. The controlled ERROR " +
      "line still explains a failure.",
  },
  {
    marker: /^--- Dockerfile ---$/,
    name: "dockerfile",
    policy: "show",
    why: "The customer's own Dockerfile, generated or supplied. Theirs to read.",
  },
  {
    marker: /^--- build ---$/,
    name: "build",
    policy: "show",
    why: "The reason anyone opens a build log. Compiler and BuildKit output.",
  },
  {
    marker: /^--- upload ---$/,
    name: "upload",
    policy: "drop",
    why:
      "Presigned R2 URLs. Their query signature IS the credential — it grants " +
      "the object write the build VM is deliberately not trusted with — and " +
      "curl prints the URL on failure.",
  },
  {
    marker: /^=== finishing: status=(\S+) ===$/,
    name: "finish",
    policy: "marker-only",
    why:
      "The marker itself is just a status. What follows it is not: vm.ts's exit " +
      "trap curls the build log to a PRESIGNED R2 URL immediately after printing " +
      "this line, and curl prints the URL on failure. The signature in that URL " +
      "grants write to the log object. Show that the build finished; show nothing " +
      "about how it was uploaded.",
  },
];

/**
 * Lines we author ourselves, which stay readable even inside a dropped stage.
 *
 * This is what makes stage-dropping tolerable rather than infuriating. A clone
 * failure is the customer's problem to fix — wrong branch, repo not found,
 * app not installed — and they cannot fix it if the whole stage vanishes. The
 * `fail()` helper in vm.ts emits a message we wrote, with no operands
 * interpolated, so it is safe in a way git's stderr is not.
 *
 * Each pattern must match the WHOLE line and capture no external text.
 */
export const CONTROLLED_LINES: RegExp[] = [
  /^ERROR: [A-Za-z0-9 ,.'()-]+$/, // fail() messages: our words, no interpolation
  /^build complete$/,
  /^digest: (sha256:[a-f0-9]{64})?$/,
];

const PLACEHOLDER = "[redacted]";

/**
 * Credential shapes, applied to every line that survives stage filtering.
 *
 * Defence in depth, explicitly NOT the primary control. Order matters: the
 * most specific patterns run first so a match reports the narrowest thing.
 */
export const PATTERNS: Array<{ name: string; re: RegExp; replace: string }> = [
  // Tokenised clone URL. Host and path survive so the line still reads.
  {
    name: "github-clone-url",
    re: /https:\/\/x-access-token:[^@\s]+@/gi,
    replace: `https://x-access-token:${PLACEHOLDER}@`,
  },
  // Any URL userinfo at all, not only GitHub's.
  //
  // The lookahead stops this re-matching what github-clone-url just cleaned.
  // Without it the two patterns fight: the specific one produces
  // `x-access-token:[redacted]@`, this one then eats that into `[redacted]@`,
  // and the reader loses the detail of WHICH credential was there while the
  // redaction counter double-counts one secret. Still safe, but less useful
  // and quietly wrong about how much it found.
  {
    name: "url-userinfo",
    re: /(https?:\/\/)[^/\s:@]+:(?!\[redacted\]@)[^/\s@]+@/gi,
    replace: `$1${PLACEHOLDER}@`,
  },
  // Presigned S3/R2 signatures. The signature and credential scope are the
  // capability; the rest of the URL is harmless and worth keeping legible.
  {
    name: "aws-sigv4-signature",
    re: /([?&]X-Amz-Signature=)[A-Fa-f0-9]+/gi,
    replace: `$1${PLACEHOLDER}`,
  },
  {
    name: "aws-sigv4-credential",
    re: /([?&]X-Amz-Credential=)[^&\s]+/gi,
    replace: `$1${PLACEHOLDER}`,
  },
  // GitHub token families, loose in the text.
  {
    name: "github-token",
    re: /\b(gh[spourc]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
    replace: PLACEHOLDER,
  },
  // JWTs — the Supabase service-role key is one, and so is any bearer we mint.
  {
    name: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    replace: PLACEHOLDER,
  },
  {
    name: "authorization-header",
    re: /\b(authorization\s*:\s*)(bearer|token|basic)\s+\S+/gi,
    replace: `$1$2 ${PLACEHOLDER}`,
  },
  { name: "aws-access-key-id", re: /\bAKIA[0-9A-Z]{16}\b/g, replace: PLACEHOLDER },
  // A PEM body should never be in a build log. If one is, drop the payload.
  {
    name: "private-key-block",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: `-----BEGIN PRIVATE KEY----- ${PLACEHOLDER} -----END PRIVATE KEY-----`,
  },
];

export interface SanitizedLog {
  /** Safe to show a customer. */
  text: string;
  /** True when anything at all was removed or replaced. */
  altered: boolean;
  /** Stage names dropped wholesale, in order encountered. */
  droppedStages: string[];
  /** How many credential patterns matched, by pattern name. */
  redactions: Record<string, number>;
  /** Lines discarded because they preceded any recognised stage marker. */
  droppedPreamble: number;
  /** Bytes of the original log, before anything was removed. */
  sourceBytes: number;
}

/**
 * Strip everything a customer must not see from a raw build log.
 *
 * Truncation is NOT done here, deliberately. Callers that need to cut output
 * must sanitise first and cut second — see `paginate`.
 */
export function sanitizeBuildLog(raw: string): SanitizedLog {
  const sourceBytes = Buffer.byteLength(raw, "utf8");
  const redactions: Record<string, number> = {};
  const droppedStages: string[] = [];
  const kept: string[] = [];

  let droppedPreamble = 0;
  let dropping = true; // default deny: nothing is shown until a stage says so
  let sawUnknownMarker = false;

  /**
   * The stage currently being suppressed, recorded only once a line is
   * ACTUALLY dropped from it.
   *
   * Reporting a stage as dropped when it had no body would make `altered` true
   * for a log where nothing was removed, and the notice would tell the reader
   * output is missing when none is. A sanitiser that cries wolf gets ignored.
   */
  let suppressing: { name: string; counted: boolean } | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");

    const stage = STAGES.find((s) => s.marker.test(line));
    if (stage) {
      dropping = stage.policy !== "show";
      // `marker-only` keeps the marker and then drops the body — the reader
      // sees that the stage ran without seeing what it ran.
      if (stage.policy === "show" || stage.policy === "marker-only") kept.push(line);
      suppressing = dropping ? { name: stage.name, counted: false } : null;
      continue;
    }

    // A marker-shaped line we do not recognise. Treat it as the start of an
    // unclassified stage and stop showing output, rather than assuming the
    // previous stage's policy still applies.
    // Recorded eagerly, unlike a classified stage: an unrecognised marker is
    // itself the finding — the build script emits a stage this file has never
    // heard of — whether or not any output followed it.
    if (/^(---|===).*(---|===)$/.test(line)) {
      sawUnknownMarker = true;
      dropping = true;
      droppedStages.push(`unclassified:${line.slice(0, 40)}`);
      suppressing = { name: `unclassified:${line.slice(0, 40)}`, counted: true };
      continue;
    }

    if (dropping) {
      if (CONTROLLED_LINES.some((re) => re.test(line))) {
        kept.push(line);
      } else if (suppressing) {
        if (!suppressing.counted) {
          droppedStages.push(suppressing.name);
          suppressing.counted = true;
        }
      } else {
        droppedPreamble += 1;
      }
      continue;
    }

    kept.push(line);
  }

  let text = kept.join("\n");

  // Count replacements that CHANGE something, not matches.
  //
  // Four of these patterns can match their own output — `[^@\s]+` and `\S+`
  // happily match "[redacted]" — so a log that has already been sanitised
  // would re-match and report credentials it did not remove. `redactions`
  // feeds alterationNotice and the API response, so that is not a cosmetic
  // miscount: it tells a reader their build output was modified when it was
  // not, and a sanitiser that cries wolf gets ignored.
  //
  // Adding a negative lookahead per pattern would also work, and would fail
  // the day someone adds a fifth pattern and forgets. Deriving the count from
  // the actual change holds however the patterns are written or reordered.
  for (const { name, re, replace } of PATTERNS) {
    re.lastIndex = 0;
    const single = new RegExp(re.source, re.flags.replace("g", ""));
    let changed = 0;
    const next = text.replace(re, (match: string) => {
      const out = match.replace(single, replace);
      if (out !== match) changed += 1;
      return out;
    });
    if (changed > 0) {
      redactions[name] = (redactions[name] ?? 0) + changed;
      text = next;
    }
  }

  return {
    text,
    altered:
      droppedStages.length > 0 ||
      Object.keys(redactions).length > 0 ||
      droppedPreamble > 0 ||
      sawUnknownMarker,
    droppedStages,
    redactions,
    droppedPreamble,
    sourceBytes,
  };
}

export interface LogPage {
  lines: string[];
  /** Line offset this page starts at, within the SANITISED log. */
  offset: number;
  /** Total sanitised lines available. */
  total: number;
  /** True when more lines follow this page. */
  hasMore: boolean;
}

/** Server-side ceiling. A caller asking for more than this gets this. */
export const MAX_PAGE_LINES = 2000;

/**
 * Page through an already-sanitised log.
 *
 * TAKES SanitizedLog, NOT A STRING, ON PURPOSE. Paginating first and
 * sanitising each page independently would let a credential straddling a page
 * boundary through — each half looks innocuous alone, and the stage a line
 * belongs to is not knowable from a slice that does not contain its marker.
 * The type makes that ordering impossible to get wrong by accident.
 *
 * `limit` is clamped rather than rejected: a client asking for a million lines
 * is answered with MAX_PAGE_LINES, never trusted and never errored at.
 */
export function paginate(
  log: SanitizedLog,
  opts: { offset?: number; limit?: number } = {},
): LogPage {
  const all = log.text === "" ? [] : log.text.split("\n");
  const total = all.length;

  const offset = Math.min(Math.max(Math.trunc(opts.offset ?? 0), 0), total);
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? MAX_PAGE_LINES), 1), MAX_PAGE_LINES);

  const lines = all.slice(offset, offset + limit);
  return { lines, offset, total, hasMore: offset + lines.length < total };
}

/**
 * The last `limit` lines — the default view for a failed build, because the
 * reason a build failed is at the end of the log, not the start.
 */
export function tail(log: SanitizedLog, limit = 200): LogPage {
  const total = log.text === "" ? 0 : log.text.split("\n").length;
  const clamped = Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_LINES);
  return paginate(log, { offset: Math.max(0, total - clamped), limit: clamped });
}

/**
 * A one-line note for the reader explaining what was removed.
 *
 * Silently altering a build log makes debugging worse: someone stares at
 * output that does not match what actually ran. Say so, without naming what
 * was found — "we removed a GitHub token" is itself a hint worth withholding.
 */
export function alterationNotice(log: SanitizedLog): string | null {
  if (!log.altered) return null;

  const parts: string[] = [];
  const stages = log.droppedStages.filter((s) => !s.startsWith("unclassified:"));
  // NAMES THE CLASS, NOT OUR PIPELINE. This used to list the stages by their
    // internal names — "clone, checkout, upload, finish stages hidden" — which
    // is our vocabulary for our machinery. The customer needs to know their view
    // is partial and that credentials were removed; which of our stages produced
    // the removed lines is not theirs to care about.
  if (stages.length || log.droppedStages.some((s) => s.startsWith("unclassified:"))) {
    parts.push("only build output is shown");
  }
  const n = Object.values(log.redactions).reduce((a, b) => a + b, 0);
  if (n) parts.push(`${n} credential${n === 1 ? "" : "s"} redacted`);

  if (!parts.length) return null;
  const joined = parts.join("; ");
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}
