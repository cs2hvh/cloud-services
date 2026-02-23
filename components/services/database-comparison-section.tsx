"use client";

import { motion } from "motion/react";
import { Container } from "@/components/ui/container";
import { Check, Minus } from "lucide-react";

const ENGINES = [
  {
    name: "PostgreSQL",
    color: "#336791",
    type: "Relational",
    bestFor: "Complex queries, ACID compliance, GIS",
    versions: "14, 15, 16",
    maxStorage: "16 TB",
    maxConnections: "10,000",
    replication: true,
    readReplicas: true,
    pitr: true,
    extensions: true,
    jsonSupport: true,
  },
  {
    name: "MongoDB",
    color: "#47A248",
    type: "Document",
    bestFor: "Flexible schemas, real-time analytics",
    versions: "6.0, 7.0",
    maxStorage: "8 TB",
    maxConnections: "5,000",
    replication: true,
    readReplicas: true,
    pitr: true,
    extensions: false,
    jsonSupport: true,
  },
  {
    name: "MySQL",
    color: "#4479A1",
    type: "Relational",
    bestFor: "Web apps, CMS, read-heavy workloads",
    versions: "8.0, 8.4",
    maxStorage: "16 TB",
    maxConnections: "10,000",
    replication: true,
    readReplicas: true,
    pitr: true,
    extensions: false,
    jsonSupport: true,
  },
  {
    name: "Redis",
    color: "#DC382D",
    type: "Key-Value",
    bestFor: "Caching, sessions, pub/sub, queues",
    versions: "7.0, 7.2",
    maxStorage: "512 GB",
    maxConnections: "65,000",
    replication: true,
    readReplicas: true,
    pitr: false,
    extensions: false,
    jsonSupport: true,
  },
];

const BOOL_FEATURES: { key: keyof (typeof ENGINES)[0]; label: string }[] = [
  { key: "replication", label: "Replication" },
  { key: "readReplicas", label: "Read Replicas" },
  { key: "pitr", label: "Point-in-Time Recovery" },
  { key: "extensions", label: "Extensions / Plugins" },
  { key: "jsonSupport", label: "JSON Support" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export default function DatabaseComparisonSection() {
  return (
    <section className="relative w-full py-16 lg:py-24 overflow-hidden bg-gradient-to-b from-black via-[#060810] to-black">
      {/* Background glows */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[#0095FF]/[0.05] rounded-full blur-[180px]" />
        <div className="absolute bottom-[-100px] right-[-200px] w-[500px] h-[500px] bg-[#336791]/[0.04] rounded-full blur-[140px]" />
      </div>

      <Container>
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Compare{" "}
            <span className="text-[#0095FF]">Database Engines</span>
          </h2>
          <p className="mt-4 text-sm lg:text-base leading-[1.7] text-white/65 max-w-2xl mx-auto">
            Choose the right engine for your workload. All engines include managed infrastructure, automated backups, and monitoring.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          variants={fadeUp}
          className="overflow-x-auto"
        >
          <div className="min-w-[640px]">
            {/* Header row */}
            <div className="grid grid-cols-5 mb-1">
              <div className="p-4 text-[11px] font-medium text-white/45 uppercase tracking-wider">
                Feature
              </div>
              {ENGINES.map((engine) => (
                <div
                  key={engine.name}
                  className="p-4 text-center"
                >
                  <span
                    className="text-[14px] font-medium"
                    style={{ color: engine.color }}
                  >
                    {engine.name}
                  </span>
                  <span className="block text-[10px] text-white/40 uppercase tracking-wider mt-0.5">
                    {engine.type}
                  </span>
                </div>
              ))}
            </div>

            {/* Best For row */}
            <div className="grid grid-cols-5 bg-white/[0.03] rounded-sm">
              <div className="p-4 text-[12px] text-white/60 font-medium">
                Best For
              </div>
              {ENGINES.map((engine) => (
                <div
                  key={engine.name}
                  className="p-4 text-[11px] text-white/55 text-center leading-[1.5]"
                >
                  {engine.bestFor}
                </div>
              ))}
            </div>

            {/* Versions row */}
            <div className="grid grid-cols-5 mt-px">
              <div className="p-4 text-[12px] text-white/60 font-medium">
                Versions
              </div>
              {ENGINES.map((engine) => (
                <div
                  key={engine.name}
                  className="p-4 text-[12px] text-white/60 text-center tabular-nums"
                >
                  {engine.versions}
                </div>
              ))}
            </div>

            {/* Max Storage row */}
            <div className="grid grid-cols-5 bg-white/[0.03] rounded-sm mt-px">
              <div className="p-4 text-[12px] text-white/60 font-medium">
                Max Storage
              </div>
              {ENGINES.map((engine) => (
                <div
                  key={engine.name}
                  className="p-4 text-[13px] text-white/75 text-center font-medium tabular-nums"
                >
                  {engine.maxStorage}
                </div>
              ))}
            </div>

            {/* Max Connections row */}
            <div className="grid grid-cols-5 mt-px">
              <div className="p-4 text-[12px] text-white/60 font-medium">
                Max Connections
              </div>
              {ENGINES.map((engine) => (
                <div
                  key={engine.name}
                  className="p-4 text-[13px] text-white/75 text-center font-medium tabular-nums"
                >
                  {engine.maxConnections}
                </div>
              ))}
            </div>

            {/* Boolean feature rows */}
            {BOOL_FEATURES.map((feature, fi) => (
              <div
                key={feature.key}
                className={`grid grid-cols-5 mt-px ${fi % 2 === 0 ? "bg-white/[0.03] rounded-sm" : ""}`}
              >
                <div className="p-4 text-[12px] text-white/60 font-medium">
                  {feature.label}
                </div>
                {ENGINES.map((engine) => {
                  const val = engine[feature.key];
                  return (
                    <div
                      key={engine.name}
                      className="p-4 flex items-center justify-center"
                    >
                      {val ? (
                        <div className="w-6 h-6 rounded-full bg-[#0095FF]/[0.12] flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-[#0095FF]" />
                        </div>
                      ) : (
                        <Minus className="w-4 h-4 text-white/20" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </motion.div>

        <div className="mt-8 text-center">
          <p className="text-[13px] text-white/40">
            All engines include SSL encryption, automated backups, monitoring dashboards, and 24/7 infrastructure management.
          </p>
        </div>
      </Container>
    </section>
  );
}
