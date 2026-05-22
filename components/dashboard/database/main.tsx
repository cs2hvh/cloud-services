"use client";

// Managed databases overview — editorial canvas (aurora + dotted grid),
// Nunito accent title, mono labels, subtle rounded corners, brand-blue
// accent. Engine catalog + pricing pulled live from Supabase
// (database_types + products). Skips the operational view section.

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  ChevronRight,
  Database,
  Loader2,
  MapPin,
  Plus,
} from "lucide-react";

import { useSession } from "@/app/dashboard/provider";
import { DatabaseIcon } from "@/components/dashboard/database/database-icon";
import { serviceLocations, vmLocations } from "@/config/locations";
import api from "@/lib/axios/axios";

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

// ─── Types ────────────────────────────────────────────────────────

export type EngineMeta = {
  code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  versions: string[];
  fromPrice: number | null;
};

type DbCluster = {
  id: string;
  name: string;
  engine: string;
  status: string;
  num_nodes: number;
  created_at: string;
  version: string;
  cluster_id: string;
  region: string;
};

type EngineCategory = "SQL" | "NoSQL" | "Streaming" | "Cache" | "Analytics";

interface DatabasePageProps {
  engines: EngineMeta[];
}

// ─── Engine helpers ───────────────────────────────────────────────

const CATEGORY_FOR_ENGINE: Record<string, EngineCategory> = {
  pg: "SQL",
  mysql: "SQL",
  mongodb: "NoSQL",
  kafka: "Streaming",
  redis: "Cache",
  valkey: "Cache",
  clickhouse: "Analytics",
};

const ENGINE_FALLBACK_DESC: Record<string, string> = {
  pg: "Advanced relational engine with JSON, full-text search, and a rich extension ecosystem.",
  mysql: "Battle-tested relational engine powering production workloads at every scale.",
  mongodb: "Flexible document database for evolving schemas and high-velocity reads.",
  kafka: "Distributed event streaming for high-throughput log and pipeline workloads.",
  redis: "In-memory data store for caching, queues, and session storage.",
  valkey: "Open-source Redis-compatible in-memory store for cache and pub/sub.",
  clickhouse: "Columnar database for sub-second analytical queries over billions of rows.",
};

const FEATURED_ENGINE = "pg";

function categoryFor(code: string): EngineCategory {
  return CATEGORY_FOR_ENGINE[code.toLowerCase()] ?? "SQL";
}

function describeEngine(engine: EngineMeta): string {
  if (engine.description && engine.description.trim()) {
    return engine.description.trim();
  }
  return ENGINE_FALLBACK_DESC[engine.code.toLowerCase()] ?? "Managed database engine.";
}

function formatFromPrice(price: number | null): string | null {
  if (price === null || !Number.isFinite(price)) return null;
  if (price === 0) return "Free";
  const rounded = price < 10 ? price.toFixed(2) : Math.round(price).toString();
  return `From $${rounded}/mo`;
}

// ─── Display helpers (preserved) ──────────────────────────────────

const getLocationName = (regionCode: string): string => {
  const all = [...serviceLocations, ...vmLocations];
  const loc = all.find(
    (l) => l.short.toLowerCase() === regionCode?.toLowerCase(),
  );
  return loc ? loc.city : regionCode || "Unknown";
};

const formatStatus = (status: string): string => {
  if (!status) return "Unknown";
  return status
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
};

