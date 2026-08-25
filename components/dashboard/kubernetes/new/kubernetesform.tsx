"use client";

// Kubernetes cluster create page — single-page editorial layout matching
// the rest of the dashboard (aurora canvas, dotted grid, Nunito accent
// title, mono labels, brand-blue accent, sharp surfaces, sticky right
// summary with Nunito-bold price). All wiring (state, validation,
// submit) preserved from the original multi-step wizard.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import z from "zod";

import { kubernetesClusterSchema } from "@/lib/validation/kubernetes";
import { Tables } from "@/lib/supabase/types";
import api from "@/lib/axios/axios";

// ─── Design tokens (scoped) ────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const BORDER_ACCENT = "rgba(0,149,255,0.4)";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

interface PageProps {
  locations: Tables<"locations">[];
  projects: Tables<"projects">[];
  userId: string;
  clusters: Tables<"clusters_get">[];
  products: Tables<"products">[];
  role?: "user" | "admin";
  allUsers?: Array<{ id: string; email: string; username?: string }>;
}

type K8sCpuType = "shared" | "dedicated" | "gpu";

const CPU_TYPES: { value: K8sCpuType; label: string }[] = [
  { value: "shared", label: "Shared CPU" },
  { value: "dedicated", label: "Dedicated CPU" },
  { value: "gpu", label: "GPU" },
];

function getProductCpuType(product: Tables<"products">): K8sCpuType {
  const cpuType = (product as { cpu_type?: string }).cpu_type;
  if (cpuType && ["shared", "dedicated", "gpu"].includes(cpuType)) {
    return cpuType as K8sCpuType;
  }
  return "shared";
}

