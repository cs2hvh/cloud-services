"use client";

// New database cluster — single-page editorial form. Numbered sections
// on the left, sticky configuration summary on the right. All wiring
// (engine list from /api/database-types, plans from products table,
// regions from locations, projects from supabase) is preserved.

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Cpu,
  HardDrive,
  Loader2,
  Server,
} from "lucide-react";
import { z } from "zod";

import api from "@/lib/axios/axios";
import { Tables } from "@/lib/supabase/types";
import { formatPrice } from "@/lib/utils";
import { NAMING_RULES } from "@/lib/validation/constants";
import { createDatabaseSchema, validateEngineVersion } from "@/lib/validation/database";

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

// ─── Types ────────────────────────────────────────────────────────

interface PageProps {
  products: Tables<"products">[];
  locations: Tables<"locations">[];
  projects: Tables<"projects">[];
  userId: string;
  clusters: Tables<"database_clusters">[];
}

interface DatabaseType {
  id: string;
  code: string;
  name: string;
  description: string;
  icon_url: string;
  versions: string[];
  available: boolean;
}

type CpuType = "basic" | "general_purpose" | "storage_optimized";

type ProductResources = {
  cpu?: number;
  ram?: number;
  storage?: number;
};

const CPU_META: Record<CpuType, { label: string; description: string }> = {
  basic: {
    label: "Basic",
    description: "Shared CPU · dev and lower-throughput workloads.",
  },
  general_purpose: {
    label: "General Purpose",
    description: "Dedicated CPU · steady production traffic.",
  },
  storage_optimized: {
    label: "Storage Optimized",
    description: "Higher storage tier · data-heavy workloads.",
  },
};

const ENGINE_CATEGORY: Record<string, string> = {
  pg: "SQL · Relational",
  mysql: "SQL · Relational",
  mongodb: "NoSQL · Document",
  kafka: "Streaming · Distributed log",
  redis: "Cache · Key-Value",
  valkey: "Cache · Key-Value",
  clickhouse: "Analytics · Columnar",
};

// ─── Helpers ──────────────────────────────────────────────────────

function getProductResources(p: Tables<"products">): ProductResources {
  return ((p.resources as ProductResources | null) || {}) as ProductResources;
}

function getProductCpuType(p: Tables<"products">): CpuType {
  return (p as { cpu_type?: CpuType }).cpu_type || "basic";
}