const formatRelativeTime = (dateString: string): string => {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function statusMeta(status: string): { dot: string; label: string } {
  const v = (status || "unknown").toLowerCase();
  if (v === "online") return { dot: "bg-emerald-400", label: "Online" };
  if (["creating", "migrating", "restoring", "updating"].includes(v))
    return { dot: "bg-amber-400", label: formatStatus(status) };
  if (v === "failed") return { dot: "bg-red-400", label: "Failed" };
  return { dot: "bg-white/30", label: formatStatus(status) };
}

// ─── Platform features (floating PNG illustrations) ──────────────

const FEATURES = [
  {
    title: "Fully managed engines",
    desc: "Patches, minor upgrades, and replication topology — handled. You get a connection string.",
    image: "/images/kubernetes-ui/fully managed.png",
  },
  {
    title: "Point-in-time recovery",
    desc: "Continuous WAL streaming with 7–35 day retention. Restore to any second in the window.",
    image: "/images/kubernetes-ui/life cycle.png",
  },
  {
    title: "Auto-scaling storage",
    desc: "Disks grow with your data — no manual resizes, no downtime, no surprise outages.",
    image: "/images/kubernetes-ui/auto scaling nodespng.png",
  },
  {
    title: "Connection pooling",
    desc: "Managed PgBouncer / ProxySQL with transactional and session modes baked in.",
    image: "/images/kubernetes-ui/Built in load balancing png.png",
  },
  {
    title: "Multi-region replicas",
    desc: "Read replicas in any supported region, with cross-region streaming replication.",
    image: "/images/kubernetes-ui/Multi region clusters png.png",
  },
  {
    title: "99.99% uptime SLA",
    desc: "Multi-AZ standby, automatic failover, and per-cluster lifecycle audit logs.",
    image: "/images/kubernetes-ui/11 nine.png",
  },
] as const;

// ─── Component ────────────────────────────────────────────────────

const DatabasePage = ({ engines }: DatabasePageProps) => {
  const { user } = useSession();
  const router = useRouter();
  const [clusters, setClusters] = useState<DbCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EngineCategory | "All">("All");

  useEffect(() => {
    if (user === null) {
      router.push("/login");
      toast.error("You must be logged in to access the dashboard.");
    }
  }, [router, user]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await api.post("/services/database/read_all_owner", {
          id: user?.id,
        });
        if (!mounted) return;
        if (res.status === 200) {
          setClusters(Array.isArray(res?.data?.data) ? res?.data?.data : []);
        }
      } catch (err) {
        console.error("Error fetching database clusters:", err);
        if (mounted) toast.error("Failed to load database clusters.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const sortedClusters = useMemo(
    () =>
      [...clusters].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [clusters],
  );

  const onlineCount = clusters.filter((c) => c.status === "online").length;
  const provisioningCount = clusters.filter((c) =>
    ["creating", "migrating", "restoring", "updating"].includes(c.status),
  ).length;
  const regionsCount = new Set(clusters.map((c) => c.region).filter(Boolean)).size;
  const totalNodes = clusters.reduce(
    (sum, c) => sum + Math.max(c.num_nodes || 0, 1),
    0,
  );

  const categories = useMemo(() => {
    const set = new Set<EngineCategory>();
    engines.forEach((e) => set.add(categoryFor(e.code)));
    return Array.from(set);
  }, [engines]);

  const visibleEngines = useMemo(() => {
    if (filter === "All") return engines;
    return engines.filter((e) => categoryFor(e.code) === filter);
  }, [engines, filter]);

  if (loading && !clusters.length && !engines.length) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16 text-white">
        <div className="flex items-center gap-3 text-white/55">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className={`${MONO} text-[11.5px] uppercase tracking-[0.14em]`}>
            Loading databases
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background: "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">
        {/* ── Hero ────────────────────────────────────── */}
        <header className="mb-14">
          <div className="max-w-2xl">
            <h1 className="text-[40px] sm:text-[52px] leading-[1.02] tracking-[-0.03em] text-white font-semibold">
              Managed databases{" "}
              <span style={SERIF_STYLE} className="text-white/55 font-normal">
                for production workloads
              </span>
              .
            </h1>
            <p
              className={`${MONO} mt-4 max-w-md text-[11.5px] text-white/45 leading-relaxed`}
            >
              Provision relational, document, and streaming engines with
              predictable capacity, point-in-time recovery, and direct
              connection strings.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Link
                href="/dashboard/services/database/new"
                className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                style={{
                  background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                  color: "#ffffff",
                  boxShadow:
                    "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                  e.currentTarget.style.transform = "none";
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New cluster
              </Link>
              <Link
                href="#inventory"
                className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white border border-white/[0.08] hover:bg-white/[0.04] rounded-[5px] transition-colors`}
              >
                View inventory
              </Link>
            </div>
          </div>
        </header>

        {/* ── Stats — horizontal divider strip ─────────── */}
        <section className="mb-16 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
          <StatCell
            label="Total clusters"
            value={String(clusters.length)}
            hint="Managed environments"
          />
          <StatCell
            label="Healthy"
            value={String(onlineCount)}
            suffix={clusters.length > 0 ? `/ ${clusters.length}` : undefined}
            hint="Online and serving"
            accent="#4ade80"
          />
          <StatCell
            label="Provisioning"
            value={String(provisioningCount)}
            hint="Creating or updating"
            accent={ACCENT}
          />
          <StatCell
            label="Footprint"
            value={regionsCount > 0 ? String(regionsCount) : "—"}
            suffix={regionsCount > 0 ? "regions" : undefined}
            hint={
              regionsCount > 0
                ? `${totalNodes} total node${totalNodes === 1 ? "" : "s"}`
                : "No deployed capacity yet"
            }
          />
        </section>

        {/* ── Engine catalog ──────────────────────────── */}
        <SectionHead
          eyebrow="Choose your engine"
          title="Pick the right"
          accent="data store"
          link={{
            label: "Or configure custom",
            href: "/dashboard/services/database/new",
          }}
        />

        {/* Filter tabs */}
        {engines.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <FilterChip
              active={filter === "All"}
              label="All"
              onClick={() => setFilter("All")}
            />
            {categories.map((c) => (
              <FilterChip
                key={c}
                active={filter === c}
                label={c}
                onClick={() => setFilter(c)}
              />
            ))}
          </div>
        )}

        {visibleEngines.length > 0 ? (
          <div className="mb-10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {visibleEngines.map((engine) => (
              <EngineCard
                key={engine.code}
                engine={engine}
                featured={engine.code === FEATURED_ENGINE}
              />
            ))}
          </div>
        ) : (
          <div className="mb-10 border border-white/[0.06] bg-[#111216] rounded-[6px] px-6 py-10 text-center">
            <p className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/45`}>
              No engines available in this category
            </p>
          </div>
        )}

        {/* ── Platform features (floating illustrations) ─ */}
        <SectionHead
          eyebrow="Why managed databases"
          title="Engineered"
          accent="for production"
          link={{ label: "Read the docs", href: "#" }}
        />
        <div className="mb-16 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6">
          {FEATURES.map((f, i) => (
            <FeatureCell key={f.title} index={i} {...f} />
          ))}
        </div>

        <style>{`
          @keyframes floaty {
            0%, 100% { transform: translateY(0px); }
            50%      { transform: translateY(-6px); }
          }
        `}</style>

        {/* ── Inventory ───────────────────────────────── */}
        <div id="inventory">
          <SectionHead
            eyebrow="Cluster inventory"
            title="Your"
            accent="clusters"
            rightMeta={
              clusters.length > 0
                ? `${onlineCount} healthy · ${clusters.length} total`
                : undefined
            }
          />
          {sortedClusters.length > 0 ? (
            <ClusterTable clusters={sortedClusters} />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabasePage;

// ─── Subcomponents ────────────────────────────────────────────────

function SectionHead({
  eyebrow,
  title,
  accent,
  link,
  rightMeta,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  link?: { label: string; href: string };
  rightMeta?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <p
          className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}
        >
          {eyebrow}
        </p>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          {title}{" "}
          <span style={SERIF_STYLE} className="text-white/55 font-normal">
            {accent}
          </span>
          <span className="text-white/55 font-normal">.</span>
        </h2>
      </div>
      <div className="flex items-center gap-4">
        {rightMeta && (
          <span
            className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/45 tabular-nums`}
          >
            {rightMeta}
          </span>
        )}
        {link && (
          <Link
            href={link.href}
            className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/50 hover:text-[#0095FF] transition-colors`}
          >
            {link.label}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  suffix,
  hint,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="px-5 py-5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          className="h-1 w-1 rounded-full shrink-0"
          style={{
            background: accent ?? "rgba(255,255,255,0.55)",
            boxShadow: accent ? `0 0 5px ${accent}` : "none",
          }}
        />
        <span
          className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={SERIF_STYLE}
          className="text-[40px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
        >
          {value}
        </span>
        {suffix && (
          <span style={SERIF_STYLE} className="text-[16px] text-white/40 font-medium">
            {suffix}
          </span>
        )}
      </div>
      <p className={`${MONO} text-[10.5px] text-white/40`}>{hint}</p>
    </div>
  );
}

function FeatureCell({
  index,
  title,
  desc,
  image,
}: {
  index: number;
  title: string;
  desc: string;
  image: string;
}) {
  return (
    <div className="flex items-start gap-4 py-2">
      <div
        className="relative h-20 w-20 shrink-0 flex items-center justify-center"
        style={{
          animation: `floaty 5s ease-in-out infinite ${(index % 6) * 0.5}s`,
        }}
      >
        <div
          className="absolute inset-0 blur-xl opacity-50"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.18), transparent 60%)",
          }}
        />
        <Image
          src={image}
          alt=""
          width={80}
          height={80}
          className="relative object-contain"
          unoptimized
        />
      </div>
      <div className="min-w-0 pt-1.5">
        <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-1.5">
          {title}
        </h3>
        <p className="text-[12px] text-white/55 leading-snug">{desc}</p>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${MONO} inline-flex h-8 items-center px-3 text-[10.5px] uppercase tracking-[0.14em] font-semibold rounded-[4px] border transition-colors`}
      style={
        active
          ? {
              color: ACCENT,
              borderColor: "rgba(0,149,255,0.4)",
              background: ACCENT_DIM,
            }
          : {
              color: "rgba(255,255,255,0.55)",
              borderColor: "rgba(255,255,255,0.08)",
              background: "#111216",
            }
      }
    >
      {label}
    </button>
  );
}

function EngineCard({
  engine,
  featured,
}: {
  engine: EngineMeta;
  featured?: boolean;
}) {
  const category = categoryFor(engine.code);
  const priceLabel = formatFromPrice(engine.fromPrice);
  const latestVersion = engine.versions[engine.versions.length - 1];
  return (
    <div
      className="group relative border rounded-[6px] p-5 flex flex-col gap-4 transition-all overflow-hidden"
      style={
        featured
          ? {
              borderColor: ACCENT,
              background:
                "linear-gradient(135deg, #111216 0%, rgba(0,149,255,0.05) 100%)",
              boxShadow: `0 0 0 1px ${ACCENT}, 0 6px 18px rgba(0,149,255,0.08)`,
            }
          : { borderColor: "rgba(255,255,255,0.06)", background: "#111216" }
      }
    >
      {featured && (
        <span
          className="absolute left-0 top-0 bottom-0 w-[2px]"
          style={{ background: ACCENT }}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="h-11 w-11 inline-flex items-center justify-center border rounded-[6px] bg-[#0d0e11] shrink-0"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            {engine.icon_url ? (
              <Image
                src={engine.icon_url}
                alt={engine.name}
                width={22}
                height={22}
                className="object-contain"
                unoptimized
              />
            ) : (
              <DatabaseIcon engine={engine.code} className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-[-0.01em] text-white truncate">
              {engine.name}
            </div>
            <div
              className={`${MONO} mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/45`}
            >
              {category}
              {latestVersion && (
                <>
                  <span className="mx-1 text-white/15">·</span>
                  v{latestVersion}
                </>
              )}
            </div>
          </div>
        </div>
        {featured && (
          <span
            className={`${MONO} text-[9px] uppercase tracking-[0.14em] font-semibold px-1.5 py-px rounded-[4px] shrink-0`}
            style={{
              background: ACCENT_DIM,
              color: ACCENT,
              border: `1px solid rgba(0,149,255,0.25)`,
            }}
          >
            Featured
          </span>
        )}
      </div>

      <p className="text-[12.5px] text-white/55 leading-snug">
        {describeEngine(engine)}
      </p>

      {engine.versions.length > 0 && (
        <div className={`${MONO} flex flex-wrap gap-1.5 text-[10px]`}>
          {engine.versions.slice(0, 4).map((v) => (
            <span
              key={v}
              className="px-1.5 py-0.5 border border-white/[0.08] bg-[#0d0e11] text-white/55 rounded-[3px]"
            >
              v{v}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
        <span
          className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/55`}
        >
          {priceLabel ?? "Pricing available at checkout"}
        </span>
        <Link
          href={`/dashboard/services/database/new?engine=${encodeURIComponent(engine.code)}`}
          className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] font-semibold transition-colors`}
          style={{ color: ACCENT }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = ACCENT_BRIGHT;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = ACCENT;
          }}
        >
          Deploy
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── Cluster table ────────────────────────────────────────────────

function ClusterTable({ clusters }: { clusters: DbCluster[] }) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
        <ColHead>Cluster</ColHead>
        <ColHead>Region</ColHead>
        <ColHead>Capacity</ColHead>
        <ColHead>Status</ColHead>
        <ColHead align="right">Action</ColHead>
      </div>
      {clusters.map((c) => {
        const s = statusMeta(c.status);
        return (
          <div
            key={c.id}
            className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] md:items-center"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-9 w-9 shrink-0 inline-flex items-center justify-center border rounded-[5px] bg-[#0d0e11]"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}
              >
                <DatabaseIcon engine={c.engine} className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-white truncate">
                  {c.name}
                </div>
                <div
                  className={`${MONO} mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/35`}
                >
                  {c.engine}
                  {c.version && (
                    <>
                      <span className="mx-1 text-white/15">·</span>v{c.version}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-white/35" />
              <div className="text-[12px] text-white/75 min-w-0 truncate">
                {getLocationName(c.region)}
              </div>
              <span
                className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/35`}
              >
                {c.region}
              </span>
            </div>

            <div className={`${MONO} text-[12px] text-white/75`}>
              {c.num_nodes || 1} node{(c.num_nodes || 1) === 1 ? "" : "s"}
              <span
                className={`${MONO} block text-[10px] text-white/35 mt-0.5`}
              >
                {formatRelativeTime(c.created_at)}
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              <span className="text-[12px] text-white/85">{s.label}</span>
            </div>

            <div className="flex justify-end">
              <Link
                href={{
                  pathname: `/dashboard/services/database/clusters/${encodeURIComponent(c.cluster_id)}`,
                  query: { clusterStatus: c.status },
                }}
                className={`${MONO} inline-flex items-center gap-1.5 h-8 px-2.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold transition-all rounded-[4px]`}
                style={{ background: ACCENT, color: "#001930" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = ACCENT_BRIGHT;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = ACCENT;
                }}
              >
                Open
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ColHead({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <span
      className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-12 text-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%), radial-gradient(circle at 70% 80%, rgba(167,139,250,0.025), transparent 50%)",
        }}
      />

      <div className="relative mx-auto mb-5 h-24 w-24 flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-[10px]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
            WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 75%)",
            maskImage: "radial-gradient(circle, black 30%, transparent 75%)",
          }}
        />
        <div
          className="relative z-10 h-12 w-12 flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]"
          style={{ color: ACCENT }}
        >
          <Database className="h-5 w-5" />
        </div>
        <span
          className="absolute top-3 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full"
          style={{
            background: ACCENT,
            boxShadow: `0 0 8px ${ACCENT}`,
            animation: "dbpulse 2s infinite",
          }}
        />
        <span
          className="absolute bottom-3 left-3 h-2 w-2 rounded-full"
          style={{
            background: ACCENT,
            boxShadow: `0 0 8px ${ACCENT}`,
            animation: "dbpulse 2s infinite 0.3s",
          }}
        />
        <span
          className="absolute bottom-3 right-3 h-2 w-2 rounded-full"
          style={{
            background: ACCENT,
            boxShadow: `0 0 8px ${ACCENT}`,
            animation: "dbpulse 2s infinite 0.6s",
          }}
        />
        <style>{`@keyframes dbpulse { 0%,100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.25); } }`}</style>
      </div>

      <h3 className="relative text-[18px] font-semibold tracking-[-0.015em] text-white">
        No database clusters yet
      </h3>
      <p
        className={`${MONO} relative mt-2 max-w-md mx-auto text-[11.5px] text-white/45 leading-relaxed`}
      >
        Spin up your first managed cluster with structured networking, automated
        backups, and direct connection strings — ready in about 3 minutes.
      </p>

      <div className="relative mt-5">
        <Link
          href="/dashboard/services/database/new"
          className={`${MONO} inline-flex items-center gap-2 h-9 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
            color: "#ffffff",
            boxShadow: "0 8px 20px rgba(0,149,255,0.20)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create database cluster
        </Link>
      </div>
    </div>
  );
}
