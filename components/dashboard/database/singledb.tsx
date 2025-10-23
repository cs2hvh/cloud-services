"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
  HardDrive,
  Cpu,
  MapPin,
  Copy,
  Eye,
  EyeOff,
  Download,
  Shield,
  Globe,
  Lock,
  DollarSign,
  RefreshCw,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Database_Connection, Tables } from "@/lib/supabase/types";
import { UUID } from "crypto";
// import api from "@/lib/axios";

// interface DatabaseCluster {
//   id: string;
//   do_database_id: string;
//   name: string;
//   engine: string;
//   version: string;
//   status: "online" | "creating" | "failed";
//   num_nodes: number;
//   size: string;
//   region: string;
//   connection_host: string;
//   connection_port: number;
//   connection_database: string;
//   connection_username: string;
//   connection_password: string;
//   connection_uri: string;
//   connection_ssl: boolean;
//   private_connection_host?: string;
//   private_connection_port?: number;
//   private_connection_uri?: string;
//   created_at: string;
//   monthly_cost?: number;
// }

interface SingleDbProps {
  databaseId: string;
}

const Singledb = ({ databaseId }: SingleDbProps) => {
  const [database, setDatabase] = useState<Tables<"database_clusters"> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"public" | "private">("public");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  // const [statusCheckInterval, setStatusCheckInterval] = useState<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownOnlineToast = useRef<boolean>(false); // Track if we've shown the toast
  const previousStatus = useRef<string | null>(null); // Track previous status

  // Fetch database cluster details
  const fetchDatabaseCluster = useCallback(async () => {
    try {
      // debugger;
      const response = await api.post(`/services/database/read/`, {
        id: databaseId,
        checkStatus: true, // Backend will check DO and update Supabase
      });

      if (response.status === 200) {
        const dbData = response.data.data;

        // Debug: Log the structure to identify object issues
        console.log("Database Data:", dbData);
        console.log("Public Connection:", dbData.public_connection);
        console.log("Private Connection:", dbData.private_connection);
        console.log("Region:", dbData.region);

        setDatabase(dbData);
        setLoading(false);

        // If backend detected status changed to online, update and stop polling
        // Also check if status actually changed from a non-online status
        if (response.data.status && intervalRef.current && previousStatus.current !== "online") {
          clearInterval(intervalRef.current);
          intervalRef.current = null;

          // Update backend with new status
          await updateDatabaseStatus(
            dbData.cluster_id,
            dbData.status,
            dbData.public_connection,
            dbData.private_connection
          );

          // Fetch updated data after backend update completes
          await fetchDatabaseCluster();

          // Only show toast if we haven't shown it yet
          if (!hasShownOnlineToast.current) {
            toast.success("Database cluster is now online!");
            hasShownOnlineToast.current = true;
          }
        }
        
        // Update previous status
        previousStatus.current = dbData.status;
      }
    } catch (error: any) {
      console.error("[fetchDatabaseCluster] Error:", error);
      toast.error(
        error.response?.data?.error || "Failed to fetch database details"
      );
      setLoading(false);
    }
  }, [databaseId]); // ✅ Only databaseId needed

  // Update database status in backend
  const updateDatabaseStatus = async (
    dbId: string,
    status: string,
    publicConnection: Database_Connection,
    privateConnection: Database_Connection
  ) => {
    try {
      await api.post(`/services/database/update_status`, {
        id: dbId,
        status,
        public_connection: publicConnection,
        private_connection: privateConnection,
      });
    } catch (error) {
      console.error("[updateDatabaseStatus] Error:", error);
    }
  };

  // Initial load and status polling
  useEffect(() => {
    // Initial fetch
    fetchDatabaseCluster();

    // Set up polling interval (check every 60 seconds)
    intervalRef.current = setInterval(() => {
      fetchDatabaseCluster();
    }, 60000); // 1 minute

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchDatabaseCluster]); // ✅ Proper dependency

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  // Delete database cluster
  const handleDeleteCluster = async () => {
    if (deleteConfirmText !== database?.name) {
      toast.error("Cluster name does not match!");
      return;
    }

    setIsDeleting(true);
    try {
      const response = await api.post(`/services/database/delete`, {
        id: database?.cluster_id,
      });

      if (response.status === 200) {
        toast.success("Database cluster deleted successfully!");
        setShowDeleteModal(false);
        // Redirect to databases list after a short delay
        setTimeout(() => {
          window.location.href = "/dashboard/services?tab=databases";
        }, 1500);
      }
    } catch (error: any) {
      console.error("[handleDeleteCluster] Error:", error);
      toast.error(
        error.response?.data?.error || "Failed to delete database cluster"
      );
    } finally {
      setIsDeleting(false);
    }
  };

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

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading database cluster...</p>
        </div>
      </div>
    );
  }

  if (!database) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-black flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-white text-lg">Database cluster not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black py-10 px-4">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Database className="h-8 w-8 text-blue-400" />
              <h1 className="text-2xl sm:text-3xl font-bold text-white break-all">{database.name}</h1>
            </div>
            <p className="text-slate-400 mt-1 text-sm sm:text-base">
              {database.engine.toUpperCase()} {database.version} •{" "}
              {database.num_nodes} node(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
           
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 transition-colors"
              title="Delete Cluster"
            >
              <Trash2 className="h-5 w-5 text-red-400" />
            </button>
          </div>
        </motion.div>

        {/* Section 1: Database Cluster Status */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6"
        >
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-400" />
            Cluster Status
          </h2>
          <StatusBadge status={database.status} />
        </motion.section>

        {/* Show content based on status */}
        <AnimatePresence mode="wait">
          {database.status === "creating" && (
            <motion.div
              key="creating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
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
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl bg-red-500/10 border-2 border-red-500/30 shadow-lg p-12 text-center"
            >
              <XCircle className="h-16 w-16 text-red-500 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-white mb-3">
                Cluster Creation Failed
              </h3>
              <p className="text-slate-300 text-lg mb-6">
                There was an error creating your database cluster. Please
                contact support or try again later.
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
                key="connection"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6"
              >
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-400" />
                  Connection Details
                </h2>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setActiveTab("public")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === "public"
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 text-slate-400 hover:bg-white/20"
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                    Public Connection
                  </button>
                  {database.private_connection && (
                    <button
                      onClick={() => setActiveTab("private")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                        activeTab === "private"
                          ? "bg-blue-500 text-white"
                          : "bg-white/10 text-slate-400 hover:bg-white/20"
                      }`}
                    >
                      <Lock className="h-4 w-4" />
                      Private Connection
                    </button>
                  )}
                </div>

                {/* Connection Info */}
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
                    value={safeStringValue(
                      database.public_connection?.password
                    )}
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
                  <ConnectionField
                    label="Database"
                    value={safeStringValue(
                      database.public_connection?.database
                    )}
                    onCopy={() =>
                      copyToClipboard(
                        safeStringValue(database.public_connection?.database),
                        "Database"
                      )
                    }
                  />
                  <ConnectionField
                    label="SSL Mode"
                    value={
                      database.public_connection?.ssl ? "require" : "disable"
                    }
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
              </motion.section>

              {/* Section 3: Configuration */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6"
              >
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Server className="h-5 w-5 text-purple-400" />
                  Configuration
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <ConfigCard
                    icon={Cpu}
                    label="vCPU"
                    value={extractCpu(database.size)}
                    color="text-blue-400"
                  />
                  <ConfigCard
                    icon={Database}
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

              {/* Section 4: CA Certificate */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6"
              >
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-yellow-400" />
                  CA Certificate
                </h2>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <p className="text-slate-300 mb-4">
                      Download the CA certificate to establish secure SSL
                      connections to your database cluster.
                    </p>
                    <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
                      <p className="text-slate-400 text-sm font-mono mb-2">
                        Usage example:
                      </p>
                      <code className="text-green-400 text-xs block">
                        {`psql "sslmode=require sslrootcert=ca-certificate.crt host=${safeStringValue(database.public_connection?.host)} port=${safeStringValue(database.public_connection?.port)} user=${safeStringValue(database.public_connection?.user)} dbname=${safeStringValue(database.public_connection?.database)}"`}
                      </code>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => downloadCACertificate(database.cluster_id,database.ca_certificate)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download CA Certificate
                  </button>
                 
                </div>
              </motion.section>

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
        </AnimatePresence>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {showDeleteModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => !isDeleting && setShowDeleteModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-slate-900 rounded-2xl border-2 border-red-500/30 shadow-2xl max-w-md w-full p-6"
              >
                <div className="flex items-start gap-4 mb-6">
                  <div className="p-3 rounded-full bg-red-500/20">
                    <AlertCircle className="h-6 w-6 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">
                      Delete Database Cluster
                    </h3>
                    <p className="text-slate-400 text-sm">
                      This action cannot be undone. This will permanently delete
                      the database cluster and all its data.
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Type <span className="font-bold text-white">{database?.name}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Enter cluster name"
                    disabled={isDeleting}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteConfirmText("");
                    }}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteCluster}
                    disabled={deleteConfirmText !== database?.name || isDeleting}
                    className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Helper Components

interface ConnectionFieldProps {
  label: string;
  value: string;
  isPassword?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  onCopy?: () => void;
  multiline?: boolean;
}

const ConnectionField = ({
  label,
  value,
  isPassword,
  showPassword,
  onTogglePassword,
  onCopy,
  multiline,
}: ConnectionFieldProps) => {
  return (
    <div className="bg-slate-900/50 rounded-lg p-4">
      <label className="text-slate-400 text-sm font-medium block mb-2">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type={isPassword && !showPassword ? "password" : "text"}
          value={value}
          readOnly
          className={`flex-1 bg-transparent text-white font-mono text-sm border-0 outline-none ${
            multiline ? "overflow-x-auto" : ""
          }`}
        />
        <div className="flex items-center gap-2">
          {isPassword && onTogglePassword && (
            <button
              onClick={onTogglePassword}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-slate-400" />
              ) : (
                <Eye className="h-4 w-4 text-slate-400" />
              )}
            </button>
          )}
          {onCopy && (
            <button
              onClick={onCopy}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Copy className="h-4 w-4 text-slate-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ConfigCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}

const ConfigCard = ({ icon: Icon, label, value, color }: ConfigCardProps) => {
  return (
    <div className="bg-slate-900/50 rounded-lg p-4 text-center">
      <Icon className={`h-6 w-6 ${color} mx-auto mb-2`} />
      <p className="text-slate-400 text-sm mb-1">{label}</p>
      <p className="text-white font-bold text-lg">{value}</p>
    </div>
  );
};

// Helper Functions

const safeStringValue = (value: any): string => {
  if (!value) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  // Handle objects with address or family properties
  if (typeof value === "object") {
    return value.address || value.family || JSON.stringify(value);
  }
  return String(value);
};

const extractCpu = (size: string): string => {
  const match = size.match(/(\d+)vcpu/);
  return match ? `${match[1]} vCPU` : "N/A";
};

const extractRam = (size: string): string => {
  const match = size.match(/(\d+)gb/);
  return match ? `${match[1]} GB` : "N/A";
};

const extractDisk = (size: string): string => {
  // DigitalOcean doesn't include disk in size string, use lookup table
  const diskMap: Record<string, string> = {
    "db-s-1vcpu-1gb": "10 GB",
    "db-s-1vcpu-2gb": "25 GB",
    "db-s-2vcpu-4gb": "38 GB",
    "db-s-4vcpu-8gb": "115 GB",
    "db-s-6vcpu-16gb": "270 GB",
    "db-s-8vcpu-32gb": "580 GB",
  };
  return diskMap[size] || "N/A";
};

const extractRegion = (region: string | undefined): string => {
  if (!region) return "N/A";

  // If region is already a string, return it
  if (typeof region === "string") {
    // Check if it's a JSON string
    try {
      const parsed = JSON.parse(region);
      return parsed?.address || parsed?.family || region;
    } catch {
      // Not JSON, return as is
      return region;
    }
  }

  // If it's an object (shouldn't happen based on types, but handle it)
  return (region as any)?.address || (region as any)?.family || "N/A";
};

const calculateMonthlyCost = (size: string): string => {
  // Pricing based on DigitalOcean's managed database pricing
  const priceMap: Record<string, number> = {
    "db-s-1vcpu-1gb": 15,
    "db-s-1vcpu-2gb": 30,
    "db-s-2vcpu-4gb": 60,
    "db-s-4vcpu-8gb": 120,
    "db-s-6vcpu-16gb": 240,
    "db-s-8vcpu-32gb": 480,
  };
  return (priceMap[size] || 0).toFixed(2);
};

const downloadCACertificate = async (databaseId: UUID | undefined, ca_certificate: string | undefined) => {
  try {
    if (!ca_certificate) {
      toast.error("CA Certificate not available");
      return;
    }

    console.log("=== CA Certificate Download Debug ===");
    console.log("Original certificate (first 100 chars):", ca_certificate.substring(0, 100));
    console.log("Certificate length:", ca_certificate.length);
    
    let formattedCert = ca_certificate;
    
    // Check if the certificate is Base64 encoded (no PEM headers, only base64 characters)
    const isBase64Only = !ca_certificate.includes('-----BEGIN CERTIFICATE-----') && 
                         /^[A-Za-z0-9+/=\s]+$/.test(ca_certificate.trim());
    
    if (isBase64Only) {
      console.log("✓ Detected Base64-encoded certificate, decoding...");
      try {
        // Decode Base64 to get the actual PEM certificate
        const decodedCert = atob(ca_certificate.trim());
        formattedCert = decodedCert;
        console.log("✓ Successfully decoded Base64 certificate");
        console.log("Decoded certificate (first 200 chars):", decodedCert.substring(0, 200));
      } catch (decodeError) {
        console.error("❌ Failed to decode Base64:", decodeError);
        toast.error("Failed to decode certificate");
        return;
      }
    } else {
      console.log("Certificate is not Base64-only, checking for other encodings...");
      
      // Handle escaped newlines
      if (ca_certificate.includes('\\n')) {
        formattedCert = ca_certificate.replace(/\\n/g, '\n');
        console.log("✓ Replaced escaped \\n with actual newlines");
      }
      
      // Handle double-escaped newlines
      if (ca_certificate.includes('\\\\n')) {
        formattedCert = formattedCert.replace(/\\\\n/g, '\n');
        console.log("✓ Replaced double-escaped \\\\n with actual newlines");
      }
      
      // Handle URL-encoded newlines
      if (ca_certificate.includes('%0A')) {
        formattedCert = formattedCert.replace(/%0A/g, '\n');
        console.log("✓ Replaced URL-encoded newlines");
      }
    }
    
    // Verify certificate has proper PEM format
    const hasPEMHeaders = formattedCert.includes('-----BEGIN CERTIFICATE-----') && 
                          formattedCert.includes('-----END CERTIFICATE-----');
    
    if (!hasPEMHeaders) {
      console.error("❌ Certificate does not have proper PEM format headers");
      console.log("Certificate content (first 500 chars):", formattedCert.substring(0, 500));
      toast.error("Invalid certificate format - missing PEM headers");
      return;
    }
    
    console.log("✓ Certificate has valid PEM headers");
    console.log("Final certificate length:", formattedCert.length);
    console.log("Has actual newlines:", formattedCert.includes('\n'));
    console.log("Number of newlines:", (formattedCert.match(/\n/g) || []).length);
    
    // Ensure the certificate ends with a newline (PEM standard)
    if (!formattedCert.endsWith('\n')) {
      formattedCert += '\n';
      console.log("✓ Added trailing newline");
    }
    
    // Create blob with UTF-8 encoding for proper text handling
    const blob = new Blob([formattedCert], { type: 'application/x-pem-file' });
    console.log("✓ Blob created, size:", blob.size, "bytes");
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ca-certificate-${databaseId}.crt`;
    document.body.appendChild(link);
    link.click();
    
    // Clean up after a small delay to ensure download starts
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log("✓ Download cleanup completed");
    }, 100);

    toast.success("CA Certificate downloaded successfully!");
    console.log("=== Download Complete ===");
  } catch (error) {
    console.error("[downloadCACertificate] Error:", error);
    toast.error("Failed to download CA certificate");
  }
};

export default Singledb;
