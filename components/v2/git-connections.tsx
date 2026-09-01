"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Notice } from "@/components/v2/notice";
import { V2_MONO } from "@/components/v2/kit";
import {
  ProviderMark,
  PROVIDER_LABEL,
  PROVIDER_ACCENT,
  type Provider,
} from "@/components/v2/provider-mark";

/**
 * The git accounts this team can deploy from — and the way to remove one.
 *
 * There was no way to disconnect an account at all. You could connect one and
 * then live with it: the wrong account, an org that should not have been linked,
 * or somebody who has left. The API had no DELETE and the picker only ever
 * showed a connect button, and only when nothing was connected.
 *
 * THREE PROVIDERS, AND THE ONES THIS DEPLOYMENT CANNOT DO SAY SO. GitLab and
 * Bitbucket were fully built — OAuth, webhooks, clients, columns — and had no
 * way in from the interface, so the platform read as GitHub-only. Offering a
 * button that 500s because a client secret is unset would be worse than not
 * offering it, so the button asks first and explains instead.
 *
 * DISCONNECTING ASKS TWICE WHEN SOMETHING DEPENDS ON IT. The route answers 409
 * with the projects that build through the account, and this shows them by name
 * before offering to go ahead. Naming them matters more than counting them —
 * "3 projects" is a number, "arthakosha" is a decision.
 */

interface Installation {
  /** A string on every provider: Bitbucket's workspace id is a braced UUID. */
  id: string;
  provider: Provider;
  account: string | null;
  accountType: string | null;
  repositorySelection?: string | null;
  hasCredential?: boolean;
}

interface ProviderStatus {
  provider: Provider;
  label: string;
  configured: boolean;
  connectUrl: string;
  missing?: string;
}

interface Blocked {
  installationId: string;
  provider: Provider;
  account: string;
  message: string;
  projects: Array<{ ref: string; name: string }>;
}

