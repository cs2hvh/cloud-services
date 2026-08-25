/**
 * Registry-mode config resolution (M3, doc 14 §4/§2b; OAuth token
 * resolution/refresh added M6, doc 14 §10 decision #2).
 *
 * Resolves a `{server_slug}` McpToolDecl into the exact same ResolvedMcpConfig
 * shape mcp.ts's inline mode already produces — the adapter (mcp.ts) stays
 * agnostic to where config came from and needs no changes. This is the ONE
 * file that imports the registry; mcp.ts / mcp-client.ts never do (§2b rule 2).
 *
 * Best-effort like everything else in M1: any resolution failure (row not
 * found, wrong org, disabled, bad ciphertext, missing DEK, refresh failure)
 * returns null — the caller (mcp-attach.ts) treats that exactly like a
 * connect failure and skips the server (§7 scenario 3), never failing the run.
 *
 * OAuth-mode servers are why agent-runner (unlike M1-M5) now ENCRYPTS as well
 * as decrypts (mcp-crypto.ts's encryptMcpToken): an access token expires and
 * this is the only process that ever makes a live MCP call, so it's the only
 * process that ever discovers expiry and needs to persist a refreshed token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { discoverOAuthServerInfo, refreshAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { decryptMcpToken, encryptMcpToken } from "./mcp-crypto.js";
import { assertSafeWebhookUrl } from "./ssrf.js";
import { sanitizeLabel, type ResolvedMcpConfig } from "./mcp.js";
import type { McpToolInfo } from "./mcp-client.js";

/** The subset of a mcp_servers row `resolveOAuthToken` actually needs —
 *  exported so mcp-schema-refresh.ts's health-check sweep can reuse the SAME
 *  resolve-and-refresh logic instead of re-implementing OAuth resolution a
 *  second time (that cron predates OAuth and, before this export, had no
 *  idea oauth-mode servers even existed — every oauth row it checked would
 *  connect with no Authorization header at all and get marked 'error' on a
 *  perfectly healthy server, found by re-reading this cron against the new
 *  OAuth columns rather than assuming it already handled them). */
export interface OAuthTokenRow {
  id: string;
  server_url: string;
  auth_type: "static" | "oauth";
  oauth_client_id: string | null;
  oauth_client_secret_enc: string | null;
  oauth_access_token_enc: string | null;
  oauth_refresh_token_enc: string | null;
  oauth_token_expires_at: string | null;
  oauth_authorization_server_url: string | null;
}

interface McpServerRow extends OAuthTokenRow {
  org_id: string | null;
  slug: string;
  auth_token_enc: string | null;
  allowed_tools: string[] | null;
  status: string;
  tool_schemas: McpToolInfo[] | null;
}

/** Per-decl overrides on top of the registry row (doc 14 §4: "org-level
 *  allowlist — agent decl can narrow further"). Both optional; a decl rarely
 *  needs either since the registry row already carries sane defaults. */
export interface RegistryDeclOverrides {
  label?: string;
  allowedTools?: string[];
}

const REFRESH_SKEW_MS = 60_000; // refresh a little before actual expiry, not exactly at it

/** SSRF-guards every discovery/token-endpoint URL the OAuth refresh call
 *  touches — same requirement as the dashboard-side authorize/callback
 *  routes (doc 14 §5), just agent-runner's existing guard (ssrf.ts) instead
 *  of the Next-side lib/mcp/oauth-fetch.ts, since this runs in a different
 *  package with no import path to app code. */
// Found live (2026-07-10, same root cause as lib/mcp/oauth-fetch.ts on the
// Next.js side): a customer's OAuth server that's unreachable or doesn't
// actually answer .well-known discovery requests hung this call indefinitely
// — discoverOAuthServerInfo has no timeout of its own, and neither did this
// wrapper. Here that's worse than the dashboard case: this runs inside a live
// agent run (would hold a worker concurrency slot open indefinitely) AND
// inside the schema-refresh cron's sequential sweep (would stall every
// server checked after it, not just this one).
const OAUTH_FETCH_TIMEOUT_MS = 15_000;

