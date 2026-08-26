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

/** What a stage's raw output may do. */
export type StagePolicy = "show" | "drop";

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
    policy: "show",
    why: "Terminal status. Contains no operands.",
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

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");

    const stage = STAGES.find((s) => s.marker.test(line));
    if (stage) {
      dropping = stage.policy === "drop";
      if (dropping) {
        droppedStages.push(stage.name);
      } else {
        kept.push(line);
      }
      continue;
    }

    // A marker-shaped line we do not recognise. Treat it as the start of an
    // unclassified stage and stop showing output, rather than assuming the
    // previous stage's policy still applies.
    if (/^(---|===).*(---|===)$/.test(line)) {
      sawUnknownMarker = true;
      dropping = true;
      droppedStages.push(`unclassified:${line.slice(0, 40)}`);
      continue;
    }

    if (dropping) {
      if (CONTROLLED_LINES.some((re) => re.test(line))) kept.push(line);
      else if (droppedStages.length === 0) droppedPreamble += 1;
      continue;
    }

    kept.push(line);
  }

  let text = kept.join("\n");
  for (const { name, re, replace } of PATTERNS) {
    re.lastIndex = 0;
    const matches = text.match(re);
    if (matches?.length) {
      redactions[name] = (redactions[name] ?? 0) + matches.length;
      re.lastIndex = 0;
      text = text.replace(re, replace);
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
  if (stages.length) {
    parts.push(`${[...new Set(stages)].join(", ")} ${stages.length === 1 ? "stage" : "stages"} hidden`);
  }
  if (log.droppedStages.some((s) => s.startsWith("unclassified:"))) {
    parts.push("unrecognised output hidden");
  }
  const n = Object.values(log.redactions).reduce((a, b) => a + b, 0);
  if (n) parts.push(`${n} credential${n === 1 ? "" : "s"} redacted`);

  if (!parts.length) return null;
  return `Some output is not shown (${parts.join("; ")}).`;
}