export function GitConnections() {
  const router = useRouter();
  // Fetched here rather than threaded in as a prop, the same way the repository
  // picker does it: /api/v2/git/connect needs a team ref, and a component that
  // asks for its own is one that can be dropped anywhere it is needed.
  const [teamRef, setTeamRef] = useState<string | null>(null);
  const [installations, setInstallations] = useState<Installation[] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Which providers this deployment can actually start a connect flow for.
  // Null while unknown — rendering three buttons before the answer arrives
  // would offer one that is about to turn out to be unavailable.
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/git/installations");
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "Could not read your connections.");
        return;
      }
      setInstallations(body.installations ?? []);
      setWarning(body.warning ?? null);
    } catch {
      setError("Could not reach the server to read your connections.");
    }
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/v2/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setTeamRef(b?.team?.ref ?? b?.teams?.[0]?.ref ?? null))
      .catch(() => setTeamRef(null));
    fetch("/api/v2/git/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setProviders(b?.providers ?? null))
      .catch(() => setProviders(null));
  }, [load]);

  async function disconnect(id: string, provider: Provider, force: boolean) {
    setBusy(id);
    setError(null);
    try {
      // The provider is part of the address, not a detail: the table's key is
      // (provider, external_id), so an id alone does not identify a row.
      const qs = new URLSearchParams({ provider });
      if (force) qs.set("force", "1");
      const res = await fetch(`/api/v2/git/installations/${encodeURIComponent(id)}?${qs}`, {
        method: "DELETE",
      });
      const body = await res.json();

      if (res.status === 409) {
        setBlocked({
          installationId: id,
          provider,
          account: body.account ?? String(id),
          message: body?.error?.message ?? "Projects still use this connection.",
          projects: body.projects ?? [],
        });
        setBusy(null);
        return;
      }
      if (!res.ok) {
        setError(body?.error?.message ?? "Could not disconnect that account.");
        setBusy(null);
        return;
      }

      setBlocked(null);
      await load();
      // The project list may now show projects that cannot build, so the page
      // behind this is stale in a way that matters.
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(null);
  }


  return (
    <div>
      {installations === null ? (
        <p className={`${V2_MONO} text-[11.5px] text-white/35`}>Reading your connections…</p>
      ) : installations.length === 0 ? (
        /*
          TWO SENTENCES THAT CONTRADICTED EACH OTHER. With nothing usable AND a
          stale reference, this said "No git account is connected yet" and the
          notice below said "A GitHub connection no longer exists" — a customer
          reading both cannot tell whether they connected something or not.

          Both were true, which is exactly why it needed one sentence rather
          than two: the row exists and the installation behind it does not.
        */
        <p className="text-[12.5px] leading-[1.7] text-white/50">
          {warning
            ? "The GitHub App this team used has been removed or reinstalled, so we can no longer read its repositories. Connect again below to restore access."
            : "No git account is connected yet. Connecting one lets us read its repositories — it is separate from the account you signed in with."}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {installations.map((i) => (
            <li
              key={`${i.provider}:${i.id}`}
              className="flex items-center justify-between gap-4 py-2.5 first:pt-0"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {/* Which provider, at a glance. An account name alone does not
                    say — the same person can be `harshit` on all three. */}
                <span
                  className="shrink-0"
                  style={{ color: PROVIDER_ACCENT[i.provider] }}
                  title={PROVIDER_LABEL[i.provider]}
                >
                  <ProviderMark provider={i.provider} className="h-[15px] w-[15px]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-white">
                    {i.account ?? `Connection ${i.id}`}
                  </p>
                  <p className={`${V2_MONO} mt-0.5 text-[10.5px] text-white/35`}>
                    {PROVIDER_LABEL[i.provider]}
                    {i.accountType ? ` · ${i.accountType}` : ""}
                    {i.repositorySelection === "all"
                      ? " · all repositories"
                      : i.repositorySelection === "selected"
                        ? " · selected repositories"
                        : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => disconnect(i.id, i.provider, false)}
                disabled={busy === i.id}
                className={`${V2_MONO} shrink-0 rounded-[5px] border border-white/[0.12] px-2.5 py-1 text-[10.5px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:border-rose-400/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {busy === i.id ? "Working…" : "Disconnect"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        ONE BUTTON PER PROVIDER, and the ones this deployment cannot do are
        shown disabled with the reason rather than hidden. Hiding them makes a
        deployment that has not configured GitLab look like a product that does
        not support GitLab, which sends the customer to a competitor over an
        unset environment variable.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {providers === null ? (
          <span className={`${V2_MONO} text-[11px] text-white/30`}>
            Checking which providers are available…
          </span>
        ) : (
          providers.map((pr) => {
            // GitHub's connect flow needs the team in the URL; the OAuth ones
            // mint their state server-side and need nothing from here.
            const needsTeam = pr.provider === "github";
            const href = needsTeam
              ? teamRef
                ? `${pr.connectUrl}?team=${encodeURIComponent(teamRef)}`
                : null
              : pr.connectUrl;
            const usable = pr.configured && href !== null;

            if (!usable) {
              return (
                <span
                  key={pr.provider}
                  title={
                    pr.configured
                      ? "Could not read your team. Reload the page."
                      : `Not configured on this deployment${pr.missing ? ` — needs ${pr.missing}` : ""}.`
                  }
                  className={`${V2_MONO} inline-flex cursor-not-allowed items-center gap-1.5 rounded-[6px] border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-white/25`}
                >
                  <ProviderMark provider={pr.provider} className="h-3.5 w-3.5" />
                  {pr.label}
                  <span className="text-[10px] uppercase tracking-[0.1em] text-white/20">
                    {pr.configured ? "unavailable" : "off"}
                  </span>
                </span>
              );
            }

            return (
              <a
                key={pr.provider}
                href={href}
                className={`${V2_MONO} inline-flex items-center gap-1.5 rounded-[6px] border border-white/[0.14] px-2.5 py-1.5 text-[11.5px] text-white/75 transition-colors hover:border-white/30 hover:text-white`}
              >
                <span style={{ color: PROVIDER_ACCENT[pr.provider] }}>
                  <ProviderMark provider={pr.provider} className="h-3.5 w-3.5" />
                </span>
                {pr.label}
              </a>
            );
          })
        )}
      </div>

      {providers !== null && !providers.some((pr) => pr.configured) ? (
        <p className={`${V2_MONO} mt-2 text-[11px] text-white/30`}>
          No git provider is configured on this deployment. An operator has to set the client
          credentials before any account can be connected.
        </p>
      ) : null}
      {blocked ? (
        <div className="mt-4">
          <Notice tone="blocked" title={`${blocked.account} is still in use`}>
            <p className="text-[12.5px] leading-[1.7]">{blocked.message}</p>
            <ul className={`${V2_MONO} mt-2 space-y-0.5 text-[11px] text-white/60`}>
              {blocked.projects.map((p) => (
                <li key={p.ref}>
                  {p.name} <span className="text-white/30">{p.ref}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => disconnect(blocked.installationId, blocked.provider, true)}
                disabled={busy === blocked.installationId}
                className={`${V2_MONO} rounded-[5px] border border-rose-400/50 bg-rose-500/15 px-2.5 py-1 text-[10.5px] uppercase tracking-[0.12em] text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-40`}
              >
                Disconnect anyway
              </button>
              <button
                type="button"
                onClick={() => setBlocked(null)}
                className={`${V2_MONO} px-2 py-1 text-[10.5px] uppercase tracking-[0.12em] text-white/40 hover:text-white/70`}
              >
                Cancel
              </button>
            </div>
          </Notice>
        </div>
      ) : null}

      {/* Only alongside connections that DO work — otherwise the sentence above
          has already said it, and saying it twice is what made the screen
          contradict itself. */}
      {warning && (installations?.length ?? 0) > 0 ? (
        <div className="mt-4">
          <Notice tone="blocked" title="One connection no longer works">
            {warning}
          </Notice>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Notice tone="blocked" title="Could not do that">
            {error}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
