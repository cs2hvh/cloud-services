import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  ChevronRight,
  ExternalLink,
  Key,
  KeyRound,
  BarChart3,
  Plus,
  PlayCircle,
  Terminal,
} from "lucide-react";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { INFERENCE_API_BASE } from "@/lib/inference/branding";

import {
  ACCENT,
  CodeChip,
  DataTable,
  EmptyState,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  SectionHead,
  SERIF_STYLE,
  StatCell,
  StatsStrip,
} from "@/components/dashboard/inference/chrome";

export const dynamic = "force-dynamic";

type OverviewStats = {
  monthSpentCents: number;
  monthRequests: number;
  windowRequests: number;
  p50: number | null;
  successRate: number | null;
  topModels: Array<{ model_id: string; spent_cents: number; requests: number }>;
  /** Number of un-revoked keys on the org. Drives the first-run guide:
   *  0 keys + 0 usage = "step 1, generate a key"; ≥1 keys + 0 usage =
   *  "step 2, make your first call". */
  activeKeyCount: number;
};

async function getStats(orgId: string): Promise<OverviewStats> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 6);

  const [{ data }, { count: activeKeyCount }] = await Promise.all([
    supabase
      .schema("inference")
      .from("usage")
      .select("created_at, model_id, cost_cents, latency_ms, status")
      .eq("org_id", orgId)
      .gte("created_at", since.toISOString())
      .returns<
        Array<{
          created_at: string;
          model_id: string;
          cost_cents: number;
          latency_ms: number | null;
          status: string;
        }>
      >(),
    supabase
      .schema("inference")
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("revoked_at", null),
  ]);

  const rows = data ?? [];
  const month = new Date().toISOString().slice(0, 7);
  let monthSpentCents = 0;
  let monthRequests = 0;
  let successCount = 0;
  const latencies: number[] = [];
  const modelMap = new Map<string, { spent: number; requests: number }>();

  for (const r of rows) {
    if (r.created_at.startsWith(month)) {
      monthSpentCents += r.cost_cents;
      monthRequests += 1;
    }
    if (r.status === "success") successCount += 1;
    if (r.latency_ms) latencies.push(r.latency_ms);
    const m = modelMap.get(r.model_id) ?? { spent: 0, requests: 0 };
    m.spent += r.cost_cents;
    m.requests += 1;
    modelMap.set(r.model_id, m);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies.length
    ? latencies[Math.floor((latencies.length - 1) * 0.5)] ?? null
    : null;
  const successRate = rows.length ? successCount / rows.length : null;

  const topModels = [...modelMap.entries()]
    .map(([model_id, b]) => ({ model_id, spent_cents: b.spent, requests: b.requests }))
    .sort((a, b) => b.spent_cents - a.spent_cents)
    .slice(0, 6);

  return {
    monthSpentCents,
    monthRequests,
    windowRequests: rows.length,
    p50,
    successRate,
    topModels,
    activeKeyCount: activeKeyCount ?? 0,
  };
}

function formatCents(c: number): string {
  if (c === 0) return "$0";
  if (c < 100) return `$${(c / 100).toFixed(4)}`;
  return `$${(c / 100).toFixed(2)}`;
}

