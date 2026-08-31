"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Notice, Empty } from "@/components/v2/notice";

/**
 * Environment variable editor.
 *
 * The one behaviour this component exists to get right: UNSAVED EDITS SURVIVE
 * A TAB CHANGE. v1's editor destroyed them on any tab change — including tab
 * changes the page performed itself, so a user could lose work without
 * touching anything.
 *
 * The fix is structural, not a confirm dialog. Drafts live in one map keyed by
 * scope, held above the tab state, so switching scope is a render change and
 * never a data change. There is no effect that clears drafts, and no
 * dependency array that could be tightened into clearing them by accident.
 *
 * Values are write-only. The list endpoint returns keys and metadata and never
 * a value, so this component has nothing to reveal and no "show" affordance —
 * see app/api/v2/projects/[ref]/env.
 */

export interface EnvVarSummary {
  key: string;
  isPublic: boolean;
  scope: { ref: string | null; kind: string };
  updatedAt: string;
}

interface Draft {
  key: string;
  value: string;
  /** Set when this draft replaces an existing key rather than adding one. */
  replacing: boolean;
}

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const PUBLIC_PREFIXES = [
  "NEXT_PUBLIC_",
  "VITE_",
  "PUBLIC_",
  "REACT_APP_",
  "NUXT_PUBLIC_",
];

/**
 * Mirrors isPublicEnvKey() in lib/paas/build/dockerfile.ts. That module is the
 * source of truth and the server enforces it; this copy exists only to preview
 * the consequence as someone types, because importing a server module into a
 * client bundle would drag the build toolchain in with it. If the two ever
 * disagree, the server wins and the label here is what is wrong.
 */
function looksPublic(key: string): boolean {
  return PUBLIC_PREFIXES.some((p) => key.startsWith(p));
}

