/**
 * Accept an `ahu_` API key on the control plane, not just a browser session.
 *
 * WHY THIS EXISTS. The platform has two customer-facing surfaces with two
 * different credentials:
 *
 *   gateway  /v1/*                 `ahu_` API key   (workers/inference)
 *   control  /api/inference/*      Supabase JWT / cookie
 *
 * Everything that can only live on the control plane was therefore unreachable
 * to an API customer. Measured 2026-08-06 by walking the vector service with a
 * key and no browser: 6 of 11 steps worked. The five that did not —
 *
 *   create a collection · delete a collection · ingest a file or URL ·
 *   manage API keys · read your own usage
 *
 * — are not missing features. Each one EXISTS and is exercised by the dashboard
 * every day. They were simply behind a credential a customer's script does not
 * have. A customer could search and answer over a knowledge base through the
 * API, but could not create one without opening a browser: no Terraform, no CI,
 * no onboarding script.
 *
 * WHY NOT MOVE THE ROUTES TO THE GATEWAY. Creating a collection starts a
 * recurring credit meter through `config/billing-flow.ts`
 * (reserveProvision/settleProvision — an atomic ledger debit with rollback);
 * deleting one closes it. That is the platform's core billing system, shared
 * with databases, kubernetes and compute, and it lives in Next-only modules the
 * Worker cannot import. Duplicating live credit-reservation logic into a second
 * codebase risks double-charging a customer — a real risk, not a routine port.
 * `vector-collections.ts` names the three options; this is the third one done
 * properly: leave the billing code exactly where it is, and widen the door.
 *
 * ONE SOURCE OF TRUTH FOR WHAT A KEY MEANS. This calls the SAME
 * `inference.lookup_api_key` RPC the gateway's authMiddleware calls. That is
 * deliberate and is the most important property of this file: a second
 * hand-written query would be a second opinion about whether a key is revoked,
 * expired, agent-scoped or public — and the two would drift. The RPC already
 * enforces `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
 * so a revoked key is refused here for the same reason and at the same moment it
 * is refused at the edge.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/** What the shared RPC returns, narrowed to the fields the control plane needs. */
interface LookupRow {
  key_id: string;
  org_id: string;
  agent_id: string | null;
  key_tier: "private" | "public" | null;
  allowed_origins: string[] | null;
  allowed_models: string[] | null;
  is_internal_service: boolean | null;
  hard_cap_cents: number | null;
  monthly_budget_cents: number | null;
  org_hard_cap_cents: number | null;
  org_monthly_budget_cents: number | null;
}

export interface ApiKeyContext {
  keyId: string;
  orgId: string;
  /** Non-null when the key was minted from one agent's own Access Keys tab. */
  agentId: string | null;
  keyTier: "private" | "public";
  /** Non-empty for a public key — `chk_public_key_has_origins` guarantees it. */
  allowedOrigins: string[] | null;
  allowedModels: string[] | null;
  isInternalService: boolean;
}

/** Only `ahu_`-prefixed bearer tokens are ours; anything else is a Supabase JWT. */
export function isApiKeyToken(token: string | null | undefined): boolean {
  return typeof token === "string" && token.startsWith("ahu_");
}

/** Pull a bearer token out of the request, or null. */
export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const parts = header.split(" ");
  return parts.length === 2 && parts[0] === "Bearer" ? parts[1] : null;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Resolve an `ahu_` key to its org, or null if it is unknown, revoked or expired.
 *
 * Service-role client because `inference.api_keys` is not readable by
 * `authenticated` (migration 20260806000002) and the RPC is SECURITY DEFINER.
 */
export async function resolveApiKey(token: string): Promise<ApiKeyContext | null> {
  if (!isApiKeyToken(token)) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, global: { headers: { "X-Client-Info": "ahura-control-plane/api-key" } } }
  );

  const hash = await sha256Hex(token);
  const { data, error } = await supabase
    .schema("inference")
    .rpc("lookup_api_key", { p_hash: hash })
    .single<LookupRow>();

  if (error || !data) return null;

  return {
    keyId: data.key_id,
    orgId: data.org_id,
    agentId: data.agent_id,
    keyTier: data.key_tier ?? "private",
    allowedOrigins: data.allowed_origins,
    allowedModels: data.allowed_models,
    isInternalService: data.is_internal_service ?? false,
  };
}

