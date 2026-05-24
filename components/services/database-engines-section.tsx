"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Check } from "lucide-react";

import { Container } from "@/components/ui/container";

type EngineDefinition = {
  key: string;
  name: string;
  family: string;
  version: string;
  image: string;
  logoStyle: "icon" | "wordmark";
  accent: string;
  fit: string;
  summary: string;
  bestFit: string;
  signal: string;
  quickFacts: Array<{ label: string; value: string }>;
  workloads: string[];
  managedFeatures: string[];
};

const ENGINES: EngineDefinition[] = [
  {
    key: "postgresql",
    name: "PostgreSQL",
    family: "Relational",
    version: "16",
    image: "/images/database-logos/postgresql.png",
    logoStyle: "icon",
    accent: "#8ecaff",
    fit: "Application core",
    summary: "Transactional systems and structured app data with mature SQL features.",
    bestFit: "SaaS, APIs, account systems, and complex application schemas.",
    signal: "Best for relational data patterns and feature-rich queries.",
    quickFacts: [
      { label: "Topology", value: "Primary + replicas" },
      { label: "Recovery", value: "Point in time" },
      { label: "Storage", value: "NVMe-backed" },
    ],
    workloads: ["ACID", "JSONB", "pgvector", "PostGIS"],
    managedFeatures: ["Read replicas", "Connection pooling", "Private network", "Automated backups"],
  },
  {
    key: "mysql",
    name: "MySQL",
    family: "Relational",
    version: "8.4",
    image: "/images/database-logos/mysql.svg",
    logoStyle: "wordmark",
    accent: "#93c5fd",
    fit: "Web scale",
    summary: "High-volume SQL operations with familiar relational behavior.",
    bestFit: "Commerce, CMS, user portals, and read-heavy websites.",
    signal: "Best for predictable relational workloads with proven web stack adoption.",
    quickFacts: [
      { label: "Topology", value: "HA deployment" },
      { label: "Recovery", value: "Daily + PITR" },
      { label: "Storage", value: "Hot standby" },
    ],
    workloads: ["Commerce", "CMS", "Read scale", "InnoDB"],
    managedFeatures: ["Failover ready", "Backup windows", "Private access", "Version upgrades"],
  },
  {
    key: "mongodb",
    name: "MongoDB",
    family: "Document",
    version: "7.0",
    image: "/images/database-logos/mongodb.png",
    logoStyle: "wordmark",
    accent: "#86efac",
    fit: "Flexible product data",
    summary: "Evolving schemas and flexible content models without constant migrations.",
    bestFit: "Catalogs, profiles, content platforms, and rapidly changing models.",
    signal: "Best for schema flexibility and frequent product iterations.",
    quickFacts: [
      { label: "Topology", value: "Replica set" },
      { label: "Recovery", value: "Snapshot restore" },
      { label: "Storage", value: "Shard-ready" },
    ],
    workloads: ["Documents", "Catalogs", "Events", "Aggregation"],
    managedFeatures: ["Replica management", "Backup policy", "Metrics + alerts", "Network controls"],
  },
  {
    key: "redis",
    name: "Redis",
    family: "In-memory",
    version: "7.2",
    image: "/images/database-logos/redis.png",
    logoStyle: "wordmark",
    accent: "#fca5a5",
    fit: "Low-latency data",
    summary: "Sub-microsecond latency for caching, queues, and sessions.",
    bestFit: "Session state, cache layers, job queues, and real-time responses.",
    signal: "Best when speed is the first priority.",
    quickFacts: [
      { label: "Topology", value: "Primary + replica" },
      { label: "Recovery", value: "Snapshot + AOF" },
      { label: "Storage", value: "Memory-first" },
    ],
    workloads: ["Caching", "Sessions", "Queues", "Pub/Sub"],
    managedFeatures: ["Automated failover", "Persistence modes", "Private endpoints", "Live metrics"],
  },
];

