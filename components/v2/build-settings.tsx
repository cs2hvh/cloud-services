"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Notice } from "@/components/v2/notice";

/**
 * Where the Docker build context starts.
 *
 * Setting a root directory normally makes that directory the build context —
 * that is what Vercel means by it, and it is right for almost every repository.
 *
 * It cannot express one real shape: a monorepo whose Dockerfile is committed in
 * a subdirectory but written to be built from the REPOSITORY root, the way
 * `docker build -f backend/Dockerfile .` is. Those Dockerfiles reach for files
 * beside them in the tree, and no choice of root directory can put a file that
 * is ABOVE the context inside it.
 *
 * ONLY SHOWN WHEN IT COULD DO SOMETHING. Without a root directory the setting is
 * meaningless, and a control that cannot change anything is worse than an absent
 * one — someone will toggle it and conclude the platform ignored them. The copy
 * also says plainly that it does nothing for a Dockerfile we generate, because
 * that is the case people will try it on first when a build fails.
 */
export function BuildSettings({
  projectRef,
  rootDirectory,
  contextRepoRoot,
}: {
  projectRef: string;
  rootDirectory: string | null;
  contextRepoRoot: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(contextRepoRoot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectRef}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildContextRepoRoot: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not save that.");
      setOn(contextRepoRoot); // reflect what the server still holds
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  if (!rootDirectory) {
    return (
      <p className="text-[12.5px] leading-[1.7] text-white/45">
        The whole repository is the build context. This becomes adjustable once a
        root directory is set, which is what makes the two differ.
      </p>
    );
  }

  return (
    <div>
      <label className="flex cursor-pointer select-none items-start gap-3">
        <span
          className={`relative mt-[2px] h-[18px] w-[32px] shrink-0 border transition-colors ${
            on ? "border-[#0095FF]/60 bg-[#0095FF]/25" : "border-white/15 bg-white/[0.04]"
          }`}
        >
          <span
            className={`absolute top-[2px] h-[12px] w-[12px] transition-all duration-200 ${
              on ? "left-[16px] bg-[#0095FF]" : "left-[2px] bg-white/40"
            }`}
          />
        </span>
        <input
          type="checkbox"
          className="sr-only"
          checked={on}
          disabled={busy}
          onChange={(e) => {
            setOn(e.target.checked);
            save(e.target.checked);
          }}
        />
        <span>
          <span className="text-[13.5px] text-white">
            Include files outside{" "}
            <span className="font-mono text-[12.5px] text-white/70">{rootDirectory}</span>
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-[1.6] text-white/45">
            Builds your repository&rsquo;s own Dockerfile from the top of the
            repository instead of from{" "}
            <span className="font-mono text-[12px] text-white/60">{rootDirectory}</span>,
            so it can reach files that live above it — a shared lockfile, a
            workspace manifest. Turn this on if the build fails saying a file it
            copies or mounts was not found.
          </span>
          <span className="mt-1.5 block text-[12px] leading-[1.6] text-white/30">
            No effect unless the repository supplies its own Dockerfile. One we
            generate is written against{" "}
            <span className="font-mono text-[11.5px]">{rootDirectory}</span> and
            would read the wrong manifest from anywhere else.
          </span>
        </span>
      </label>

      {error && (
        <div className="mt-3">
          <Notice tone="blocked" title="Could not save">
            {error}
          </Notice>
        </div>
      )}
    </div>
  );
}
