/**
 * Agent management API — create/list/get/update/delete an agent, and
 * list/mint/revoke/rotate its access keys, all by API key (no dashboard
 * session needed).
 *
 * Found missing in a Phase-0 API-completeness review (2026-07-17): every one
 * of these operations already existed, but only behind a logged-in dashboard
 * session (app/api/agents/*, authenticateUserFromHeader — a Supabase user
 * JWT, never an org API key). A customer's own backend could RUN an agent by
 * API key (POST /v1/responses, /v1/agents/:id/runs — see responses.ts) but
 * had no way to ever CREATE or CONFIGURE one without a human clicking
 * through the dashboard first. This file is the API-key-authed counterpart:
 * same agentcore.agents / inference.api_keys tables, same validation rules
 * as the dashboard routes, kept in sync BY HAND — this Worker is a separate
 * deployable and can't import app/lib/agentcore/agent-schema.ts.
 *
 * Auth: gated by agentManagementAuthMiddleware (private, unrestricted keys
 * only — see that file for why) and registered as its own Hono group in
 * index.ts, deliberately outside the spend-checked `v1` group: an org that
 * hit its monthly hard cap must still be able to delete a runaway agent or
 * revoke a leaking key, not get locked out of the one thing that fixes it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";
import { generateApiKey } from "../lib/api-key-crypto.ts";
import { isValidUuid } from "../lib/on-behalf-of.ts";
import { makeSupabase, enqueueAudit, readJson } from "../lib/route-helpers.ts";

// ── Validation (mirrors lib/agentcore/agent-schema.ts + the keys routes'
// inline schemas — see file header for why this can't just import them) ──────

const toolSchema = z.object({ type: z.string() }).passthrough();

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  model: z.string().min(1),
  system_prompt: z.string().max(20000).optional().nullable(),
  tools: z.array(toolSchema).max(20).optional(),
  memory_policy: z.record(z.unknown()).optional(),
  guardrail: z.enum(["off", "warn", "block"]).optional(),
  max_steps: z.number().int().min(1).max(100).optional(),
  max_cost_cents: z.number().int().positive().max(1_000_000).optional(),
});

export const updateAgentSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    model: z.string().min(1).optional(),
    system_prompt: z.string().max(20000).optional().nullable(),
    tools: z.array(toolSchema).max(20).optional(),
    memory_policy: z.record(z.unknown()).optional(),
    guardrail: z.enum(["off", "warn", "block"]).optional(),
    max_steps: z.number().int().min(1).max(100).optional(),
    max_cost_cents: z.number().int().positive().max(1_000_000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

// Scheme + host (+ optional port), never a path — what a browser's Origin
// header actually sends. Same rule as the dashboard's agent-keys route.
const ORIGIN_RE = /^(https:\/\/[a-zA-Z0-9.-]+(:\d+)?|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

// A public key is designed to be visible to anyone, so it must never be
// unbounded — applied only when the caller didn't set their own cap.
const DEFAULT_PUBLIC_KEY_HARD_CAP_CENTS = 2000; // $20/mo
const DEFAULT_ROTATE_GRACE_HOURS = 24;

export const createAgentKeySchema = z
  .object({
    name: z.string().min(1).max(100),
    tier: z.enum(["private", "public"]).default("private"),
    allowed_origins: z
      .array(z.string().regex(ORIGIN_RE, "must be an https:// origin (or http://localhost for testing)"))
      .max(20)
      .optional(),
    rate_limit_rpm: z.number().int().min(1).max(10000).optional().nullable(),
    monthly_budget_cents: z.number().int().nonnegative().optional().nullable(),
    hard_cap_cents: z.number().int().nonnegative().optional().nullable(),
    expires_at: z.string().datetime().optional().nullable(),
  })
  .refine((d) => d.tier === "private" || (d.allowed_origins && d.allowed_origins.length > 0), {
    message: "Public keys require at least one allowed origin",
    path: ["allowed_origins"],
  });

export const rotateAgentKeySchema = z.object({
  // 0 = revoke the old key immediately (no grace window) — a deliberate,
  // explicit choice for a caller that knows the key already leaked.
  grace_hours: z.number().min(0).max(168).optional(),
});

// ── Shared plumbing ─────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  org_id: string;
  name: string;
  model: string;
  system_prompt: string | null;
  tools: Record<string, unknown>[];
  memory_policy: Record<string, unknown>;
  guardrail: string;
  max_steps: number;
  max_cost_cents: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const AGENT_SELECT_COLS =
  "id, org_id, name, model, system_prompt, tools, memory_policy, guardrail, max_steps, max_cost_cents, is_active, created_by, created_at, updated_at";

function toAgentResponse(row: AgentRow) {
  return {
    id: row.id,
    object: "agent" as const,
    name: row.name,
    model: row.model,
    system_prompt: row.system_prompt,
    tools: row.tools,
    memory_policy: row.memory_policy,
    guardrail: row.guardrail,
    max_steps: row.max_steps,
    max_cost_cents: row.max_cost_cents,
    is_active: row.is_active,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Fail-fast catalog check: is this an active model id? (Run-time model
 *  scope is still enforced by the gateway; this just catches typos at
 *  create/update time — same guard the dashboard route applies.) */
