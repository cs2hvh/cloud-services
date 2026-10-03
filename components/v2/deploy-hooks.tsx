"use client";

import { useCallback, useEffect, useState } from "react";

import { Empty } from "@/components/v2/notice";
import { ColHead, V2_MONO, timeAgo } from "@/components/v2/kit";

/**
 * Deploy hooks — a secret URL per app that deploys its production branch.
 *
 * Fetches its own data rather than taking it from the page. The page reads
 * everything it shows on every tab, and hooks are needed on this one only; the
 * GET route also already works out whether the viewer may manage them, which
 * the page would otherwise have to re-derive.
 *
 * THE URL APPEARS ONCE. Only a hash is stored, so the full URL exists in the
 * POST response and nowhere else. It is held in component state until the
 * person dismisses it, and the copy says so plainly — "we can't show this
 * again" is a fact about how it is stored, not a warning for effect.
 */

interface Hook {
  ref: string;
  name: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface HooksResponse {
  branch: string;
  deployOnPush: boolean;
  canManage: boolean;
  hooks: Hook[];
}

const SNIPPET = [
  "- name: Deploy to AhuraSense",
  "  if: success()",
  '  run: curl -fsS -X POST "${{ secrets.AHURA_DEPLOY_HOOK }}"',
].join("\n");

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          setCopied(false); // left selectable; silence would look like a dead button
        }
      }}
      className="shrink-0 rounded-[5px] border border-white/[0.14] px-2 py-1 text-[11.5px] text-white/70 transition-colors hover:border-white/30 hover:text-white"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function DeployHooks({ projectRef }: { projectRef: string }) {
  const [data, setData] = useState<HooksResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; url: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v2/projects/${projectRef}/hooks`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setLoadError(body?.error?.message ?? "Could not load deploy hooks.");
      return;
    }
    setLoadError(null);
    setData(body as HooksResponse);
  }, [projectRef]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectRef}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not create the deploy hook.");
      return;
    }
    setCreated({ name: body.hook.name, url: body.url });
    setName("");
    void load();
  }

  async function setDeployOnPush(next: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectRef}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deployOnPush: next }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not change the setting.");
      return;
    }
    void load();
  }

  async function revoke(ref: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectRef}/hooks/${ref}`, { method: "DELETE" });
    const body = await res.json().catch(() => null);
    setBusy(false);
    setConfirming(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not revoke the deploy hook.");
      return;
    }
    void load();
  }

  if (loadError) {
    return <p className="m-0 text-[12.5px] text-rose-300">{loadError}</p>;
  }
  if (!data) {
    return <p className={`${V2_MONO} m-0 text-[11px] text-white/35`}>Loading…</p>;
  }

  const active = data.hooks.filter((h) => !h.revokedAt);
  const revoked = data.hooks.filter((h) => h.revokedAt);

  return (
    <div>
      <p className="m-0 mb-3 max-w-[68ch] text-[12.5px] leading-relaxed text-white/55">
        A secret URL that deploys{" "}
        <span className={`${V2_MONO} text-white/80`}>{data.branch}</span> when your CI calls it with
        POST. Anyone with the URL can trigger a deploy, so store it as a CI secret.
      </p>

      {/*
        THE SETTING THAT MAKES A HOOK MEAN SOMETHING. With deploy-on-push on, a
        push to the production branch deploys straight away and the hook then
        deploys a second time after the tests — it gates nothing. It lives here,
        beside the hooks, because this is the only place the reason to turn it
        off makes sense.
      */}
      <label
        className={`mb-4 flex items-start gap-3 rounded-[8px] border border-white/[0.08] bg-black/20 px-3 py-2.5 ${
          data.canManage ? "cursor-pointer" : "cursor-default opacity-70"
        }`}
      >
        <input
          type="checkbox"
          checked={data.deployOnPush}
          disabled={!data.canManage || busy}
          onChange={(e) => void setDeployOnPush(e.target.checked)}
          className="mt-[3px] h-3.5 w-3.5 accent-[#0095FF]"
        />
        <span>
          <span className="block text-[13px] text-white">
            Deploy on every push to <span className={V2_MONO}>{data.branch}</span>
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-white/45">
            {data.deployOnPush
              ? "Turn this off to deploy production only from a hook or the Deploy button — for example, after your CI's tests pass. Branch previews keep deploying on push."
              : `Pushes to ${data.branch} no longer deploy. Production deploys come from a hook or the Deploy button. Branch previews still deploy on push.`}
          </span>
        </span>
      </label>

      {created ? (
        <div className="mb-4 rounded-[8px] border border-[#0095FF]/40 bg-[#0095FF]/[0.07] p-3.5">
          <p className="m-0 text-[13px] font-medium text-white">
            “{created.name}” is ready. Copy the URL now — it can’t be shown again.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <code className={`${V2_MONO} min-w-0 flex-1 break-all rounded-[5px] bg-black/40 px-2.5 py-1.5 text-[12px] text-white/90`}>
              {created.url}
            </code>
            <CopyButton value={created.url} />
          </div>

          <p className="m-0 mt-3 text-[11px] uppercase tracking-[0.12em] text-white/35">
            In a GitHub Actions workflow
          </p>
          <div className="mt-1.5 flex items-start gap-2">
            <pre className={`${V2_MONO} m-0 min-w-0 flex-1 overflow-x-auto rounded-[5px] bg-black/40 px-2.5 py-2 text-[11.5px] leading-[1.6] text-white/75`}>
              {SNIPPET}
            </pre>
            <CopyButton value={SNIPPET} />
          </div>
          <p className="m-0 mt-1.5 text-[11.5px] text-white/40">
            Save the URL as a repository secret named AHURA_DEPLOY_HOOK first.
          </p>

          <button
            type="button"
            onClick={() => setCreated(null)}
            className="mt-3 text-[12px] text-white/50 underline-offset-2 hover:text-white hover:underline"
          >
            I’ve saved it
          </button>
        </div>
      ) : null}

      {active.length === 0 && revoked.length === 0 ? (
        <Empty title="No deploy hooks yet.">
          Pushing to {data.branch} already deploys this app. A hook is for when your CI should decide
          when to deploy instead.
        </Empty>
      ) : (
        <div className="-mx-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/[0.07] px-1 pb-2">
            <ColHead>Hook</ColHead>
            <ColHead align="right">Last used</ColHead>
          </div>

          {active.map((h) => (
            <div
              key={h.ref}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.05] px-1 py-2.5"
            >
              <span className="min-w-0">
                <span className="text-[13px] text-white">{h.name}</span>{" "}
                <span className={`${V2_MONO} text-[11.5px] text-white/35`}>…{h.hint}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5">
                <span className={`${V2_MONO} text-[11.5px] text-white/45`}>
                  {h.lastUsedAt ? timeAgo(h.lastUsedAt) : "never"}
                </span>
                {data.canManage ? (
                  confirming === h.ref ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11.5px] text-white/50">CI using it will stop deploying.</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => revoke(h.ref)}
                        className="rounded-[5px] border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-[11.5px] text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-40"
                      >
                        Revoke
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-[5px] px-2 py-1 text-[11.5px] text-white/45 hover:text-white"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming(h.ref)}
                      className="rounded-[5px] px-2 py-1 text-[11.5px] text-white/40 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  )
                ) : null}
              </span>
            </div>
          ))}

          {revoked.map((h) => (
            <div
              key={h.ref}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.05] px-1 py-2.5 opacity-50 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="text-[13px] text-white/70 line-through decoration-white/30">{h.name}</span>{" "}
                <span className={`${V2_MONO} text-[11.5px] text-white/30`}>…{h.hint}</span>
              </span>
              <span className={`${V2_MONO} text-[11.5px] text-white/40`}>
                revoked {timeAgo(h.revokedAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.canManage ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
            maxLength={60}
            placeholder="Name, e.g. GitHub Actions"
            autoComplete="off"
            className="min-w-[240px] rounded-[6px] border border-white/[0.12] bg-black/30 px-2.5 py-1.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#0095FF]/60"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !name.trim()}
            className="rounded-[6px] border border-[#0095FF]/50 bg-[#0095FF]/15 px-3 py-1.5 text-[12.5px] text-white transition-colors hover:bg-[#0095FF]/25 disabled:opacity-40"
          >
            {busy ? "Working…" : "Create hook"}
          </button>
          {error ? <span className="text-[12.5px] text-rose-300">{error}</span> : null}
        </div>
      ) : (
        <p className="m-0 mt-3 text-[12px] text-white/40">
          Only team owners and admins can create or revoke deploy hooks.
        </p>
      )}
    </div>
  );
}
