"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Notice, Empty } from "@/components/v2/notice";
import { StateBadge } from "@/components/v2/state-badge";

/**
 * Custom domain management.
 *
 * Cloudflare for SaaS is not enabled on the zone, so a claimed domain records
 * intent and serves nothing. The component says that on the surface rather
 * than in a tooltip — a domain row that looks configured but returns no
 * traffic is the single most confusing state a PaaS can present, and v1's
 * habit of showing capabilities it did not have is what this avoids.
 */

export interface DnsInstruction {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: string;
}

export interface DomainSummary {
  ref: string;
  domain: string;
  state: string;
  verification: { type: string; name: string; value: string } | null;
  lastError: string | null;
  /**
   * Every record the customer has to create.
   *
   * This used to show only the ownership TXT, which tells somebody how to
   * PROVE they own a domain and nothing about how to make it serve. The CNAME
   * is the record that actually carries traffic and it is deterministic, so
   * there was never a reason to withhold it.
   */
  records?: DnsInstruction[];
}

export function DomainManager({
  projectRef,
  domains,
  customHostnamesEnabled,
}: {
  projectRef: string;
  domains: DomainSummary[];
  customHostnamesEnabled: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const domain = value.trim().toLowerCase();
    if (!domain) return;
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/v2/projects/${projectRef}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(body?.error?.message ?? "Could not add that domain.");
      setBusy(false);
      return;
    }

    setValue("");
    setBusy(false);
    router.refresh();
  }

  async function remove(ref: string) {
    setBusy(true);
    await fetch(
      `/api/v2/projects/${projectRef}/domains?domain=${encodeURIComponent(ref)}`,
      { method: "DELETE" }
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      {!customHostnamesEnabled && (
        <Notice
          tone="blocked"
          title="Custom domains will not serve traffic yet."
          action="Cloudflare for SaaS is not enabled on this zone."
          className="mb-3"
        >
          You can claim a domain now — the claim is recorded and reserved
          against other tenants — but requests to it will not reach your app
          until the zone is configured.
        </Notice>
      )}

      {domains.length === 0 ? (
        <Empty title="No custom domains yet.">
          Add one below and we will show you the exact DNS records to create. You keep your domain
          where it is — nothing needs to move.
        </Empty>
      ) : (
        <div className="border border-white/[0.09]">
          {domains.map((d, i) => (
            <div
              key={d.ref}
              className={`px-4 py-3 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] text-white">
                    {d.domain}
                  </span>
                  <StateBadge state={d.state} kind="domain" />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(d.ref)}
                  className="border border-white/[0.14] px-2.5 py-1 text-[12px] text-white/60 transition-colors hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>

              {/*
                THE WHOLE RECORD SET, not just the ownership TXT. A customer
                shown only the TXT has been told how to prove they own the
                domain and nothing about how to make it answer.

                Each record says what it is FOR. "Add a CNAME" without a reason
                is a instruction people put off; "this is what routes traffic"
                is one they act on.
              */}
              {(d.records?.length ?? 0) > 0 && (
                <div className="mt-2 border border-white/[0.07] bg-black/25 px-3 py-2.5">
                  <p className="m-0 text-[11.5px] uppercase tracking-[0.1em] text-white/30">
                    Add these records at your DNS provider
                  </p>
                  <div className="mt-2 space-y-2.5">
                    {d.records!.map((r) => (
                      <div key={`${r.type}:${r.name}`}>
                        <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px]">
                          <span className="rounded border border-white/[0.12] px-1.5 py-0.5 text-[10px] text-white/50">
                            {r.type}
                          </span>
                          <span className="break-all text-white/70">{r.name}</span>
                          <span className="text-white/25">→</span>
                          <span className="break-all text-white/90">{r.value}</span>
                        </div>
                        <p className="m-0 mt-0.5 text-[11px] text-white/35">{r.purpose}</p>
                      </div>
                    ))}
                  </div>
                  <p className="m-0 mt-2.5 text-[11px] text-white/30">
                    The certificate issues automatically once these resolve. DNS can take a few minutes.
                  </p>
                </div>
              )}

              {d.lastError && (
                <p className="m-0 mt-2 text-[12px] text-rose-300">
                  {d.lastError}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="app.example.com"
          spellCheck={false}
          autoComplete="off"
          className="min-w-[240px] border border-white/[0.12] bg-black/30 px-2.5 py-1.5 font-mono text-[13px] text-white outline-none focus:border-[#0095FF]/60"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !value.trim()}
          className="border border-white/[0.14] px-3 py-1.5 text-[12.5px] text-white transition-colors hover:border-[#0095FF] hover:bg-[#0095FF]/10 disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add domain"}
        </button>
        {error && <span className="text-[12.5px] text-rose-300">{error}</span>}
      </div>
    </div>
  );
}
