/**
 * The adapter the repos route wires in: every provider's repositories for one
 * team, with each provider's failure kept separate from its emptiness.
 *
 * HANDED TO THE DEPLOY LANE RATHER THAN WIRED BY THIS ONE.
 * `app/api/v2/repos/route.ts` is theirs; this is the function it calls.
 *
 * THE ONE PROPERTY THAT MATTERS MOST. If GitLab is down and GitHub is fine, the
 * combined answer must NOT read as "you have no GitLab repositories". An empty
 * list invites "connect your account"; an error invites "retry". They are
 * different states, the UI renders them differently, and collapsing them is the
 * defect this whole codebase has spent its time removing. So a provider that
 * could not be read returns `repos: null` and an error string — never `[]`.
 *
 * RLS-SCOPED. Takes the caller's Supabase client rather than reaching for the
 * service role: the connections it reads are the caller's team's, and the
 * policy on paas.installations is what makes that true. A service-role read
 * here would return every team's connections and the filter would be ours to
 * get right, which is exactly the arrangement rule 1 exists to prevent.
 *
 * ONE SLOW PROVIDER MUST NOT DELAY THE OTHERS, so the fan-out is parallel and
 * each provider's failure is caught locally. A rejected promise anywhere would
 * otherwise lose every provider's result including the ones that worked.
 */

import * as gitlab from "../gitlab/client.ts";
import * as bitbucket from "../bitbucket/client.ts";
import { listInstallationRepos } from "../github/client.ts";
import { decryptConnectionToken, needsRefresh } from "./credentials.ts";
import type { GitProvider, ProviderListing, ProviderRepo } from "./types.ts";

/** One row of paas.installations, as the adapter needs it. */
export interface ConnectionRow {
  provider: GitProvider;
  external_id: string;
  account_login: string;
  access_token_ct: string | null;
  token_dek_id: string | null;
  token_expires_at: string | null;
  provider_metadata: Record<string, unknown> | null;
}

/**
 * PostgREST returns bytea as a `\x`-prefixed hex string.
 *
 * Returns null rather than throwing on a shape it does not recognise: a
 * malformed credential is one broken connection, and throwing here would take
 * down the listing for every other provider the team has.
 */
export function hexToBuffer(value: string | null): Buffer | null {
  if (typeof value !== "string") return null;
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length === 0 || hex.length % 2 !== 0) return null;
  return Buffer.from(hex, "hex");
}

/**
 * Decrypt a connection's access token, or explain why not.
 *
 * Every failure is a STRING rather than an exception, because each one is a
 * per-connection condition the listing should report against that provider
 * while still returning the others.
 */
export function resolveToken(row: ConnectionRow): { token: string } | { error: string } {
  if (!row.access_token_ct || !row.token_dek_id) {
    return { error: `${row.provider} connection ${row.account_login} has no stored credential — reconnect it` };
  }
  const ct = hexToBuffer(row.access_token_ct);
  if (!ct) return { error: `${row.provider} connection ${row.account_login} has an unreadable credential` };

  // Reported, not refused. A token past its expiry may still work — providers
  // are inconsistent about enforcing it — and refusing outright would hide a
  // working connection behind a clock comparison. The caller refreshes.
  const stale = needsRefresh(row.token_expires_at);

  try {
    const token = decryptConnectionToken(row.provider, row.external_id, "access", ct, row.token_dek_id);
    return { token };
  } catch (e) {
    // The message names the connection, never the ciphertext or the key.
    return {
      error:
        `${row.provider} connection ${row.account_login} could not be decrypted` +
        (stale ? " (and its token is past expiry)" : "") +
        ` — ${(e as Error).message.slice(0, 120)}`,
    };
  }
}

/**
 * List repositories across every connection a team holds.
 *
 * Grouped by PROVIDER, not by connection: a team with two GitLab groups gets
 * one `gitlab` listing containing both, because that is the unit the UI's
 * provider chooser is built on. A failure in either connection fails that
 * provider's listing — a partially-read provider must not present as complete.
 */
export async function listReposForTeam(connections: ConnectionRow[]): Promise<ProviderListing[]> {
  const byProvider = new Map<GitProvider, ConnectionRow[]>();
  for (const c of connections) {
    byProvider.set(c.provider, [...(byProvider.get(c.provider) ?? []), c]);
  }

  const settled = await Promise.all(
    [...byProvider.entries()].map(async ([provider, rows]): Promise<ProviderListing> => {
      const repos: ProviderRepo[] = [];
      try {
        for (const row of rows) {
          repos.push(...(await listOneConnection(provider, row)));
        }
        return { provider, repos, error: null };
      } catch (e) {
        // repos is DISCARDED on failure rather than returned partially. Half a
        // provider's repositories rendered as all of them is the same lie as an
        // empty list, and harder to notice.
        return { provider, repos: null, error: (e as Error).message.slice(0, 300) };
      }
    }),
  );

  return settled;
}

async function listOneConnection(provider: GitProvider, row: ConnectionRow): Promise<ProviderRepo[]> {
  if (provider === "github") {
    // GitHub stores no credential — its tokens are minted per request from the
    // App private key. See credentials.ts for why that asymmetry exists.
    const id = Number(row.external_id);
    if (!Number.isSafeInteger(id)) {
      throw new Error(`github connection ${row.account_login} has a non-numeric installation id`);
    }
    const repos = await listInstallationRepos(id);
    return repos.map((r) => ({
      provider: "github" as const,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch ?? null,
      connectionId: row.external_id,
      account: r.full_name.split("/")[0],
    }));
  }

  const resolved = resolveToken(row);
  if ("error" in resolved) throw new Error(resolved.error);

  if (provider === "gitlab") {
    // The host is per-connection: a team may hold a gitlab.com connection and a
    // self-hosted one, and using one host for both would 404 the other.
    const host =
      typeof row.provider_metadata?.host === "string" ? row.provider_metadata.host : gitlab.GITLAB_CLOUD;
    return gitlab.listRepos(host, resolved.token, row.external_id);
  }

  return bitbucket.listRepos(resolved.token, row.external_id);
}