export default function DatabaseEnginesSection() {
  const [activeKey, setActiveKey] = useState("postgresql");
  const active = ENGINES.find((engine) => engine.key === activeKey) ?? ENGINES[0];

  return (
    <section id="engines" className="relative overflow-hidden bg-black py-16 lg:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.05),transparent_22%),radial-gradient(circle_at_80%_8%,rgba(0,149,255,0.1),transparent_22%),linear-gradient(180deg,#000000_0%,#06080d_52%,#000000_100%)]" />
      </div>

      <Container>
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-[400] leading-[1.02] tracking-tight text-white sm:text-4xl lg:text-[4rem]">
                Pick a database by
                <span className="block text-[#8ecaff]">workload, not branding</span>
              </h2>
            </div>

            <p className="max-w-md text-sm leading-7 text-white/52 lg:text-[15px]">
              Each engine maps to a different product shape. Start with the data pattern, then choose the database that fits the operating model.
            </p>
          </div>

          <div className="mt-12 grid gap-3 lg:grid-cols-4">
            {ENGINES.map((engine) => {
              const isActive = engine.key === active.key;

              return (
                <button
                  key={engine.key}
                  type="button"
                  onClick={() => setActiveKey(engine.key)}
                  className={`group relative overflow-hidden border text-left transition-all duration-300 ${
                    isActive
                      ? "border-white/16 bg-white/[0.07] shadow-[0_18px_40px_rgba(0,0,0,0.34)]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
                  }`}
                >
                  {isActive ? (
                    <>
                      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: engine.accent }} />
                      <motion.div
                        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/14 to-transparent blur-xl"
                        animate={{ x: ["-20%", "320%"] }}
                        transition={{ duration: 3.8, repeat: Number.POSITIVE_INFINITY, repeatDelay: 1.2, ease: "easeInOut" }}
                      />
                    </>
                  ) : null}

                  <div className="relative flex items-start gap-4 px-4 py-4">
                    <div
                      className={`flex shrink-0 items-center justify-center ${
                        engine.logoStyle === "wordmark" ? "h-12 w-24" : "h-12 w-12"
                      }`}
                    >
                      <Image
                        src={engine.image}
                        alt={engine.name}
                        width={engine.logoStyle === "wordmark" ? 140 : 72}
                        height={engine.logoStyle === "wordmark" ? 42 : 72}
                        className={`object-contain ${
                          engine.logoStyle === "wordmark" ? "h-auto w-full max-w-[92px]" : "h-10 w-10"
                        } ${isActive ? "opacity-100" : "opacity-85 grayscale-[0.15]"}`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[18px] font-medium tracking-tight text-white">{engine.name}</div>
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">
                        {engine.fit}
                      </div>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/32">
                        {engine.family} {" • "}v{engine.version}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <motion.div
            key={active.key}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="relative mt-8 overflow-hidden border border-white/[0.08] bg-[#07090d] shadow-[0_26px_70px_rgba(0,0,0,0.42)]"
          >
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/16 to-transparent" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(0,149,255,0.08),transparent_20%),radial-gradient(circle_at_18%_76%,rgba(255,255,255,0.05),transparent_18%)]" />
            </div>

            <div className="relative grid gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,1.02fr)_340px] xl:gap-10">
              <div>
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="border border-white/[0.1] bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        {active.fit}
                      </span>
                      <span
                        className="border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70"
                        style={{
                          borderColor: `${active.accent}33`,
                          backgroundColor: `${active.accent}12`,
                        }}
                      >
                        {active.family} {" • "}v{active.version}
                      </span>
                    </div>

                    <h3 className="mt-5 text-[2rem] font-[400] leading-[1.02] tracking-tight text-white sm:text-[2.7rem]">
                      {active.name}
                    </h3>
                    <p className="mt-4 max-w-xl text-[16px] leading-8 text-white/72">{active.summary}</p>
                  </div>

                  <div className="flex items-center justify-center py-6">
                    <Image
                      src={active.image}
                      alt={active.name}
                      width={active.logoStyle === "wordmark" ? 320 : 180}
                      height={active.logoStyle === "wordmark" ? 120 : 180}
                      className={`object-contain ${
                        active.logoStyle === "wordmark"
                          ? "h-auto w-full max-w-[220px] sm:max-w-[240px]"
                          : "h-28 w-28 sm:h-32 sm:w-32"
                      }`}
                    />
                  </div>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {active.quickFacts.map((fact) => (
                    <div
                      key={fact.label}
                      className="border border-white/[0.08] bg-white/[0.03] px-4 py-4"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                        {fact.label}
                      </div>
                      <div className="mt-2 text-[16px] font-medium tracking-tight text-white">{fact.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                      Why this engine
                    </div>
                    <p className="mt-3 text-[14px] leading-7 text-white/68">{active.signal}</p>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                      Best fit
                    </div>
                    <p className="mt-3 text-[14px] leading-7 text-white/68">{active.bestFit}</p>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                    Workload signals
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {active.workloads.map((workload) => (
                      <span
                        key={workload}
                        className="border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/68"
                      >
                        {workload}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-5">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,149,255,0.08),transparent_32%)]" />

                <div className="relative flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">
                      Managed by default
                    </div>
                    <div className="mt-2 text-[15px] tracking-tight text-white/84">
                      Operational guardrails around the engine
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-white/34" />
                </div>

                <div className="relative mt-5 space-y-4">
                  {active.managedFeatures.map((feature, index) => (
                    <div key={feature} className="relative">
                      {index !== active.managedFeatures.length - 1 ? (
                        <div className="absolute left-[16px] top-10 h-[calc(100%+8px)] w-px bg-white/[0.08]" />
                      ) : null}

                      <div className="flex items-start gap-4">
                        <div
                          className="relative flex h-8 w-8 shrink-0 items-center justify-center border"
                          style={{
                            borderColor: `${active.accent}33`,
                            backgroundColor: `${active.accent}12`,
                          }}
                        >
                          <Check className="h-4 w-4" style={{ color: active.accent }} />
                        </div>

                        <div className="pt-1">
                          <div className="text-[13px] leading-6 text-white/78">{feature}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="relative mt-6 border-t border-white/[0.08] pt-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                    What this means
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-white/60">
                    Teams choose the database for the shape of the workload, then inherit the backup, failover, and networking posture they would otherwise have to build themselves.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