function makeGuardedFetch(allowPrivate?: boolean) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    await assertSafeWebhookUrl(url, { allowPrivate });
    const signal = init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS)])
      : AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS);
    return fetch(input as never, { ...init, signal });
  };
}

async function persistOAuthState(
  supabase: SupabaseClient,
  row: OAuthTokenRow,
  patch: Record<string, unknown>,
  opts: {
    /** CAS guard (found live, 2026-07-15): two concurrent runs reading the
     *  same row both attempt a refresh with the same (soon-to-be-stale)
     *  refresh token; the winner rotates it and succeeds, the loser's refresh
     *  call is then rejected by the provider as invalid_grant. Without this
     *  guard the loser's failure write races the winner's success write and
     *  can land second, stomping oauth_status back to 'error' on a server
     *  that is, at that moment, perfectly healthy — a false alarm in the
     *  management UI (self-heals on the next successful call, but only after
     *  showing a wrong status in the meantime). Only apply this guard to the
     *  failure path: two concurrent *successes* racing is harmless either way
     *  (both wrote valid, if different, tokens). */
    onlyIfRefreshTokenUnchanged?: boolean;
  } = {}
): Promise<void> {
  let query = supabase.schema("agentcore").from("mcp_servers").update(patch).eq("id", row.id);
  if (opts.onlyIfRefreshTokenUnchanged) {
    query = query.eq("oauth_refresh_token_enc", row.oauth_refresh_token_enc);
  }
  await query;
}

/**
 * Resolves an oauth-mode row's bearer token, refreshing it first if expired
 * (or close to it). Returns null on ANY failure — missing refresh token,
 * missing DEK, a dead authorization server, a revoked grant — so the caller
 * treats it exactly like a connect failure (best-effort skip), never a run
 * failure. Persists a successful refresh's new tokens back to the row;
 * persists the failure reason too, so it's visible in the management UI via
 * the same oauth_status/oauth_last_error the callback route writes.
 *
 * Exported: mcp-schema-refresh.ts's health-check sweep reuses this exact
 * function rather than re-resolving OAuth tokens itself — see OAuthTokenRow's
 * doc comment for why that reuse matters here specifically.
 */
export async function resolveOAuthToken(
  supabase: SupabaseClient,
  row: OAuthTokenRow,
  dek: string,
  allowPrivate?: boolean
): Promise<string | null> {
  const expiresAtMs = row.oauth_token_expires_at ? new Date(row.oauth_token_expires_at).getTime() : 0;
  const stillValid = row.oauth_access_token_enc && expiresAtMs - REFRESH_SKEW_MS > Date.now();
  if (stillValid) {
    try {
      return await decryptMcpToken(row.oauth_access_token_enc!, dek);
    } catch {
      return null;
    }
  }

  if (!row.oauth_refresh_token_enc || !row.oauth_client_id) return null; // nothing to refresh with

  try {
    const refreshToken = await decryptMcpToken(row.oauth_refresh_token_enc, dek);
    const clientSecret = row.oauth_client_secret_enc ? await decryptMcpToken(row.oauth_client_secret_enc, dek) : undefined;
    const fetchFn = makeGuardedFetch(allowPrivate);

    const authorizationServerUrl =
      row.oauth_authorization_server_url ?? (await discoverOAuthServerInfo(row.server_url, { fetchFn })).authorizationServerUrl;

    const tokens = await refreshAuthorization(authorizationServerUrl, {
      clientInformation: { client_id: row.oauth_client_id, client_secret: clientSecret },
      refreshToken,
      resource: new URL(row.server_url),
      fetchFn,
    });

    const newAccessEnc = await encryptMcpToken(tokens.access_token, dek);
    // refreshAuthorization preserves the original refresh_token when the
    // server doesn't issue a new one — re-encrypt it either way so the
    // stored ciphertext is always freshly IV'd, never reused.
    const newRefreshEnc = await encryptMcpToken(tokens.refresh_token ?? refreshToken, dek);
    const newExpiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;

    await persistOAuthState(supabase, row, {
      oauth_access_token_enc: newAccessEnc,
      oauth_refresh_token_enc: newRefreshEnc,
      oauth_token_expires_at: newExpiresAt,
      oauth_authorization_server_url: authorizationServerUrl,
      oauth_status: "connected",
      oauth_last_error: null,
    });
    return tokens.access_token;
  } catch (err) {
    await persistOAuthState(
      supabase,
      row,
      {
        oauth_status: "error",
        oauth_last_error: err instanceof Error ? err.message : "Token refresh failed",
      },
      { onlyIfRefreshTokenUnchanged: true }
    );
    return null;
  }
}

