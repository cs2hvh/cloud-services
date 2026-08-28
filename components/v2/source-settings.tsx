"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Notice } from "@/components/v2/notice";
import { V2_MONO, buttonClass } from "@/components/v2/kit";

/**
 * Which branch and which directory this project builds from.
 *
 * BOTH WERE SHOWN AND NEITHER COULD BE CHANGED. The header printed the branch,
 * the API has accepted `productionBranch` and `rootDirectory` on PATCH since it
 * was written, and there was no control anywhere — so moving a project from
 * `master` to `main`, or pointing it at a subdirectory after a repository was
 * reorganised, meant deleting the project and making it again.
 *
 * NOTHING IS SAVED UNTIL IT CHANGES. Both fields start as what the server holds,
 * and Save is dead until one of them differs — an enabled Save on an untouched
 * form invites a write that does nothing and rolls the pods for no reason.
 *
 * CHANGING EITHER DOES NOT DEPLOY, and the copy says so. The new branch takes
 * effect on the next build, which is the same rule the environment editor
 * follows; implying otherwise would have somebody watch a hostname for a change
 * that is not coming.
 */
export function SourceSettings({
  projectRef,
  repoFullName,
  productionBranch,
  rootDirectory,
}: {
  projectRef: string;
  repoFullName: string;
  productionBranch: string;
  rootDirectory: string | null;
}) {
  const router = useRouter();
  const [branch, setBranch] = useState(productionBranch);
  const [root, setRoot] = useState(rootDirectory ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmedBranch = branch.trim();
  const trimmedRoot = root.trim().replace(/^\/+|\/+$/g, "");
  const dirty =
    trimmedBranch !== productionBranch || trimmedRoot !== (rootDirectory ?? "");
  const valid = trimmedBranch.length > 0;

  async function save() {
    if (!dirty || !valid) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    const res = await fetch(`/api/v2/projects/${projectRef}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productionBranch: trimmedBranch,
        // Empty means the repository root, and null is how that is stored —
        // sending "" would persist an empty string and break the path join.
        rootDirectory: trimmedRoot === "" ? null : trimmedRoot,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not save that.");
      setBusy(false);
      return;
    }

    setSaved(true);
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <p className={`${V2_MONO} mb-4 text-[11.5px] text-white/40`}>{repoFullName}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12.5px] text-white/55">Production branch</span>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={busy}
            spellCheck={false}
            className="mt-1.5 w-full rounded-[6px] border border-white/[0.12] bg-black/30 px-2.5 py-1.5 font-mono text-[13px] text-white outline-none focus:border-[#0095FF]/60"
          />
          <span className="mt-1 block text-[11px] text-white/30">
            Pushes here deploy. Every other branch gets a preview.
          </span>
        </label>

        <label className="block">
          <span className="text-[12.5px] text-white/55">Root directory</span>
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            disabled={busy}
            spellCheck={false}
            placeholder="repository root"
            className="mt-1.5 w-full rounded-[6px] border border-white/[0.12] bg-black/30 px-2.5 py-1.5 font-mono text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#0095FF]/60"
          />
          <span className="mt-1 block text-[11px] text-white/30">
            For a monorepo — the folder holding the app that builds.
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || !valid || busy}
          className={buttonClass(dirty && valid ? "primary" : "secondary", "sm")}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {!valid ? (
          <span className="text-[11.5px] text-rose-300">A branch name is required.</span>
        ) : dirty ? (
          <span className="text-[11.5px] text-white/40">
            Takes effect on the next deploy — this does not build anything now.
          </span>
        ) : saved ? (
          <span className="text-[11.5px] text-white/40">
            Saved. Deploy to build from {productionBranch}.
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3">
          <Notice tone="blocked" title="Not saved">
            {error}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
