"use client";

import { motion } from "motion/react";
import {
  Activity,
  GitBranch,
  Lock,
  TimerReset,
} from "lucide-react";

import { Container } from "@/components/ui/container";

const PLATFORM_SIGNALS = [
  {
    icon: TimerReset,
    title: "Backups and recovery stay operational by default",
    description: "Daily snapshots, retention policies, and point-in-time restore are handled at the platform layer.",
  },
  {
    icon: GitBranch,
    title: "Failover and replicas are built into the topology",
    description: "Primary nodes, read replicas, and standby paths are designed as one managed cluster surface.",
  },
  {
    icon: Lock,
    title: "Networking and encryption are part of the deploy path",
    description: "Private access, TLS, and encrypted storage are exposed as product defaults instead of add-ons.",
  },
  {
    icon: Activity,
    title: "Observability ships with the cluster",
    description: "Health signals, lag, storage, and connection behavior are visible without external setup.",
  },
];

const EVENT_STREAM = [
  { label: "Replica sync healthy", detail: "Lag below 50 ms", tone: "blue" },
  { label: "Snapshot policy active", detail: "PITR window protected", tone: "white" },
  { label: "Private network attached", detail: "Ingress locked to trusted sources", tone: "white" },
];

function ClusterNode({
  className,
  eyebrow,
  title,
  detail,
  pulse = false,
}: {
  className: string;
  eyebrow: string;
  title: string;
  detail: string;
  pulse?: boolean;
}) {
  return (
    <motion.div
      className={`absolute border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] px-3 py-3 backdrop-blur-sm ${className}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">
            {eyebrow}
          </div>
          <div className="mt-1 text-[13px] font-medium leading-snug text-white">
            {title}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-white/48">
            {detail}
          </div>
        </div>
        <span
          className={`mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-[#0095FF] shadow-[0_0_18px_rgba(0,149,255,0.5)] ${
            pulse ? "animate-pulse" : ""
          }`}
        />
      </div>
    </motion.div>
  );
}

export default function DatabaseControlPlaneSection() {
  return (
    <section className="relative overflow-hidden bg-black py-16 lg:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.05),transparent_20%),radial-gradient(circle_at_82%_16%,rgba(0,149,255,0.08),transparent_20%),linear-gradient(180deg,#000000_0%,#05070b_48%,#000000_100%)]" />
      </div>

      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/52">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
            Managed Cluster Control Plane
          </span>
          <h2 className="mt-5 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl">
            <span className="text-[#8ecaff]">Managed clusters</span>, not hosted VMs
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/52 lg:text-[15px]">
            Backups, replicas, failover, and private access in one operating layer.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-12">
          <div>
            <div className="space-y-6">
              {PLATFORM_SIGNALS.map((signal) => (
                <div key={signal.title} className="border-b border-white/[0.08] pb-6 last:border-b-0 last:pb-0">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/[0.08] bg-white/[0.03]">
                      <signal.icon className="h-5 w-5 text-[#8ecaff]" />
                    </div>
                    <div>
                      <h3 className="text-[16px] font-medium tracking-tight text-white">{signal.title}</h3>
                      <p className="mt-2 text-[13px] leading-6 text-white/48">{signal.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Backup policy", value: "Daily + PITR" },
                { label: "Replication", value: "Read replicas" },
                { label: "Access model", value: "Private by default" },
              ].map((item) => (
                <div key={item.label} className="border border-white/[0.08] bg-white/[0.02] px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">{item.label}</div>
                  <div className="mt-2 text-[15px] font-medium text-white/84">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              {["Encrypted at rest", "Replica-aware", "Failover ready"].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-white/58"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                  {item}
                </span>
              ))}
            </div>

            <div className="relative mt-5 aspect-[1.22/1] overflow-hidden border border-white/[0.07] bg-[#090b0f]">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
                  backgroundSize: "56px 56px",
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(0,149,255,0.18),transparent_18%),radial-gradient(circle_at_28%_72%,rgba(255,255,255,0.06),transparent_20%)]" />

              <svg
                viewBox="0 0 1000 720"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
                preserveAspectRatio="none"
              >
                {[
                  "M170 145 H370",
                  "M500 190 V330",
                  "M570 368 H760",
                  "M500 420 L220 570",
                  "M620 368 L820 188",
                ].map((path) => (
                  <path
                    key={path}
                    d={path}
                    fill="none"
                    stroke="rgba(142,202,255,0.35)"
                    strokeWidth="2"
                    strokeDasharray="8 10"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="36"
                      to="0"
                      dur="3.2s"
                      repeatCount="indefinite"
                    />
                  </path>
                ))}
              </svg>

              <ClusterNode
                className="left-[6%] top-[10%] w-[27%]"
                eyebrow="Application traffic"
                title="Private clients and services"
                detail="App traffic enters through trusted sources, internal networks, and service identities."
              />
              <ClusterNode
                className="left-[38%] top-[10%] w-[24%]"
                eyebrow="Routing layer"
                title="Connection pooler"
                detail="Manages client sessions and smooths spikes before they hit the primary node."
                pulse
              />
              <ClusterNode
                className="left-[34%] top-[45%] w-[28%]"
                eyebrow="Primary cluster"
                title="Write node"
                detail="Handles transactions, backups, health checks, and coordinated engine operations."
                pulse
              />
              <ClusterNode
                className="left-[70%] top-[42%] w-[24%]"
                eyebrow="Read scaling"
                title="Replica group"
                detail="Replica capacity is exposed for read-heavy apps, analytics, and regional workloads."
              />
              <ClusterNode
                className="left-[8%] top-[72%] w-[29%]"
                eyebrow="Recovery path"
                title="Snapshot and PITR vault"
                detail="Recovery points remain attached to the cluster lifecycle instead of separate scripts."
              />
              <ClusterNode
                className="left-[72%] top-[12%] w-[22%]"
                eyebrow="Observability"
                title="Metrics and alerts"
                detail="Lag, storage, CPU, and replication health stay visible as first-party signals."
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {EVENT_STREAM.map((event) => (
                <div key={event.label} className="border border-white/[0.08] bg-white/[0.02] px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        event.tone === "blue" ? "bg-[#0095FF]" : "bg-white/70"
                      }`}
                    />
                    <div className="text-[12px] font-medium text-white/82">{event.label}</div>
                  </div>
                  <div className="mt-2 text-[11px] leading-5 text-white/42">{event.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
