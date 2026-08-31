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
 * WHY `engines.node` OUTRANKS `.nvmrc`, WHICH IS THE OPPOSITE OF THE OBVIOUS.
 *
 * `.nvmrc` says what a developer runs locally. `engines.node` says what the
 * package requires, it is published with the package, and npm and pnpm ENFORCE
 * it — including for dependencies. Those are different claims, and the local one
 * goes stale silently because nothing breaks when it does.
 *
 * Honouring `.nvmrc` as a hard pin broke a repository that had been building
 * fine: sveltejs/realworld ships `.nvmrc` containing `20`, while a package in
 * its tree declares `engines.node: >=22.12.0`. pnpm refused the install outright
 *
 *     Your Node version is incompatible with "sanitize-html@2.17.7".
 *     Expected version: >=22.12.0  Got: v20.20.2
 *
 * on a build that had previously served. So `.nvmrc` raises the floor and never
 * lowers the ceiling: it can move us to a NEWER major than the default, never to
 * an older one. Only `engines.node` — an explicit, published, enforced
 * constraint — can pin downward. Vercel reads `engines.node` and not `.nvmrc`
 * for the same reason.
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
  op: ">=" | "<=" | "<" | "=";
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
    case ">":
      // `>18` and `>18.0.0` are both satisfied by the newest 18 image, so `>`
      // deliberately behaves like `>=`. The alternative rejects a major whose
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
 * table that would go stale. An alias returns null rather than a guess.
 */
export function majorFromNvmrc(contents: string | undefined): number | null {
  if (!contents) return null;
  const m = /^\s*v?(\d+)(?:\.|\s|$)/.exec(contents);
  if (!m) return null;
  const major = Number(m[1]);
  return Number.isFinite(major) ? major : null;
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

/**
 * Choose the Node major for a repository.
 *
 * `engines.node` decides when it is present, including downward. Otherwise
 * `.nvmrc` may raise us above the default but never below it — see the note at
 * the top of this file for why those two are not treated alike.
 */
export function resolveNodeVersion(input: {
  enginesNode?: string | null;
  nvmrc?: string | null;
}): NodeChoice {
  const supported = SUPPORTED_NODE_MAJORS as readonly number[];
  const range = (input.enginesNode ?? "").trim();

  if (range) {
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

  const floor = majorFromNvmrc(input.nvmrc ?? undefined);
  if (floor === null) {
    return { major: DEFAULT_NODE_MAJOR, reason: `no Node version declared — using ${DEFAULT_NODE_MAJOR}` };
  }
  if (floor <= DEFAULT_NODE_MAJOR) {
    // Deliberately NOT honoured downward. A stale .nvmrc is invisible locally
    // and would refuse installs that the default builds happily.
    return {
      major: DEFAULT_NODE_MAJOR,
      reason: `.nvmrc asks for Node ${floor}; building on ${DEFAULT_NODE_MAJOR}, which satisfies it — pin engines.node to insist`,
    };
  }
  if (!supported.includes(floor)) {
    return {
      major: DEFAULT_NODE_MAJOR,
      reason: `.nvmrc asks for Node ${floor}, which this platform does not offer — building on ${DEFAULT_NODE_MAJOR}`,
    };
  }
  return { major: floor, reason: `.nvmrc asks for Node ${floor}` };
}
