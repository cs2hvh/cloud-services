"use client";

/**
 * The interactive parts of a project page: deploy, and environment variables.
 *
 * Both go through the API rather than server actions, so the dashboard uses the
 * same surface a CLI would and the two cannot drift into disagreeing about what
 * a deploy is.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeployButton({ projectRef, branch }: { projectRef: string; branch: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function deploy() {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const res = await fetch(`/api/v2/projects/${projectRef}/deployments`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setFailed(true);
        // 409 is not a failure the user caused — it means the same commit is
        // already on its way, which is worth saying plainly rather than as an
        // error.
        setMessage(body?.error?.message ?? `Could not deploy (${res.status}).`);
        return;
      }
      setMessage(`Queued ${body.deployment.shortSha} on ${body.deployment.branch}.`);
      router.refresh();
    } catch (e) {
      setFailed(true);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={deploy}
        disabled={busy}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "Queueing…" : `Deploy ${branch}`}
      </button>
      {message ? (
        <span className={`text-xs ${failed ? "text-red-600 dark:text-red-400" : "text-neutral-500"}`}>{message}</span>
      ) : null}
    </div>
  );
}

interface EnvVar {
  key: string;
  isPublic: boolean;
  updatedAt: string;
}

export function EnvEditor({ projectRef, initial }: { projectRef: string; initial: EnvVar[] }) {
  const router = useRouter();
  const [vars, setVars] = useState(initial);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(`/api/v2/projects/${projectRef}/env`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vars: { [key.trim()]: value } }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? `Could not save (${res.status}).`);
        return;
      }
      setSaved(body.note ?? "Saved.");
      setKey("");
      setValue("");
      const fresh = await (await fetch(`/api/v2/projects/${projectRef}/env`)).json();
      setVars(fresh.vars ?? []);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/projects/${projectRef}/env?key=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body?.error?.message ?? `Could not delete (${res.status}).`);
        return;
      }
      setVars((v) => v.filter((x) => x.key !== name));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {vars.length === 0 ? (
        <p className="text-sm text-neutral-500">No variables set.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {vars.map((v) => (
            <li key={v.key} className="flex items-center justify-between gap-3 py-2 first:pt-0">
              <div className="min-w-0">
                <code className="text-sm">{v.key}</code>
                {v.isPublic ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    public — baked into the browser bundle
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(v.key)}
                disabled={busy}
                className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        No value is ever shown back, so there is nothing to "edit" — only to
        replace. Saying so avoids the reasonable assumption that a blank field
        means the variable is empty.
      */}
      <p className="text-xs text-neutral-500">
        Values are write-only: they are encrypted on save and never shown again. To change one, set it again.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="NAME"
          className="w-44 rounded border border-neutral-300 px-2 py-1 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          placeholder="value"
          className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !key.trim()}
          className="rounded border border-neutral-300 px-3 py-1 text-sm font-medium disabled:opacity-40 dark:border-neutral-700"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      {saved ? <p className="text-xs text-neutral-500">{saved}</p> : null}
    </div>
  );
}