/**
 * Can this key create or destroy something that costs money?
 *
 * THE KEY MODEL, per the DB constraints (20260708000002/3) — worth stating
 * because it is narrower than it looks:
 *
 *     chk_public_key_is_agent_scoped   key_tier='private' OR agent_id IS NOT NULL
 *     chk_public_key_has_origins       a public key must list allowed origins
 *     chk_public_key_has_hard_cap      a public key must carry a spend ceiling
 *
 * So only three shapes exist: a private org key (no agent), a private
 * agent-scoped key, and a public key — which is ALWAYS agent-scoped, capped and
 * origin-locked. There is no public org-level key; the database forbids it.
 *
 * Only the first shape may start a meter:
 *
 *   - AGENT-SCOPED. Minted from one agent's Access Keys tab and deliberately
 *     narrow — `agentScopeMiddleware` already confines it to that agent's own
 *     run routes at the edge. A key handed to one agent must not provision
 *     org-wide billable infrastructure.
 *
 *   - PUBLIC TIER. Designed to be embedded in a browser (the only tier that may
 *     travel in a query string, for EventSource). Anything it can reach is
 *     reachable by anyone who views source.
 *
 * The public test therefore never fires alone — every public key is also
 * agent-scoped and would be caught by the second test anyway. It is checked
 * FIRST on purpose: for an embeddable key, "this is public" is the more useful
 * thing to tell someone than "this is agent-scoped".
 *
 * Returning a REASON rather than a boolean so the 403 can say which rule applied
 * — "your key is not allowed to do this" without saying why is the kind of error
 * that generates a support ticket.
 */
export function billableActionRefusal(ctx: ApiKeyContext): string | null {
  if (ctx.keyTier === "public") {
    return "A public-tier key cannot create or delete billable resources. Public keys are meant to be embeddable in a browser, so anything they can reach is effectively world-accessible. Use a private key.";
  }
  if (ctx.agentId) {
    return "An agent-scoped key cannot create or delete billable resources. It is scoped to one agent's own runs. Use an org-level private key.";
  }
  return null;
}

/**
 * Can this key manage ORG-WIDE configuration — prompts, files, datasets,
 * deployments, guardrails, connectors, members, other keys?
 *
 * Same predicate as `billableActionRefusal` (private + org-level only) but a
 * different question, so it stays a different function: money is not the only
 * reason to refuse. These routes expose or mutate configuration belonging to
 * the whole organisation, and the two narrow key shapes have no business there:
 *
 *   - A PUBLIC key is embeddable in a browser. Anything it can read is readable
 *     by anyone who views source — that includes member email addresses, key
 *     inventories and BYOK provider metadata. Read access is the leak here, so
 *     unlike a spend limit this cannot be bounded by a cap.
 *
 *   - An AGENT-SCOPED key speaks for one agent, not the organisation that owns
 *     it. Letting it rewrite shared prompts or delete another team's dataset
 *     would make "scoped to one agent" meaningless.
 *
 * The practical rule for customers: scripts, CI and Terraform use an org-level
 * private key. Agent-scoped and public keys are runtime credentials — they run
 * an agent and read their own usage, and that is all.
 */
export function orgManagementRefusal(ctx: ApiKeyContext): string | null {
  if (ctx.keyTier === "public") {
    return "A public-tier key cannot read or manage organisation-wide resources. Public keys are meant to be embeddable in a browser, so anything they can reach is effectively world-accessible. Use an org-level private key.";
  }
  if (ctx.agentId) {
    return "An agent-scoped key cannot read or manage organisation-wide resources. It speaks for one agent, not for the organisation. Use an org-level private key.";
  }
  return null;
}

/**
 * Origin enforcement for public-tier keys — the control-plane half of
 * `workers/inference/src/middleware/origin-check.ts`.
 *
 * The gateway applies that middleware to EVERY /v1 route (`v1.use("*", ...)`).
 * Accepting keys here without the same check would have made the control plane
 * the soft way around it: a leaked public key, refused at the edge because the
 * Origin did not match, would still have worked against /api/inference/*.
 *
 * A public key is safe to leak the way a Stripe `pk_` key is — not because of
 * CORS, which is browser-enforced and any script ignores, but because of what it
 * may do plus this server-side check that the request came from a domain the
 * customer approved.
 *
 * Fails CLOSED on a missing Origin or an empty allow-list. The DB constraint
 * `chk_public_key_has_origins` means an empty list should be impossible, so if
 * one appears the data arrived some other way and refusing is correct.
 *
 * A private key is unaffected, exactly as at the edge.
 */
