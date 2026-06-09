"use client";

import * as React from "react";
import { Container } from "@/components/ui/container";

type Status = "live" | "beta" | "upcoming";

const STATUS_META: Record<
  Status,
  { label: string; dot: string; chip: string; desc: string }
> = {
  live: {
    label: "Live",
    dot: "bg-emerald-400",
    chip: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
    desc: "Generally available to all customers.",
  },
  beta: {
    label: "Beta",
    dot: "bg-amber-400",
    chip: "border-amber-400/30 bg-amber-400/[0.08] text-amber-300",
    desc: "Available to try, still being refined.",
  },
  upcoming: {
    label: "Upcoming",
    dot: "bg-sky-400",
    chip: "border-sky-400/30 bg-sky-400/[0.08] text-sky-300",
    desc: "On the roadmap, coming soon.",
  },
};

type Entry = {
  date: string;
  title: string;
  category: string;
  status: Status;
  body: string;
};

const ENTRIES: Entry[] = [
  {
    date: "May 30, 2026",
    title: "Per-hour metering for compute & GPU",
    category: "Billing",
    status: "live",
    body:
      "Virtual machines and GPU pods are now metered hourly against your credit balance, with a 7-day grace window and clear usage breakdowns in the dashboard.",
  },
  {
    date: "May 29, 2026",
    title: "Custom OS images for VPS",
    category: "Compute",
    status: "live",
    body:
      "Bring your own images by URL import or snapshot, then launch new instances from them in any region. Billed per GB-month of stored image data.",
  },
  {
    date: "May 22, 2026",
    title: "Managed vector collections (pgvector)",
    category: "AI · Embeddings",
    status: "live",
    body:
      "Spin up managed vector collections on Postgres with hosted embedding models — build RAG and semantic search without running your own vector store.",
  },
  {
    date: "May 14, 2026",
    title: "Fine-tuning with auto-deploy",
    category: "AI · Fine-Tuning",
    status: "beta",
    body:
      "Train LoRA adapters on open models and deploy the result to a dedicated endpoint in one flow. We're expanding base-model coverage during beta.",
  },
  {
    date: "May 6, 2026",
    title: "Dedicated model hosting",
    category: "AI · Serving",
    status: "beta",
    body:
      "Deploy your own weights or a HuggingFace model to a dedicated GPU endpoint with per-hour pricing and idle auto-stop. Try it and send us feedback.",
  },
  {
    date: "April 28, 2026",
    title: "Domain registration & marketplace",
    category: "Domains",
    status: "live",
    body:
      "Search, register, transfer, and manage domains directly from the dashboard, with DNS management and a domain marketplace built in.",
  },
  {
    date: "Coming soon",
    title: "Reserved GPU clusters (self-serve)",
    category: "GPU",
    status: "upcoming",
    body:
      "Reserve committed B300 / B200 / H200 capacity with discounted pricing directly from the dashboard — no sales call required.",
  },
  {
    date: "Coming soon",
    title: "Batch inference API",
    category: "AI · Inference",
    status: "upcoming",
    body:
      "Submit large asynchronous inference jobs and retrieve results at a lower price point — ideal for offline enrichment and evaluation workloads.",
  },
  {
    date: "Coming soon",
    title: "Team workspaces & role-based access",
    category: "Platform",
    status: "upcoming",
    body:
      "Invite teammates, share projects, and control access with granular roles across all services.",
  },
];

const FILTERS: Array<{ value: "all" | Status; label: string }> = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "beta", label: "Beta" },
  { value: "upcoming", label: "Upcoming" },
];

export default function ChangelogPage() {
  const [filter, setFilter] = React.useState<"all" | Status>("all");

  const visible = filter === "all" ? ENTRIES : ENTRIES.filter((e) => e.status === filter);

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/[0.08] pt-28 pb-14 sm:pt-32 sm:pb-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(0,149,255,0.18),transparent_45%),radial-gradient(circle_at_88%_15%,rgba(255,255,255,0.08),transparent_40%)]" />
        <Container className="relative">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#0095FF]">Changelog</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight leading-tight">
            What&apos;s <span className="text-[#0095FF]">shipping</span>
          </h1>
          <p className="mt-5 max-w-3xl text-sm sm:text-base leading-7 text-white/65">
            Product updates across the platform — what&apos;s live, what&apos;s in beta, and
            what&apos;s coming next.
          </p>

          {/* Status legend */}
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            {(Object.keys(STATUS_META) as Status[]).map((s) => (
              <div key={s} className="flex items-center gap-2 text-xs text-white/55">
                <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
                <span className="text-white/80">{STATUS_META[s].label}</span>
                <span className="hidden sm:inline">— {STATUS_META[s].desc}</span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Filter + timeline */}
      <section className="py-12 sm:py-14 lg:py-16">
        <Container>
          {/* Filter tabs */}
          <div className="mb-10 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`cursor-pointer border px-4 py-2 text-sm transition-colors ${
                    active
                      ? "border-[#0095FF] bg-[#0095FF]/[0.12] text-white"
                      : "border-white/[0.12] bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Timeline */}
          <div className="relative border-l border-white/[0.1] pl-6 sm:pl-8">
            {visible.map((entry) => {
              const meta = STATUS_META[entry.status];
              return (
                <div key={entry.title} className="relative pb-10 last:pb-0">
                  {/* node */}
                  <span
                    className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ring-4 ring-black sm:-left-[39px] ${meta.dot}`}
                  />
                  <div className="border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6 hover:bg-white/[0.04] transition-colors">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.12em] ${meta.chip}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-[#0095FF]">
                        {entry.category}
                      </span>
                      <span className="ml-auto text-xs text-white/45">{entry.date}</span>
                    </div>
                    <h3 className="mt-3 text-xl leading-snug">{entry.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/65">{entry.body}</p>
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && (
              <p className="text-sm text-white/50">No updates in this category yet.</p>
            )}
          </div>
        </Container>
      </section>
    </main>
  );
}
