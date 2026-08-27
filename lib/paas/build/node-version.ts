/**
 * Which Node.js major to build and run an application on.
 *
 * WHY THIS IS NOT JUST "USE THE NEWEST".
 *
 * A repository that pins Node is usually pinning it for a reason: a native
 * addon with no prebuilt binary for a newer ABI, a dependency that reads a V8
 * header that has since changed, a framework version that predates the runtime.
 * Building those on the newest Node produces failures deep inside node-gyp —
 *
 *     v8-local-handle.h:269:42: error: static assertion failed: type check
 *
 * — which name a C++ header rather than a version mismatch, and which no
 * customer is going to trace back to a base image they never chose. Deploy v2
 * hardcoded 22 and ignored every pin the repository offered.
 *
 * WHY THE RANGE IS NOT EVALUATED PRECISELY. We choose a MAJOR, because that is
 * what a base image is: `node:18-alpine` is the newest 18 there is. So a range
 * is tested against majors, and `>=18.17.0` is satisfied by 18 — the image will
 * be well past 18.17. Being exact here would mean rejecting a major whose image
 * actually satisfies the range, which is worse than the approximation.
 */

/** The majors we publish images for, oldest first. */
export const SUPPORTED_NODE_MAJORS = [18, 20, 22, 24] as const;

/** Used when a repository says nothing, or says something we cannot read. */
export const DEFAULT_NODE_MAJOR = 22;

export interface NodeChoice {
  /** The major to put in the base image tag. */
  major: number;
  /** Why, in the words the build log should carry. */
  reason: string;
}

/** One comparator out of a range: an operator and the major it applies to. */
interface Clause {
  op: ">=" | ">" | "<=" | "<" | "=";
  major: number;
}

function parseClause(raw: string): Clause | null {
  const t = raw.trim();
  if (!t || t === "*" || t === "x" || t === "latest") return null;

  const m = /^(>=|<=|>|<|\^|~|=|v)?\s*v?(\d+)/.exec(t);
  if (!m) return null;

  const major = Number(m[2]);
  if (!Number.isFinite(major)) return null;

  switch (m[1]) {
    case ">=":
      return { op: ">=", major };
    case ">":
      // `>18` and `>18.0.0` are both satisfied by the newest 18 image, so this
      // deliberately behaves like >=. The alternative rejects a major whose
      // image does satisfy the range.
      return { op: ">=", major };
    case "<=":
      return { op: "<=", major };
    case "<":
      return { op: "<", major };
    default:
      // ^18, ~18.1, =18, 18, 18.x — all mean "the 18 line".
      return { op: "=", major };
  }
}

function satisfies(major: number, clauses: Clause[]): boolean {
  return clauses.every((c) => {
    switch (c.op) {
      case ">=":
        return major >= c.major;
      case "<=":
        return major <= c.major;
      case "<":
        return major < c.major;
      case "=":
        return major === c.major;
    }
  });
}

/**
 * Read a major out of an .nvmrc.
 *
 * The file holds a bare version — `18`, `18.20.4`, `v20.11.0` — and sometimes an
 * alias like `lts/hydrogen`, which names a major we cannot resolve without a
 * table that would go stale. An alias returns null so the caller falls through
 * to engines rather than guessing wrong.
 */
export function majorFromNvmrc(contents: string | undefined): number | null {
  if (!contents) return null;
  const m = /^\s*v?(\d+)(?:\.|\s|$)/.exec(contents);
  if (!m) return null;
  const major = Number(m[1]);
  return Number.isFinite(major) ? major : null;
}

/**
 * Choose the Node major for a repository.
 *
 * Preference order, and the reasoning behind it:
 *
 *  1. `.nvmrc`, because a developer writes it to say what they actually run.
 *  2. `engines.node`, which is a constraint rather than a choice — so within it
 *     we take our default when the default fits, and otherwise the newest
 *     supported major that does. An app declaring `>=18` gets 22, not 18: it
 *     said 18 was the floor, not the target.
 *  3. The default.
 *
 * An unsupported pin is NOT silently rounded. Building 16 on a 22 image is how
 * a customer ends up debugging someone else's runtime, so the reason says
 * plainly that the pin could not be honoured.
 */
export function resolveNodeVersion(input: {
  enginesNode?: string | null;
  nvmrc?: string | null;
}): NodeChoice {
  const supported = SUPPORTED_NODE_MAJORS as readonly number[];

  const pinned = majorFromNvmrc(input.nvmrc ?? undefined);
  if (pinned !== null) {
    if (supported.includes(pinned)) {
      return { major: pinned, reason: `.nvmrc pins Node ${pinned}` };
    }
    return {
      major: DEFAULT_NODE_MAJOR,
      reason: `.nvmrc pins Node ${pinned}, which this platform does not offer — building on ${DEFAULT_NODE_MAJOR}`,
    };
  }

  const range = (input.enginesNode ?? "").trim();
  if (!range) {
    return { major: DEFAULT_NODE_MAJOR, reason: `no Node version declared — using ${DEFAULT_NODE_MAJOR}` };
  }

  // `18 || 20` is two ranges; a major satisfying either satisfies the whole.
  const alternatives = range
    .split("||")
    .map((alt) => alt.split(/[\s,]+/).map(parseClause).filter((c): c is Clause => c !== null))
    .filter((cs) => cs.length > 0);

  if (!alternatives.length) {
    return {
      major: DEFAULT_NODE_MAJOR,
      reason: `engines.node "${range}" places no constraint — using ${DEFAULT_NODE_MAJOR}`,
    };
  }

  const ok = supported.filter((m) => alternatives.some((cs) => satisfies(m, cs)));
  if (!ok.length) {
    return {
      major: DEFAULT_NODE_MAJOR,
      reason: `engines.node "${range}" matches no Node this platform offers — building on ${DEFAULT_NODE_MAJOR}`,
    };
  }

  if (ok.includes(DEFAULT_NODE_MAJOR)) {
    return { major: DEFAULT_NODE_MAJOR, reason: `engines.node "${range}" allows ${DEFAULT_NODE_MAJOR}` };
  }

  const chosen = ok[ok.length - 1];
  return { major: chosen, reason: `engines.node "${range}" requires Node ${chosen}` };
}

/** `engines.node` out of a package.json that may be anything at all. */
export function enginesNodeFrom(packageJson: string | undefined): string | null {
  if (!packageJson) return null;
  try {
    const v = JSON.parse(packageJson)?.engines?.node;
    return typeof v === "string" ? v : null;
  } catch {
    // An unparseable manifest is not a version pin. Detection reports that
    // separately, and more clearly than a JSON error thrown from here.
    return null;
  }
}