export function publicKeyOriginRefusal(
  ctx: ApiKeyContext,
  origin: string | null
): string | null {
  if (ctx.keyTier !== "public") return null;
  const allowed = ctx.allowedOrigins ?? [];
  if (!origin || !allowed.includes(origin)) {
    return "This public key is restricted to specific origins and the request's Origin header didn't match.";
  }
  return null;
}

/**
 * Model allow-list enforcement — the control-plane half of `checkModelScope`
 * in `workers/inference/src/lib/gateway.ts`.
 *
 * A key can be restricted to specific models. The gateway refuses a request
 * naming anything outside that list; a control-plane route that lets the caller
 * choose a model must do the same, or the restriction only holds on one surface.
 *
 * An empty or null list means "no restriction", which is the default.
 */
export function modelScopeRefusal(ctx: ApiKeyContext, modelId: string | null | undefined): string | null {
  if (!modelId) return null;
  if (!ctx.allowedModels || ctx.allowedModels.length === 0) return null;
  return ctx.allowedModels.includes(modelId)
    ? null
    : `Model "${modelId}" is not allowed for this API key.`;
}

/**
 * The gateway's agent-scope allow-list, restated for the control plane.
 *
 * `workers/inference/src/middleware/agent-scope.ts` lets an agent-scoped key
 * reach EXACTLY two things — POST its own agent's runs, and read/stream/cancel
 * those runs — and answers 403 `agent_scope_restricted` for everything else.
 * Its own comment is explicit: such a key "must never reach any other inference
 * surface (chat completions, images, embeddings, a DIFFERENT agent's runs...)".
 *
 * That includes the vector service. An agent-scoped key cannot touch
 * /v1/vector/* at the edge, so the control plane must not let it either — a
 * key handed to one agent should not be able to delete the organisation's
 * knowledge bases just because it knocked on the other door.
 *
 * This is why the control plane DENIES BY DEFAULT and a route must opt in
 * (`allowAgentScoped`). The opt-in list is the same two things the gateway
 * allows, plus reading your own usage, which the edge already grants any key
 * through GET /v1/key. A new route added later is refused until someone
 * deliberately widens it, rather than silently inheriting org-wide reach.
 *
 * Every public key is agent-scoped (chk_public_key_is_agent_scoped), so this
 * covers public keys too.
 */
export function agentScopeRestrictedRefusal(ctx: ApiKeyContext): string | null {
  if (!ctx.agentId) return null;
  return "This key can only run and read its assigned agent. It is scoped to a single agent, so it cannot reach organisation-wide resources. Use an org-level private key.";
}

/**
 * Is this caller reaching for an agent that is not the one its key belongs to?
 *
 * An agent-scoped key is minted from ONE agent's Access Keys tab. Without this
 * check every per-agent route becomes an org-wide one the moment a key is
 * accepted: read another agent's system prompt, tail another agent's run, purge
 * another team's memories. The agent id in the URL is attacker-controlled; the
 * one on the key is not, so the key always wins.
 *
 * Callers answer 404 rather than 403 — "this run is not yours" still confirms
 * the run exists, which is a listing oracle for anyone holding one narrow key.
 *
 * Returns false for a session or an org-level key: neither is agent-scoped.
 */
export function agentScopeMismatch(
  auth: Pick<ControlPlaneAuth, "apiKey">,
  resourceAgentId: string | null
): boolean {
  const scoped = auth.apiKey?.agentId;
  return !!scoped && resourceAgentId !== scoped;
}

/**
 * What a control-plane route needs, however the caller authenticated.
 *
 * `subject` is what rate limits key on. For a session that is the user id, which
 * is what every route already used; for an API key it is the KEY id, so one
 * customer's runaway script cannot exhaust the budget of another key on the same
 * org — and so revoking that key also revokes its rate-limit history.
 *
 * `userId` is null for an API key: there is no human in the request. Routes that
 * need a payer resolve it from the org (`billing_user_id` / `owner_user_id`),
 * which is what they already do — the session user was only ever a last-resort
 * fallback.
 */
export interface ControlPlaneAuth {
  via: "api_key" | "session";
  orgId: string;
  subject: string;
  userId: string | null;
  email: string | null;
  apiKey: ApiKeyContext | null;
  /**
   * The caller's org role, for the session path only.
   *
   * NULL for an API key, and that is not an oversight: org roles describe
   * PEOPLE, and a key is not a person. A key's authority comes from its tier and
   * scope (see billableActionRefusal), which is a different question from
   * whether some human is a viewer. Routes that gate on `role === "viewer"`
   * should keep doing so — a null role simply is not a viewer.
   */
  orgRole: string | null;
  /** Display fields the routes echo back. Looked up once, either way in. */
  orgName: string | null;
  orgSlug: string | null;
}