export async function resolveRegistryMcpConfig(
  supabase: SupabaseClient,
  orgId: string,
  slug: string,
  dek: string | null,
  declOverrides?: RegistryDeclOverrides,
  /** Dev-only escape hatch — mirrors function tool's AGENT_WEBHOOK_ALLOW_PRIVATE,
   *  threaded down for the OAuth discovery/refresh HTTP calls this function
   *  makes for oauth-mode rows (static-token rows never touch the network here). */
  allowPrivate?: boolean
): Promise<ResolvedMcpConfig | null> {
  // Org-scoped OR platform-curated (org_id IS NULL) — same visibility rule the
  // RLS policy enforces, applied explicitly since the runner uses service-role.
  const { data } = await supabase
    .schema("agentcore")
    .from("mcp_servers")
    .select(
      "id, org_id, slug, server_url, auth_type, auth_token_enc, oauth_client_id, oauth_client_secret_enc, oauth_access_token_enc, oauth_refresh_token_enc, oauth_token_expires_at, oauth_authorization_server_url, allowed_tools, status, tool_schemas"
    )
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .eq("slug", slug)
    .maybeSingle<McpServerRow>();

  if (!data || data.status !== "active") return null;

  let token: string | undefined;
  if (data.auth_type === "oauth") {
    if (!dek) return null; // can't decrypt/refresh without the DEK — fail closed
    const resolved = await resolveOAuthToken(supabase, data, dek, allowPrivate);
    if (!resolved) return null; // not connected yet, or refresh failed — skip this server (§7 scenario 3)
    token = resolved;
  } else if (data.auth_token_enc) {
    if (!dek) return null; // can't decrypt without the DEK — fail closed
    try {
      token = await decryptMcpToken(data.auth_token_enc, dek);
    } catch {
      return null;
    }
  }

  // Regression (found live, 2026-07-07): this used to ignore declOverrides
  // entirely — an agent's own `allowed_tools` on a `{server_slug}` decl was
  // silently dropped, so "agent decl can narrow further" (doc 14 §4) never
  // actually narrowed anything. Merge: the decl's list intersects the row's
  // own restriction (if the row has one); either alone still applies.
  const rowAllowed = data.allowed_tools?.length ? data.allowed_tools : null;
  const declAllowed = declOverrides?.allowedTools?.length ? declOverrides.allowedTools : null;
  const allowedTools =
    declAllowed && rowAllowed
      ? declAllowed.filter((t) => rowAllowed.includes(t))
      : (declAllowed ?? rowAllowed ?? undefined);

  return {
    url: data.server_url,
    token,
    // The slug (not display_name) is the namespace label: it's already
    // validated clean at registration (`^[a-z0-9][a-z0-9_-]*$`, doc 14 §4's
    // createMcpServerSchema), where display_name is free text ("DeepWiki
    // (GitHub repo Q&A)") that sanitizeLabel's 24-char cut can mangle into an
    // ugly, truncated tool name (found live: `mcp__deepwiki__github_repo_q___
    // ask_question` instead of the clean `mcp__deepwiki__ask_question`). A
    // decl-level label override still wins when explicitly set.
    label: sanitizeLabel(declOverrides?.label ?? data.slug),
    allowedTools,
    // Scalability path (§4/§6): the schema-refresh cron already has this
    // server's tools/list — let connectMcpTools advertise from it instead of
    // connecting fresh every run. Absent (or empty) rows fall through to the
    // old connect-and-list behavior unchanged (e.g. never swept yet).
    cachedTools: data.tool_schemas?.length ? data.tool_schemas : undefined,
  };
}