async function modelExists(supabase: SupabaseClient, modelId: string): Promise<boolean> {
  const { data } = await supabase
    .schema("inference")
    .from("models")
    .select("model_id")
    .eq("model_id", modelId)
    .eq("is_active", true)
    .maybeSingle<{ model_id: string }>();
  return !!data;
}

/**
 * API-key-created rows still need a real auth.users id for `created_by` /
 * `created_by_user_id` (the latter is NOT NULL + FK'd — see migration
 * 20260523000001) — but an API key has no human user behind it, only an
 * org. Same resolution responses.ts already uses for a run's
 * billing_user_id: the org's billing owner is the one real user identity
 * an API-key-authed request can attribute a write to.
 */
async function resolveOrgOwner(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await supabase
    .schema("inference")
    .from("orgs")
    .select("billing_user_id")
    .eq("id", orgId)
    .maybeSingle<{ billing_user_id: string }>();
  return data?.billing_user_id ?? null;
}

// ── Agents ───────────────────────────────────────────────────────────────────

// GET /v1/agents
export const listAgents: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const supabase = makeSupabase(c.env);

  const { data, error } = await supabase
    .schema("agentcore")
    .from("agents")
    .select(AGENT_SELECT_COLS)
    .eq("org_id", auth.orgId)
    .order("updated_at", { ascending: false })
    .returns<AgentRow[]>();

  if (error) {
    return c.json(gatewayError("Failed to list agents", "server_error", "agents_list_failed", requestId), 500);
  }
  return c.json({ object: "list" as const, data: (data ?? []).map(toAgentResponse) });
};

// POST /v1/agents
export const createAgent: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = createAgentSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        "invalid_request_error",
        "invalid_request",
        requestId
      ),
      400
    );
  }
  const d = parsed.data;
  const supabase = makeSupabase(c.env);

  if (!(await modelExists(supabase, d.model))) {
    return c.json(gatewayError(`Unknown or inactive model: ${d.model}`, "invalid_request_error", "unknown_model", requestId), 400);
  }

  const owner = await resolveOrgOwner(supabase, auth.orgId);
  if (!owner) {
    return c.json(gatewayError("Unable to resolve billing account", "server_error", "billing_unresolved", requestId), 500);
  }

  const { data, error } = await supabase
    .schema("agentcore")
    .from("agents")
    .insert({
      org_id: auth.orgId,
      name: d.name,
      model: d.model,
      system_prompt: d.system_prompt ?? null,
      tools: d.tools ?? [],
      memory_policy: d.memory_policy ?? {},
      guardrail: d.guardrail ?? "warn",
      max_steps: d.max_steps ?? 12,
      max_cost_cents: d.max_cost_cents ?? 100,
      created_by: owner,
    })
    .select(AGENT_SELECT_COLS)
    .single<AgentRow>();

  if (error || !data) {
    if (error?.code === "23505") {
      return c.json(gatewayError(`An agent named "${d.name}" already exists`, "invalid_request_error", "duplicate_name", requestId), 409);
    }
    return c.json(gatewayError(error?.message ?? "Failed to create agent", "server_error", "agent_create_failed", requestId), 400);
  }

  enqueueAudit(c, { action: "agent.created", targetType: "agentcore_agent", targetId: data.id, metadata: { name: d.name, model: d.model } });
  return c.json(toAgentResponse(data), 201);
};

// GET /v1/agents/:id
export const getAgent: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid agent id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const { data } = await supabase
    .schema("agentcore")
    .from("agents")
    .select(AGENT_SELECT_COLS)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .maybeSingle<AgentRow>();

  if (!data) {
    return c.json(gatewayError("Agent not found", "invalid_request_error", "agent_not_found", requestId), 404);
  }
  return c.json(toAgentResponse(data));
};