export default async function InferenceOverview() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");
  const stats = await getStats(org.org_id);

  return (
    <PageCanvas>
      <Hero
        title="Serverless inference"
        accent="for every model"
        caption="OpenAI- and Anthropic-compatible gateway proxied to 50+ frontier and open-source models. One API key, one bill, streaming and tool calling everywhere."
        actions={
          <>
            <PrimaryButton href="/dashboard/services/inference/api-keys">
              <Plus className="h-3.5 w-3.5" />
              Create API key
            </PrimaryButton>
            <GhostButton href="/services/inference">
              <ExternalLink className="h-3.5 w-3.5" />
              Documentation
            </GhostButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell
          label="This month"
          value={formatCents(stats.monthSpentCents)}
          hint={`${stats.monthRequests.toLocaleString()} requests`}
        />
        <StatCell
          label="Requests (7d)"
          value={stats.windowRequests.toLocaleString()}
          hint="Across all keys"
          accent={ACCENT}
        />
        <StatCell
          label="Latency p50"
          value={stats.p50 ? String(stats.p50) : "—"}
          suffix={stats.p50 ? "ms" : undefined}
          hint={stats.windowRequests ? "Median end-to-end" : "No requests yet"}
        />
        <StatCell
          label="Success rate"
          value={
            stats.successRate !== null
              ? `${(stats.successRate * 100).toFixed(1)}%`
              : "—"
          }
          hint={stats.windowRequests ? `${stats.windowRequests} total` : "—"}
          accent={
            stats.successRate !== null
              ? stats.successRate > 0.99
                ? "#4ade80"
                : stats.successRate > 0.9
                  ? "#fbbf24"
                  : "#f87171"
              : undefined
          }
        />
      </StatsStrip>

      {/* Endpoint info row */}
      <section className="mb-14">
        <SectionHead
          title="One"
          accent="base URL"
          rightMeta={`org_${org.org_slug}`}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <EndpointCard
            label="OpenAI Chat Completions"
            url={`${INFERENCE_API_BASE}/chat/completions`}
            description="Drop-in for the OpenAI SDK. Set base_url and pass any model from the catalog."
          />
          <EndpointCard
            label="Anthropic Messages"
            url={`${INFERENCE_API_BASE}/messages`}
            description="Drop-in for the Anthropic SDK. Same key, same models, native message shape."
          />
          <EndpointCard
            label="Catalog"
            url={`${INFERENCE_API_BASE}/models`}
            description="GET the full model list with capability flags and per-Mtok pricing."
          />
        </div>
      </section>

      {/* Manage */}
      <section className="mb-14">
        <SectionHead title="Keys, billing, and" accent="observability" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NavCard
            href="/dashboard/services/inference/api-keys"
            label="API Keys"
            description="Create, rotate, revoke — with per-key budgets, scopes, and ZDR."
            icon={Key}
          />
          <NavCard
            href="/dashboard/services/inference/byok-keys"
            label="BYOK Keys"
            description="Bring your own provider keys for direct billing through your account."
            icon={KeyRound}
          />
          <NavCard
            href="/dashboard/services/inference/usage"
            label="Usage"
            description="Daily spend, latency percentiles, top models, recent requests."
            icon={BarChart3}
          />
        </div>
      </section>

      {/* First-run guide — shown only when the org is genuinely new
          (no traffic in the last 7 days). The two sub-states (no
          keys yet vs. keys but no calls) emphasize different steps. */}
      {stats.windowRequests === 0 ? (
        <FirstRunGuide hasKey={stats.activeKeyCount > 0} />
      ) : (
        <section id="activity">
          <SectionHead
            title="Top"
            accent="models"
            rightMeta={`${stats.windowRequests.toLocaleString()} requests · 7d window`}
            link={{ label: "Open usage", href: "/dashboard/services/inference/usage" }}
          />
          {stats.topModels.length > 0 ? (
            <DataTable>
              <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
                <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40`}>Model</span>
                <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 text-right`}>Requests</span>
                <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 text-right`}>Spend (7d)</span>
              </div>
              {stats.topModels.map((m) => (
                <div
                  key={m.model_id}
                  className="grid grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors items-center"
                >
                  <span className={`${MONO} text-[12.5px] text-white truncate`}>{m.model_id}</span>
                  <span className={`${MONO} text-[11.5px] text-white/75 tabular-nums text-right`}>
                    {m.requests.toLocaleString()}
                  </span>
                  <span
                    style={SERIF_STYLE}
                    className="text-[15px] font-bold text-white tabular-nums text-right"
                  >
                    {formatCents(m.spent_cents)}
                  </span>
                </div>
              ))}
            </DataTable>
          ) : (
            <EmptyState
              title="No model activity"
              description="Traffic is flowing but no model rolled up — likely all errors. Open Usage for details."
            />
          )}
        </section>
      )}
    </PageCanvas>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────

function EndpointCard({
  label,
  url,
  description,
}: {
  label: string;
  url: string;
  description: string;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4 hover:border-white/[0.12] transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-1 w-1 rounded-full bg-[#0095FF]" style={{ boxShadow: "0 0 5px #0095FF" }} />
        <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/55`}>
          {label}
        </p>
      </div>
      <CodeChip>{url}</CodeChip>
      <p className={`${MONO} mt-3 text-[11px] text-white/45 leading-relaxed`}>{description}</p>
    </div>
  );
}

function FirstRunGuide({ hasKey }: { hasKey: boolean }) {
  return (
    <section id="first-run">
      <SectionHead
        title="Three steps to your"
        accent="first call"
      />

      <div className="space-y-3">
        <Step
          n={1}
          done={hasKey}
          title={hasKey ? "API key created" : "Create an API key"}
          body={
            hasKey
              ? "You've already minted a key for this org. Keep it server-side — keys are shown once."
              : "Mint a key for this org. We'll only show it once, so store it server-side."
          }
          cta={
            hasKey
              ? { label: "Manage keys", href: "/dashboard/services/inference/api-keys" }
              : { label: "Create API key", href: "/dashboard/services/inference/api-keys", primary: true }
          }
        />

        <Step
          n={2}
          done={false}
          title="Make your first call"
          body="Drop-in for the OpenAI and Anthropic SDKs — just change base_url. Paste either snippet into your terminal once your key is set."
        >
          <Snippet
            label="curl"
            code={`curl ${INFERENCE_API_BASE}/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
          />
          <Snippet
            label="Python"
            code={`from openai import OpenAI
client = OpenAI(
    base_url="${INFERENCE_API_BASE}",
    api_key="<your AhuraCloud key>",
)
r = client.chat.completions.create(
    model="openai/gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(r.choices[0].message.content)`}
          />
        </Step>

        <Step
          n={3}
          done={false}
          title="Try it interactively first"
          body="The Playground sends real calls against any model in the catalog with one click — no key handling, no SDK setup."
          cta={{
            label: "Open Playground",
            href: "/dashboard/services/inference/playground",
            icon: PlayCircle,
          }}
        />
      </div>
    </section>
  );
}

function Step({
  n,
  done,
  title,
  body,
  cta,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  body: string;
  cta?: { label: string; href: string; primary?: boolean; icon?: React.ElementType };
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[6px] border bg-[#111216] p-5"
      style={{
        borderColor: done ? "rgba(34,197,94,0.20)" : "rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className={`${MONO} h-7 w-7 shrink-0 rounded-full border flex items-center justify-center text-[11px] font-semibold tabular-nums`}
          style={
            done
              ? {
                  background: "rgba(34,197,94,0.10)",
                  borderColor: "rgba(34,197,94,0.35)",
                  color: "#4ade80",
                }
              : {
                  background: "rgba(0,149,255,0.08)",
                  borderColor: "rgba(0,149,255,0.30)",
                  color: "#33adff",
                }
          }
        >
          {done ? "✓" : n}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-white">{title}</h3>
          <p className={`${MONO} mt-1 text-[11.5px] text-white/55 leading-relaxed`}>{body}</p>
          {children && <div className="mt-3 space-y-2">{children}</div>}
          {cta && (
            <div className="mt-3">
              {cta.primary ? (
                <PrimaryButton href={cta.href}>
                  {cta.icon ? <cta.icon className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {cta.label}
                </PrimaryButton>
              ) : (
                <GhostButton href={cta.href}>
                  {cta.icon ? <cta.icon className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {cta.label}
                </GhostButton>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div className="rounded-[5px] border border-white/[0.06] bg-black/40 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-1.5">
        <Terminal className="h-3 w-3 text-white/40" />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/55`}>
          {label}
        </span>
      </div>
      <pre className={`${MONO} text-[11px] text-white/80 leading-relaxed p-3 overflow-x-auto`}>
        {code}
      </pre>
    </div>
  );
}

function NavCard({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 border border-white/[0.06] bg-[#111216] rounded-[6px] p-4 hover:border-white/[0.14] hover:bg-[#15161a] transition-colors"
    >
      <div className="h-8 w-8 rounded-[5px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-[#0095FF] shrink-0">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-white">{label}</h3>
          <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-white/70 transition-colors" />
        </div>
        <p className={`${MONO} mt-1.5 text-[11px] text-white/45 leading-relaxed`}>{description}</p>
      </div>
    </Link>
  );
}
