"use client";

// Object Storage overview — editorial canvas with horizontal stats
// strip, floating PNG feature illustrations, and a clean bucket
// inventory. Matches the editorial language used across Kubernetes,
// Database, and Apps overviews.

import { useMemo } from "react";
import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ObjectSpaceBucket, Tables } from "@/lib/supabase/types";
import BucketsTable from "./buckets-table";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

interface ObjectStorageMainProps {
  buckets: ObjectSpaceBucket[];
  projects: Tables<"projects">[];
  userId: string;
}

// ─── Platform features (floating PNG illustrations) ───────────────

const FEATURES = [
  {
    title: "S3-compatible API",
    desc: "Drop-in for the AWS S3 SDK. Bring your existing tooling — boto3, aws-cli, MinIO clients.",
    image: "/images/kubernetes-ui/s3 Compatible API.png",
  },
  {
    title: "11 nines durability",
    desc: "Objects replicated across multiple nodes per region. Designed for 99.999999999% durability.",
    image: "/images/11 nINES dURABILITY.png",
  },
  {
    title: "Lifecycle policies",
    desc: "Auto-transition cold objects to archival storage and expire stale data on a schedule.",
    image: "/images/Life cycle policiese.png",
  },
  {
    title: "Object versioning",
    desc: "Per-object version history with point-in-time restore and soft-delete protection.",
    image: "/images/kubernetes-ui/versoning.png",
  },
  {
    title: "Global CDN",
    desc: "Serve public assets from 150+ edge POPs with brotli compression and range requests.",
    image: "/images/Global CDN Integration.png",
  },
  {
    title: "Multi-region replication",
    desc: "Replicate buckets across regions for low-latency reads and disaster recovery.",
    image: "/images/kubernetes-ui/Multi region clusters png.png",
  },
] as const;

// ─── Component ─────────────────────────────────────────────────────

const ObjectStorageMain = ({ buckets }: ObjectStorageMainProps) => {
  const stats = useMemo(() => {
    const activeBuckets = buckets.filter((b) => b.status === "active").length;
    const publicBuckets = buckets.filter((b) => b.acl === "public-read").length;
    const versionedBuckets = buckets.filter((b) => b.versioning_enabled).length;
    return {
      totalBuckets: buckets.length,
      activeBuckets,
      publicBuckets,
      versionedBuckets,
    };
  }, [buckets]);

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[900px] w-[900px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.08), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
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
        {/* Hero */}
        <header className="mb-14">
          <div className="max-w-2xl">
            <h1 className="text-[40px] sm:text-[52px] leading-[1.02] tracking-[-0.03em] text-white font-semibold">
              Object storage{" "}
              <span style={SERIF_STYLE} className="text-white/55 font-normal">
                for files, assets, and data
              </span>
              .
            </h1>
            <p
              className={`${MONO} mt-4 max-w-md text-[11.5px] text-white/45 leading-relaxed`}
            >
              S3-compatible buckets with versioning, lifecycle policies, and a
              global CDN — backed by 11 nines of durability.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Link
                href="/dashboard/services/object-storage/new"
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
                New bucket
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

        {/* Stats — horizontal divider strip */}
        <section className="mb-16 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
          <StatCell
            label="Buckets"
            value={String(stats.totalBuckets)}
            hint="Provisioned storage buckets"
          />
          <StatCell
            label="Active"
            value={String(stats.activeBuckets)}
            suffix={
              stats.totalBuckets > 0 ? `/ ${stats.totalBuckets}` : undefined
            }
            hint="Available for traffic"
            accent="#4ade80"
          />
          <StatCell
            label="Public access"
            value={String(stats.publicBuckets)}
            hint="Buckets with public read"
            accent={ACCENT}
          />
          <StatCell
            label="Versioning"
            value={String(stats.versionedBuckets)}
            hint="Buckets with object versioning"
          />
        </section>

        {/* Platform features */}
        <SectionHead
          eyebrow="Why object storage"
          title="Engineered"
          accent="for scale"
          link={{ label: "Read the docs", href: "/docs" }}
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

        {/* Inventory */}
        <div id="inventory">
          <SectionHead
            eyebrow="Bucket inventory"
            title="Your"
            accent="buckets"
            rightMeta={
              stats.totalBuckets > 0
                ? `${stats.activeBuckets} active · ${stats.totalBuckets} total`
                : undefined
            }
          />
          <BucketsTable buckets={buckets} />
        </div>
      </div>
    </div>
  );
};

export default ObjectStorageMain;

// ─── Subcomponents ─────────────────────────────────────────────────

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
            <span aria-hidden>→</span>
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
          <span
            style={SERIF_STYLE}
            className="text-[16px] text-white/40 font-medium"
          >
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