const NewClusterForm = ({
  locations,
  projects,
  userId,
  clusters,
  products,
  role = "user",
  allUsers = [],
}: PageProps) => {
  const router = useRouter();

  // ─── State ────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [selectedUser, setSelectedUser] = useState<string>(role === "admin" ? "" : userId);
  const [userSearch, setUserSearch] = useState("");
  const [clusterName, setClusterName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedVersion, setSelectedVersion] = useState("1.31.1");
  const [nodeCount, setNodeCount] = useState(3);
  const [selectedCpuType, setSelectedCpuType] = useState<K8sCpuType>("shared");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedProject, setSelectedProject] = useState("");

  const versions = ["1.31.1", "1.30.4", "1.29.8"];

  // ─── Derived ──────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => getProductCpuType(p) === selectedCpuType)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  }, [products, selectedCpuType]);

  const selectedProductObj = useMemo(
    () => products.find((p) => p.name === selectedPlan) ?? null,
    [products, selectedPlan]
  );

  const filteredUsers = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          !userSearch ||
          u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
          (u.username && u.username.toLowerCase().includes(userSearch.toLowerCase()))
      ),
    [allUsers, userSearch]
  );

  const filteredProjects = useMemo(() => {
    if (role === "admin") {
      if (!selectedUser) return [];
      return projects.filter((p) => p.owner === selectedUser);
    }
    return projects;
  }, [projects, role, selectedUser]);

  useEffect(() => {
    if (selectedProject && !filteredProjects.some((p) => p.id === selectedProject)) {
      setSelectedProject("");
    }
  }, [filteredProjects, selectedProject]);

  useEffect(() => {
    if (selectedPlan && !filteredProducts.some((p) => p.name === selectedPlan)) {
      setSelectedPlan("");
    }
  }, [filteredProducts, selectedPlan]);

  // ─── Validation ───────────────────────────────────────────────
  const nameStatus = useMemo(() => {
    if (!clusterName.trim()) return { ok: false, msg: "Required" };
    if (clusterName.length > 20) return { ok: false, msg: "Max 20 chars" };
    if (clusters?.some((c) => c.cluster_name === clusterName))
      return { ok: false, msg: "Already exists" };
    try {
      kubernetesClusterSchema.shape.name.parse(clusterName);
      return { ok: true, msg: "Available" };
    } catch (e) {
      if (e instanceof z.ZodError) return { ok: false, msg: e.errors[0].message };
      return { ok: false, msg: "Invalid" };
    }
  }, [clusterName, clusters]);

  const valid = {
    user: role === "admin" ? !!selectedUser : true,
    name: nameStatus.ok,
    location: !!selectedLocation,
    version: !!selectedVersion,
    nodes: nodeCount >= 1 && nodeCount <= 10,
    plan: !!selectedPlan,
    project: !!selectedProject,
  };
  const allValid = Object.values(valid).every(Boolean);
  const canSubmit = allValid && termsAccepted && !isLoading;

  // ─── Cost calculation ─────────────────────────────────────────
  const planMonthly = selectedProductObj?.price ?? 0;
  const nodesMonthly = planMonthly * nodeCount;
  const totalMonthly = nodesMonthly; // (no HA add-on wired yet)
  const totalHourly = totalMonthly / 730;

  // ─── Submit ───────────────────────────────────────────────────
  const onSubmit = async () => {
    if (!canSubmit) {
      if (!termsAccepted) {
        toast.error("Please accept the terms of service");
      } else {
        toast.error("Complete every section before deploying");
      }
      return;
    }
    const targetUserId = role === "admin" ? selectedUser : userId;
    if (!targetUserId || !selectedProductObj?.slug) {
      toast.error("Invalid selection");
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.post("/services/kubernetes/clusters/init", {
        name: clusterName,
        region: selectedLocation,
        version: selectedVersion,
        nodeCount,
        size: selectedProductObj.slug,
        ownerId: targetUserId,
        projectId: selectedProject,
        planId: selectedProductObj.id,
        resources: {
          cpu: selectedProductObj.resources.cpu,
          ram: selectedProductObj.resources.ram,
          storage: selectedProductObj.resources.storage,
        },
      });
      const settled = response as typeof response & {
        error?: unknown;
        data?: { message?: string; clusterId?: string };
      };
      if (settled.error) return;
      if (settled.status === 200) {
        toast.info("Kubernetes cluster creation started");
        if (role === "admin") {
          router.push("/dashboard/admin/kubernetes");
        } else {
          const id = settled.data?.clusterId;
          router.push(
            id
              ? `/dashboard/services/kubernetes/clusters/${encodeURIComponent(id)}`
              : "/dashboard/services/kubernetes"
          );
        }
        return;
      }
      toast.error(settled.data?.message || "Failed to initialize cluster");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to initialize cluster");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)" }}
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

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9 max-w-[1560px] mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard/services/kubernetes"
          className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors mb-5`}
        >
          ← Back to clusters
        </Link>

        {/* Title */}
        <h1 className="text-[44px] sm:text-[52px] leading-[1] tracking-[-0.025em] text-white font-semibold">
          Provision{" "}
          <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
            a cluster
          </span>
        </h1>
        <p className={`${MONO} mt-3 max-w-2xl text-[12px] text-white/45 leading-relaxed`}>
          Managed control plane · automatic upgrades · kubectl-ready in ~4 minutes
        </p>

        {/* Body */}
        <div className="mt-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-6">
          {/* Left: sections */}
          <div className="space-y-4">
            {/* 01 — Admin: user (only when admin role) */}
            {role === "admin" && (
              <Section num="01" title="User" description="Cluster owner for billing + IAM." status={valid.user ? "Ready" : "Pick a user"} ok={valid.user}>
                <Field label="Search user">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="email or username…"
                    className={`${MONO} h-9 w-full px-3 border border-white/[0.08] bg-[#0d0e11] text-[12px] text-white placeholder:text-white/30 outline-none focus:border-white/25 rounded-[5px]`}
                  />
                </Field>
                <div className="mt-3 max-h-[200px] overflow-y-auto border border-white/[0.06] bg-[#0d0e11] rounded-[5px]">
                  {filteredUsers.length === 0 ? (
                    <p className={`${MONO} px-3 py-2.5 text-[11.5px] text-white/40`}>No users match.</p>
                  ) : (
                    filteredUsers.map((u) => {
                      const sel = selectedUser === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSelectedUser(u.id)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]"
                          style={sel ? { background: ACCENT_DIM } : {}}
                        >
                          <span className="text-[12.5px] text-white truncate">{u.email}</span>
                          {sel && <span className={`${MONO} text-[10px] uppercase tracking-[0.12em]`} style={{ color: ACCENT }}>Selected</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </Section>
            )}

            {/* Identity */}
            <Section
              num={role === "admin" ? "02" : "01"}
              title="Cluster identity"
              description="A name for your dashboard and kubeconfig context."
              status={valid.name ? "Valid" : nameStatus.msg}
              ok={valid.name}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Field
                  label="Cluster name"
                  hint="required"
                  helper={
                    <span className="flex items-center gap-2">
                      <span>Lowercase · numbers · hyphens · 1–20 chars</span>
                      {clusterName && (
                        <span
                          className="ml-auto inline-flex items-center gap-1"
                          style={{ color: nameStatus.ok ? "#4ade80" : "#f87171" }}
                        >
                          {nameStatus.ok ? "✓" : "✕"} {nameStatus.msg}
                        </span>
                      )}
                    </span>
                  }
                >
                  <input
                    type="text"
                    value={clusterName}
                    onChange={(e) => setClusterName(e.target.value)}
                    placeholder="prod-eu-1"
                    className={`${MONO} h-9 w-full px-3 border border-white/[0.08] bg-[#0d0e11] text-[12.5px] text-white placeholder:text-white/30 outline-none focus:border-white/25 rounded-[5px]`}
                  />
                </Field>
              </div>
              <div className="mt-2.5">
                <Field label="Description" hint="optional">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this cluster runs, who owns it…"
                    rows={2}
                    className="w-full px-3 py-2 border border-white/[0.08] bg-[#0d0e11] text-[12.5px] text-white placeholder:text-white/30 outline-none focus:border-white/25 resize-y rounded-[5px]"
                  />
                </Field>
              </div>
            </Section>

            {/* Region */}
            <Section
              num={role === "admin" ? "03" : "02"}
              title="Region"
              description="Where the control plane and default node pool will be deployed."
              status={valid.location ? (locations.find((l) => l.short === selectedLocation)?.city ?? "Selected") : "Pick a region"}
              ok={valid.location}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {locations.map((loc) => {
                  const sel = selectedLocation === loc.short;
                  return (
                    <button
                      key={loc.short}
                      type="button"
                      onClick={() => loc.short && setSelectedLocation(loc.short)}
                      className="text-left p-3 border rounded-[5px] transition-all"
                      style={
                        sel
                          ? {
                              borderColor: ACCENT,
                              background:
                                "linear-gradient(135deg, #0d0e11 0%, rgba(0,149,255,0.06) 100%)",
                              boxShadow: `0 0 0 1px ${ACCENT}, 0 6px 18px rgba(0,149,255,0.08)`,
                            }
                          : { borderColor: "rgba(255,255,255,0.06)", background: "#0d0e11" }
                      }
                      onMouseEnter={(e) => {
                        if (sel) return;
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                        e.currentTarget.style.background = "#16181d";
                      }}
                      onMouseLeave={(e) => {
                        if (sel) return;
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                        e.currentTarget.style.background = "#0d0e11";
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`${MONO} text-[11px] font-semibold tracking-[0.06em] text-white/70`}>
                          {(loc.short ?? "").toUpperCase()}
                        </span>
                        <span className={`${MONO} inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.14em] text-emerald-300/85`}>
                          <span className="h-1 w-1 rounded-full bg-emerald-400" />
                          Ready
                        </span>
                      </div>
                      <div className="text-[13px] font-semibold text-white tracking-[-0.01em] truncate">
                        {loc.city}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Version */}
            <Section
              num={role === "admin" ? "04" : "03"}
              title="Kubernetes version"
              description="Choose your control-plane version. Patch upgrades happen during maintenance windows."
              status={selectedVersion ? `v${selectedVersion}` : "Pick a version"}
              ok={valid.version}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {versions.map((v, idx) => {
                  const sel = selectedVersion === v;
                  const tag = idx === 0 ? "Stable" : idx === 1 ? "LTS" : "EOL soon";
                  const tagColor = idx === 0 ? "#4ade80" : idx === 1 ? ACCENT : "#fbbf24";
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSelectedVersion(v)}
                      aria-pressed={sel}
                      className={`text-left p-3 border rounded-[5px] transition-all cursor-pointer ${
                        sel
                          ? ""
                          : "border-white/[0.06] bg-[#0d0e11] hover:border-white/25 hover:bg-white/[0.04]"
                      }`}
                      style={
                        sel
                          ? {
                              borderColor: ACCENT,
                              background:
                                "linear-gradient(135deg, #0d0e11 0%, rgba(0,149,255,0.06) 100%)",
                              boxShadow: `0 0 0 1px ${ACCENT}, 0 6px 18px rgba(0,149,255,0.08)`,
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <span
                          style={SERIF_STYLE}
                          className="text-[20px] leading-none font-bold tabular-nums tracking-[-0.02em] text-white"
                        >
                          v{v.split(".").slice(0, 2).join(".")}
                        </span>
                        <span
                          className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold border px-1.5 py-px`}
                          style={{
                            color: tagColor,
                            borderColor: `${tagColor}40`,
                            background: `${tagColor}10`,
                          }}
                        >
                          {tag}
                        </span>
                      </div>
                      <p className={`${MONO} text-[10.5px] text-white/40`}>
                        Patch v{v}
                      </p>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Node pool */}
            <Section
              num={role === "admin" ? "05" : "04"}
              title="Node pool"
              description="Worker nodes run your pods. Add more pools after creation for GPU workloads or isolated tenants."
              status={
                valid.plan && valid.nodes
                  ? `${nodeCount} × ${selectedProductObj?.slug ?? ""}`
                  : "Pick a size"
              }
              ok={valid.plan && valid.nodes}
            >
              {/* Tier toggle */}
              <div className="inline-flex border border-white/[0.06] bg-[#0d0e11] p-1 mb-3 rounded-[5px]">
                {CPU_TYPES.map((t) => {
                  const sel = selectedCpuType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSelectedCpuType(t.value)}
                      className="px-3 py-1.5 text-[11.5px] transition-colors"
                      style={
                        sel
                          ? { background: "#ededee", color: "#08090b", fontWeight: 500 }
                          : { color: "rgba(255,255,255,0.55)", background: "transparent" }
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Count stepper */}
              <div className="mb-3">
                <Field label="Node count" hint={`${nodeCount} of 10 max`}>
                  <div className="inline-flex items-center border border-white/[0.08] bg-[#0d0e11] w-fit rounded-[5px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setNodeCount(Math.max(1, nodeCount - 1))}
                      className="w-9 h-9 text-white/65 hover:text-white hover:bg-white/[0.04] transition-colors"
                    >
                      −
                    </button>
                    <span
                      style={SERIF_STYLE}
                      className="px-5 h-9 inline-flex items-center justify-center min-w-[48px] text-[16px] font-bold tabular-nums text-white border-x border-white/[0.08]"
                    >
                      {nodeCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setNodeCount(Math.min(10, nodeCount + 1))}
                      className="w-9 h-9 text-white/65 hover:text-white hover:bg-white/[0.04] transition-colors"
                    >
                      +
                    </button>
                  </div>
                </Field>
              </div>

              {/* Size grid */}
              <Field label="Node sizing">
                {filteredProducts.length === 0 ? (
                  <div className="border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[12px] text-amber-200/85 rounded-[5px]">
                    No {selectedCpuType} plans available. Switch tier or contact admin.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {filteredProducts.map((p) => {
                      const sel = selectedPlan === p.name;
                      const cpu = p.resources?.cpu ?? "?";
                      const ram = p.resources?.ram ?? "?";
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => p.name && setSelectedPlan(p.name)}
                          aria-pressed={sel}
                          className={`text-left p-3 border rounded-[5px] transition-all cursor-pointer ${
                            sel
                              ? ""
                              : "border-white/[0.06] bg-[#0d0e11] hover:border-white/25 hover:bg-white/[0.04]"
                          }`}
                          style={
                            sel
                              ? {
                                  borderColor: BORDER_ACCENT,
                                  background: ACCENT_DIM,
                                  boxShadow: `0 0 0 1px ${BORDER_ACCENT}`,
                                }
                              : undefined
                          }
                        >
                          <div className={`${MONO} text-[10.5px] font-semibold tracking-[0.04em] text-white/65 mb-1.5 truncate`}>
                            {p.slug ?? p.name}
                          </div>
                          <div className={`${MONO} text-[11.5px] text-white tabular-nums`}>
                            {cpu} vCPU · {ram} GB
                          </div>
                          <div className={`${MONO} mt-2 text-[10.5px] text-white/45 tabular-nums`}>
                            ${(p.price ?? 0).toFixed(0)}/mo
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>
            </Section>

            {/* Project */}
            <Section
              num={role === "admin" ? "06" : "05"}
              title="Project"
              description="Resource group for IAM, billing, and quota tracking."
              status={valid.project ? (projects.find((p) => p.id === selectedProject)?.name ?? "Selected") : "Pick a project"}
              ok={valid.project}
            >
              {filteredProjects.length === 0 ? (
                <div className={`${MONO} border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[11.5px] text-amber-200/85 rounded-[5px]`}>
                  No projects available{role === "admin" ? " for this user" : ""}. Create one first.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredProjects.map((p) => {
                    const sel = selectedProject === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProject(p.id)}
                        aria-pressed={sel}
                        className={`flex items-center justify-between gap-2 p-3.5 border rounded-[6px] text-left transition-all cursor-pointer ${
                          sel
                            ? ""
                            : "border-white/[0.08] bg-[#0d0e11] hover:border-white/25 hover:bg-white/[0.04]"
                        }`}
                        style={
                          sel
                            ? {
                                borderColor: ACCENT,
                                background:
                                  "linear-gradient(135deg, #0d0e11 0%, rgba(0,149,255,0.06) 100%)",
                                boxShadow: `0 0 0 1px ${ACCENT}, 0 6px 18px rgba(0,149,255,0.08)`,
                              }
                            : undefined
                        }
                      >
                        <span className="text-[13px] font-medium text-white truncate">{p.name}</span>
                        {/* Always-visible radio so it reads as a selectable option */}
                        <span
                          aria-hidden
                          className="h-4 w-4 rounded-full shrink-0 relative transition-colors"
                          style={{
                            border: `${sel ? 1.5 : 1}px solid ${sel ? ACCENT : "rgba(255,255,255,0.28)"}`,
                          }}
                        >
                          {sel && (
                            <span
                              className="absolute inset-[3px] rounded-full block"
                              style={{ background: ACCENT, boxShadow: `0 0 6px rgba(0,149,255,0.6)` }}
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Terms */}
            <label className={`${MONO} flex items-center gap-2.5 text-[11.5px] text-white/60 cursor-pointer select-none px-1`}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#0095FF]"
              />
              I accept the{" "}
              <Link href="/terms" className="underline" style={{ color: ACCENT }}>
                terms of service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline" style={{ color: ACCENT }}>
                privacy policy
              </Link>
              .
            </label>
          </div>

          {/* Right summary */}
          <aside className="xl:sticky xl:top-6 xl:self-start space-y-3">
            <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[6px] overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                <div className="min-w-0">
                  <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35`}>
                    Configuration
                  </p>
                  <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-white">
                    Your{" "}
                    <span style={SERIF_STYLE} className="text-white/55 font-normal">
                      cluster
                    </span>
                  </h3>
                </div>
                <span
                  className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold`}
                  style={{ color: allValid ? "#4ade80" : ACCENT }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: allValid ? "#4ade80" : ACCENT,
                      boxShadow: allValid ? "0 0 6px #4ade80" : `0 0 6px ${ACCENT}`,
                    }}
                  />
                  {allValid ? "Ready" : "Draft"}
                </span>
              </header>

              <div className="px-5 py-3">
                <SumRow label="Name" value={clusterName} mono />
                <SumRow
                  label="Region"
                  value={locations.find((l) => l.short === selectedLocation)?.city ?? ""}
                />
                <SumRow label="Version" value={selectedVersion ? `v${selectedVersion}` : ""} mono />
                <SumRow label="Tier" value={CPU_TYPES.find((t) => t.value === selectedCpuType)?.label} />
                <SumRow label="Node size" value={selectedProductObj?.slug ?? ""} mono />
                <SumRow
                  label="Nodes"
                  value={selectedProductObj ? `${nodeCount} × ${selectedProductObj.slug ?? ""}` : ""}
                  mono
                />
                {selectedProductObj && (
                  <SumRow
                    label="Total capacity"
                    value={`${(selectedProductObj.resources?.cpu ?? 0) * nodeCount} vCPU · ${
                      (selectedProductObj.resources?.ram ?? 0) * nodeCount
                    } GB`}
                    mono
                  />
                )}
                <SumRow label="Project" value={projects.find((p) => p.id === selectedProject)?.name} />
              </div>

              {/* Cost block */}
              <div className="border-t border-white/[0.06] bg-[#08090b] px-5 py-4">
                <div className="flex items-baseline justify-between mb-2">
                  <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35`}>
                    Monthly cost
                  </p>
                  <p className={`${MONO} text-[10.5px] text-white/45 tabular-nums`}>
                    ${totalHourly.toFixed(3)}/hr
                  </p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span style={SERIF_STYLE} className="text-[18px] text-white/55 font-medium">
                    $
                  </span>
                  <span
                    style={SERIF_STYLE}
                    className="text-[34px] leading-none text-white font-bold tracking-[-0.03em] tabular-nums"
                  >
                    {totalMonthly.toFixed(2)}
                  </span>
                  <span className={`${MONO} ml-1.5 text-[11px] text-white/45`}>/mo</span>
                </div>
                {selectedProductObj && (
                  <div className={`${MONO} mt-3 pt-3 border-t border-white/[0.06] space-y-1 text-[10.5px] text-white/45 tabular-nums`}>
                    <div className="flex justify-between">
                      <span>
                        {nodeCount} × {selectedProductObj.slug ?? "node"}
                      </span>
                      <span className="text-white/75">${nodesMonthly.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="border-t border-white/[0.06] p-3">
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!canSubmit}
                  className={`${MONO} w-full inline-flex items-center justify-center gap-2.5 py-3.5 text-[12px] uppercase tracking-[0.16em] font-semibold transition-all disabled:cursor-not-allowed disabled:bg-[#111216] disabled:text-white/30 rounded-[5px]`}
                  style={
                    !canSubmit
                      ? {}
                      : {
                          background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                          color: "#ffffff",
                          boxShadow:
                            "0 12px 32px rgba(0,149,255,0.30), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }
                  }
                  onMouseEnter={(e) => {
                    if (!canSubmit) return;
                    e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow =
                      "0 16px 40px rgba(0,149,255,0.40), inset 0 1px 0 rgba(255,255,255,0.2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!canSubmit) return;
                    e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow =
                      "0 12px 32px rgba(0,149,255,0.30), inset 0 1px 0 rgba(255,255,255,0.15)";
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
                      <span aria-hidden>→</span>
                    </>
                  )}
                </button>
                <p className={`${MONO} mt-2.5 text-center text-[10px] text-white/35 tracking-[0.04em]`}>
                  Ready in ~4 minutes · billed by second
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default NewClusterForm;

// ─── Subcomponents ───────────────────────────────────────────────

function Section({
  num,
  title,
  description,
  status,
  ok,
  children,
}: {
  num: string;
  title: string;
  description?: string;
  status?: string;
  ok?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      <header className="border-b border-white/[0.06] px-5 py-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
            {num} · {title}
          </p>
          <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
          {description && <p className="mt-1 text-[12px] text-white/45 max-w-2xl">{description}</p>}
        </div>
        {status && (
          <span
            className={`${MONO} shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold`}
            style={{ color: ok ? "#4ade80" : "rgba(255,255,255,0.4)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: ok ? "#4ade80" : "rgba(255,255,255,0.25)",
                boxShadow: ok ? "0 0 6px rgba(74,222,128,0.5)" : "none",
              }}
            />
            {status}
          </span>
        )}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  helper,
  children,
}: {
  label: string;
  hint?: string;
  helper?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/45`}>
          {label}
        </span>
        {hint && <span className={`${MONO} text-[9.5px] text-white/30`}>{hint}</span>}
      </div>
      {children}
      {helper && <div className={`${MONO} text-[10.5px] text-white/40 mt-1`}>{helper}</div>}
    </div>
  );
}

function SumRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  const empty = !value;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-white/[0.06] last:border-b-0">
      <span className={`${MONO} text-[10.5px] uppercase tracking-[0.04em] text-white/40`}>
        {label}
      </span>
      <span
        className={`text-[11.5px] text-right truncate max-w-[180px] ${mono ? MONO : ""} ${
          empty ? "text-white/25 italic" : "text-white/85"
        }`}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}
