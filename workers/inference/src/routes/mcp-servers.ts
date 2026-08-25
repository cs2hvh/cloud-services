/**
 * MCP server registry — list/register/edit/delete a server in the org's MCP
 * registry (agentcore.mcp_servers), by API key. Counterpart to
 * app/api/agents/mcp-servers/* (dashboard-session-only) — same table, same
 * validation, same AES-GCM encryption of stored credentials
 * (lib/crypto.ts, mirrors lib/inference/crypto.ts byte-for-byte).
 *
 * Scope, deliberately narrower than the dashboard version: registering a
 * `static`-auth server (bearer token) works end-to-end here. Registering an
 * `oauth`-auth server's CLIENT CONFIG also works — but completing the actual
 * consent flow (GET .../oauth/authorize, the 302 to the provider, and the
 * callback) is NOT ported here. That flow needs @modelcontextprotocol/sdk's
 * OAuth discovery/PKCE helpers (unverified Workers-runtime compatibility)
 * plus the existing SSRF-guarded discovery fetch (lib/mcp/oauth-fetch.ts,
 * Next.js-only) — real, separate work, not a mechanical port like the rest
 * of this file. An oauth server registered here still needs a human to open
 * the dashboard once to finish connecting it.
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";
import { encryptAesGcm, bytesToPostgresBytea } from "../lib/crypto.ts";
import { isValidUuid } from "../lib/on-behalf-of.ts";
import { makeSupabase, enqueueAudit, readJson } from "../lib/route-helpers.ts";

// ── Validation (mirrors lib/agentcore/agent-schema.ts's createMcpServerSchema
// / updateMcpServerSchema — see file header for why this can't just import them) ──

export const createMcpServerSchema = z
  .object({
    slug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/, "slug must be lowercase alphanumeric/underscore/hyphen"),
    display_name: z.string().min(1).max(100),
    server_url: z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), "must be an http(s) URL"),
    auth_type: z.enum(["static", "oauth"]).optional().default("static"),
    auth_token: z.string().min(1).max(2000).optional(),
    oauth_client_id: z.string().min(1).max(500).optional(),
    oauth_client_secret: z.string().min(1).max(2000).optional(),
    oauth_scope: z.string().max(500).optional(),
    allowed_tools: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine((d) => d.auth_type !== "oauth" || !!d.oauth_client_id, {
    message: "oauth_client_id is required when auth_type is 'oauth'",
    path: ["oauth_client_id"],
  })
  .refine((d) => d.auth_type !== "static" || !d.oauth_client_id, {
    message: "oauth_client_id only applies when auth_type is 'oauth'",
    path: ["oauth_client_id"],
  });

export const updateMcpServerSchema = z
  .object({
    display_name: z.string().min(1).max(100).optional(),
    server_url: z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), "must be an http(s) URL").optional(),
    auth_token: z.string().min(1).max(2000).optional(),
    oauth_client_id: z.string().min(1).max(500).optional(),
    oauth_client_secret: z.string().min(1).max(2000).optional(),
    oauth_scope: z.string().max(500).optional(),
    allowed_tools: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

// ── Shared plumbing ─────────────────────────────────────────────────────────

interface McpServerDbRow {
  id: string;
  org_id: string | null;
  slug: string;
  display_name: string;
  server_url: string;
  auth_type: "static" | "oauth";
  auth_token_enc: string | null;
  oauth_client_id: string | null;
  oauth_status: "pending" | "connected" | "error" | null;
  oauth_last_error: string | null;
  allowed_tools: string[];
  visibility: "private" | "curated";
  status: "active" | "error" | "disabled";
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const MCP_SERVER_COLS =
  "id, org_id, slug, display_name, server_url, auth_type, auth_token_enc, oauth_client_id, oauth_status, oauth_last_error, allowed_tools, visibility, status, last_error, created_at, updated_at";

/** Mask the row for the wire — auth_token_enc/oauth_client_secret_enc are
 *  NEVER returned, only a derived `has_token` boolean (same masking the
 *  dashboard's AgentcoreMcpServers.list/create/update apply). */
