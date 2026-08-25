/**
 * Agent-scoped API keys ("Access Keys" tab, doc: manager ask 2026-07-08).
 *
 * GET  /api/agents/[id]/keys  — list this agent's own keys (masked)
 * POST /api/agents/[id]/keys — mint a new key restricted to this one agent
 *
 * These are ordinary `inference.api_keys` rows with `agent_id` set (see
 * migration 20260708000001) — same table, same ahu_live_ format, same
 * rate-limit/spend-cap/audit machinery as the general org-wide keys
 * (app/api/inference/api-keys/route.ts). The only difference is the scope
 * column and that creation happens from the agent's own page, org+agent
 * scoped, instead of the general Keys settings page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { actingUserId, controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { AgentcoreAgents } from "@/lib/supabase/queries/agentcore";
import { generateApiKey } from "@/lib/inference/api-key-crypto";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

// An "origin" is scheme + host (+ optional port), never a path — what a
// browser's `Origin` request header actually sends. https:// for real
// deployments; http://localhost / http://127.0.0.1 special-cased (never
// arbitrary http://) so a customer can test an embed before deploying it —
// every comparable vendor (Stripe, Google Maps, Firebase) does the same.
const ORIGIN_RE = /^(https:\/\/[a-zA-Z0-9.-]+(:\d+)?|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

// Doc: manager ask 2026-07-08, confirmed against DigitalOcean's own agent
// docs (no spend cap documented at all for their public endpoints) — a
// public key is designed to be visible to anyone, so it must never be
// unbounded. Applied only when the customer didn't set their own cap;
// chk_public_key_has_hard_cap (migration 20260708000003) is the structural
// guarantee this can never be bypassed, this is just the friendly default.
const DEFAULT_PUBLIC_KEY_HARD_CAP_CENTS = 2000; // $20/mo

const createSchema = z
  .object({
    name: z.string().min(1).max(100),
    // Public tier (doc: manager ask 2026-07-08) — safe to embed in a
    // customer's website JS; always agent-scoped (already true here) and
    // always origin-restricted (enforced below + by the DB CHECK).
    tier: z.enum(["private", "public"]).default("private"),
    allowed_origins: z.array(z.string().regex(ORIGIN_RE, "must be an https:// origin (or http://localhost for testing)")).max(20).optional(),
    rate_limit_rpm: z.number().int().min(1).max(10000).optional().nullable(),
    monthly_budget_cents: z.number().int().nonnegative().optional().nullable(),
    hard_cap_cents: z.number().int().nonnegative().optional().nullable(),
    expires_at: z.string().datetime().optional().nullable(),
  })
  .refine((d) => d.tier === "private" || (d.allowed_origins && d.allowed_origins.length > 0), {
    message: "Public keys require at least one allowed origin",
    path: ["allowed_origins"],
  });

function canWrite(role: string): boolean {
  return role !== "viewer";
}

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id: agentId } = await params;

  const rl = await limitByUser(auth.subject, { prefix: "rl:agent-keys-list", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const agent = await AgentcoreAgents.get(org.org_id, agentId);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const supabase = supabaseService();
  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .select("id, name, key_prefix, key_last_four, key_tier, allowed_origins, rate_limit_rpm, monthly_budget_cents, hard_cap_cents, expires_at, last_used_at, created_at")
    .eq("org_id", org.org_id)
    .eq("agent_id", agentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[agent-keys] list error:", error);
    return NextResponse.json({ error: "Failed to list access keys" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: (data ?? []).map((k) => ({
      id: k.id,
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
    })),
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id: agentId } = await params;

  const rl = await limitByUser(auth.subject, { prefix: "rl:agent-keys-create", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && !canWrite(org.role ?? "")) {
    return NextResponse.json({ error: "Insufficient role — developer or higher required" }, { status: 403 });
  }

  const agent = await AgentcoreAgents.get(org.org_id, agentId);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const { fullKey, keyPrefix, keyLastFour, keyHash } = generateApiKey(d.tier);

  // A public key must never be unbounded (chk_public_key_has_hard_cap
  // guarantees this structurally) — default it if the customer didn't set
  // one, rather than forcing them to think about a cap before they can even
  // try the feature.
  const hardCapCents = d.hard_cap_cents ?? (d.tier === "public" ? DEFAULT_PUBLIC_KEY_HARD_CAP_CENTS : null);

  const supabase = supabaseService();
  const { data, error } = await supabase
    .schema("inference")
    .from("api_keys")
    .insert({
      org_id: org.org_id,
      created_by_user_id: (await actingUserId(auth))!,
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
    .single();

  if (error) {
    console.error("[agent-keys] create error:", error);
    const isCheckViolation = error.message?.includes("chk_public_key");
    return NextResponse.json(
      { error: isCheckViolation ? "Public keys require an allowed origin and a spend cap" : "Failed to create access key" },
      { status: isCheckViolation ? 400 : 500 }
    );
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "key.created",
    targetType: "api_key",
    targetId: data.id,
    metadata: { name: d.name, agent_id: agentId, agent_name: agent.name, scoped: true, tier: d.tier },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json(
    {
      success: true,
      data: { ...data, api_key: fullKey },
      message: "Copy this key now — for security, the full key will never be shown again.",
    },
    { status: 201 }
  );
}