// PATCH /v1/agents/:id
export const updateAgent: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid agent id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = updateAgentSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        "invalid_request_error",
        "invalid_request",
        requestId
      ),
      400
    );
  }
  const supabase = makeSupabase(c.env);

  if (parsed.data.model && !(await modelExists(supabase, parsed.data.model))) {
    return c.json(gatewayError(`Unknown or inactive model: ${parsed.data.model}`, "invalid_request_error", "unknown_model", requestId), 400);
  }

  // Drop undefined keys so we only write provided fields.
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) patch[k] = v;

  const { data, error } = await supabase
    .schema("agentcore")
    .from("agents")
    .update(patch)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .select(AGENT_SELECT_COLS)
    .maybeSingle<AgentRow>();

  if (error) {
    if (error.code === "23505") {
      return c.json(gatewayError("An agent with that name already exists", "invalid_request_error", "duplicate_name", requestId), 409);
    }
    return c.json(gatewayError(error.message, "server_error", "agent_update_failed", requestId), 400);
  }
  if (!data) {
    return c.json(gatewayError("Agent not found", "invalid_request_error", "agent_not_found", requestId), 404);
  }

  enqueueAudit(c, { action: "agent.updated", targetType: "agentcore_agent", targetId: id, metadata: { fields: Object.keys(parsed.data) } });
  return c.json(toAgentResponse(data));
};

// DELETE /v1/agents/:id
export const deleteAgent: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid agent id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  // Runs reference agent_id ON DELETE SET NULL, so this never orphans run history.
  const { data, error } = await supabase
    .schema("agentcore")
    .from("agents")
    .delete()
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .select("id, name")
    .maybeSingle<{ id: string; name: string }>();

  if (error) {
    return c.json(gatewayError(error.message, "server_error", "agent_delete_failed", requestId), 500);
  }
  if (!data) {
    return c.json(gatewayError("Agent not found", "invalid_request_error", "agent_not_found", requestId), 404);
  }

  enqueueAudit(c, { action: "agent.deleted", targetType: "agentcore_agent", targetId: id, metadata: { name: data.name } });
  return c.json({ id, object: "agent" as const, deleted: true });
};

// ── Agent access keys ────────────────────────────────────────────────────────

interface AgentKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  key_last_four: string;
  key_tier: "private" | "public";
  allowed_origins: string[] | null;
  rate_limit_rpm: number | null;
  monthly_budget_cents: number | null;
  hard_cap_cents: number | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

function toKeyResponse(k: AgentKeyRow) {
  return {
    id: k.id,
    object: "agent.api_key" as const,
    name: k.name,
    preview: `${k.key_prefix}••••${k.key_last_four}`,
    tier: k.key_tier,
    allowed_origins: k.allowed_origins,
    rate_limit_rpm: k.rate_limit_rpm,
    monthly_budget_cents: k.monthly_budget_cents,
    hard_cap_cents: k.hard_cap_cents,
    expires_at: k.expires_at,
    last_used_at: k.last_used_at,
    created_at: k.created_at,
  };
}

async function agentExists(supabase: SupabaseClient, orgId: string, agentId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .schema("agentcore")
    .from("agents")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("id", agentId)
    .maybeSingle<{ id: string; name: string }>();
  return data ?? null;
}

