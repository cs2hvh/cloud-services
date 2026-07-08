/**
 * MCP schema-refresh / health-check (M4 follow-up, doc 14 §4/§7 scenario 13).
 *
 * Closes the gap flagged repeatedly during live testing: `status`/`last_error`
 * on a registered server were write-once at creation — nothing ever flipped a
 * server to 'error' when it actually went down, so "the customer sees it in
 * the registry last_error" had no mechanism to ever become true. This job
 * periodically re-checks every registered server (private + curated) and
 * updates status/last_error/tool_schemas/schemas_refreshed_at accordingly.
 *
 * Deliberately does NOT change the per-run adapter (mcp.ts / mcp-attach.ts /
 * mcp-registry.ts stay frozen, §2b rule 3) — this is a separate, additive,
 * out-of-band job. It reuses the SAME quarantined SDK wrapper (mcp-client.ts)
 * and the SAME crypto (mcp-crypto.ts) and SSRF guard (ssrf.ts), so no new
 * surface touches the SDK or key material (§2b rules 2/4).
 *
 * `tool_schemas` is written here but not yet READ anywhere at run time (the
 * adapter still does a fresh connect+listTools every run) — that's the
 * separate "scalability win" doc 14 §4 describes and is still deferred; this
 * job only delivers the correctness-relevant half (accurate status/last_error).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSafeWebhookUrl } from "./ssrf.js";
import { decryptMcpToken } from "./mcp-crypto.js";
import { openMcpClient, type McpToolInfo } from "./mcp-client.js";

interface McpServerRow {
  id: string;
  server_url: string;
  auth_token_enc: string | null;
}

export interface RefreshLogger {
  warn(fields: Record<string, unknown>, msg: string): void;
  error(fields: Record<string, unknown>, msg: string): void;
}

export interface RefreshDeps {
  supabase: SupabaseClient;
  /** Decrypts a row's auth_token_enc. Null → any token-bearing row is marked
   *  'error' (can't verify it without the token), same fail-closed posture
   *  registry-mode run-time resolution already uses. */
  dek: string | null;
  timeoutMs: number;
  /** Dev-only escape hatch — mirrors function tool's AGENT_WEBHOOK_ALLOW_PRIVATE
   *  (same env var, threaded from index.ts). Lets tests use fake/unresolvable
   *  hostnames without a real SSRF-guard DNS lookup. */
  allowPrivate?: boolean;
  logger?: RefreshLogger;
  /** Injectable for L1 unit tests (a fake client, no network). Production
   *  callers never pass this, so they get the real openMcpClient. */
  openClient?: typeof openMcpClient;
}

export interface RefreshSummary {
  checked: number;
  ok: number;
  failed: number;
}

/** Re-checks every non-disabled registered server (service-role — no org
 *  filter, this is a maintenance sweep across the whole registry, mirroring
 *  the connector-scheduler refresh pattern doc 14 §4 references). */
export async function refreshAllMcpServers(deps: RefreshDeps): Promise<RefreshSummary> {
  const openClient = deps.openClient ?? openMcpClient;
  const { data, error } = await deps.supabase
    .schema("agentcore")
    .from("mcp_servers")
    .select("id, server_url, auth_token_enc")
    .neq("status", "disabled")
    .returns<McpServerRow[]>();

  if (error || !data) {
    deps.logger?.error({ err: error?.message }, "mcp-schema-refresh: failed to list servers");
    return { checked: 0, ok: 0, failed: 0 };
  }

  let ok = 0;
  let failed = 0;
  for (const row of data) {
    // Sequential, not Promise.all: this is a background sweep, not a
    // request path — no latency pressure, and it avoids opening N concurrent
    // connections to N different (untrusted) remote servers at once.
    const healthy = await refreshOne(row, deps, openClient);
    if (healthy) ok++;
    else failed++;
  }
  return { checked: data.length, ok, failed };
}

async function refreshOne(
  row: McpServerRow,
  deps: RefreshDeps,
  openClient: typeof openMcpClient
): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    await assertSafeWebhookUrl(row.server_url, { allowPrivate: deps.allowPrivate });

    let token: string | undefined;
    if (row.auth_token_enc) {
      if (!deps.dek) throw new Error("no DEK configured to decrypt the stored auth token");
      token = await decryptMcpToken(row.auth_token_enc, deps.dek);
    }

    const client = await openClient(row.server_url, token, deps.timeoutMs);
    let tools: McpToolInfo[];
    try {
      tools = await client.listTools();
    } finally {
      await client.close().catch(() => undefined);
    }

    const { error } = await deps.supabase
      .schema("agentcore")
      .from("mcp_servers")
      .update({ status: "active", last_error: null, tool_schemas: tools, schemas_refreshed_at: now })
      .eq("id", row.id);
    if (error) throw new Error(`failed to persist refreshed schema: ${error.message}`);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deps.supabase
      .schema("agentcore")
      .from("mcp_servers")
      .update({ status: "error", last_error: message.slice(0, 500), schemas_refreshed_at: now })
      .eq("id", row.id);
    deps.logger?.warn({ id: row.id, err: message }, "mcp-schema-refresh: server unhealthy");
    return false;
  }
}
