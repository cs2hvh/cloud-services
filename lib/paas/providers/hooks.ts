/**
 * Registering the push webhook on a repository, for both OAuth providers.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CLIENTS. Listing repositories is a read
 * and fails harmlessly. Creating a hook is a WRITE on the customer's
 * repository, and it is the one place this platform mutates something it does
 * not own. That deserves its own file, its own idempotency rule, and its own
 * refusal to guess.
 *
 * GITHUB DOES NOT APPEAR HERE. A GitHub App receives events for every
 * repository the installation covers, configured once on the App itself — there
 * is no per-repository hook to create and nothing to clean up when a project is
 * deleted. GitLab and Bitbucket have no equivalent: each repository needs its
 * own hook, created with our URL and our secret, and each one is litter if the
 * project goes away.
 *
 * IDEMPOTENCY IS BY URL, NOT BY A STORED ID. Storing the hook id would work
 * until someone deletes the hook in the provider's UI, at which point we hold
 * an id for something that no longer exists and never notice — pushes stop and
 * nothing reports it. Listing and matching on our own URL asks the question
 * that actually matters: is there a hook here pointing at us?
 */

import type { GitProvider } from "./types.ts";

export interface HookSpec {
  /** Where pushes should arrive. */
  url: string;
  /** GitLab's token, or Bitbucket's HMAC secret. */
  secret: string;
}

export interface ExistingHook {
  id: string;
  url: string;
  active: boolean;
}

export type HookOutcome =
  | { action: "created"; id: string }
  | { action: "already-present"; id: string }
  /**
   * A hook pointing at us exists but is disabled, or its events are wrong.
   * Reported rather than silently recreated: a second hook on the same URL
   * means every push is delivered twice, which is two builds of one commit.
   */
  | { action: "needs-attention"; id: string; detail: string };

/**
 * Decide what to do about a repository's hooks, given what is already there.
 *
 * Pure, so the decision is testable without touching a customer's repository —
 * which matters more here than anywhere else in this lane, because the action
 * it authorises is a write we cannot undo from our side.
 */
export function planHook(existing: ExistingHook[], spec: HookSpec): { create: boolean; outcome?: HookOutcome } {
  // Compared without the query string and without a trailing slash: providers
  // normalise URLs inconsistently, and a mismatch on a slash creates a second
  // hook that delivers every push twice.
  const normalise = (u: string) => u.split("?")[0].replace(/\/+$/, "").toLowerCase();
  const target = normalise(spec.url);

  const ours = existing.filter((h) => normalise(h.url) === target);
  if (ours.length === 0) return { create: true };

  const live = ours.find((h) => h.active);
  if (!live) {
    return {
      create: false,
      outcome: {
        action: "needs-attention",
        id: ours[0].id,
        detail: "a hook points at us but is disabled — enable it rather than adding a second",
      },
    };
  }

  if (ours.length > 1) {
    return {
      create: false,
      outcome: {
        action: "needs-attention",
        id: live.id,
        detail: `${ours.length} hooks point at us — every push is delivered ${ours.length} times`,
      },
    };
  }

  return { create: false, outcome: { action: "already-present", id: live.id } };
}

// ── GitLab ──────────────────────────────────────────────────────────────────

