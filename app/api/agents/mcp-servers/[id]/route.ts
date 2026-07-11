/**
 * PATCH  /api/agents/mcp-servers/[id] — edit a registered MCP server (M4).
 * DELETE /api/agents/mcp-servers/[id] — remove a registered MCP server
 * (M3, doc 14 §4). Both org-scoped — a curated (org_id NULL) row can never
 * match, so no customer can touch a platform row through either route.
 *
 * PATCH intentionally cannot change `slug` or `visibility` — see
 * AgentcoreMcpServers.update()'s doc comment for why.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreMcpServers } from "@/lib/supabase/queries/agentcore";
import { updateMcpServerSchema } from "@/lib/agentcore/agent-schema";
import { encryptAesGcm, bytesToPostgresBytea } from "@/lib/inference/crypto";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

function canWrite(role: string): boolean {
  return role !== "viewer";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid MCP server id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:mcp-servers-update", limit: 20, windowMs: 60_000 });
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

  const parsed = updateMcpServerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // Re-encrypt only if a NEW credential was actually provided — omitted means
  // "leave the existing one alone" (neither is ever returned to the client,
  // so there's nothing to "keep the same value" with otherwise).
  let authTokenEnc: string | undefined;
  let oauthClientSecretEnc: string | undefined;
  if (d.auth_token || d.oauth_client_secret) {
    const dek = process.env.BYOK_DEK;
    if (!dek) {
      return NextResponse.json({ error: "Server is not configured to store MCP credentials (BYOK_DEK missing)" }, { status: 500 });
    }
    try {
      if (d.auth_token) authTokenEnc = bytesToPostgresBytea(await encryptAesGcm(d.auth_token, dek));
      if (d.oauth_client_secret) oauthClientSecretEnc = bytesToPostgresBytea(await encryptAesGcm(d.oauth_client_secret, dek));
    } catch (err) {
      console.error("[mcp-servers] encryption failed:", err);
      return NextResponse.json({ error: "Failed to encrypt credentials" }, { status: 500 });
    }
  }

  const result = await AgentcoreMcpServers.update(org.org_id, id, {
    display_name: d.display_name,
    server_url: d.server_url,
    allowed_tools: d.allowed_tools,
    auth_token_enc: authTokenEnc,
    oauth_client_id: d.oauth_client_id,
    oauth_client_secret_enc: oauthClientSecretEnc,
    oauth_scope: d.oauth_scope,
  });

  if (!result.success) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "MCP server not found in this org" }, { status: 404 });
    }
    return NextResponse.json({ error: result.error || "Failed to update MCP server" }, { status: 400 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "mcp_server.updated",
    targetType: "mcp_server",
    targetId: id,
    metadata: { fields: Object.keys(d) },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data: result.data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid MCP server id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:mcp-servers-delete", limit: 20, windowMs: 60_000 });
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

  const result = await AgentcoreMcpServers.remove(org.org_id, id);
  if (!result.success) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "MCP server not found in this org" }, { status: 404 });
    }
    return NextResponse.json({ error: result.error || "Failed to delete MCP server" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "mcp_server.removed",
    targetType: "mcp_server",
    targetId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, deleted_id: id });
}
