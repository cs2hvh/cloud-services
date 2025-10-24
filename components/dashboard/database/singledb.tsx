"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Loader2,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Database_Connection, Tables } from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "./tabs/overview-tab";
import { NetworkTab } from "./tabs/network-tab";
import { UsersDbsTab } from "./tabs/users-dbs-tab";
import { SettingsTab } from "./tabs/settings-tab";
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
  status: string;
}

const Singledb = ({ databaseId, status }: SingleDbProps) => {
  const [database, setDatabase] = useState<Tables<"database_clusters"> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionTab, setConnectionTab] = useState<"public" | "private">("public");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownOnlineToast = useRef<boolean>(false);
  const previousStatus = useRef<string | null>(null);

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
        if (response.data.status && intervalRef.current && status !== "online") {
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
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-white text-lg">Database cluster not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black py-10 px-4">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Database className="h-8 w-8 text-blue-400" />
              <h1 className="text-2xl sm:text-3xl font-bold text-white break-all">
                {database.name}
              </h1>
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

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Tab Navigation */}
            <div className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-2 mb-6">
              <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 bg-transparent p-0 h-auto">
                <TabsTrigger 
                  value="overview" 
                  className="text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all border-0"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger 
                  value="network" 
                  className="text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all border-0"
                >
                  Network
                </TabsTrigger>
                <TabsTrigger 
                  value="users-dbs" 
                  className="text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all border-0"
                >
                  Users & DBs
                </TabsTrigger>
                <TabsTrigger 
                  value="settings" 
                  className="text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all border-0"
                >
                  Settings
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab Content */}
            <TabsContent value="overview" className="mt-0">
              <OverviewTab
                database={database}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                activeTab={connectionTab}
                setActiveTab={setConnectionTab}
                copyToClipboard={copyToClipboard}
              />
            </TabsContent>

            <TabsContent value="network" className="mt-0">
              <NetworkTab 
                clusterId={database.cluster_id || ""}
                databaseId={database.cluster_id || ""}
                initialNetworkRules={database.network_rules}
                onRulesUpdate={fetchDatabaseCluster}
              />
            </TabsContent>

            <TabsContent value="users-dbs" className="mt-0">
              <UsersDbsTab clusterId={database.cluster_id || ""} />
            </TabsContent>

            <TabsContent value="settings" className="mt-0">
              <SettingsTab />
            </TabsContent>
          </Tabs>
        </motion.div>

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
                    Type{" "}
                    <span className="font-bold text-white">
                      {database?.name}
                    </span>{" "}
                    to confirm
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
                    disabled={
                      deleteConfirmText !== database?.name || isDeleting
                    }
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

export default Singledb;
