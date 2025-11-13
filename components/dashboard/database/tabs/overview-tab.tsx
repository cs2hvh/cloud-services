"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
  HardDrive,
  Cpu,
  MapPin,
  Shield,
  Globe,
  Lock,
  DollarSign,
  RefreshCw,
  Download,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import {
  ConnectionField,
  ConfigCard,
  safeStringValue,
  extractCpu,
  extractRam,
  extractDisk,
  extractRegion,
  downloadCACertificate,
} from "../singledb-helpers";
import { DatabaseIcon } from "../database-icon";

interface OverviewTabProps {
  database: Tables<"database_clusters">;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  activeTab: "public" | "private";
  setActiveTab: (tab: "public" | "private") => void;
  copyToClipboard: (text: string, label: string) => void;
}

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig = {
    online: {
      color: "text-green-400",
      bg: "bg-green-500/20",
      border: "border-green-500",
      icon: CheckCircle2,
      text: "Online",
    },
    creating: {
      color: "text-yellow-400",
      bg: "bg-yellow-500/20",
      border: "border-yellow-500",
      icon: Loader2,
      text: "Creating",
    },
    failed: {
      color: "text-red-400",
      bg: "bg-red-500/20",
      border: "border-red-500",
      icon: XCircle,
      text: "Failed",
    },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.failed;
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${config.border} ${config.bg}`}
    >
      <Icon
        className={`h-5 w-5 ${config.color} ${status === "creating" ? "animate-spin" : ""}`}
      />
      <span className={`font-semibold ${config.color}`}>{config.text}</span>
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
  return (
    <div className="space-y-6">
      {/* Header with Database Info */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-4"
      >
        {/* Left Section - Icon */}
        <div className="p-2 border border-slate-600 rounded-full">
          <DatabaseIcon engine={database.engine} className="h-6 w-6" />
        </div>

        {/* Right Section - Contents */}
        <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white mb-2">
              {database.name}
            </h1>
           
            <p className="text-slate-400 text-sm mt-1">
              {database.size[11]}GB RAM / {database.size[5]}vCPU / {database.version}/ {database.engine.toUpperCase()} {database.version} •{" "}
              {database.num_nodes} node{database.num_nodes !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center">
            <StatusBadge status={database.status} />
          </div>
        </div>
      </motion.div>

      {/* Show content based on status */}
      {database.status === "creating" && (
        <motion.div
          key="creating"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-12 text-center"
        >
          <Loader2 className="h-16 w-16 text-blue-500 animate-spin mx-auto mb-6" />
          <h3 className="text-2xl font-bold text-white mb-3">
            Creating Your Database Cluster
          </h3>
          <p className="text-slate-400 text-lg mb-6">
            Your database cluster is being provisioned. This may take a few
            minutes.
          </p>
          <div className="flex items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Checking status every minute...</span>
          </div>
        </motion.div>
      )}

      {database.status === "pending" && (
        <motion.div
          key="pending"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl bg-red-500/10 border-2 border-red-500/30 shadow-lg p-12 text-center"
        >
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-6" />
          <h3 className="text-2xl font-bold text-white mb-3">
            Cluster Creation Failed
          </h3>
          <p className="text-slate-300 text-lg mb-6">
            There was an error creating your database cluster. Please contact
            support or try again later.
          </p>
          <button className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-colors">
            Contact Support
          </button>
        </motion.div>
      )}

      {database.status === "online" && (
       <>
  {/* Section 2: Connection Details */}
  <motion.section
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.2 }}
    className="rounded-xl bg-white/5 shadow-lg ring-1 ring-white/10 p-4"
  >
    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
      <Shield className="h-5 w-5 text-green-400" />
      Connection Details
    </h2>

    {/* Tabs */}
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => setActiveTab("public")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
          activeTab === "public"
            ? "bg-white text-black shadow-md"
            : "bg-white/10 text-slate-400 hover:bg-white/20"
        }`}
      >
        <Globe className="h-4 w-4" />
        Public
      </button>
      {database.private_connection && (
        <button
          onClick={() => setActiveTab("private")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
            activeTab === "private"
              ? "bg-white text-black shadow-md"
              : "bg-white/10 text-slate-400 hover:bg-white/20"
          }`}
        >
          <Lock className="h-4 w-4" />
          Private
        </button>
      )}
    </div>

    {/* Connection Info - Two Column Layout */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Section */}
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
      </div>

      {/* Right Section */}
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
  </motion.section>

  {/* Section 3 & 4: Configuration and CA Certificate */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Configuration */}
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl bg-white/5 shadow-lg ring-1 ring-white/10 p-4"
    >
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Server className="h-5 w-5 text-purple-400" />
        Configuration
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <ConfigCard
          icon={Cpu}
          label="vCPU"
          value={extractCpu(database.size)}
          color="text-blue-400"
        />
        <ConfigCard
          icon={Server}
          label="RAM"
          value={extractRam(database.size)}
          color="text-green-400"
        />
        <ConfigCard
          icon={HardDrive}
          label="Disk"
          value={extractDisk(database.size)}
          color="text-purple-400"
        />
        <ConfigCard
          icon={MapPin}
          label="Region"
          value={extractRegion(database.region)}
          color="text-orange-400"
        />
      </div>
    </motion.section>

    {/* CA Certificate */}
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="rounded-xl bg-white/5 shadow-lg ring-1 ring-white/10 p-4"
    >
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-yellow-400" />
        CA Certificate
      </h2>
      <div className="flex flex-col gap-3">
        <p className="text-slate-300 text-sm">
          Download the CA certificate to establish secure SSL connections to your database cluster.
        </p>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-slate-400 text-xs font-mono mb-1">
            Usage example:
          </p>
          <code className="text-green-400 text-xs block break-all">
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
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white text-black hover:bg-gray-100 rounded-lg font-semibold transition-colors"
        >
          <Download className="h-4 w-4" />
          Download Certificate
        </button>
      </div>
    </motion.section>
  </div>

  {/* Section 5: Monthly Cost */}
  <motion.section
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.5 }}
    className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-2 border-blue-500/30 shadow-lg p-6"
  >
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-400" />
          Monthly Cost
        </h2>
        <p className="text-slate-400">
          Estimated cost for this database cluster
        </p>
      </div>
      <div className="text-right">
        <p className="text-4xl font-bold text-white">
          {/* ${database.monthly_cost || calculateMonthlyCost(database.size)} */}
        </p>
        <p className="text-slate-400 text-sm">per month</p>
      </div>
    </div>
  </motion.section>
</>
      )}
    </div>
  );
};