// GET /v1/agents/:id/keys
export const listAgentKeys: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const agentId = c.req.param("id");
  if (!agentId || !isValidUuid(agentId)) {
    return c.json(gatewayError("Invalid agent id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  if (!(await agentExists(supabase, auth.orgId, agentId))) {
    return c.json(gatewayError("Agent not found", "invalid_request_error", "agent_not_found", requestId), 404);
  }

  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .select("id, name, key_prefix, key_last_four, key_tier, allowed_origins, rate_limit_rpm, monthly_budget_cents, hard_cap_cents, expires_at, last_used_at, created_at")
    .eq("org_id", auth.orgId)
    .eq("agent_id", agentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .returns<AgentKeyRow[]>();

  if (error) {
    return c.json(gatewayError("Failed to list access keys", "server_error", "agent_keys_list_failed", requestId), 500);
  }
  return c.json({ object: "list" as const, data: (data ?? []).map(toKeyResponse) });
};

// POST /v1/agents/:id/keys
export const createAgentKey: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const agentId = c.req.param("id");
  if (!agentId || !isValidUuid(agentId)) {
    return c.json(gatewayError("Invalid agent id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const agent = await agentExists(supabase, auth.orgId, agentId);
  if (!agent) {
    return c.json(gatewayError("Agent not found", "invalid_request_error", "agent_not_found", requestId), 404);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = createAgentKeySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        "invalid_request_error",
        "invalid_request",
        requestId
      ),
      400
    );
  }
  const d = parsed.data;

  const owner = await resolveOrgOwner(supabase, auth.orgId);
  if (!owner) {
    return c.json(gatewayError("Unable to resolve billing account", "server_error", "billing_unresolved", requestId), 500);
  }

  const { fullKey, keyPrefix, keyLastFour, keyHash } = await generateApiKey(d.tier);
  const hardCapCents = d.hard_cap_cents ?? (d.tier === "public" ? DEFAULT_PUBLIC_KEY_HARD_CAP_CENTS : null);

  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .insert({
      org_id: auth.orgId,
      created_by_user_id: owner,
      agent_id: agentId,
      name: d.name,
      key_prefix: keyPrefix,
      key_last_four: keyLastFour,
      key_hash: keyHash,
      key_tier: d.tier,
      allowed_origins: d.tier === "public" ? d.allowed_origins : null,
      rate_limit_rpm: d.rate_limit_rpm ?? null,
      monthly_budget_cents: d.monthly_budget_cents ?? null,
      hard_cap_cents: hardCapCents,
      expires_at: d.expires_at ?? null,
    })
    .select("id, name, key_prefix, key_last_four, created_at")
    .single<{ id: string; name: string; key_prefix: string; key_last_four: string; created_at: string }>();

  if (error || !data) {
    const isCheckViolation = error?.message?.includes("chk_public_key");
    return c.json(
      gatewayError(
        isCheckViolation ? "Public keys require an allowed origin and a spend cap" : "Failed to create access key",
        isCheckViolation ? "invalid_request_error" : "server_error",
        "agent_key_create_failed",
        requestId
      ),
      isCheckViolation ? 400 : 500
    );
  }

  enqueueAudit(c, {
    action: "agent_key.created",
    targetType: "api_key",
    targetId: data.id,
    metadata: { name: d.name, agent_id: agentId, agent_name: agent.name, tier: d.tier },
  });

  return c.json(
    {
      id: data.id,
      object: "agent.api_key" as const,
      name: data.name,
      api_key: fullKey,
      preview: `${data.key_prefix}••••${data.key_last_four}`,
      tier: d.tier,
      created_at: data.created_at,
      message: "Copy this key now — for security, the full key will never be shown again.",
    },
    201
  );
};

// DELETE /v1/agents/:id/keys/:keyId
export const revokeAgentKey: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const agentId = c.req.param("id");
  const keyId = c.req.param("keyId");
  if (!agentId || !isValidUuid(agentId) || !keyId || !isValidUuid(keyId)) {
    return c.json(gatewayError("Invalid agent or key id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("org_id", auth.orgId)
    .eq("agent_id", agentId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return c.json(gatewayError("Failed to revoke access key", "server_error", "agent_key_revoke_failed", requestId), 500);
  }
  if (!data) {
    return c.json(gatewayError("Access key not found for this agent", "invalid_request_error", "agent_key_not_found", requestId), 404);
  }

  enqueueAudit(c, { action: "agent_key.revoked", targetType: "api_key", targetId: keyId, metadata: { agent_id: agentId } });
  return c.json({ id: keyId, object: "agent.api_key" as const, deleted: true });
};

interface OldKeyRow {
  id: string;
  name: string;
  key_tier: "private" | "public";
  allowed_origins: string[] | null;
  rate_limit_rpm: number | null;
  monthly_budget_cents: number | null;
  hard_cap_cents: number | null;
  expires_at: string | null;
  revoked_at: string | null;
}

/** Never LOOSEN an expiry the customer already set on the old key — the
 *  tighter of (existing expiry, grace deadline) wins. Pure so it's
 *  unit-testable without a Hono context or a real clock. */
export function rotatedKeyExpiry(now: Date, graceHours: number, existingExpiresAt: string | null): Date {
  const graceDeadline = new Date(now.getTime() + graceHours * 60 * 60 * 1000);
  const existing = existingExpiresAt ? new Date(existingExpiresAt) : null;
  return existing && existing < graceDeadline ? existing : graceDeadline;
}

// POST /v1/agents/:id/keys/:keyId/rotate
export const rotateAgentKey: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const agentId = c.req.param("id");
  const keyId = c.req.param("keyId");
  if (!agentId || !isValidUuid(agentId) || !keyId || !isValidUuid(keyId)) {
    return c.json(gatewayError("Invalid agent or key id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const agent = await agentExists(supabase, auth.orgId, agentId);
  if (!agent) {
    return c.json(gatewayError("Agent not found", "invalid_request_error", "agent_not_found", requestId), 404);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = rotateAgentKeySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        "invalid_request_error",
        "invalid_request",
        requestId
      ),
      400
    );
  }
  const graceHours = parsed.data.grace_hours ?? DEFAULT_ROTATE_GRACE_HOURS;

  const { data: oldKey } = await supabase
    .schema("inference")
    .from("api_keys")
    .select("id, name, key_tier, allowed_origins, rate_limit_rpm, monthly_budget_cents, hard_cap_cents, expires_at, revoked_at")
    .eq("id", keyId)
    .eq("org_id", auth.orgId)
    .eq("agent_id", agentId)
    .maybeSingle<OldKeyRow>();

  if (!oldKey) {
    return c.json(gatewayError("Access key not found for this agent", "invalid_request_error", "agent_key_not_found", requestId), 404);
  }
  if (oldKey.revoked_at || (oldKey.expires_at && new Date(oldKey.expires_at) <= new Date())) {
    return c.json(
      gatewayError("Key is already revoked or expired — create a new one instead", "invalid_request_error", "agent_key_inactive", requestId),
      409
    );
  }

  const oldKeyNewExpiry = rotatedKeyExpiry(new Date(), graceHours, oldKey.expires_at);

  const owner = await resolveOrgOwner(supabase, auth.orgId);
  if (!owner) {
    return c.json(gatewayError("Unable to resolve billing account", "server_error", "billing_unresolved", requestId), 500);
  }

  const { fullKey, keyPrefix, keyLastFour, keyHash } = await generateApiKey(oldKey.key_tier);

  const { data: newKeyRow, error: insertErr } = await supabase
    .schema("inference")
    .from("api_keys")
    .insert({
      org_id: auth.orgId,
      created_by_user_id: owner,
      agent_id: agentId,
      name: oldKey.name,
      key_prefix: keyPrefix,
      key_last_four: keyLastFour,
      key_hash: keyHash,
      key_tier: oldKey.key_tier,
      allowed_origins: oldKey.allowed_origins,
      rate_limit_rpm: oldKey.rate_limit_rpm,
      monthly_budget_cents: oldKey.monthly_budget_cents,
      hard_cap_cents: oldKey.hard_cap_cents,
    })
    .select("id, name, key_prefix, key_last_four, created_at")
    .single<{ id: string; name: string; key_prefix: string; key_last_four: string; created_at: string }>();

  if (insertErr || !newKeyRow) {
    return c.json(gatewayError("Failed to create the replacement key", "server_error", "agent_key_rotate_failed", requestId), 500);
  }

  // Only now touch the old row — if this fails, the caller still has a
  // working new key and can retry/revoke the old one manually; a partial
  // failure here never leaves them locked out.
  await supabase
    .schema("inference")
    .from("api_keys")
    .update({ expires_at: oldKeyNewExpiry.toISOString() })
    .eq("id", keyId)
    .eq("org_id", auth.orgId)
    .is("revoked_at", null);

  enqueueAudit(c, {
    action: "agent_key.rotated",
    targetType: "api_key",
    targetId: keyId,
    metadata: { agent_id: agentId, new_key_id: newKeyRow.id, old_key_expires_at: oldKeyNewExpiry.toISOString(), grace_hours: graceHours },
  });

  return c.json(
    {
      object: "agent.api_key.rotation" as const,
      new_key: { ...newKeyRow, object: "agent.api_key" as const, api_key: fullKey },
      old_key_id: keyId,
      old_key_expires_at: oldKeyNewExpiry.toISOString(),
      message: "Copy the new key now — it will never be shown again. The old key keeps working until it expires.",
    },
    201
  );
};

// ── Memories ─────────────────────────────────────────────────────────────────

// DELETE /v1/agents/:id/memories — right-to-erasure purge (DPDP/GDPR),
// idempotent. Counterpart to app/api/agents/[id]/memories (dashboard-only).
export const purgeAgentMemories: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const agentId = c.req.param("id");
  if (!agentId || !isValidUuid(agentId)) {
    return c.json(gatewayError("Invalid agent id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  if (!(await agentExists(supabase, auth.orgId, agentId))) {
    return c.json(gatewayError("Agent not found", "invalid_request_error", "agent_not_found", requestId), 404);
  }

  const { data, error } = await supabase
    .schema("agentcore")
    .from("agent_memories")
    .delete()
    .eq("org_id", auth.orgId)
    .eq("agent_id", agentId)
    .select("id");

  if (error) {
    return c.json(gatewayError(error.message, "server_error", "memory_purge_failed", requestId), 500);
  }

  enqueueAudit(c, { action: "agent.memory_purged", targetType: "agentcore_agent", targetId: agentId, metadata: { purged: data?.length ?? 0 } });
  return c.json({ purged: data?.length ?? 0 });
};