/**
 * The API-key half of control-plane auth.
 *
 * Returns `null` when the request carries no `ahu_` key at all, which means the
 * caller should fall through to the existing session path — this is additive and
 * changes nothing for the dashboard. Returns a 401 response when a key IS
 * presented but does not resolve, because falling through in that case would
 * answer a bad key with a confusing "not signed in".
 */
export async function authenticateApiKey(
  req: NextRequest
): Promise<{ ok: true; ctx: ApiKeyContext } | { ok: false; response: NextResponse } | null> {
  const token = bearerToken(req);
  if (!isApiKeyToken(token)) return null;

  const ctx = await resolveApiKey(token!);
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid API key", code: "invalid_api_key" },
        { status: 401 }
      ),
    };
  }

  // Applied here rather than per-route so it cannot be forgotten on a new one,
  // which is how the gateway does it (v1.use("*", originCheckMiddleware)).
  const originRefusal = publicKeyOriginRefusal(ctx, req.headers.get("Origin"));
  if (originRefusal) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: originRefusal, code: "origin_not_allowed" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, ctx };
}

/**
 * One entry point for a control-plane route, whichever credential arrives.
 *
 * Order matters: the API key is tried FIRST, and only a request with no `ahu_`
 * bearer falls through to the session path. That keeps the dashboard behaving
 * exactly as before — it never sends one — while a script gets a real answer
 * rather than "not signed in".
 *
 * `sessionAuth` is injected rather than imported so this module stays free of
 * the Next cookie machinery and remains unit-testable.
 */
export async function resolveControlPlaneAuth(
  req: NextRequest,
  sessionAuth: () => Promise<
    { ok: true; userId: string; email: string } | { ok: false; response: NextResponse }
  >,
  orgForUser: (
    userId: string,
    email: string
  ) => Promise<{ org_id: string; role?: string; org_name?: string | null; org_slug?: string | null } | null>,
  /**
   * What to answer when the user has no org. Routes differ — some already
   * returned 404 "No inference org" — and quietly changing that to a 403 would
   * break callers that branch on the status. Defaults to the 403 below.
   */
  noOrgResponse?: () => NextResponse,
  /**
   * Opt a route into agent-scoped (and therefore public) keys. Defaults to
   * FALSE so a route is refused until someone widens it deliberately — see
   * agentScopeRestrictedRefusal for why denying by default is the safe side.
   */
  allowAgentScoped = false
): Promise<{ ok: true; auth: ControlPlaneAuth } | { ok: false; response: NextResponse }> {
  const viaKey = await authenticateApiKey(req);
  if (viaKey) {
    if (!viaKey.ok) return { ok: false, response: viaKey.response };

    if (!allowAgentScoped) {
      const refusal = agentScopeRestrictedRefusal(viaKey.ctx);
      if (refusal) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: refusal, code: "agent_scope_restricted" },
            { status: 403 }
          ),
        };
      }
    }

    // The routes echo the org's name and slug back. The RPC does not return
    // them, so one small lookup — the session path already got them free from
    // its org resolver, and the response shape must not depend on how you
    // authenticated.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: orgRow } = await supabase
      .schema("inference")
      .from("orgs")
      .select("name, slug")
      .eq("id", viaKey.ctx.orgId)
      .maybeSingle<{ name: string | null; slug: string | null }>();

    return {
      ok: true,
      auth: {
        via: "api_key",
        orgId: viaKey.ctx.orgId,
        subject: viaKey.ctx.keyId,
        userId: null,
        email: null,
        apiKey: viaKey.ctx,
        orgRole: null,
        orgName: orgRow?.name ?? null,
        orgSlug: orgRow?.slug ?? null,
      },
    };
  }

  const session = await sessionAuth();
  if (!session.ok) return { ok: false, response: session.response };

  const org = await orgForUser(session.userId, session.email);
  if (!org) {
    return {
      ok: false,
      response: noOrgResponse?.() ?? NextResponse.json({ error: "No organisation for this user" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    auth: {
      via: "session",
      orgId: org.org_id,
      subject: session.userId,
      userId: session.userId,
      email: session.email,
      apiKey: null,
      orgRole: org.role ?? null,
      orgName: org.org_name ?? null,
      orgSlug: org.org_slug ?? null,
    },
  };
}
