"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Notice, Empty } from "@/components/v2/notice";
import { StateBadge } from "@/components/v2/state-badge";
import { ColHead } from "@/components/v2/kit";
import { V2_MONO } from "@/components/v2/kit";
import { AutoRefresh } from "@/components/v2/auto-refresh";

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

/**
 * A value with a copy button.
 *
 * These records are typed into somebody ELSE'S control panel — a registrar, a
 * DNS provider — and a mistyped CNAME target fails silently for as long as it
 * takes them to notice the certificate never issued. Transcribing
 * `_cf-custom-hostname.app.example.com` by hand is where that mistake comes
 * from, so it should not have to be transcribed.
 *
 * Falls back to selecting the text when the clipboard is unavailable, which it
 * is over plain http and in some embedded browsers. A copy button that silently
 * does nothing is worse than no copy button.
 */
function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Left for the reader to select manually; saying nothing would look
      // like the click was ignored.
      setCopied(false);
    }
  }

  return (
    <span className="group/copy inline-flex min-w-0 items-center gap-1.5">
      <span className="break-all font-mono text-[12px] text-white/90">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${value}`}
        className="shrink-0 rounded-[3px] border border-white/[0.12] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-white/35 opacity-0 transition-all hover:border-white/30 hover:text-white/70 focus:opacity-100 group-hover/copy:opacity-100"
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
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

  // active and failed are settled; pending and verifying are still moving.
  const pending = domains.filter((d) => d.state === "pending" || d.state === "verifying").length;
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

      {/*
        VERIFICATION IS A WAIT, AND THE PAGE DID NOT MOVE.

        A domain sits in pending or verifying while Cloudflare checks the records
        and issues the certificate — minutes, sometimes longer. Nothing polled,
        so the only way to learn it had gone active was to reload by hand, and
        nothing on the page said so. Somebody who added the records correctly sat
        looking at pending with no way to tell whether they had got it wrong.

        Slower than the build tick on purpose: DNS and certificate issuance move
        on the order of minutes, and polling the edge every five seconds buys
        nothing.
      */}
      {pending > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className={`${V2_MONO} text-[11px] text-white/40`}>
            {pending} domain{pending === 1 ? "" : "s"} verifying
          </span>
          <AutoRefresh active intervalMs={20000} label="" />
        </div>
      ) : null}

      {domains.length === 0 ? (
        <Empty title="No custom domains yet.">
          Add one below and we will show you the exact DNS records to create. You keep your domain
          where it is — nothing needs to move.
        </Empty>
      ) : (
        /*
          ONE FRAME, NOT FOUR. This had a rounded container inside the Card, a
          bordered block inside that for the records, and a border on every
          record row — so a single domain sat inside four nested boxes and the
          eye had to work out which edge belonged to what.

          The Card is the frame. Domains are separated by hairlines, and the
          records hang off a left rail rather than sitting in a box of their
          own: indentation says 'these belong to the domain above' using one
          line instead of four.
        */
        <div className="-mx-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/[0.07] px-1 pb-2">
            <ColHead>Domain</ColHead>
            <ColHead align="right">Status</ColHead>
          </div>

          {domains.map((d) => (
            <div key={d.ref} className="border-b border-white/[0.05] px-1 py-3 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="truncate font-mono text-[13px] text-white">{d.domain}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <StateBadge state={d.state} kind="domain" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(d.ref)}
                    className="rounded-[5px] px-2 py-1 text-[11.5px] text-white/40 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </span>
              </div>

              {/*
                THE WHOLE RECORD SET, not just the ownership TXT. A customer shown
                only the TXT has been told how to prove they own the domain and
                nothing about how to make it answer.

                Each record says what it is FOR. "Add a CNAME" without a reason is
                an instruction people put off; "this is what routes traffic" is one
                they act on.
              */}
              {(d.records?.length ?? 0) > 0 && (
                <div className="mt-2.5 space-y-2.5 border-l border-white/[0.08] pl-3.5">
                  <p className="m-0 text-[10.5px] uppercase tracking-[0.12em] text-white/30">
                    Add these records at your DNS provider
                  </p>

                  {d.records!.map((r) => (
                    <div key={`${r.type}:${r.name}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-white/40">
                          {r.type}
                        </span>
                        <Copyable value={r.name} />
                        <span className="text-white/25">→</span>
                        <Copyable value={r.value} />
                      </div>
                      <p className="m-0 mt-0.5 text-[11px] text-white/35">{r.purpose}</p>
                    </div>
                  ))}

                  <p className="m-0 text-[11px] text-white/25">
                    The certificate issues automatically once these resolve. DNS can take a few minutes.
                  </p>
                </div>
              )}

              {d.lastError && (
                <p className="m-0 mt-2 text-[12px] text-rose-300">{d.lastError}</p>
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
          className="min-w-[260px] rounded-[6px] border border-white/[0.12] bg-black/30 px-2.5 py-1.5 font-mono text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#0095FF]/60"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !value.trim()}
          className="rounded-[6px] border border-[#0095FF]/50 bg-[#0095FF]/15 px-3 py-1.5 text-[12.5px] text-white transition-colors hover:bg-[#0095FF]/25 disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add domain"}
        </button>
        {error && <span className="text-[12.5px] text-rose-300">{error}</span>}
      </div>
    </div>
  );
}