export function EnvEditor({
  projectRef,
  variables,
  canSave,
}: {
  projectRef: string;
  variables: EnvVarSummary[];
  /**
   * False disables saving and says so. It was false until 48fc6034, when the
   * encryption path landed; there is no longer a reason to pass false unless a
   * future gap reopens.
   */
  canSave: boolean;
}) {
  const scopes = useMemo(() => {
    const seen = new Map<string, string>();
    seen.set("all", "All environments");
    for (const v of variables) {
      const key = v.scope.ref ?? "all";
      if (!seen.has(key)) seen.set(key, v.scope.kind);
    }
    return Array.from(seen, ([ref, label]) => ({ ref, label }));
  }, [variables]);

  const [activeScope, setActiveScope] = useState(scopes[0]?.ref ?? "all");

  // Drafts are keyed by scope and live ABOVE the tab state. Switching tabs
  // re-renders; it does not touch this map. Nothing clears it but an explicit
  // discard or a successful save.
  const [drafts, setDrafts] = useState<Record<string, Draft[]>>({});
  const [busy, setBusy] = useState(false);
  // Set only after a successful save, so the redeploy offer appears exactly
  // when the message that asks for it does.
  const router = useRouter();
  const [needsDeploy, setNeedsDeploy] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const scopeDrafts = drafts[activeScope] ?? [];
  const totalPending = useMemo(
    () => Object.values(drafts).reduce((n, list) => n + list.length, 0),
    [drafts]
  );
  const pendingElsewhere = totalPending - scopeDrafts.length;

  const addDraft = useCallback(
    (scope: string) =>
      setDrafts((prev) => ({
        ...prev,
        [scope]: [...(prev[scope] ?? []), { key: "", value: "", replacing: false }],
      })),
    []
  );

  const updateDraft = useCallback(
    (scope: string, index: number, patch: Partial<Draft>) =>
      setDrafts((prev) => {
        const list = [...(prev[scope] ?? [])];
        list[index] = { ...list[index], ...patch };
        return { ...prev, [scope]: list };
      }),
    []
  );

  const removeDraft = useCallback(
    (scope: string, index: number) =>
      setDrafts((prev) => {
        const list = (prev[scope] ?? []).filter((_, i) => i !== index);
        const next = { ...prev };
        if (list.length === 0) delete next[scope];
        else next[scope] = list;
        return next;
      }),
    []
  );

  const existingKeys = useMemo(
    () => new Set(variables.map((v) => v.key)),
    [variables]
  );

  async function save() {
    setBusy(true);
    setMessage(null);
    const list = scopeDrafts;
    let saved = 0;
    for (const draft of list) {
      const res = await fetch(`/api/v2/projects/${projectRef}/env`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: draft.key, value: draft.value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessage(
          body?.error?.message ??
            `Could not save ${draft.key}. Nothing else was changed.`
        );
        setBusy(false);
        // Deliberately do NOT clear drafts on failure — that is the v1 bug in
        // a different costume.
        return;
      }
      saved += 1;
    }
    // Only clear what actually saved, and only for this scope.
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[activeScope];
      return next;
    });
    // "restarting to apply" was FALSE, and the server had been saying so all
    // along: its response note reads "Saved. Redeploy for these to take
    // effect." Nothing reconciles a project when env changes — the reconciler
    // is called by deploy, rollback, aliases and domains, and by nothing else —
    // so the pods keep the environment they started with until the next build.
    //
    // A running pod reads envFrom once, at container start. Telling somebody it
    // is restarting when it is not is how they conclude the platform ignored
    // their change.
    setMessage(
      `Saved ${saved} variable${saved === 1 ? "" : "s"}. Redeploy for ${saved === 1 ? "it" : "them"} to take effect — running pods keep the values they started with.`
    );
    setNeedsDeploy(true);
    setBusy(false);
  }

  async function redeploy() {
    setDeploying(true);
    const res = await fetch(`/api/v2/projects/${projectRef}/deployments`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // 409 means the same commit is already building, which is not a failure
      // the person caused and reads badly as an error.
      setMessage(body?.error?.message ?? `Could not deploy (${res.status}).`);
      setDeploying(false);
      return;
    }
    setNeedsDeploy(false);
    setDeploying(false);
    setMessage(`Queued ${body?.deployment?.shortSha ?? "a build"} — the new values are in it.`);
    router.refresh();
  }

  const visible = variables.filter(
    (v) => (v.scope.ref ?? "all") === activeScope
  );

  return (
    <div>
      {scopes.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {scopes.map((s) => {
            const pending = (drafts[s.ref] ?? []).length;
            return (
              <button
                key={s.ref}
                type="button"
                onClick={() => setActiveScope(s.ref)}
                aria-pressed={s.ref === activeScope}
                className={`border px-3 py-1.5 text-[12.5px] transition-colors ${
 s.ref === activeScope
 ? "border-[#0095FF]/55 bg-[#0095FF]/12 text-white"
 : "border-white/[0.1] text-white/55 hover:border-white/25 hover:text-white/85"
 }`}
              >
                {s.label}
                {pending > 0 && (
                  <span className="ml-1.5 text-[11px] text-amber-300">
                    {pending} unsaved
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!canSave && (
        <Notice
          tone="blocked"
          title="Variables cannot be saved yet."
          action="Waiting on the platform encryption path."
          className="mb-3"
        >
          You can still delete existing variables. Anything you type here is
          kept while you navigate, but the save will be refused.
        </Notice>
      )}

      {pendingElsewhere > 0 && (
        <Notice title={`${pendingElsewhere} unsaved change${pendingElsewhere === 1 ? "" : "s"} in another environment.`} className="mb-3">
          They are still there. Switching tabs does not discard them.
        </Notice>
      )}

      {visible.length === 0 && scopeDrafts.length === 0 ? (
        <Empty title="No variables in this environment." />
      ) : (
        <div className="border border-white/[0.09]">
          {visible.map((v, i) => (
            <div
              key={v.key}
              className={`flex items-center justify-between gap-4 px-4 py-3 ${
 i > 0 ? "border-t border-white/[0.06]" : ""
 }`}
            >
              <div className="min-w-0">
                <p className="m-0 truncate font-mono text-[13px] text-white">
                  {v.key}
                </p>
                <p className="m-0 mt-0.5 text-[11.5px] text-white/35">
                  {v.isPublic
                    ? "Public — baked into the build"
                    : "Runtime only"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-[12px] text-white/25">
                  ••••••••
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const res = await fetch(
                      `/api/v2/projects/${projectRef}/env?key=${encodeURIComponent(v.key)}`,
                      { method: "DELETE" }
                    );
                    setMessage(
                      res.ok
                        ? `Deleted ${v.key}. Running deployments keep the old value until redeployed.`
                        : `Could not delete ${v.key}.`
                    );
                    setBusy(false);
                  }}
                  className="border border-white/[0.14] px-2.5 py-1 text-[12px] text-white/60 transition-colors hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {scopeDrafts.map((draft, i) => {
            const badKey = draft.key !== "" && !ENV_KEY.test(draft.key);
            const collides = draft.key !== "" && existingKeys.has(draft.key);
            return (
              <div
                key={`draft-${i}`}
                className="border-t border-white/[0.06] bg-amber-400/[0.03] px-4 py-3"
              >
                <div className="flex flex-wrap items-start gap-2">
                  <input
                    value={draft.key}
                    onChange={(e) =>
                      updateDraft(activeScope, i, { key: e.target.value })
                    }
                    placeholder="KEY"
                    spellCheck={false}
                    className="w-[220px] border border-white/[0.12] bg-black/30 px-2.5 py-1.5 font-mono text-[13px] text-white outline-none focus:border-[#0095FF]/60"
                  />
                  <input
                    value={draft.value}
                    onChange={(e) =>
                      updateDraft(activeScope, i, { value: e.target.value })
                    }
                    placeholder="value"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-[220px] flex-1 border border-white/[0.12] bg-black/30 px-2.5 py-1.5 font-mono text-[13px] text-white outline-none focus:border-[#0095FF]/60"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraft(activeScope, i)}
                    className="border border-white/[0.12] px-2.5 py-1.5 text-[12px] text-white/50 hover:text-white"
                  >
                    Discard
                  </button>
                </div>
                {badKey && (
                  <p className="m-0 mt-1.5 text-[12px] text-rose-300">
                    Keys must start with a letter or underscore and contain only
                    letters, numbers and underscores.
                  </p>
                )}
                {collides && (
                  <p className="m-0 mt-1.5 text-[12px] text-amber-300">
                    {draft.key} already exists — saving will replace it.
                  </p>
                )}
                {!badKey && looksPublic(draft.key) && (
                  <p className="m-0 mt-1.5 text-[12px] text-amber-300">
                    This prefix makes the value a build argument. It will be
                    embedded in the image and visible to anyone who pulls it.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => addDraft(activeScope)}
          className="border border-white/[0.14] px-3 py-1.5 text-[12.5px] text-white transition-colors hover:border-[#0095FF] hover:bg-[#0095FF]/10"
        >
          Add variable
        </button>
        {scopeDrafts.length > 0 && (
          <button
            type="button"
            disabled={
              busy ||
              !canSave ||
              scopeDrafts.some((d) => !ENV_KEY.test(d.key))
            }
            onClick={save}
            className="border border-[#0095FF]/55 bg-[#0095FF]/12 px-3 py-1.5 text-[12.5px] text-white transition-colors hover:bg-[#0095FF]/20 disabled:opacity-40"
          >
            {busy ? "Saving…" : `Save ${scopeDrafts.length}`}
          </button>
        )}
        {message && (
          <span className="text-[12.5px] text-white/55">{message}</span>
        )}
        {/* The button belongs beside the sentence that asks for it. Telling
            somebody to redeploy and then making them find the control is how a
            two-step task becomes a hunt — and the message only appears after a
            save, so this is not a second deploy button sitting there all day. */}
        {needsDeploy && (
          <button
            type="button"
            onClick={redeploy}
            disabled={deploying}
            className="border border-white/[0.18] px-2.5 py-1 text-[12px] text-white transition-colors hover:border-white/40 disabled:opacity-40"
          >
            {deploying ? "Queueing…" : "Redeploy now"}
          </button>
        )}
      </div>
    </div>
  );
}
