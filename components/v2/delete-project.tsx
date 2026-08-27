"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Notice } from "@/components/v2/notice";

/**
 * Deleting a project.
 *
 * TYPE THE NAME. A confirmation dialog with a single button is a reflex, not a
 * decision — people click through them without reading. Typing the project's
 * own name is the smallest thing that makes someone look at WHICH project they
 * are about to destroy, which is the mistake that actually happens: the right
 * action on the wrong tab.
 *
 * The copy says what goes and what stays. Deployments and charges are kept
 * deliberately — they are the record of what a tenant was billed for, and
 * destroying them to tidy up a delete is how a customer ends up unable to
 * check an invoice for an app they no longer have.
 */
export function DeleteProject({
  projectRef,
  projectName,
  hostnames,
}: {
  projectRef: string;
  projectName: string;
  /** What stops answering. Named, because "your app" is not specific enough. */
  hostnames: string[];
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim() === projectName && !busy;

  async function remove() {
    if (!armed) return;
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/v2/projects/${projectRef}`, { method: "DELETE" });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(body?.error?.message ?? "Could not delete this project.");
      setBusy(false);
      return;
    }

    // The API distinguishes a project whose workload is gone from one whose
    // row is deleted but whose cluster footprint could not be torn down. That
    // difference matters to whoever has to clean up, so it is not flattened
    // into "done".
    if (body?.status !== "deleted") {
      setError(
        body?.note ??
          "The project was deleted, but its running infrastructure could not be removed. It will need a sweep.",
      );
      setBusy(false);
      return;
    }

    router.push("/dashboard/v2/projects");
    router.refresh();
  }

  return (
    <div>
      <p className="text-[12.5px] leading-[1.7] text-white/55">
        This removes the project and everything running for it. Its build
        history and usage records are kept, so past charges stay auditable.
      </p>

      {hostnames.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-[1.7] text-white/45">
          These stop answering immediately:{" "}
          {hostnames.map((h, i) => (
            <span key={h}>
              {i > 0 ? ", " : ""}
              <span className="font-mono text-[12px] text-white/70">{h}</span>
            </span>
          ))}
          .
        </p>
      )}

      <label className="mt-4 block">
        <span className="text-[12.5px] text-white/55">
          Type <span className="font-mono text-[12px] text-white/80">{projectName}</span> to confirm
        </span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          className="mt-1.5 w-full max-w-[340px] border border-white/[0.12] bg-black/30 px-2.5 py-1.5 font-mono text-[13px] text-white outline-none focus:border-rose-400/60"
        />
      </label>

      <button
        type="button"
        onClick={remove}
        disabled={!armed}
        className={`mt-3 border px-3 py-1.5 text-[13px] transition-colors ${
          armed
            ? "cursor-pointer border-rose-400/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
            : "cursor-not-allowed border-white/10 bg-white/[0.03] text-white/25"
        }`}
      >
        {busy ? "Deleting…" : "Delete this project"}
      </button>

      {error && (
        <div className="mt-3">
          <Notice tone="blocked" title="Not deleted">
            {error}
          </Notice>
        </div>
      )}
    </div>
  );
}
