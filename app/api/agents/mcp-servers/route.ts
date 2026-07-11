/**
 * GET  /api/agents/mcp-servers — list the org's registered MCP servers + the
 *      platform-curated catalog (M3, doc 14 §4/§12b)
 * POST /api/agents/mcp-servers — register a server (RBAC: developer+ to write)
 *
 * Mirrors app/api/inference/byok-keys/route.ts: Zod validate → org-scope →
 * encrypt the auth token (AES-GCM, lib/inference/crypto.ts, BYOK_DEK) before
 * it ever reaches the DB → mask on every read (auth_token_enc is NEVER
 * returned, only a `has_token` boolean — see AgentcoreMcpServers.list/create).
 *
 * Same auth pattern as the rest of /api/agents (Bearer-capable
 * authenticateUserFromHeader + getOrBootstrapOrgForUser), not byok-keys'
 * cookie-only authenticateUser — this is an agentcore-family endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreMcpServers } from "@/lib/supabase/queries/agentcore";
import { createMcpServerSchema } from "@/lib/agentcore/agent-schema";
import { encryptAesGcm, bytesToPostgresBytea } from "@/lib/inference/crypto";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

/** Writes require developer+ — viewers are read-only (same rule as /api/agents). */
function canWrite(role: string): boolean {
  return role !== "viewer";
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:mcp-servers-list", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  try {
    const servers = await AgentcoreMcpServers.list(org.org_id);
    return NextResponse.json({ success: true, data: servers });
  } catch (err) {
    console.error("[mcp-servers] list error:", err);
    return NextResponse.json({ error: "Failed to list MCP servers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:mcp-servers-create", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }
  if (!canWrite(org.role)) {
    return NextResponse.json({ error: "Insufficient role — developer or higher required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createMcpServerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const dek = process.env.BYOK_DEK;
  if ((d.auth_token || d.oauth_client_secret) && !dek) {
    return NextResponse.json({ error: "Server is not configured to store MCP credentials (BYOK_DEK missing)" }, { status: 500 });
  }

  // Encrypt whichever credential applies BEFORE it ever reaches the DB (same
  // discipline as byok-keys). auth_token and oauth_client_secret are mutually
  // exclusive by the schema's own refine(), so at most one of these runs.
  let authTokenEnc: string | null = null;
  let oauthClientSecretEnc: string | null = null;
  try {
    if (d.auth_token) authTokenEnc = bytesToPostgresBytea(await encryptAesGcm(d.auth_token, dek!));
    if (d.oauth_client_secret) oauthClientSecretEnc = bytesToPostgresBytea(await encryptAesGcm(d.oauth_client_secret, dek!));
  } catch (err) {
    console.error("[mcp-servers] encryption failed:", err);
    return NextResponse.json({ error: "Failed to encrypt credentials" }, { status: 500 });
  }

  const result = await AgentcoreMcpServers.create({
    org_id: org.org_id,
    slug: d.slug,
    display_name: d.display_name,
    server_url: d.server_url,
    auth_type: d.auth_type,
    auth_token_enc: authTokenEnc,
    oauth_client_id: d.oauth_client_id ?? null,
    oauth_client_secret_enc: oauthClientSecretEnc,
    oauth_scope: d.oauth_scope ?? null,
    allowed_tools: d.allowed_tools ?? [],
  });

  if (!result.success) {
    if (result.code === "23505") {
      return NextResponse.json({ error: `An MCP server with slug "${d.slug}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: result.error || "Failed to register MCP server" }, { status: 400 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "mcp_server.registered",
    targetType: "mcp_server",
    targetId: result.data!.id,
    metadata: { slug: d.slug, display_name: d.display_name, has_token: authTokenEnc != null },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
}
