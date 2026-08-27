"use client";

/**
 * Repository picker.
 *
 * A client component because it is a form: it fetches the caller's repositories,
 * lets one be chosen, and posts. The server pages elsewhere read directly
 * through RLS, but this needs interaction, so it goes through the API — which is
 * also the path a CLI would take, so the two cannot drift.
 *
 * THREE STATES, NOT TWO. Loading, failed, and empty are distinct and rendered
 * distinctly. Collapsing "we could not ask GitHub" into "you have no
 * repositories" is the failure this project has found most often, and here it
 * would tell someone their repos are gone and invite them to reinstall the app.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Repo {
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
  installationId: number;
  account: string;
}

interface Tier {
  id: string;
  label: string;
  memoryMib: number;
  vcpu: number;
  priceUsd: number;
}

export function Picker({ tiers }: { tiers: Tier[] }) {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<Repo | null>(null);
  const [tier, setTier] = useState(tiers[0]?.id ?? "starter");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/repos");
        if (!res.ok) throw new Error(`Could not list repositories (${res.status}).`);
        const body = await res.json();
        if (cancelled) return;
        setRepos(body.repos ?? []);
        setConnected(Boolean(body.connected));
        // A per-installation failure is surfaced rather than dropped — an
        // installation whose token could not be minted is not an installation
        // with no repositories.
        if (body.errors?.length) {
          setLoadError(`Some connections could not be read: ${body.errors.map((e: { account: string }) => e.account).join(", ")}.`);
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function create() {
    if (!chosen) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/v2/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: chosen.fullName,
          installationId: chosen.installationId,
          branch: chosen.defaultBranch ?? "main",
          tier,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        // The API's message, not a generic one. It already says whether this is
        // a duplicate name, an unknown plan, or an unusable repository name.
        setSubmitError(body?.error?.message ?? `Could not create the project (${res.status}).`);
        return;
      }
      router.push(`/dashboard/v2/projects/${body.project.ref}`);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError && repos === null) {
    return (
      <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm dark:border-red-900 dark:bg-red-950/40">
        <p className="font-medium text-red-900 dark:text-red-200">Could not load your repositories.</p>
        <p className="mt-0.5 text-xs text-red-800 dark:text-red-300">{loadError}</p>
      </div>
    );
  }

  if (repos === null) {
    return <p className="text-sm text-neutral-500">Loading your repositories…</p>;
  }

  if (connected === false) {
    return (
      <div className="rounded border border-dashed border-neutral-300 px-4 py-8 text-center dark:border-neutral-700">
        <p className="text-sm font-medium">No GitHub account connected</p>
        <p className="mt-1 text-xs text-neutral-500">
          Install the AhuraSense app on your GitHub account and choose which repositories it can see.
        </p>
      </div>
    );
  }

  const shown = filter
    ? repos.filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()))
    : repos;

  return (
    <div className="space-y-4">
      {loadError ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {loadError}
        </p>
      ) : null}

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter repositories"
        className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />

      {shown.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {repos.length === 0
            ? "This installation can see no repositories. Grant it access to one on GitHub."
            : "No repository matches that filter."}
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {shown.map((r) => (
            <li key={`${r.installationId}:${r.fullName}`}>
              <button
                type="button"
                onClick={() => setChosen(r)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                  chosen?.fullName === r.fullName ? "bg-neutral-100 dark:bg-neutral-800" : ""
                }`}
              >
                <span className="truncate">
                  {r.fullName}
                  {r.private ? <span className="ml-2 text-xs text-neutral-500">private</span> : null}
                </span>
                <span className="shrink-0 text-xs text-neutral-500">{r.defaultBranch ?? "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor="tier" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Plan
        </label>
        <select
          id="tier"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} — {t.memoryMib >= 1024 ? `${t.memoryMib / 1024} GB` : `${t.memoryMib} MB`} RAM, {t.vcpu} vCPU · ${t.priceUsd}/mo
            </option>
          ))}
        </select>
      </div>

      {submitError ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {submitError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={create}
        disabled={!chosen || submitting}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        {submitting ? "Creating…" : chosen ? `Create ${chosen.fullName.split("/")[1]}` : "Choose a repository"}
      </button>
    </div>
  );
}