interface Fetcher {
  (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>;
}

export async function listGitlabHooks(
  host: string,
  token: string,
  fullName: string,
  fetcher: Fetcher,
): Promise<ExistingHook[]> {
  const id = encodeURIComponent(fullName);
  const res = await fetcher(`${host.replace(/\/+$/, "")}/api/v4/projects/${id}/hooks`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`[providers/hooks] gitlab list -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as Array<{ id?: unknown; url?: unknown; disabled_until?: unknown }>;
  return (Array.isArray(body) ? body : [])
    .filter((h) => typeof h.url === "string" && h.id !== undefined)
    .map((h) => ({
      id: String(h.id),
      url: h.url as string,
      // GitLab disables a failing hook by setting disabled_until rather than a
      // boolean, so an absent field is the healthy case.
      active: h.disabled_until == null,
    }));
}

export async function createGitlabHook(
  host: string,
  token: string,
  fullName: string,
  spec: HookSpec,
  fetcher: Fetcher,
): Promise<string> {
  const id = encodeURIComponent(fullName);
  const res = await fetcher(`${host.replace(/\/+$/, "")}/api/v4/projects/${id}/hooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: spec.url,
      token: spec.secret,
      push_events: true,
      // Everything else off. A hook subscribed to more than it needs delivers
      // payloads the receiver refuses, which fills the provider's failure log
      // and eventually gets the hook auto-disabled.
      merge_requests_events: false,
      tag_push_events: false,
      issues_events: false,
      note_events: false,
      pipeline_events: false,
      // TLS verification ON. It defaults on, and is set explicitly because this
      // is the field someone turns off while debugging a certificate and never
      // turns back on — at which point our webhook secret travels to whoever
      // answers on that hostname.
      enable_ssl_verification: true,
    }),
  });
  if (!res.ok) throw new Error(`[providers/hooks] gitlab create -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { id?: unknown };
  if (body?.id === undefined) throw new Error("[providers/hooks] gitlab created a hook with no id");
  return String(body.id);
}

// ── Bitbucket ───────────────────────────────────────────────────────────────

export async function listBitbucketHooks(
  token: string,
  fullName: string,
  fetcher: Fetcher,
): Promise<ExistingHook[]> {
  const res = await fetcher(`https://api.bitbucket.org/2.0/repositories/${fullName}/hooks?pagelen=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`[providers/hooks] bitbucket list -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { values?: Array<{ uuid?: unknown; url?: unknown; active?: unknown }> };
  return (Array.isArray(body?.values) ? body.values : [])
    .filter((h) => typeof h.url === "string" && typeof h.uuid === "string")
    .map((h) => ({ id: h.uuid as string, url: h.url as string, active: h.active !== false }));
}

export async function createBitbucketHook(
  token: string,
  fullName: string,
  spec: HookSpec,
  fetcher: Fetcher,
): Promise<string> {
  const res = await fetcher(`https://api.bitbucket.org/2.0/repositories/${fullName}/hooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      description: "AhuraCloud deploy",
      url: spec.url,
      active: true,
      events: ["repo:push"],
      // WITHOUT THIS BITBUCKET SENDS NO SIGNATURE AT ALL, and the receiver
      // refuses every delivery with `no-signature` — correctly, since an
      // unsigned request is indistinguishable from someone stripping the
      // header. A hook created without it looks configured and never deploys.
      secret: spec.secret,
    }),
  });
  if (!res.ok) throw new Error(`[providers/hooks] bitbucket create -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { uuid?: unknown };
  if (typeof body?.uuid !== "string") throw new Error("[providers/hooks] bitbucket created a hook with no uuid");
  return body.uuid;
}

/**
 * Ensure a repository has exactly one working hook pointing at us.
 *
 * Never deletes and never edits — only creates, and only when nothing points
 * at us. Anything else is reported for a human. This platform is writing to a
 * repository it does not own, and the difference between "add what is missing"
 * and "make it match what I expect" is the difference between a helpful
 * integration and one that removes a customer's own CI hook because it did not
 * recognise the URL.
 */
export async function ensureHook(
  provider: Exclude<GitProvider, "github">,
  args: { host?: string; token: string; fullName: string; spec: HookSpec },
  fetcher: Fetcher,
): Promise<HookOutcome> {
  const { token, fullName, spec } = args;
  const host = args.host ?? "https://gitlab.com";

  const existing =
    provider === "gitlab"
      ? await listGitlabHooks(host, token, fullName, fetcher)
      : await listBitbucketHooks(token, fullName, fetcher);

  const plan = planHook(existing, spec);
  if (!plan.create) return plan.outcome!;

  const id =
    provider === "gitlab"
      ? await createGitlabHook(host, token, fullName, spec, fetcher)
      : await createBitbucketHook(token, fullName, spec, fetcher);

  return { action: "created", id };
}
