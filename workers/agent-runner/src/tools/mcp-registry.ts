/**
 * Registry-mode config resolution (M3, doc 14 §4/§2b).
 *
 * Resolves a `{server_slug}` McpToolDecl into the exact same ResolvedMcpConfig
 * shape mcp.ts's inline mode already produces — the adapter (mcp.ts) stays
 * agnostic to where config came from and needs no changes. This is the ONE
 * file that imports the registry; mcp.ts / mcp-client.ts never do (§2b rule 2).
 *
 * Best-effort like everything else in M1: any resolution failure (row not
 * found, wrong org, disabled, bad ciphertext, missing DEK) returns null — the
 * caller (mcp-attach.ts) treats that exactly like a connect failure and skips
 * the server (§7 scenario 3), never failing the run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptMcpToken } from "./mcp-crypto.js";
import { sanitizeLabel, type ResolvedMcpConfig } from "./mcp.js";

interface McpServerRow {
  slug: string;
  server_url: string;
  auth_token_enc: string | null;
  allowed_tools: string[] | null;
  status: string;
}

/** Per-decl overrides on top of the registry row (doc 14 §4: "org-level
 *  allowlist — agent decl can narrow further"). Both optional; a decl rarely
 *  needs either since the registry row already carries sane defaults. */
export interface RegistryDeclOverrides {
  label?: string;
  allowedTools?: string[];
}

export async function resolveRegistryMcpConfig(
  supabase: SupabaseClient,
  orgId: string,
  slug: string,
  dek: string | null,
  declOverrides?: RegistryDeclOverrides
): Promise<ResolvedMcpConfig | null> {
  // Org-scoped OR platform-curated (org_id IS NULL) — same visibility rule the
  // RLS policy enforces, applied explicitly since the runner uses service-role.
  const { data } = await supabase
    .schema("agentcore")
    .from("mcp_servers")
    .select("slug, server_url, auth_token_enc, allowed_tools, status")
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .eq("slug", slug)
    .maybeSingle<McpServerRow>();

  if (!data || data.status !== "active") return null;

  let token: string | undefined;
  if (data.auth_token_enc) {
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
  };
}
