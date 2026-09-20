/**
 * Partner upstreams for proxy-served models.
 *
 * The gateway knows two partners. Since 2026-09-20 a proxy model is served
 * by exactly the partner named in its catalog row (models.upstream_provider,
 * chosen per model in the admin panel); there is no cross-partner fallback.
 * forwardWithFallback still handles a chain of any length, with deadlines on
 * every provider but the last, so a fallback can be reintroduced per model
 * without touching the routes.
 *
 * Two rules that keep this safe:
 *
 *  1. BYOK never enters any chain. A customer's own key belongs to one
 *     vendor and is sent only there.
 *  2. A Starimg model with no Starimg credential configured gets an empty
 *     chain and a clean 503, never a silent reroute to the other partner.
 *
 * Provider names live here, in logs, and in usage.provider. They are never
 * put in a response body or header.
 */
import type { Env } from "../types.ts";

export type UpstreamId = "starimg" | "wokey";

export interface Upstream {
  id: UpstreamId;
  baseUrl: string;
  key: string;
}

const DEFAULT_TTFB_MS = 20_000;
const DEFAULT_NONSTREAM_MS = 60_000;

function intVar(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── The chain ────────────────────────────────────────────────────────────

export interface ChainOptions {
  env: Pick<Env, "WOKEY_BASE_URL" | "WOKEY_PLATFORM_KEY" | "STARIMG_BASE_URL" | "STARIMG_PLATFORM_KEY">;
  billing: "platform" | "byok";
  /** The customer's decrypted key when billing is byok. */
  byokKey?: string;
  /**
   * The catalog's upstream_provider for the model. From 2026-09-20 this is
   * the whole routing decision: "starimg" goes to Starimg and nowhere else,
   * anything else goes to Wokey. Harshit chose no cross-partner fallback;
   * which partner serves a model is set per model in the admin panel.
   */
  modelProvider?: string | null;
}

export function upstreamChain(o: ChainOptions): Upstream[] {
  const wokey: Upstream = {
    id: "wokey",
    baseUrl: o.env.WOKEY_BASE_URL,
    key: o.billing === "byok" ? (o.byokKey ?? "") : o.env.WOKEY_PLATFORM_KEY,
  };
  if (o.billing === "byok") return [wokey];

  if (o.modelProvider === "starimg") {
    if (!o.env.STARIMG_BASE_URL || !o.env.STARIMG_PLATFORM_KEY) return [];
    return [{ id: "starimg", baseUrl: o.env.STARIMG_BASE_URL, key: o.env.STARIMG_PLATFORM_KEY }];
  }
  return [wokey];
}

// ── Forwarding with failover ─────────────────────────────────────────────

export interface ForwardAttempt {
  provider: UpstreamId;
  status: number | null;
  error: string | null;
  ms: number;
}

export interface ForwardOutcome {
  response: Response;
  provider: UpstreamId;
  /** Providers tried before the one that answered. Empty on a clean first hit. */
  attempts: ForwardAttempt[];
}

export class UpstreamsExhaustedError extends Error {
  constructor(public readonly attempts: ForwardAttempt[]) {
    super(`every upstream failed: ${attempts.map((a) => `${a.provider}:${a.status ?? a.error}`).join(", ")}`);
    this.name = "UpstreamsExhaustedError";
  }
}

/** Does this 4xx body say the provider does not carry the model? Pure. */
export function looksLikeUnknownModel(status: number, bodyText: string): boolean {
  if (status !== 404 && status !== 400) return false;
  const t = bodyText.toLowerCase();
  return (
    /model/.test(t) &&
    /(not found|does not exist|doesn't exist|unknown|not recognized|not recognised|invalid model|no such|not available|not supported|unsupported)/.test(t)
  );
}

/** Should a non-final provider's response be abandoned for the next one? Pure. */
export function shouldFailOver(status: number, bodyText: string): boolean {
  if (status >= 500 || status === 429) return true;
  return looksLikeUnknownModel(status, bodyText);
}

export interface ForwardOptions {
  env: Pick<Env, "UPSTREAM_PRIMARY_TTFB_MS" | "UPSTREAM_PRIMARY_NONSTREAM_MS">;
  chain: Upstream[];
  path: "/chat/completions" | "/completions";
  body: unknown;
  stream: boolean;
  clientSignal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Try each upstream in order. A provider that is not last gets a deadline
 * to produce response headers: the first-byte budget for a stream, a longer
 * one for a buffered reply where headers only arrive with the whole body.
 * The deadline is cleared the moment headers arrive, so a long stream is
 * never cut mid-way. The last provider gets no deadline beyond the client's
 * own, and its response is returned whatever the status, so a genuine
 * upstream error still reaches the caller sanitised as before.
 */
export async function forwardWithFallback(o: ForwardOptions): Promise<ForwardOutcome> {
  const fetchImpl = o.fetchImpl ?? fetch;
  const ttfbMs = intVar(o.env.UPSTREAM_PRIMARY_TTFB_MS, DEFAULT_TTFB_MS);
  const nonStreamMs = intVar(o.env.UPSTREAM_PRIMARY_NONSTREAM_MS, DEFAULT_NONSTREAM_MS);
  const attempts: ForwardAttempt[] = [];
  if (o.chain.length === 0) throw new UpstreamsExhaustedError(attempts);
  const bodyText = JSON.stringify(o.body);

  for (let i = 0; i < o.chain.length; i++) {
    const up = o.chain[i]!;
    const isLast = i === o.chain.length - 1;
    const started = Date.now();

    const ctl = new AbortController();
    const onClientAbort = () => ctl.abort(o.clientSignal?.reason);
    if (o.clientSignal?.aborted) ctl.abort(o.clientSignal.reason);
    o.clientSignal?.addEventListener("abort", onClientAbort, { once: true });
    const timer = isLast
      ? null
      : setTimeout(
          () => ctl.abort(new DOMException("upstream deadline before first byte", "TimeoutError")),
          o.stream ? ttfbMs : nonStreamMs
        );

    let res: Response;
    try {
      res = await fetchImpl(`${up.baseUrl}${o.path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${up.key}`, "Content-Type": "application/json" },
        body: bodyText,
        signal: ctl.signal,
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      o.clientSignal?.removeEventListener("abort", onClientAbort);
      if (o.clientSignal?.aborted) throw err;
      attempts.push({ provider: up.id, status: null, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), ms: Date.now() - started });
      if (isLast) throw new UpstreamsExhaustedError(attempts);
      continue;
    }
    if (timer) clearTimeout(timer);
    // The listener stays attached: a client that goes away mid-stream must
    // still cancel this upstream. It is a no-op once the body is consumed.

    if (isLast) return { response: res, provider: up.id, attempts };

    if (res.status >= 500 || res.status === 429) {
      attempts.push({ provider: up.id, status: res.status, error: null, ms: Date.now() - started });
      try { await res.body?.cancel(); } catch { /* nothing to release */ }
      continue;
    }
    if (res.status === 404 || res.status === 400) {
      const peek = await res.clone().text().catch(() => "");
      if (looksLikeUnknownModel(res.status, peek)) {
        attempts.push({ provider: up.id, status: res.status, error: "unknown model", ms: Date.now() - started });
        try { await res.body?.cancel(); } catch { /* nothing to release */ }
        continue;
      }
    }
    return { response: res, provider: up.id, attempts };
  }

  throw new UpstreamsExhaustedError(attempts);
}
