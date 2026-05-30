"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Download,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  HardDrive,
  Cpu,
  MapPin,
  Shield,
  XCircle,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import {
  ConnectionField,
  ConfigCard,
  safeStringValue,
  extractCpu,
  extractRam,
  extractRegion,
  downloadCACertificate,
  getStorageGiB,
} from "../singledb-helpers";

interface OverviewTabProps {
  database: Tables<"database_clusters">;
  products: Tables<"products">[];
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  activeTab: "public" | "private";
  setActiveTab: (tab: "public" | "private") => void;
  copyToClipboard: (text: string, label: string) => void;
}

const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig = {
    online: {
      color: "text-emerald-300",
      bg: "bg-emerald-500/10",
      border: "border-emerald-400/20",
      icon: CheckCircle2,
      text: "Online",
    },
    creating: {
      color: "text-amber-300",
      bg: "bg-amber-500/10",
      border: "border-amber-400/20",
      icon: Loader2,
      text: "Provisioning",
    },
    migrating: {
      color: "text-amber-300",
      bg: "bg-amber-500/10",
      border: "border-amber-400/20",
      icon: Loader2,
      text: "Migrating",
    },
    failed: {
      color: "text-red-300",
      bg: "bg-red-500/10",
      border: "border-red-400/20",
      icon: XCircle,
      text: "Failed",
    },
    pending: {
      color: "text-red-300",
      bg: "bg-red-500/10",
      border: "border-red-400/20",
      icon: XCircle,
      text: "Pending",
    },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.failed;
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium ${config.border} ${config.bg} ${config.color}`}
    >
      <Icon
        className={`h-4 w-4 ${
          status === "creating" || status === "migrating" ? "animate-spin" : ""
        }`}
      />
      {config.text}
    </div>
  );
};

export const OverviewTab = ({
  database,
  products,
  showPassword,
  setShowPassword,
  activeTab,
  setActiveTab,
  copyToClipboard,
}: OverviewTabProps) => {
  const storageGiB = getStorageGiB({
    storageSizeMib: database.storage_size_mib,
    size: database.size,
    products,
  });

  if (database.status === "creating" || database.status === "migrating") {
    const isMigrating = database.status === "migrating";
    return (
      <motion.div
        key="creating"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-6 py-14 text-center"
      >
        {/* ambient glow */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-[60px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.12), transparent 70%)" }}
        />
        {/* glowing icon with a pulsing ring */}
        <div
          className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[16px] border border-[#0095FF]/25 bg-[#0095FF]/[0.08]"
          style={{ boxShadow: "0 0 40px rgba(0,149,255,0.18)" }}
        >
          <Server className="h-7 w-7 text-[#33adff]" />
          <motion.span
            className="absolute inset-0 rounded-[16px] border border-[#0095FF]/40"
            animate={{ opacity: [0.55, 0], scale: [1, 1.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        </div>
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          {isMigrating ? "Migrating your cluster" : "Provisioning your cluster"}
        </h3>
        <p className="mx-auto mt-2.5 max-w-xl text-[13px] leading-6 text-white/45">
          We&apos;re allocating compute, attaching encrypted storage, and configuring private
          networking and TLS. Connection details and controls unlock automatically the moment the
          cluster reports healthy.
        </p>
        {/* indeterminate progress */}
        <div className="relative mx-auto mt-7 h-1 w-full max-w-sm overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full"
            style={{ background: "linear-gradient(90deg, transparent, #0095FF, transparent)" }}
            animate={{ x: ["-110%", "320%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        {/* stages */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {["Compute", "Encrypted storage", "Networking", "TLS"].map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]/70" />
              {s}
            </span>
          ))}
        </div>
        <div className="mt-6 inline-flex items-center gap-2 text-[12px] text-white/35">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Status refreshes automatically every minute
        </div>
      </motion.div>
    );
  }

  if (database.status === "pending") {
    return (
      <motion.div
        key="failed"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[12px] border border-red-400/20 bg-red-500/[0.05] px-6 py-14 text-center"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[16px] border border-red-400/25 bg-red-500/[0.08]">
          <XCircle className="h-7 w-7 text-red-300" />
        </div>
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          Cluster needs attention
        </h3>
        <p className="mx-auto mt-2.5 max-w-xl text-[13px] leading-6 text-white/45">
          This cluster didn&apos;t finish provisioning successfully. Retry from your dashboard, or
          reach out to support if the problem persists.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]"
      >
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
                Access
              </div>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Connection Details
              </h2>
              <p className="mt-1 text-sm leading-6 text-white/45">
                Use the public or private endpoint below to connect application
                workloads, migration tools, or operators.
              </p>
            </div>
            <StatusBadge status={database.status} />
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab("public")}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "public"
                  ? "border-blue-400/25 bg-blue-500/10 text-white"
                  : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
              }`}
            >
              <Globe className="h-4 w-4" />
              Public
            </button>
            {database.private_connection && (
              <button
                onClick={() => setActiveTab("private")}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === "private"
                    ? "border-blue-400/25 bg-blue-500/10 text-white"
                    : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
                }`}
              >
                <Lock className="h-4 w-4" />
                Private
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <ConnectionField
                label="Host"
                value={safeStringValue(
                  activeTab === "public"
                    ? database.public_connection?.host
                    : database.private_connection?.host
                )}
                onCopy={() =>
                  copyToClipboard(
                    safeStringValue(
                      activeTab === "public"
                        ? database.public_connection?.host
                        : database.private_connection?.host
                    ),
                    "Host"
                  )
                }
              />
              <ConnectionField
                label="Port"
                value={safeStringValue(
                  activeTab === "public"
                    ? database.public_connection?.port
                    : database.private_connection?.port
                )}
                onCopy={() =>
                  copyToClipboard(
                    safeStringValue(
                      activeTab === "public"
                        ? database.public_connection?.port
                        : database.private_connection?.port
                    ),
                    "Port"
                  )
                }
              />
              <ConnectionField
                label="Username"
                value={safeStringValue(database.public_connection?.user)}
                onCopy={() =>
                  copyToClipboard(
                    safeStringValue(database.public_connection?.user),
                    "Username"
                  )
                }
              />
              {database.engine !== "mongodb" && (
                <ConnectionField
                  label="Password"
                  value={safeStringValue(database.public_connection?.password)}
                  isPassword
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword(!showPassword)}
                  onCopy={() =>
                    copyToClipboard(
                      safeStringValue(database.public_connection?.password),
                      "Password"
                    )
                  }
                />
              )}
            </div>

            <div className="space-y-3">
              <ConnectionField
                label="Database"
                value={safeStringValue(database.public_connection?.database)}
                onCopy={() =>
                  copyToClipboard(
                    safeStringValue(database.public_connection?.database),
                    "Database"
                  )
                }
              />
              <ConnectionField
                label="SSL Mode"
                value={database.public_connection?.ssl ? "require" : "disable"}
              />
              <ConnectionField
                label="Connection URI"
                value={safeStringValue(
                  activeTab === "public"
                    ? database.public_connection?.uri
                    : database.private_connection?.uri
                )}
                onCopy={() =>
                  copyToClipboard(
                    safeStringValue(
                      activeTab === "public"
                        ? database.public_connection?.uri
                        : database.private_connection?.uri
                    ),
                    "Connection URI"
                  )
                }
                multiline
              />
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]"
        >
          <div className="border-b border-white/[0.06] px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
                  Capacity
                </div>
                <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-white">
                  <Server className="h-5 w-5 text-blue-300" />
                  Service Profile
                </h2>
                <p className="mt-1 text-sm leading-6 text-white/45">
                  Current compute, storage, and regional placement for the
                  managed cluster.
                </p>
              </div>
              <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-right">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Plan Size
                </div>
                <div className="mt-1.5 text-sm font-semibold text-white">
                  {database.size || "Managed"}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[8px] border border-white/[0.08] bg-black/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Engine
                </div>
                <div className="mt-1.5 text-sm font-semibold text-white">
                  {database.engine?.toUpperCase()} {database.version}
                </div>
              </div>
              <div className="rounded-[8px] border border-white/[0.08] bg-black/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Nodes
                </div>
                <div className="mt-1.5 text-sm font-semibold text-white">
                  {database.num_nodes} node{database.num_nodes !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="rounded-[8px] border border-white/[0.08] bg-black/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Region Code
                </div>
                <div className="mt-1.5 text-sm font-semibold text-white">
                  {database.region || "N/A"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
            <ConfigCard
              icon={Cpu}
              label="vCPU"
              value={extractCpu(database.size)}
              color="text-blue-300"
            />
            <ConfigCard
              icon={Server}
              label="RAM"
              value={extractRam(database.size)}
              color="text-emerald-300"
            />
            <ConfigCard
              icon={HardDrive}
              label="Disk"
              value={storageGiB ? `${storageGiB} GiB` : "Managed"}
              color="text-violet-300"
            />
            <ConfigCard
              icon={MapPin}
              label="Region"
              value={extractRegion(database.region)}
              color="text-amber-300"
            />
            </div>
          </div>
        </motion.section>

        {database.engine !== "mongodb" && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]"
          >
            <div className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Shield className="h-5 w-5 text-amber-300" />
                CA Certificate
              </h2>
            </div>
            <div className="space-y-4 px-5 py-5">
              <p className="text-sm leading-6 text-white/45">
                Download the CA certificate to establish secure client
                connections from local machines, CI jobs, or managed
                applications.
              </p>
              <div className="rounded-[8px] border border-white/[0.08] bg-black/20 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Example
                </p>
                <code className="block break-all text-xs leading-6 text-emerald-300">
                  {`psql "sslmode=require sslrootcert=ca-certificate.crt host=${safeStringValue(database.public_connection?.host)} port=${safeStringValue(database.public_connection?.port)}"`}
                </code>
              </div>
              <button
                onClick={() =>
                  downloadCACertificate(
                    database.cluster_id,
                    database.ca_certificate
                  )
                }
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                <Download className="h-4 w-4" />
                Download Certificate
              </button>
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
};
