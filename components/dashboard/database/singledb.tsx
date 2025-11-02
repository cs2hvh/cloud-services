"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  // Database,
  Loader2,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import api from "@/lib/axios/axios";
import { Tables } from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "./tabs/overview-tab";
import { NetworkTab } from "./tabs/network-tab";
import { UsersDbsTab } from "./tabs/users-dbs-tab";
import { SettingsTab } from "./tabs/settings-tab";

interface SingleDbProps {
  databaseId: string;
  status: string;
}

const Singledb = ({ databaseId }: SingleDbProps) => {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  
  const [database, setDatabase] = useState<Tables<"database_clusters"> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionTab, setConnectionTab] = useState<"public" | "private">("public");
  const [activeTab, setActiveTab] = useState<string>(tabParam || "overview");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownOnlineToast = useRef<boolean>(false);
  const previousStatus = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  // Fetch database cluster details
  const fetchDatabaseCluster = useCallback(async () => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log("⚠️ Fetch already in progress, skipping...");
      return;
    }

    try {
      debugger
      isFetchingRef.current = true;
      console.log("🔄 Fetching database cluster...");
      
      const response = await api.post(`/services/database/read/`, {
        id: databaseId,
        checkStatus: true, // Backend will check DO and update Supabase
      });

      if (response.status === 200) {
        const dbData = response.data.data;

        // Debug: Log the structure to identify object issues
        console.log("📊 [Frontend] Database Data received:", dbData);
        console.log("📊 [Frontend] Status from API:", dbData.status, "Type:", typeof dbData.status);
        console.log("📊 [Frontend] Previous status:", previousStatus.current);

        setDatabase(dbData);
        setLoading(false);

        // Check if status changed to online
        const wasCreating = previousStatus.current === "creating";
        const isNowOnline = dbData.status === "online";

        console.log(`📊 [Frontend] wasCreating: ${wasCreating}, isNowOnline: ${isNowOnline}`);

        // If database is now online, stop polling and show toast
        if (isNowOnline) {
          console.log("✅ [Frontend] Database is online, stopping polling");
          
          // Stop polling
          if (intervalRef.current) {
            console.log("🛑 [Frontend] Clearing polling interval");
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          } else {
            console.log("⚠️ [Frontend] No interval to clear (already stopped)");
          }

          // Show toast only if status changed from creating to online
          if (wasCreating && !hasShownOnlineToast.current) {
            toast.success("Database cluster is now online!");
            hasShownOnlineToast.current = true;
          }
        } else {
          console.log(`ℹ️ [Frontend] Database status is "${dbData.status}", polling continues`);
        }
        
        // Update previous status
        previousStatus.current = dbData.status;
        console.log(`📊 [Frontend] Updated previousStatus.current to: "${dbData.status}"`);

        return dbData.status; // Return status for use in useEffect
      }
    } catch (error: any) {
      console.error("[fetchDatabaseCluster] Error:", error);
      toast.error(
        error.response?.data?.error || "Failed to fetch database details"
      );
      setLoading(false);
    } finally {
      isFetchingRef.current = false;
    }
  }, [databaseId]); // ✅ Only databaseId needed

  // Initial load and status polling
  useEffect(() => {
    // Initial fetch
    const initializePolling = async () => {
      console.log("🚀 [Frontend] Initializing polling...");
      const currentStatus = await fetchDatabaseCluster();
      
      console.log(`📊 [Frontend] Initial status after fetch: "${currentStatus}"`);
      
      // Only set up polling if the database is not already online
      if (currentStatus !== "online") {
        console.log("⏱️ [Frontend] Database is not online, starting polling every 60s...");
        intervalRef.current = setInterval(() => {
          console.log("🔄 [Frontend] Polling interval fired, fetching database status...");
          fetchDatabaseCluster();
        }, 60000); // 1 minute
      } else {
        console.log("✅ [Frontend] Database is already online, skipping polling setup");
      }
    };

    initializePolling();

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        console.log("🧹 [Frontend] Component unmounting, clearing interval");
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []); // ✅ Proper dependency

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
          window.location.href = "/dashboard/services/database";
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
    <div className="min-h-[calc(100vh-4rem)] bg-black py-4 px-4 ">
      
      <div className="mx-auto max-w-6xl space-y-6 mb-6">
        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Tab Navigation */}
            <div className="rounded-xl bg-black shadow-md p-1.5 mb-6">
              <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-transparent p-0 h-auto">
                <TabsTrigger 
                  value="overview" 
                  className="text-sm sm:text-base font-semibold py-2.5 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-black text-white hover:bg-white/10 transition-all border-0"
                >
                  Overview
                </TabsTrigger>
                {
                  database.status==='online' &&
                  <>
                  <TabsTrigger 
                  value="network" 
                  className="text-sm sm:text-base font-semibold py-2.5 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-black text-white hover:bg-white/10 transition-all border-0"
                >
                  Network
                </TabsTrigger>
                <TabsTrigger 
                  value="users-dbs" 
                  className="text-sm sm:text-base font-semibold py-2.5 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-black text-white hover:bg-white/10 transition-all border-0"
                >
                  Users & DBs
                </TabsTrigger>
                <TabsTrigger 
                  value="settings" 
                  className="text-sm sm:text-base font-semibold py-2.5 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-black text-white hover:bg-white/10 transition-all border-0"
                >
                  Settings
                </TabsTrigger>
                  </>
                }
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
              <SettingsTab 
                database={database}
                onDatabaseUpdate={fetchDatabaseCluster}
              />
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