function toMcpServerResponse(row: McpServerDbRow) {
  return {
    id: row.id,
    object: "mcp_server" as const,
    slug: row.slug,
    display_name: row.display_name,
    server_url: row.server_url,
    auth_type: row.auth_type,
    has_token: row.auth_token_enc != null,
    oauth_client_id: row.oauth_client_id,
    oauth_status: row.oauth_status,
    oauth_last_error: row.oauth_last_error,
    allowed_tools: row.allowed_tools ?? [],
    visibility: row.visibility,
    status: row.status,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// GET /v1/mcp-servers — the org's own servers + the platform-curated catalog.
export const listMcpServers: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const supabase = makeSupabase(c.env);

  const { data, error } = await supabase
    .schema("agentcore")
    .from("mcp_servers")
    .select(MCP_SERVER_COLS)
    .or(`org_id.eq.${auth.orgId},org_id.is.null`)
    // Org's own ('private') servers first, curated catalog last — 'private' >
    // 'curated' alphabetically, so this needs DESCENDING order.
    .order("visibility", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<McpServerDbRow[]>();

  if (error) {
    return c.json(gatewayError("Failed to list MCP servers", "server_error", "mcp_servers_list_failed", requestId), 500);
  }
  return c.json({ object: "list" as const, data: (data ?? []).map(toMcpServerResponse) });
};

// POST /v1/mcp-servers — register once, org-scoped (always visibility='private').
export const createMcpServer: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = createMcpServerSchema.safeParse(raw);
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

  if ((d.auth_token || d.oauth_client_secret) && !c.env.BYOK_DEK) {
    return c.json(gatewayError("Server is not configured to store MCP credentials", "server_error", "dek_missing", requestId), 500);
  }

  // Encrypt whichever credential applies BEFORE it ever reaches the DB —
  // auth_token and oauth_client_secret are mutually exclusive by the
  // schema's own refine(), so at most one of these runs.
  let authTokenEnc: string | null = null;
  let oauthClientSecretEnc: string | null = null;
  try {
    if (d.auth_token) authTokenEnc = bytesToPostgresBytea(await encryptAesGcm(d.auth_token, c.env.BYOK_DEK));
    if (d.oauth_client_secret) oauthClientSecretEnc = bytesToPostgresBytea(await encryptAesGcm(d.oauth_client_secret, c.env.BYOK_DEK));
  } catch {
    return c.json(gatewayError("Failed to encrypt credentials", "server_error", "encryption_failed", requestId), 500);
  }

  const supabase = makeSupabase(c.env);
  const { data, error } = await supabase
    .schema("agentcore")
    .from("mcp_servers")
    .insert({
      org_id: auth.orgId,
      slug: d.slug,
      display_name: d.display_name,
      server_url: d.server_url,
      auth_type: d.auth_type,
      auth_token_enc: authTokenEnc,
      oauth_client_id: d.oauth_client_id ?? null,
      oauth_client_secret_enc: oauthClientSecretEnc,
      oauth_scope: d.oauth_scope ?? null,
      // A freshly-registered oauth server has no tokens yet — 'pending'
      // until a human completes the authorize→callback consent flow
      // (dashboard-only for now, see file header).
      oauth_status: d.auth_type === "oauth" ? "pending" : null,
      allowed_tools: d.allowed_tools ?? [],
      visibility: "private",
    })
    .select(MCP_SERVER_COLS)
    .single<McpServerDbRow>();

  if (error || !data) {
    if (error?.code === "23505") {
      return c.json(gatewayError(`An MCP server with slug "${d.slug}" already exists`, "invalid_request_error", "duplicate_slug", requestId), 409);
    }
    return c.json(gatewayError(error?.message ?? "Failed to register MCP server", "server_error", "mcp_server_create_failed", requestId), 400);
  }

  enqueueAudit(c, {
    action: "mcp_server.registered",
    targetType: "mcp_server",
    targetId: data.id,
    metadata: { slug: d.slug, display_name: d.display_name, has_token: authTokenEnc != null },
  });

  return c.json(toMcpServerResponse(data), 201);
};

// PATCH /v1/mcp-servers/:id — slug/visibility/auth_type are NOT editable
// (see AgentcoreMcpServers.update()'s doc comment on the dashboard side —
// slug is agents' stable bind-key; changing it would silently break every
// agent bound to it; visibility/auth_type switches would leave stale
// credentials of the wrong shape).
export const updateMcpServer: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid MCP server id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = updateMcpServerSchema.safeParse(raw);
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

  // Re-encrypt only if a NEW credential was actually provided — omitted
  // means "leave the existing one alone" (neither is ever returned to the
  // caller, so there's nothing to "keep the same value" with otherwise).
  let authTokenEnc: string | undefined;
  let oauthClientSecretEnc: string | undefined;
  if (d.auth_token || d.oauth_client_secret) {
    if (!c.env.BYOK_DEK) {
      return c.json(gatewayError("Server is not configured to store MCP credentials", "server_error", "dek_missing", requestId), 500);
    }
    try {
      if (d.auth_token) authTokenEnc = bytesToPostgresBytea(await encryptAesGcm(d.auth_token, c.env.BYOK_DEK));
      if (d.oauth_client_secret) oauthClientSecretEnc = bytesToPostgresBytea(await encryptAesGcm(d.oauth_client_secret, c.env.BYOK_DEK));
    } catch {
      return c.json(gatewayError("Failed to encrypt credentials", "server_error", "encryption_failed", requestId), 500);
    }
  }

  const patch: Record<string, unknown> = {
    display_name: d.display_name,
    server_url: d.server_url,
    allowed_tools: d.allowed_tools,
    auth_token_enc: authTokenEnc,
    oauth_client_id: d.oauth_client_id,
    oauth_client_secret_enc: oauthClientSecretEnc,
    oauth_scope: d.oauth_scope,
  };
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];

  const supabase = makeSupabase(c.env);
  const { data, error } = await supabase
    .schema("agentcore")
    .from("mcp_servers")
    .update(patch)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .select(MCP_SERVER_COLS)
    .maybeSingle<McpServerDbRow>();

  if (error) {
    return c.json(gatewayError(error.message, "server_error", "mcp_server_update_failed", requestId), 400);
  }
  if (!data) {
    return c.json(gatewayError("MCP server not found in this org", "invalid_request_error", "mcp_server_not_found", requestId), 404);
  }

  enqueueAudit(c, { action: "mcp_server.updated", targetType: "mcp_server", targetId: id, metadata: { fields: Object.keys(d) } });
  return c.json(toMcpServerResponse(data));
};

// DELETE /v1/mcp-servers/:id — org-scoped; a curated (org_id NULL) row can
// never match, so no caller can delete a platform row through this route.
export const deleteMcpServer: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid MCP server id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const { data, error } = await supabase
    .schema("agentcore")
    .from("mcp_servers")
    .delete()
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return c.json(gatewayError(error.message, "server_error", "mcp_server_delete_failed", requestId), 500);
  }
  if (!data) {
    return c.json(gatewayError("MCP server not found in this org", "invalid_request_error", "mcp_server_not_found", requestId), 404);
  }

  enqueueAudit(c, { action: "mcp_server.removed", targetType: "mcp_server", targetId: id, metadata: {} });
  return c.json({ id, object: "mcp_server" as const, deleted: true });
};
