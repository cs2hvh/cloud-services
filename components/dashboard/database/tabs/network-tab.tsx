"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Shield,
  Globe,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { network_rules } from "@/lib/supabase/types";

interface NetworkTabProps {
  clusterId: string;
  databaseId: string;
  initialNetworkRules?: network_rules;
  onRulesUpdate?: () => void;
}

interface FirewallRule {
  uuid: string;
  cluster_uuid: string;
  type: string;
  value: string;
  created_at: string;
}

export const NetworkTab = ({
  clusterId,
  databaseId,
  initialNetworkRules,
  onRulesUpdate,
}: NetworkTabProps) => {
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRule, setAddingRule] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newIpAddress, setNewIpAddress] = useState("");
  const [ipError, setIpError] = useState("");

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{
    show: boolean;
    rule: FirewallRule | null;
    confirmText: string;
  }>({ show: false, rule: null, confirmText: "" });
  const [deletingRule, setDeletingRule] = useState(false);

  // Validate IPv4 address
  const validateIP = (ip: string): boolean => {
    const ipv4Regex =
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  };

  // Fetch network rules
  const fetchNetworkRules = async () => {
    try {
        debugger
      setLoading(true);
      const response = await api.post("/services/database/network/read", {
        id: clusterId,
      });

      if (response.status === 200) {
        setRules(response.data.data || []);
      }
    } catch (error: any) {
      console.error("[fetchNetworkRules] Error:", error);
      toast.error(
        error.response?.data?.error || "Failed to fetch network rules"
      );
    } finally {
      setLoading(false);
    }
  };

  // Refresh rules
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNetworkRules();
    if (onRulesUpdate) {
      onRulesUpdate();
    }
    setRefreshing(false);
    toast.success("Network rules refreshed!");
  };

  // Add new IP address rule
  const handleAddRule = async () => {
    // Validate IP
    const trimmedIp = newIpAddress.trim();
    if (!trimmedIp) {
      setIpError("Please enter an IP address");
      return;
    }

    if (!validateIP(trimmedIp)) {
      setIpError("Please enter a valid IPv4 address (e.g., 192.168.1.1)");
      return;
    }

    // Check for duplicates
    if (rules.some((rule) => rule.value === trimmedIp)) {
      setIpError("This IP address is already in the firewall rules");
      return;
    }

    setAddingRule(true);
    setIpError("");

    try {
      const response = await api.post("/services/database/network/update", {
        id: databaseId,
        ip_address: trimmedIp,
      });

      if (response.status === 200) {
        toast.success("IP address added successfully!");
        setNewIpAddress("");
        await fetchNetworkRules();
        if (onRulesUpdate) {
          onRulesUpdate();
        }
      }
    } catch (error: any) {
      console.error("[handleAddRule] Error:", error);
      toast.error(
        error.response?.data?.error || "Failed to add IP address to firewall"
      );
    } finally {
      setAddingRule(false);
    }
  };

  // Delete rule (Note: This will need a backend endpoint to delete specific rules)
  const handleDeleteRule = async () => {
    if (!deleteModal.rule) return;

    if (deleteModal.confirmText !== deleteModal.rule.value) {
      toast.error("IP address does not match!");
      return;
    }

    setDeletingRule(true);

    try {
      // Filter out the rule to delete and update with remaining rules
      const remainingRules = rules.filter(
        (rule) => rule.uuid !== deleteModal.rule?.uuid
      );

      // For now, we'll need to update all remaining rules
      // This is a workaround until we have a dedicated delete endpoint
      toast.info(
        "Delete functionality requires backend update endpoint for specific rules"
      );

      // Close modal
      setDeleteModal({ show: false, rule: null, confirmText: "" });
    } catch (error: any) {
      console.error("[handleDeleteRule] Error:", error);
      toast.error(
        error.response?.data?.error || "Failed to delete firewall rule"
      );
    } finally {
      setDeletingRule(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (initialNetworkRules?.rules) {
      setRules(initialNetworkRules.rules);
      setLoading(false);
    } else {
      fetchNetworkRules();
    }
  }, [clusterId]);

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Loading state
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-12 flex items-center justify-center"
      >
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading network rules...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Refresh Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20">
              <Shield className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Firewall Rules</h3>
              <p className="text-slate-400 text-sm">
                Manage trusted IP addresses for database access
              </p>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-white/10 hover:bg-white/20 text-white border-0"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Add New IP Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Plus className="h-5 w-5 text-blue-400" />
          <h4 className="text-lg font-semibold text-white">
            Add IP Address
          </h4>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="e.g., 192.168.1.1"
              value={newIpAddress}
              onChange={(e) => {
                setNewIpAddress(e.target.value);
                setIpError("");
              }}
              disabled={addingRule}
              className={`bg-slate-800 border ${
                ipError ? "border-red-500" : "border-slate-700"
              } text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !addingRule) {
                  handleAddRule();
                }
              }}
            />
            {ipError && (
              <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {ipError}
              </p>
            )}
          </div>
          <Button
            onClick={handleAddRule}
            disabled={addingRule}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            {addingRule ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </>
            )}
          </Button>
        </div>
        <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-sm text-slate-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <span>
              Add trusted IP addresses to allow secure connections to your
              database. Only connections from these IPs will be permitted.
            </span>
          </p>
        </div>
      </motion.div>

      {/* Rules List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {rules.length === 0 ? (
          <div className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="mx-auto w-16 h-16 rounded-full bg-slate-500/20 flex items-center justify-center mb-6">
                <Network className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                No Firewall Rules
              </h3>
              <p className="text-slate-400">
                Add IP addresses above to allow secure database connections.
                Your database is currently not accessible from any IP address.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {rules.map((rule, index) => (
                <motion.div
                  key={rule.uuid}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-xl bg-white/5 shadow-lg ring-1 ring-white/10 p-5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-blue-400" />
                      <span className="text-xs font-medium text-blue-400 uppercase">
                        {rule.type}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        setDeleteModal({ show: true, rule, confirmText: "" })
                      }
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 transition-colors"
                      title="Delete Rule"
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </button>
                  </div>
                  <div className="mb-3">
                    <p className="text-lg font-mono font-semibold text-white break-all">
                      {rule.value}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(rule.created_at)}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModal.show && deleteModal.rule && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() =>
              !deletingRule &&
              setDeleteModal({ show: false, rule: null, confirmText: "" })
            }
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
                    Delete Firewall Rule
                  </h3>
                  <p className="text-slate-400 text-sm">
                    This will remove the IP address from trusted sources. The
                    database will no longer accept connections from this IP.
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Type{" "}
                  <span className="font-bold font-mono text-white">
                    {deleteModal.rule.value}
                  </span>{" "}
                  to confirm
                </label>
                <Input
                  type="text"
                  value={deleteModal.confirmText}
                  onChange={(e) =>
                    setDeleteModal({
                      ...deleteModal,
                      confirmText: e.target.value,
                    })
                  }
                  placeholder="Enter IP address"
                  disabled={deletingRule}
                  className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() =>
                    setDeleteModal({ show: false, rule: null, confirmText: "" })
                  }
                  disabled={deletingRule}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteRule}
                  disabled={
                    deleteModal.confirmText !== deleteModal.rule.value ||
                    deletingRule
                  }
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                >
                  {deletingRule ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