function getDiscountPercent(p: Tables<"products">): number {
  const parsed = Number(p.discount ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEffectivePrice(p?: Tables<"products"> | null): number | null {
  if (!p || p.price === null || p.price === undefined) return null;
  const price = Number(p.price);
  if (!Number.isFinite(price)) return null;
  const d = getDiscountPercent(p);
  return d > 0 ? price * (1 - d / 100) : price;
}

function priceLabel(p?: Tables<"products"> | null): string {
  if (!p) return "—";
  const eff = getEffectivePrice(p);
  if (eff === null || eff === 0) return "Free";
  return `${formatPrice(eff)}/mo`;
}

// ─── Component ────────────────────────────────────────────────────

const DatabaseSelect = ({
  products,
  locations,
  projects,
  userId,
  clusters,
}: PageProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [selectedCpuType, setSelectedCpuType] = useState<CpuType>("basic");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [state, setState] = useState({
    selectedDb: "",
    selectedName: "",
    selectedVersion: "",
    selectedLocation: "",
    selectedDbType: "",
    selectedProject: projects[0]?.id ?? "",
  });

  // Fetch engines on mount
  useEffect(() => {
    (async () => {
      try {
        setLoadingTypes(true);
        const res = await api.get("/database-types");
        if (res?.data?.success) {
          setDatabaseTypes(res?.data?.data ?? []);
        }
      } catch (err) {
        console.error("Error fetching database types:", err);
        toast.error("Failed to load database engines");
      } finally {
        setLoadingTypes(false);
      }
    })();
  }, []);

  const selectedDbTypeInfo = useMemo(
    () => databaseTypes.find((t) => t.code === state.selectedDbType),
    [databaseTypes, state.selectedDbType],
  );

  const versions = selectedDbTypeInfo?.versions || [];

  const availablePlans = useMemo(() => {
    if (!state.selectedDbType) return [] as Tables<"products">[];
    return products
      .filter(
        (p) =>
          p.sub === state.selectedDbType &&
          getProductCpuType(p) === selectedCpuType,
      )
      .sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
  }, [products, selectedCpuType, state.selectedDbType]);

  useEffect(() => {
    if (
      state.selectedDb &&
      !availablePlans.some((p) => p.id === state.selectedDb)
    ) {
      setState((prev) => ({ ...prev, selectedDb: "" }));
    }
  }, [availablePlans, state.selectedDb]);

  const selectedPlan =
    availablePlans.find((p) => p.id === state.selectedDb) ??
    products.find((p) => p.id === state.selectedDb);

  const selectedLocationData = locations.find(
    (l) => l.short === state.selectedLocation,
  );

  const selectedProjectData = projects.find(
    (p) => p.id === state.selectedProject,
  );

  // ─── Validation helpers ────────────────────────────────────────

  const nameError = useMemo(() => {
    const n = state.selectedName;
    if (!n) return "";
    if (n.length < NAMING_RULES.MIN_CLUSTER_NAME_LENGTH) {
      return `At least ${NAMING_RULES.MIN_CLUSTER_NAME_LENGTH} characters`;
    }
    if (n.length > NAMING_RULES.MAX_CLUSTER_NAME_LENGTH) {
      return `At most ${NAMING_RULES.MAX_CLUSTER_NAME_LENGTH} characters`;
    }
    if (!NAMING_RULES.CLUSTER_NAME_PATTERN.test(n)) {
      return "Lowercase letters, numbers, and hyphens only";
    }
    if (clusters.some((c) => c.name === n)) return "Name already taken";
    return "";
  }, [state.selectedName, clusters]);

  const isNameValid = !!state.selectedName && !nameError;
  const isEngineValid = !!state.selectedDbType && !!state.selectedVersion;
  const isRegionValid = !!state.selectedLocation;
  const isPlanValid = !!state.selectedDb;
  const isProjectValid = !!state.selectedProject;

  const canSubmit =
    isNameValid &&
    isEngineValid &&
    isRegionValid &&
    isPlanValid &&
    isProjectValid &&
    termsAccepted &&
    !isLoading;

  // ─── Handlers ──────────────────────────────────────────────────

  const handleEngineChange = (code: string) => {
    const t = databaseTypes.find((x) => x.code === code);
    if (!t?.available) return;
    setState((prev) => ({
      ...prev,
      selectedDbType: code,
      selectedDb: "",
      selectedVersion: t?.versions?.[0] || "",
    }));
  };

  const onSubmit = async () => {
    if (!canSubmit) {
      toast.error("Complete all required fields");
      return;
    }
    if (!selectedPlan) {
      toast.error("Invalid plan selected");
      return;
    }

    try {
      setIsLoading(true);

      const resources = getProductResources(selectedPlan);
      const sizeSlug =
        selectedPlan.slug || `db-s-${resources.cpu || 1}vcpu-${resources.ram || 1}gb`;

      const payload = {
        name: state.selectedName,
        engine: state.selectedDbType,
        version: state.selectedVersion,
        num_nodes: 1,
        size: sizeSlug,
        plan_id: selectedPlan.id,
        region: state.selectedLocation,
        project_id: state.selectedProject,
        owner_id: userId,
      };

      try {
        createDatabaseSchema.parse(payload);
      } catch (e) {
        if (e instanceof z.ZodError) {
          toast.error(e.errors[0].message);
          return;
        }
        throw e;
      }

      if (!validateEngineVersion(payload.engine, payload.version)) {
        toast.error(
          `Version ${payload.version} is not valid for ${payload.engine}`,
        );
        return;
      }

      const res = await api.post("/services/database/create", payload);
      if (res.status === 200) {
        toast.success(res?.data?.message || "Database creation started.");
        const clusterId = res?.data?.data?.cluster_id;
        if (clusterId) {
          router.push(`/dashboard/services/database/clusters/${clusterId}`);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to create database. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const monthlyPrice = getEffectivePrice(selectedPlan ?? null);
  const hourlyPrice =
    monthlyPrice !== null ? monthlyPrice / (24 * 30) : null;

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[900px] w-[900px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
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

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9 max-w-[1360px] mx-auto">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/dashboard/services/database"
            className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to databases
          </Link>
        </div>

        {/* Hero */}
        <div
          className={`${MONO} mb-3 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}
        >
          <span className="h-px w-4 bg-white/45" />
          Database · Provisioning
        </div>
        <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
          Spin up a managed cluster{" "}
          <span style={SERIF_STYLE} className="text-white/55 font-normal">
            in seconds
          </span>
          .
        </h1>
        <p
          className={`${MONO} max-w-xl text-[11.5px] text-white/45 leading-relaxed mb-10`}
        >
          Pick an engine, choose a region, and we handle replication, TLS, and
          connection strings. Per-second billing.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-10 items-start">
          {/* ─── LEFT: Sections ─────────────────────────────── */}
          <div className="min-w-0">
            {/* 01 Identity */}
            <Section
              num="01"
              title="Cluster identity"
              desc="A stable name for dashboards, billing, and connection strings."
              status={isNameValid ? "done" : state.selectedName ? "active" : "idle"}
              statusLabel={isNameValid ? "Valid" : state.selectedName ? "Check" : "Required"}
            >
              <div className="max-w-[520px]">
                <FieldLabel hint="required">Cluster name</FieldLabel>
                <Input
                  value={state.selectedName}
                  placeholder="prod-orders-pg"
                  onChange={(e) =>
                    setState((p) => ({ ...p, selectedName: e.target.value }))
                  }
                  mono
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`${MONO} text-[10.5px] text-white/40`}>
                    3–63 chars · lowercase · hyphens allowed
                  </span>
                  {state.selectedName && (
                    <span
                      className={`${MONO} text-[10.5px] inline-flex items-center gap-1 ${
                        isNameValid ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {isNameValid ? (
                        <>
                          <Check className="h-3 w-3" /> Available
                        </>
                      ) : (
                        nameError
                      )}
                    </span>
                  )}
                </div>
              </div>
            </Section>

            {/* 02 Engine */}
            <Section
              num="02"
              title="Engine"
              desc="Select your database engine. Version is selectable after picking."
              status={isEngineValid ? "done" : "idle"}
              statusLabel={
                isEngineValid && selectedDbTypeInfo
                  ? selectedDbTypeInfo.name
                  : "Required"
              }
            >
              {loadingTypes ? (
                <div className="flex items-center gap-3 text-white/50 py-12 justify-center border border-white/[0.06] bg-[#111216] rounded-[6px]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className={`${MONO} text-[11px] uppercase tracking-[0.14em]`}>
                    Loading engines
                  </span>
                </div>
              ) : (
                <>
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-[6px] overflow-hidden mb-3"
                  >
                    {databaseTypes.map((engine) => {
                      const isSelected = state.selectedDbType === engine.code;
                      const planCount = products.filter(
                        (p) => p.sub === engine.code,
                      ).length;
                      const fromPrice = products
                        .filter((p) => p.sub === engine.code && p.price !== null)
                        .reduce<number | null>((min, p) => {
                          const eff = getEffectivePrice(p);
                          if (eff === null) return min;
                          return min === null || eff < min ? eff : min;
                        }, null);
                      const category =
                        ENGINE_CATEGORY[engine.code.toLowerCase()] ?? "Database";

                      return (
                        <EngineCard
                          key={engine.code}
                          name={engine.name}
                          category={category}
                          iconUrl={engine.icon_url}
                          version={engine.versions[engine.versions.length - 1]}
                          fromPrice={fromPrice}
                          selected={isSelected}
                          disabled={!engine.available || planCount === 0}
                          onClick={() => handleEngineChange(engine.code)}
                        />
                      );
                    })}
                  </div>

                  {selectedDbTypeInfo && versions.length > 0 && (
                    <div
                      className="flex items-center gap-3 max-w-[520px] px-4 h-11 border border-white/[0.06] bg-[#111216] rounded-[6px]"
                    >
                      <span
                        className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40`}
                      >
                        Version
                      </span>
                      <span
                        className={`${MONO} text-[12px] text-white/85 truncate flex-1`}
                      >
                        {selectedDbTypeInfo.name} {state.selectedVersion}
                      </span>
                      <select
                        value={state.selectedVersion}
                        onChange={(e) =>
                          setState((p) => ({
                            ...p,
                            selectedVersion: e.target.value,
                          }))
                        }
                        className={`${MONO} bg-[#0d0e11] border border-white/[0.08] text-white text-[11px] px-2 py-1 rounded-[4px] outline-none`}
                      >
                        {versions.map((v) => (
                          <option key={v} value={v}>
                            v{v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* 03 Region */}
            <Section
              num="03"
              title="Region"
              desc="Where the primary node is provisioned. Replicas can be added later."
              status={isRegionValid ? "done" : "idle"}
              statusLabel={
                isRegionValid && selectedLocationData
                  ? selectedLocationData.city
                  : "Required"
              }
            >
              <div
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-[6px] overflow-hidden"
              >
                {locations.map((r) => (
                  <RegionCard
                    key={r.id}
                    city={r.city}
                    country={r.country}
                    countryCode={r.country_code}
                    short={r.short}
                    available={!!r.available}
                    selected={state.selectedLocation === r.short}
                    onClick={() => {
                      if (!r.available) return;
                      setState((p) => ({ ...p, selectedLocation: r.short }));
                    }}
                  />
                ))}
              </div>
            </Section>

            {/* 04 Plan */}
            <Section
              num="04"
              title="Plan & sizing"
              desc="Compute and memory tier. Storage scales with the chosen plan."
              status={isPlanValid ? "done" : isEngineValid ? "active" : "idle"}
              statusLabel={
                selectedPlan
                  ? `${selectedPlan.name} · ${getProductResources(selectedPlan).cpu || 1} vCPU`
                  : isEngineValid
                    ? "Choose a plan"
                    : "Pick engine first"
              }
            >
              {/* CPU profile tabs */}
              <div className="mb-4">
                <FieldLabel>CPU profile</FieldLabel>
                <div
                  className="inline-flex border border-white/[0.06] bg-[#0d0e11] rounded-[5px] p-0.5 gap-0.5"
                >
                  {(Object.keys(CPU_META) as CpuType[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setSelectedCpuType(k);
                        setState((p) => ({ ...p, selectedDb: "" }));
                      }}
                      className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold px-3 h-7 rounded-[4px] transition-colors`}
                      style={
                        selectedCpuType === k
                          ? {
                              color: ACCENT,
                              background: ACCENT_DIM,
                              border: "1px solid rgba(0,149,255,0.25)",
                            }
                          : {
                              color: "rgba(255,255,255,0.55)",
                              border: "1px solid transparent",
                            }
                      }
                    >
                      {CPU_META[k].label}
                    </button>
                  ))}
                </div>
                <p className={`${MONO} mt-2 text-[10.5px] text-white/40`}>
                  {CPU_META[selectedCpuType].description}
                </p>
              </div>

              {!isEngineValid ? (
                <div
                  className={`${MONO} text-[11px] text-white/45 px-6 py-10 text-center border border-dashed border-white/[0.08] rounded-[6px]`}
                >
                  Pick an engine in step 02 to see matching plans.
                </div>
              ) : availablePlans.length === 0 ? (
                <div
                  className={`${MONO} text-[11px] text-white/45 px-6 py-10 text-center border border-dashed border-white/[0.08] rounded-[6px]`}
                >
                  No plans available for {CPU_META[selectedCpuType].label.toLowerCase()} profile.
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] rounded-[6px] overflow-hidden"
                >
                  {availablePlans.map((plan, idx) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      featured={idx === 1}
                      selected={state.selectedDb === plan.id}
                      onClick={() =>
                        setState((p) => ({ ...p, selectedDb: plan.id }))
                      }
                    />
                  ))}
                </div>
              )}
            </Section>

            {/* 05 Project */}
            <Section
              num="05"
              title="Project & billing"
              desc="Resource group for IAM, billing, and quotas."
              status={isProjectValid ? "done" : "idle"}
              statusLabel={
                selectedProjectData?.name ?? "Required"
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[520px]">
                <div>
                  <FieldLabel>Project</FieldLabel>
                  {projects.length === 0 ? (
                    <div
                      className={`${MONO} text-[11px] text-white/45 px-4 h-11 inline-flex items-center border border-dashed border-white/[0.08] rounded-[6px] w-full`}
                    >
                      No projects yet
                    </div>
                  ) : (
                    <select
                      value={state.selectedProject}
                      onChange={(e) =>
                        setState((p) => ({
                          ...p,
                          selectedProject: e.target.value,
                        }))
                      }
                      className={`${MONO} w-full bg-[#0d0e11] border border-white/[0.08] text-white text-[12px] px-3 h-11 rounded-[6px] outline-none hover:border-white/15 focus:border-[${ACCENT}]`}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <Link
                    href="/dashboard/projects/new"
                    className={`${MONO} mt-2 inline-flex items-center gap-1 text-[10.5px] text-white/50 hover:text-[#0095FF] transition-colors`}
                  >
                    Create new project
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
                <div>
                  <FieldLabel>Billing account</FieldLabel>
                  <div
                    className={`${MONO} w-full bg-[#0d0e11] border border-white/[0.08] text-white/85 text-[12px] px-3 h-11 inline-flex items-center rounded-[6px]`}
                  >
                    Default · pay-as-you-go
                  </div>
                </div>
              </div>
            </Section>

            {/* 06 Confirm */}
            <Section
              num="06"
              title="Review and confirm"
              desc="Provisioning begins immediately after confirmation."
              status={termsAccepted ? "done" : "idle"}
              statusLabel={termsAccepted ? "Accepted" : "Required"}
            >
              <label
                className="flex items-start gap-3 px-4 py-3 border border-white/[0.06] bg-[#111216] rounded-[6px] cursor-pointer max-w-[640px]"
              >
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-3.5 w-3.5 accent-[#0095FF]"
                />
                <span className="text-[12.5px] leading-snug text-white/75">
                  I accept the{" "}
                  <Link
                    href="/terms"
                    className="text-white underline underline-offset-4"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="text-white underline underline-offset-4"
                  >
                    Privacy Policy
                  </Link>{" "}
                  for provisioning this managed database cluster.
                </span>
              </label>
            </Section>
          </div>

          {/* ─── RIGHT: Sticky summary ──────────────────────── */}
          <aside className="lg:sticky lg:top-6 self-start">
            <div
              className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden"
            >
              <header
                className="border-b border-white/[0.06] px-5 py-4 flex items-start justify-between gap-2"
              >
                <div>
                  <p
                    className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1`}
                  >
                    Configuration
                  </p>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">
                    Your cluster
                  </h3>
                </div>
                <span
                  className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold`}
                  style={{ color: canSubmit ? "#4ade80" : ACCENT }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: canSubmit ? "#4ade80" : ACCENT,
                      boxShadow: `0 0 6px ${canSubmit ? "#4ade80" : ACCENT}`,
                    }}
                  />
                  {canSubmit ? "Ready" : "Pending"}
                </span>
              </header>

              {/* Summary rows */}
              <div className="px-5 py-3">
                <SumRow
                  k="Name"
                  v={state.selectedName || "—"}
                  empty={!state.selectedName}
                  mono
                />
                <SumRow
                  k="Engine"
                  v={
                    selectedDbTypeInfo && state.selectedVersion
                      ? `${selectedDbTypeInfo.name} ${state.selectedVersion}`
                      : "—"
                  }
                  empty={!selectedDbTypeInfo}
                />
                <SumRow
                  k="Region"
                  v={
                    selectedLocationData
                      ? `${selectedLocationData.city} · ${selectedLocationData.short}`
                      : "—"
                  }
                  empty={!selectedLocationData}
                />
                <SumRow
                  k="Plan"
                  v={selectedPlan?.name || "—"}
                  empty={!selectedPlan}
                  mono
                />
                {selectedPlan && (
                  <>
                    <SumRow
                      k="vCPU"
                      v={`${getProductResources(selectedPlan).cpu || 1}`}
                      mono
                    />
                    <SumRow
                      k="Memory"
                      v={`${getProductResources(selectedPlan).ram || 1} GB`}
                      mono
                    />
                    <SumRow
                      k="Storage"
                      v={`${getProductResources(selectedPlan).storage || 0} GB`}
                      mono
                    />
                  </>
                )}
                <SumRow
                  k="Project"
                  v={selectedProjectData?.name || "—"}
                  empty={!selectedProjectData}
                />
              </div>

              {/* Connection preview */}
              {selectedDbTypeInfo && state.selectedName && selectedLocationData && (
                <div
                  className="mx-5 mb-4 px-3 py-2.5 border border-white/[0.06] bg-[#08090b] rounded-[5px]"
                >
                  <div
                    className={`${MONO} flex items-center justify-between mb-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/35`}
                  >
                    Connection preview
                  </div>
                  <code
                    className={`${MONO} text-[10.5px] break-all leading-snug text-white/55`}
                  >
                    <span style={{ color: ACCENT }}>
                      {connSchemaFor(state.selectedDbType)}
                    </span>
                    <span className="text-emerald-400">admin</span>
                    :****@
                    <span className="text-white/85">
                      {state.selectedName}.{state.selectedLocation}.ahurasense.com
                    </span>
                    :{connPortFor(state.selectedDbType)}
                  </code>
                </div>
              )}

              {/* Cost block */}
              <div
                className="px-5 py-4 bg-[#08090b] border-t border-white/[0.06]"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <span
                    className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40`}
                  >
                    Monthly cost
                  </span>
                  {hourlyPrice !== null && hourlyPrice > 0 && (
                    <span className={`${MONO} text-[10.5px] text-white/45`}>
                      ${hourlyPrice.toFixed(4)} / hr
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  {monthlyPrice === null ? (
                    <span
                      style={SERIF_STYLE}
                      className="text-[28px] font-bold text-white/35 leading-none"
                    >
                      —
                    </span>
                  ) : monthlyPrice === 0 ? (
                    <span
                      style={SERIF_STYLE}
                      className="text-[34px] font-bold tracking-[-0.03em] text-white leading-none"
                    >
                      Free
                    </span>
                  ) : (
                    <>
                      <span
                        style={SERIF_STYLE}
                        className="text-[18px] text-white/50 font-medium leading-none"
                      >
                        $
                      </span>
                      <span
                        style={SERIF_STYLE}
                        className="text-[38px] font-bold tracking-[-0.03em] tabular-nums text-white leading-none"
                      >
                        {monthlyPrice.toFixed(monthlyPrice < 10 ? 2 : 0)}
                      </span>
                      <span
                        className={`${MONO} text-[11px] text-white/40 ml-1`}
                      >
                        / mo
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={onSubmit}
                  className={`${MONO} mt-4 w-full inline-flex items-center justify-center gap-2 h-11 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                  style={{
                    background: canSubmit
                      ? `linear-gradient(135deg, ${ACCENT}, #0066B3)`
                      : "#1a1d24",
                    color: canSubmit ? "#ffffff" : "rgba(255,255,255,0.35)",
                    boxShadow: canSubmit
                      ? "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)"
                      : "none",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                  }}
                  onMouseEnter={(e) => {
                    if (!canSubmit) return;
                    e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    if (!canSubmit) return;
                    e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Provisioning
                    </>
                  ) : (
                    <>
                      Create cluster
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
                <p
                  className={`${MONO} text-center text-[10px] text-white/35 mt-2`}
                >
                  Per-second billing · cancel anytime
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default DatabaseSelect;

// ─── Subcomponents ────────────────────────────────────────────────

function Section({
  num,
  title,
  desc,
  status,
  statusLabel,
  children,
}: {
  num: string;
  title: string;
  desc: string;
  status: "done" | "active" | "idle";
  statusLabel: string;
  children: React.ReactNode;
}) {
  const tone =
    status === "done"
      ? { dot: "#4ade80", text: "#4ade80" }
      : status === "active"
        ? { dot: ACCENT, text: ACCENT }
        : { dot: "rgba(255,255,255,0.25)", text: "rgba(255,255,255,0.35)" };

  return (
    <section className="border-t border-white/[0.06] py-8 first:border-t-0 first:pt-0">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span
            className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30 mt-0.5`}
          >
            {num}
          </span>
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">
              {title}
            </h2>
            <p className={`${MONO} mt-1 text-[11px] text-white/45 leading-snug max-w-[520px]`}>
              {desc}
            </p>
          </div>
        </div>
        <span
          className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold shrink-0 mt-1`}
          style={{ color: tone.text }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: tone.dot,
              boxShadow: status !== "idle" ? `0 0 6px ${tone.dot}` : "none",
            }}
          />
          {statusLabel}
        </span>
      </header>
      {children}
    </section>
  );
}

function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-[12px] font-medium text-white/85">{children}</span>
      {hint && (
        <span className={`${MONO} text-[10px] text-white/35`}>{hint}</span>
      )}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`${mono ? MONO : ""} w-full bg-[#0d0e11] border border-white/[0.08] text-white text-[12.5px] px-3 h-11 rounded-[6px] outline-none placeholder:text-white/25 hover:border-white/15 focus:border-[${ACCENT}] focus:shadow-[0_0_0_3px_rgba(0,149,255,0.09)] transition-all`}
    />
  );
}

function EngineCard({
  name,
  category,
  iconUrl,
  version,
  fromPrice,
  selected,
  disabled,
  onClick,
}: {
  name: string;
  category: string;
  iconUrl: string;
  version?: string;
  fromPrice: number | null;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative text-left px-5 py-4 bg-[#111216] hover:bg-[#16181d] transition-colors flex flex-col gap-2.5 min-h-[150px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#111216]"
      style={
        selected
          ? {
              background: "#16181d",
              boxShadow: `inset 0 0 0 1px ${ACCENT}`,
            }
          : undefined
      }
    >
      {selected && (
        <span
          className="absolute top-3 right-3 h-4 w-4 rounded-full inline-flex items-center justify-center"
          style={{ background: ACCENT }}
        >
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </span>
      )}
      <div className="flex items-center gap-3">
        <div
          className="h-9 w-9 inline-flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] rounded-[6px] shrink-0"
        >
          {iconUrl ? (
            <Image
              src={iconUrl}
              alt={name}
              width={22}
              height={22}
              className="object-contain"
              unoptimized
            />
          ) : (
            <Server className="h-4 w-4 text-white/55" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold tracking-[-0.005em] text-white truncate">
            {name}
          </div>
          <div
            className={`${MONO} mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/45 truncate`}
          >
            {category}
          </div>
        </div>
      </div>
      <div
        className={`${MONO} mt-auto flex items-center justify-between gap-2 pt-2 border-t border-white/[0.05] text-[10.5px] text-white/45`}
      >
        {version ? (
          <span>
            v <span className="text-white/85 font-medium">{version}</span>
          </span>
        ) : (
          <span>—</span>
        )}
        {fromPrice !== null && fromPrice > 0 && (
          <span className="text-white/85 font-semibold">
            <span className="text-white/40 font-normal">From</span> $
            {fromPrice.toFixed(fromPrice < 10 ? 2 : 0)}
            <span className="text-white/40 font-normal">/mo</span>
          </span>
        )}
      </div>
    </button>
  );
}

function RegionCard({
  city,
  country,
  countryCode,
  short,
  available,
  selected,
  onClick,
}: {
  city: string;
  country: string;
  countryCode: string | null;
  short: string;
  available: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className="relative text-left px-4 py-3.5 bg-[#111216] hover:bg-[#16181d] transition-colors min-h-[78px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#111216]"
      style={
        selected
          ? {
              background: "#16181d",
              boxShadow: `inset 0 0 0 1px ${ACCENT}`,
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`${MONO} text-[11px] font-semibold tracking-[0.04em] uppercase`}
          style={{ color: selected ? ACCENT : "rgba(255,255,255,0.55)" }}
        >
          {short} · {countryCode || ""}
        </span>
        {available ? (
          <span
            className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold inline-flex items-center gap-1 text-emerald-300/85`}
          >
            <span
              className="h-1 w-1 rounded-full bg-emerald-400"
              style={{ boxShadow: "0 0 5px #4ade80" }}
            />
            Ready
          </span>
        ) : (
          <span
            className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold text-white/35`}
          >
            Soon
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {countryCode && (
          <Image
            src={`https://flagcdn.com/${countryCode.toLowerCase()}.svg`}
            alt={country}
            width={18}
            height={12}
            className="rounded-sm shrink-0"
            unoptimized
          />
        )}
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold tracking-[-0.005em] text-white truncate">
            {city}
          </div>
          <div className={`${MONO} text-[10px] text-white/40 truncate`}>
            {country}
          </div>
        </div>
      </div>
    </button>
  );
}

function PlanCard({
  plan,
  featured,
  selected,
  onClick,
}: {
  plan: Tables<"products">;
  featured?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const resources = getProductResources(plan);
  const discount = getDiscountPercent(plan);
  const effective = getEffectivePrice(plan);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left px-5 py-4 bg-[#111216] hover:bg-[#16181d] transition-colors flex flex-col gap-2.5 min-h-[170px]"
      style={
        selected
          ? {
              background: "#16181d",
              boxShadow: `inset 0 0 0 1px ${ACCENT}`,
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[13.5px] font-semibold tracking-[-0.005em]"
          style={{ color: selected ? ACCENT : "#ffffff" }}
        >
          {plan.name}
        </span>
        {featured && (
          <span
            className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold px-1.5 py-px rounded-[3px]`}
            style={{
              background: ACCENT_DIM,
              color: ACCENT,
              border: "1px solid rgba(0,149,255,0.25)",
            }}
          >
            Popular
          </span>
        )}
      </div>
      <div className={`${MONO} text-[11px] flex flex-col gap-1`}>
        <div className="flex justify-between text-white/45">
          <span>vCPU</span>
          <span className="text-white/85 font-medium">
            {resources.cpu || 1}
          </span>
        </div>
        <div className="flex justify-between text-white/45">
          <span>Memory</span>
          <span className="text-white/85 font-medium">
            {resources.ram || 1} GB
          </span>
        </div>
        <div className="flex justify-between text-white/45">
          <span>Storage</span>
          <span className="text-white/85 font-medium">
            {resources.storage || 0} GB
          </span>
        </div>
      </div>
      <div className="mt-auto pt-2 border-t border-white/[0.05] flex items-baseline justify-between gap-2">
        {effective === null || effective === 0 ? (
          <span
            style={SERIF_STYLE}
            className="text-[18px] font-bold tracking-[-0.01em] text-white"
          >
            Free
          </span>
        ) : (
          <span style={SERIF_STYLE} className="text-[18px] font-bold tracking-[-0.01em] text-white">
            <span className="text-white/45 text-[13px] font-medium">$</span>
            {effective.toFixed(effective < 10 ? 2 : 0)}
            <span className={`${MONO} text-[9.5px] text-white/35 font-medium ml-0.5`}>
              /mo
            </span>
          </span>
        )}
        {discount > 0 && (
          <span
            className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold text-emerald-300`}
          >
            Save {discount}%
          </span>
        )}
      </div>
    </button>
  );
}

function SumRow({
  k,
  v,
  empty,
  mono,
}: {
  k: string;
  v: string;
  empty?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-b-0">
      <span
        className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-medium text-white/40`}
      >
        {k}
      </span>
      <span
        className={`${mono ? MONO : ""} text-[12px] font-medium truncate max-w-[200px] ${
          empty ? "text-white/25" : "text-white/90"
        }`}
        title={v}
      >
        {v}
      </span>
    </div>
  );
}

function connSchemaFor(engine: string): string {
  const e = engine.toLowerCase();
  if (e === "pg") return "postgresql://";
  if (e === "mysql") return "mysql://";
  if (e === "mongodb") return "mongodb://";
  if (e === "kafka") return "kafka://";
  return "db://";
}

function connPortFor(engine: string): string {
  const e = engine.toLowerCase();
  if (e === "pg") return "5432";
  if (e === "mysql") return "3306";
  if (e === "mongodb") return "27017";
  if (e === "kafka") return "9092";
  return "—";
}
