"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Notice } from "@/components/v2/notice";
import { V2_MONO, buttonClass } from "@/components/v2/kit";

/**
 * The git accounts this team can deploy from — and the way to remove one.
 *
 * There was no way to disconnect an account at all. You could connect one and
 * then live with it: the wrong account, an org that should not have been linked,
 * or somebody who has left. The API had no DELETE and the picker only ever
 * showed a connect button, and only when nothing was connected.
 *
 * DISCONNECTING ASKS TWICE WHEN SOMETHING DEPENDS ON IT. The route answers 409
 * with the projects that build through the account, and this shows them by name
 * before offering to go ahead. Naming them matters more than counting them —
 * "3 projects" is a number, "arthakosha" is a decision.
 */

interface Installation {
  id: number;
  account: string | null;
  accountType: string | null;
  repositorySelection?: string | null;
}

interface Blocked {
  installationId: number;
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
  const [busy, setBusy] = useState<number | null>(null);
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
  }, [load]);

  async function disconnect(id: number, force: boolean) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/v2/git/installations/${id}${force ? "?force=1" : ""}`, {
        method: "DELETE",
      });
      const body = await res.json();

      if (res.status === 409) {
        setBlocked({
          installationId: id,
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

  const connectHref = teamRef
    ? `/api/v2/git/connect?team=${encodeURIComponent(teamRef)}`
    : null;

  return (
    <div>
      {installations === null ? (
        <p className={`${V2_MONO} text-[11.5px] text-white/35`}>Reading your connections…</p>
      ) : installations.length === 0 ? (
        <p className="text-[12.5px] leading-[1.7] text-white/50">
          No git account is connected yet. Connecting one lets us read its repositories — it is
          separate from the account you signed in with.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {installations.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-white">{i.account ?? `Installation ${i.id}`}</p>
                <p className={`${V2_MONO} mt-0.5 text-[10.5px] text-white/35`}>
                  {i.accountType ?? "account"}
                  {i.repositorySelection === "all"
                    ? " · all repositories"
                    : i.repositorySelection === "selected"
                      ? " · selected repositories"
                      : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => disconnect(i.id, false)}
                disabled={busy === i.id}
                className={`${V2_MONO} shrink-0 rounded-[5px] border border-white/[0.12] px-2.5 py-1 text-[10.5px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:border-rose-400/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {busy === i.id ? "Working…" : "Disconnect"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {connectHref ? (
        <a href={connectHref} className={buttonClass("secondary", "sm", "mt-4")}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {installations && installations.length > 0 ? "Add another account" : "Connect an account"}
        </a>
      ) : (
        <p className={`${V2_MONO} mt-4 text-[11px] text-white/35`}>
          Could not read your team, so the connect link cannot be built. Reload the page.
        </p>
      )}

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
                onClick={() => disconnect(blocked.installationId, true)}
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

      {warning ? (
        <div className="mt-4">
          <Notice tone="blocked" title="A connection no longer exists on GitHub">
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
