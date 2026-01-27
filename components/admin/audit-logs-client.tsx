"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { AuditLogTable, type AuditLogEntry } from "@/components/admin/audit-log-table";
import { AuditLogDetailModal } from "@/components/admin/audit-log-detail-modal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Shield, Search, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AuditLogsClientProps {
  initialLogs: AuditLogEntry[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export default function AuditLogsClient({
  initialLogs,
  initialPagination,
}: AuditLogsClientProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Filter states
  const [userId, setUserId] = useState("");
  const [serviceType, setServiceType] = useState("all");
  const [action, setAction] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const [pagination, setPagination] = useState(initialPagination);

  const fetchLogs = async (page: number = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
      });

      if (userId) params.append("user_id", userId);
      if (serviceType !== "all") params.append("service_type", serviceType);
      if (action !== "all") params.append("action", action);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);

      const response = await fetch(`/api/admin/audit-logs?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }

      const data = await response.json();
      setLogs(data.data || []);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast.error("Failed to load audit logs");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogDetails = async (logId: string) => {
    try {
      const response = await fetch(`/api/admin/audit-logs/${logId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch log details");
      }

      const data = await response.json();
      setSelectedLog(data.data);
      setIsDetailModalOpen(true);
    } catch (error) {
      console.error("Error fetching log details:", error);
      toast.error("Failed to load log details");
    }
  };

  const handleSearch = () => {
    fetchLogs(1);
  };

  const handleClearFilters = () => {
    setUserId("");
    setServiceType("all");
    setAction("all");
    setStartDate("");
    setEndDate("");
    fetchLogs(1);
  };

  const handlePageChange = (newPage: number) => {
    fetchLogs(newPage);
  };

  const hasActiveFilters = userId || serviceType !== "all" || action !== "all" || startDate || endDate;

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto"
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <Shield className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Audit Logs
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {pagination.total.toLocaleString()} total logs recorded
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search by user ID..."
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:ring-0"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={isLoading}
              className="bg-neutral-800 hover:bg-neutral-700 text-white border-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className="w-full sm:w-[200px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
                <SelectValue placeholder="Service Type" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-800">
                <SelectItem value="all" className="text-white focus:bg-neutral-800 focus:text-white">
                  All Services
                </SelectItem>
                <SelectItem value="auth" className="text-white focus:bg-neutral-800 focus:text-white">
                  Authentication
                </SelectItem>
                <SelectItem value="database" className="text-white focus:bg-neutral-800 focus:text-white">
                  Database
                </SelectItem>
                <SelectItem value="kubernetes" className="text-white focus:bg-neutral-800 focus:text-white">
                  Kubernetes
                </SelectItem>
                <SelectItem value="platform_apps" className="text-white focus:bg-neutral-800 focus:text-white">
                  Platform Apps
                </SelectItem>
                <SelectItem value="network_ddos" className="text-white focus:bg-neutral-800 focus:text-white">
                  Network/DDoS
                </SelectItem>
                <SelectItem value="object_storage" className="text-white focus:bg-neutral-800 focus:text-white">
                  Object Storage
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-full sm:w-[180px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-800">
                <SelectItem value="all" className="text-white focus:bg-neutral-800 focus:text-white">
                  All Actions
                </SelectItem>
                <SelectItem value="login" className="text-white focus:bg-neutral-800 focus:text-white">
                  Login
                </SelectItem>
                <SelectItem value="logout" className="text-white focus:bg-neutral-800 focus:text-white">
                  Logout
                </SelectItem>
                <SelectItem value="create" className="text-white focus:bg-neutral-800 focus:text-white">
                  Create
                </SelectItem>
                <SelectItem value="update" className="text-white focus:bg-neutral-800 focus:text-white">
                  Update
                </SelectItem>
                <SelectItem value="delete" className="text-white focus:bg-neutral-800 focus:text-white">
                  Delete
                </SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="datetime-local"
              placeholder="Start Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full sm:w-[200px] bg-neutral-900 border-neutral-800 text-white focus:border-neutral-700 focus:ring-0"
            />

            <Input
              type="datetime-local"
              placeholder="End Date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full sm:w-[200px] bg-neutral-900 border-neutral-800 text-white focus:border-neutral-700 focus:ring-0"
            />

            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-[1600px] mx-auto"
      >
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <AuditLogTable
              logs={logs}
              onViewDetails={fetchLogDetails}
              isLoading={isLoading}
            />
          </div>

          {/* Pagination */}
          {!isLoading && logs.length > 0 && pagination.pages > 1 && (
            <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
              <div className="text-sm text-neutral-400">
                Page {pagination.page} of {pagination.pages}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1 || isLoading}
                  className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages || isLoading}
                  className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {!isLoading && logs.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-neutral-400">No audit logs found</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Detail Modal */}
      <AuditLogDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        log={selectedLog}
      />
    </div>
  );
}
