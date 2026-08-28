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

  /**
   * The caller's team, needed to START a connection.
   *
   * The empty state used to say “install the AhuraSense app” and offer no way
   * to do it — a dead end on the one screen where a new customer arrives with
   * nothing connected. /api/v2/git/connect needs a team ref, and /api/v2/me is
   * where that comes from; it also bootstraps a personal team, so a brand-new
   * account gets one by asking.
   */
  const [teamRef, setTeamRef] = useState<string | null>(null);

  // Everything below was accepted by POST /api/v2/projects from the start and
  // never offered. The API validated `branch`, `rootDirectory` and `instances`
  // while the form silently sent the default branch, no subdirectory and one
  // instance — so a monorepo could not deploy `apps/web` at all, and a project
  // could not be created on `develop` even though the field existed.
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branch, setBranch] = useState<string>("");
  const [rootDirectory, setRootDirectory] = useState("");
  const [instances, setInstances] = useState(1);

  /**
   * Environment variables set at CREATION.
   *
   * Without this the first deploy of anything needing config fails, and the
   * customer learns that by watching a build succeed and the app crash. That is
   * exactly how the first real deploy on this platform went: it built, served a
   * 500, and the cause was a missing NEXTAUTH_SECRET that could have been typed
   * here.
   *
   * Write-only in the same way the project page is — a value goes in and is
   * never shown again — so the form holds them only until they are saved.
   */
  const [envRows, setEnvRows] = useState<Array<{ key: string; value: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Asked alongside the repo list rather than only when it comes back
        // empty: the button has to be ready the moment the empty state renders.
        fetch("/api/v2/me")
          .then((r) => (r.ok ? r.json() : null))
          .then((me) => {
            if (!cancelled && me?.team?.ref) setTeamRef(me.team.ref as string);
          })
          .catch(() => {
            // Left null. The empty state then explains rather than offering a
            // button that cannot work.
          });

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

  /**
   * Load the chosen repository's branches.
   *
   * THREE STATES AGAIN, and the middle one matters most here: if GitHub cannot
   * be reached the branch list is null, NOT empty. An empty list would render a
   * dropdown with nothing in it and imply the repository has no branches, which
   * is never true of a repository you can see.
   *
   * The default branch is preselected but not assumed — it stays selectable so
   * someone deploying `develop` does not have to know the API accepts it.
   */
  useEffect(() => {
    if (!chosen) {
      setBranches(null);
      setBranch("");
      return;
    }
    let cancelled = false;
    setBranches(null);
    setBranchError(null);
    setBranch(chosen.defaultBranch ?? "");
    (async () => {
      try {
        const [owner, repo] = chosen.fullName.split("/");
        const res = await fetch(
          `/api/v2/git/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?installation=${chosen.installationId}`,
        );
        if (!res.ok) throw new Error(`Could not list branches (${res.status}).`);
        const body = await res.json();
        if (cancelled) return;
        const names: string[] = (body.branches ?? []).map((b: { name: string }) => b.name);
        setBranches(names);
        // Keep the default if it is really there; otherwise fall back to the
        // first branch rather than leaving a value the repo does not have.
        if (chosen.defaultBranch && names.includes(chosen.defaultBranch)) setBranch(chosen.defaultBranch);
        else if (names.length) setBranch(names[0]);
      } catch (e) {
        if (!cancelled) setBranchError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chosen]);

  async function create() {
    if (!chosen) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const vars = Object.fromEntries(
        envRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]),
      );

      const res = await fetch("/api/v2/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: chosen.fullName,
          installationId: chosen.installationId,
          branch: branch || chosen.defaultBranch || "main",
          rootDirectory: rootDirectory.trim() || undefined,
          instances,
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

      // Variables are saved AFTER the project exists, because they are keyed to
      // it. A failure here must NOT read as a failed creation — the project is
      // real and the customer is about to be looking at it, so it navigates and
      // the project page shows what did and did not save.
      if (Object.keys(vars).length) {
        try {
          await fetch(`/api/v2/projects/${body.project.ref}/env`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vars }),
          });
        } catch {
          // Swallowed deliberately, and only here: the project succeeded.
        }
      }

      router.push(`/dashboard/services/apps/${body.project.ref}`);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError && repos === null) {
    return (
      <div className="rounded border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-sm">
        <p className="font-medium text-red-200">Could not load your repositories.</p>
        <p className="mt-0.5 text-xs text-red-300/80">{loadError}</p>
      </div>
    );
  }

  if (repos === null) {
    return <p className="text-sm text-white/40">Loading your repositories…</p>;
  }

  if (connected === false) {
    return (
      <div className="rounded border border-dashed border-white/[0.09] px-4 py-8 text-center border-white/[0.09]">
        <p className="text-sm font-medium">No GitHub account connected</p>
        <p className="mt-1 text-xs text-white/40">
          Install the AhuraSense app on your GitHub account and choose which repositories it can see.
        </p>
        {/*
          CONNECTIONS ARE PER TEAM, NOT PER LOGIN, and that is why this can say
          "not connected" while the account settings page says "Connected".
          That page reads your Supabase OAuth identities — how you signed in.
          This reads paas.installations, which records which GitHub App
          installation a TEAM holds. Signing in with GitHub does not give your
          team a deploy connection, and the two are meant to be separable:
          people deploy from an org account they did not sign in with.
        */}
        <p className="mt-3 text-xs text-white/40">
          Signing in with GitHub is not the same thing — that is how you log in.
          This connects a GitHub account to your team so we can read its
          repositories.
        </p>
        {teamRef ? (
          <a
            href={`/api/v2/git/connect?team=${encodeURIComponent(teamRef)}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
          >
            Connect GitHub
          </a>
        ) : (
          // No button rather than a broken one. Without a team ref the connect
          // route cannot bind the installation to anything.
          <p className="mt-4 text-xs text-amber-600 dark:text-amber-500">
            Could not read your team, so the connect link cannot be built. Reload,
            and if it persists your account has no team yet.
          </p>
        )}
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
        className="w-full rounded border border-white/[0.09] px-3 py-1.5 text-sm border-white/[0.09]"
      />

      {shown.length === 0 ? (
        <p className="text-sm text-white/40">
          {repos.length === 0
            ? "This installation can see no repositories. Grant it access to one on GitHub."
            : "No repository matches that filter."}
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto rounded border border-white/[0.07] border-white/[0.07]">
          {shown.map((r) => (
            <li key={`${r.installationId}:${r.fullName}`}>
              <button
                type="button"
                onClick={() => setChosen(r)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.05] ${
 chosen?.fullName === r.fullName ? "bg-white/[0.06]" : ""
 }`}
              >
                <span className="truncate">
                  {r.fullName}
                  {r.private ? <span className="ml-2 text-xs text-white/40">private</span> : null}
                </span>
                <span className="shrink-0 text-xs text-white/40">{r.defaultBranch ?? "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen ? (
        <div className="space-y-4 rounded border border-white/[0.07] p-3 border-white/[0.07]">
          <div>
            <label htmlFor="branch" className="block text-xs font-medium text-white/60">
              Production branch
            </label>
            {branchError ? (
              // NOT an empty dropdown. A repository you can see always has
              // branches, so "none" would be a lie about GitHub being
              // unreachable. The typed field still lets the customer proceed.
              <>
                <input
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="mt-1 w-full rounded border border-white/[0.09] px-3 py-1.5 text-sm border-white/[0.09]"
                />
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Could not list branches ({branchError}) — type one. It is checked when you deploy.
                </p>
              </>
            ) : branches === null ? (
              <p className="mt-1 text-sm text-white/40">Loading branches…</p>
            ) : (
              <select
                id="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="mt-1 w-full rounded border border-white/[0.09] px-3 py-1.5 text-sm border-white/[0.09]"
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                    {b === chosen.defaultBranch ? " (default)" : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-white/40">
              Pushes here deploy to production. Every other branch gets a free preview for 48 hours.
            </p>
          </div>

          <div>
            <label htmlFor="root" className="block text-xs font-medium text-white/60">
              Root directory <span className="font-normal text-white/30">optional</span>
            </label>
            <input
              id="root"
              value={rootDirectory}
              onChange={(e) => setRootDirectory(e.target.value)}
              placeholder="apps/web"
              className="mt-1 w-full rounded border border-white/[0.09] px-3 py-1.5 font-mono text-sm border-white/[0.09]"
            />
            <p className="mt-1 text-xs text-white/40">
              For a monorepo. Leave blank if the app is at the repository root.
            </p>
          </div>

          <div>
            <label htmlFor="tier" className="block text-xs font-medium text-white/60">
              Plan
            </label>
            <select
              id="tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="mt-1 w-full rounded border border-white/[0.09] px-3 py-1.5 text-sm border-white/[0.09]"
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {t.memoryMib >= 1024 ? `${t.memoryMib / 1024} GB` : `${t.memoryMib} MB`} RAM, {t.vcpu} vCPU · ${t.priceUsd}/mo
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="instances" className="block text-xs font-medium text-white/60">
              Instances
            </label>
            <input
              id="instances"
              type="number"
              min={1}
              max={10}
              value={instances}
              onChange={(e) => setInstances(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="mt-1 w-24 rounded border border-white/[0.09] px-3 py-1.5 text-sm border-white/[0.09]"
            />
            <p className="mt-1 text-xs text-white/40">
              Copies behind one address. They do not add or remove themselves. Billed per instance.
            </p>
          </div>

          <div>
            <span className="block text-xs font-medium text-white/60">
              Environment variables <span className="font-normal text-white/30">optional</span>
            </span>
            {envRows.map((row, i) => (
              <div key={i} className="mt-1 flex gap-2">
                <input
                  value={row.key}
                  onChange={(e) =>
                    setEnvRows((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))
                  }
                  placeholder="NAME"
                  className="w-44 rounded border border-white/[0.09] px-2 py-1 font-mono text-sm border-white/[0.09]"
                />
                <input
                  type="password"
                  value={row.value}
                  onChange={(e) =>
                    setEnvRows((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                  }
                  placeholder="value"
                  className="min-w-0 flex-1 rounded border border-white/[0.09] px-2 py-1 text-sm border-white/[0.09]"
                />
                <button
                  type="button"
                  onClick={() => setEnvRows((rows) => rows.filter((_, j) => j !== i))}
                  className="text-xs text-red-300 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEnvRows((rows) => [...rows, { key: "", value: "" }])}
              className="mt-1 text-xs text-sky-300 transition-colors hover:text-sky-200"
            >
              + Add variable
            </button>
            <p className="mt-1 text-xs text-white/40">
              Set them now and the first build has them. Otherwise an app that needs config builds
              fine and then crashes on start.
            </p>
          </div>
        </div>
      ) : null}

      {submitError ? (
        <p className="rounded border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
          {submitError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={create}
        disabled={!chosen || submitting}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Creating…" : chosen ? `Create ${chosen.fullName.split("/")[1]}` : "Choose a repository"}
      </button>
    </div>
  );
}
