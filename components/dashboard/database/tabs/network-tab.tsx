"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Globe,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { network_rules } from "@/lib/supabase/types";
import { AxiosError } from "axios";

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
  const [deleteModal, setDeleteModal] = useState<{
    show: boolean;
    rule: FirewallRule | null;
    confirmText: string;
  }>({ show: false, rule: null, confirmText: "" });
  const [deletingRule, setDeletingRule] = useState(false);

  const getErrorMessage = (error: unknown, defaultMessage: string): string => {
    if (error instanceof AxiosError) {
      return error.response?.data?.error || defaultMessage;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return defaultMessage;
  };

  const validateIP = (ip: string): boolean => {
    const ipv4Regex =
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  };

  const fetchNetworkRules = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.post("/services/database/network/read", {
        id: clusterId,
      });

      if (response.status === 200) {
        setRules(response.data.data || []);
      }
    } catch (error) {
      console.error("[fetchNetworkRules] Error:", error);
      toast.error(getErrorMessage(error, "Failed to fetch network rules"));
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNetworkRules();
    onRulesUpdate?.();
    setRefreshing(false);
    toast.success("Network rules refreshed!");
  };

  const handleAddRule = async () => {
    const trimmedIp = newIpAddress.trim();

    if (!trimmedIp) {
      setIpError("Please enter an IP address");
      return;
    }

    if (!validateIP(trimmedIp)) {
      setIpError("Please enter a valid IPv4 address (for example 192.168.1.1)");
      return;
    }

    if (rules.some((rule) => rule.value === trimmedIp)) {
      setIpError("This IP address is already on the allowlist");
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
        onRulesUpdate?.();
      }
    } catch (error) {
      console.error("[handleAddRule] Error:", error);
      toast.error(
        getErrorMessage(error, "Failed to add IP address to firewall")
      );
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!deleteModal.rule) return;

    if (deleteModal.confirmText !== deleteModal.rule.value) {
      toast.error("IP address does not match!");
      return;
    }

    setDeletingRule(true);

    try {
      const response = await api.post("/services/database/network/delete", {
        id: databaseId,
        rule_uuid: deleteModal.rule.uuid,
      });

      if (response.status === 200) {
        toast.success("IP address deleted successfully!");
        await fetchNetworkRules();
        onRulesUpdate?.();
        setDeleteModal({ show: false, rule: null, confirmText: "" });
      }
    } catch (error) {
      console.error("[handleDeleteRule] Error:", error);
      toast.error(getErrorMessage(error, "Failed to delete firewall rule"));
    } finally {
      setDeletingRule(false);
    }
  };

  useEffect(() => {
    if (initialNetworkRules?.rules && Array.isArray(initialNetworkRules.rules)) {
      setRules(initialNetworkRules.rules);
      setLoading(false);
    } else {
      fetchNetworkRules();
    }
  }, [fetchNetworkRules, initialNetworkRules]);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const accessState = useMemo(() => {
    if (rules.length === 0) {
      return {
        label: "Open access",
        description: "No allowlist entries are configured yet.",
        tone: "border-amber-400/20 bg-amber-500/10 text-amber-300",
        icon: AlertCircle,
      };
    }

    return {
      label: "Restricted access",
      description: `${rules.length} trusted ${rules.length === 1 ? "address" : "addresses"} configured.`,
      tone: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
      icon: CheckCircle2,
    };
  }, [rules.length]);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-white/[0.08] bg-white/[0.03] px-6 py-12 text-center"
      >
        <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-400" />
        <p className="text-lg font-medium text-white">Loading network rules...</p>
        <p className="mt-2 text-sm text-white/45">
          Retrieving the current access allowlist for this cluster.
        </p>
      </motion.div>
    );
  }

  const AccessIcon = accessState.icon;

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-white/[0.08] bg-white/[0.03]"
      >
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
                Access Policy
              </div>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Network Allowlist
              </h2>
              <p className="mt-1 text-sm leading-6 text-white/45">
                Restrict database connectivity to approved source IP addresses.
                Only listed endpoints can establish public connections.
              </p>
            </div>
            <div
              className={`inline-flex items-center gap-2 border px-3 py-1.5 text-sm font-medium ${accessState.tone}`}
            >
              <AccessIcon className="h-4 w-4" />
              {accessState.label}
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
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
                  className={`h-11 border ${
                    ipError ? "border-red-400/50" : "border-white/[0.12]"
                  } bg-white/[0.04] text-white placeholder:text-white/34 focus:border-blue-400/40 focus:ring-0`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !addingRule) {
                      handleAddRule();
                    }
                  }}
                />
                {ipError && (
                  <p className="mt-1.5 flex items-center gap-1 text-sm text-red-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {ipError}
                  </p>
                )}
              </div>
              <Button
                onClick={handleAddRule}
                disabled={addingRule}
                className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
              >
                {addingRule ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add IP
                  </>
                )}
              </Button>
            </div>

            <div className="border border-white/[0.08] bg-black/20 px-4 py-3">
              <div className="flex items-start gap-2 text-sm leading-6 text-white/48">
                <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-300" />
                <span>
                  Add the IPs used by operators, application servers, CI jobs,
                  or VPN egress points. Avoid broad exposure unless it is
                  absolutely required.
                </span>
              </div>
            </div>
          </div>

          <div className="border border-white/[0.08] bg-white/[0.02] px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
              Policy Summary
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-3">
                <div className="text-sm font-medium text-white/50">Access mode</div>
                <div className="text-right text-sm font-semibold text-white">
                  {accessState.label}
                </div>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-3">
                <div className="text-sm font-medium text-white/50">Trusted IPs</div>
                <div className="text-right text-sm font-semibold text-white">
                  {rules.length}
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm font-medium text-white/50">Enforcement</div>
                <div className="text-right text-sm font-semibold text-white">
                  Immediate
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/42">
              {accessState.description}
            </p>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="border border-white/[0.08] bg-white/[0.03]"
      >
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
              Inventory
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Trusted IP Addresses
            </h2>
            <p className="mt-1 text-sm leading-6 text-white/45">
              Review active allowlist entries and remove any IPs that no longer
              need database access.
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
            size="sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="px-5 py-5">
          {rules.length === 0 ? (
            <div className="border border-white/[0.08] bg-black/20 px-6 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center border border-white/[0.08] bg-white/[0.03] text-white/45">
                <Network className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">
                No trusted IPs configured
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/45">
                The database is currently reachable from any source allowed by
                the provider network policy. Add at least one trusted IP above
                to tighten access.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden border border-white/[0.08]">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_140px_180px_88px] gap-4 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38 md:grid">
                <div>Address</div>
                <div>Type</div>
                <div>Added</div>
                <div className="text-right">Action</div>
              </div>
              <AnimatePresence initial={false}>
                {rules.map((rule, index) => (
                  <motion.div
                    key={rule.uuid}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.03 }}
                    className="border-b border-white/[0.06] last:border-b-0"
                  >
                    <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_140px_180px_88px] md:items-center">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-white/[0.04] text-blue-300">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-semibold text-white break-all">
                            {rule.value}
                          </div>
                          <div className="mt-1 text-xs text-white/38 md:hidden">
                            {formatDate(rule.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-medium uppercase text-white/55">
                        {rule.type}
                      </div>
                      <div className="hidden items-center gap-2 text-sm text-white/45 md:flex">
                        <Clock3 className="h-4 w-4" />
                        {formatDate(rule.created_at)}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() =>
                            setDeleteModal({ show: true, rule, confirmText: "" })
                          }
                          className="inline-flex cursor-pointer items-center gap-2 border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/16"
                          title="Delete IP"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.section>

      <AnimatePresence>
        {deleteModal.show && deleteModal.rule && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() =>
              !deletingRule &&
              setDeleteModal({ show: false, rule: null, confirmText: "" })
            }
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md border border-red-400/20 bg-[#0d1220] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center border border-red-400/20 bg-red-500/10 text-red-300">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">
                    Remove trusted IP
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-white/45">
                    This address will immediately lose permission to connect to
                    the database over public access.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                <label className="block text-sm font-medium text-white">
                  Type <span className="font-mono">{deleteModal.rule.value}</span> to
                  confirm
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
                  className="h-11 border-white/[0.12] bg-white/[0.04] text-white placeholder:text-white/34 focus:border-red-400/35 focus:ring-0"
                />
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  onClick={() =>
                    setDeleteModal({ show: false, rule: null, confirmText: "" })
                  }
                  disabled={deletingRule}
                  className="flex-1 border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteRule}
                  disabled={
                    deleteModal.confirmText !== deleteModal.rule.value ||
                    deletingRule
                  }
                  className="flex-1 bg-red-500 text-white hover:bg-red-600"
                >
                  {deletingRule ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
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
