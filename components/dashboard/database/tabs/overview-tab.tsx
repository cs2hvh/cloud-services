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
} from "../singledb-helpers";

interface OverviewTabProps {
  database: Tables<"database_clusters">;
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
      className={`inline-flex items-center gap-2 border px-3 py-1.5 text-sm font-medium ${config.border} ${config.bg} ${config.color}`}
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
  showPassword,
  setShowPassword,
  activeTab,
  setActiveTab,
  copyToClipboard,
}: OverviewTabProps) => {
  if (database.status === "creating" || database.status === "migrating") {
    return (
      <motion.div
        key="creating"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="border border-white/[0.08] bg-white/[0.03] px-6 py-12 text-center"
      >
        <Loader2 className="mx-auto mb-5 h-14 w-14 animate-spin text-blue-400" />
        <h3 className="text-2xl font-semibold tracking-tight text-white">
          Database cluster is being provisioned
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/45">
          Credentials, networking controls, and operational settings will become
          available once the managed cluster reports a healthy online status.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 text-sm text-white/38">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Checking status every minute
        </div>
      </motion.div>
    );
  }

  if (database.status === "pending") {
    return (
      <motion.div
        key="failed"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="border border-red-400/20 bg-red-500/8 px-6 py-12 text-center"
      >
        <XCircle className="mx-auto mb-5 h-14 w-14 text-red-300" />
        <h3 className="text-2xl font-semibold tracking-tight text-white">
          Cluster requires attention
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/45">
          The database did not finish provisioning successfully. Review the
          request details with your team or contact support before retrying.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-white/[0.08] bg-white/[0.03]"
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
              className={`inline-flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm font-medium transition-colors ${
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
                className={`inline-flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm font-medium transition-colors ${
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
          className="border border-white/[0.08] bg-white/[0.03]"
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
              <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-right">
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
              <div className="border border-white/[0.08] bg-black/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Engine
                </div>
                <div className="mt-1.5 text-sm font-semibold text-white">
                  {database.engine?.toUpperCase()} {database.version}
                </div>
              </div>
              <div className="border border-white/[0.08] bg-black/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Nodes
                </div>
                <div className="mt-1.5 text-sm font-semibold text-white">
                  {database.num_nodes} node{database.num_nodes !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="border border-white/[0.08] bg-black/20 px-4 py-3">
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
              value={
                database.storage_size_mib
                  ? `${Math.round(database.storage_size_mib / 1024)} GB`
                  : "N/A"
              }
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
            className="border border-white/[0.08] bg-white/[0.03]"
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
              <div className="border border-white/[0.08] bg-black/20 p-4">
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
                className="inline-flex cursor-pointer items-center justify-center gap-2 border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
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
