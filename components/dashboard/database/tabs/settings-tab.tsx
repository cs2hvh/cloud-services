"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  // Settings,
  Save,
  X,
  Calendar,
  // Clock,
  MapPin,
  Trash2,
  AlertTriangle,
  Loader2,
  FolderKanban,
  HardDrive,
  // Info,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { toast } from "sonner";
import axios from "axios";
import { useProjects } from "@/app/dashboard/provider";
import { useRouter } from "next/navigation";
import { getDatabaseErrorMessage } from "../error-messages";
import { getStorageGiB } from "../singledb-helpers";

interface SettingsTabProps {
  database: Tables<"database_clusters">;
  onDatabaseUpdate?: () => void;
  products: Tables<"products">[];
}

// Days of the week
const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Time slots (12 AM to 11 PM)
const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, "0");
  return `${hour}:00`;
});

// Available regions for database migration
const REGIONS = [
  { slug: "ams2", name: "Amsterdam 2" },
  { slug: "ams3", name: "Amsterdam 3" },
  { slug: "blr1", name: "Bangalore 1" },
  { slug: "fra1", name: "Frankfurt 1" },
  { slug: "lon1", name: "London 1" },
  { slug: "nyc1", name: "New York 1" },
  { slug: "nyc3", name: "New York 3" },
  { slug: "sfo1", name: "San Francisco 1" },
  { slug: "sfo2", name: "San Francisco 2" },
  { slug: "sfo3", name: "San Francisco 3" },
  { slug: "sgp1", name: "Singapore 1" },
  { slug: "syd1", name: "Sydney 1" },
  { slug: "tor1", name: "Toronto 1" },
];



export const SettingsTab = ({
  database,
  onDatabaseUpdate,
  products,
}: SettingsTabProps) => {
  const { projects } = useProjects();
  const [loading, setLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [isMigrating, setIsMigrating] = useState(database.status === "migrating");
  const [targetRegion, setTargetRegion] = useState(database.region || "");
  const router = useRouter();

  // Update Project State
  const [selectedProject, setSelectedProject] = useState(
    database.project_id || ""
  );

  // Maintenance Window State
  const [maintenanceDay, setMaintenanceDay] = useState("");
  const [maintenanceHour, setMaintenanceHour] = useState("");
  const [currentMaintenanceWindow, setCurrentMaintenanceWindow] = useState<{
    day: string;
    hour: string;
  } | null>(null);

  // Region State
  const [selectedRegion, setSelectedRegion] = useState(database.region || "");

  // Storage State
  // const [selectedSize] = useState(database.size || "");

  // Storage Upsize State
  const [selectedStorageGiB, setSelectedStorageGiB] = useState<number>(0);
  const isMongoDbCluster = database.engine === "mongodb";

  const normalizeMaintenanceDay = (value: string | undefined | null): string => {
    const normalized = (value || "").toLowerCase();
    return DAYS.includes(normalized) ? normalized : "monday";
  };

  const normalizeMaintenanceHour = (value: string | undefined | null): string => {
    const match = (value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return "00:00";
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  };

  const normalizedCurrentMaintenance = currentMaintenanceWindow
    ? {
        day: normalizeMaintenanceDay(currentMaintenanceWindow.day),
        hour: normalizeMaintenanceHour(currentMaintenanceWindow.hour),
      }
    : null;

  const hasMaintenanceChanges =
    maintenanceDay !== "" &&
    maintenanceHour !== "" &&
    (!!normalizedCurrentMaintenance
      ? maintenanceDay !== normalizedCurrentMaintenance.day ||
        maintenanceHour !== normalizedCurrentMaintenance.hour
      : true);

  const currentStorageGiB =
    getStorageGiB({
      storageSizeMib: database.storage_size_mib,
      size: database.size,
      products,
    }) || 0;

  // Storage limits based on engine and RAM
  const STORAGE_LIMITS = {
    pg: {
      "1gb": { minGiB: 10, maxGiB: 30 },
      "2gb": { minGiB: 30, maxGiB: 60 },
      "4gb": { minGiB: 60, maxGiB: 120 },
      "8gb": { minGiB: 140, maxGiB: 280 },
      "16gb": { minGiB: 290, maxGiB: 580 },
    },
    mysql: {
      "1gb": { minGiB: 10, maxGiB: 30 },
      "2gb": { minGiB: 30, maxGiB: 60 },
      "4gb": { minGiB: 60, maxGiB: 120 },
      "8gb": { minGiB: 140, maxGiB: 280 },
      "16gb": { minGiB: 290, maxGiB: 580 },
    },
    mongodb: {
      "1gb": { minGiB: 15, maxGiB: 25 },
      "2gb": { minGiB: 34, maxGiB: 54 },
      "32gb": { minGiB: 504, maxGiB: 1014 },
    },
  };

  // Helper function to extract RAM from size string (e.g., "db-s-2vcpu-4gb" -> "4gb")
  const extractRAM = (size: string): string => {
    const match = size.match(/(\d+)gb/i);
    return match ? `${match[1]}gb` : "4gb"; // Default to 4gb if not found
  };

  // Helper function to get storage options based on engine and RAM
  const getStorageOptions = (): number[] => {
    const engine = database.engine || "pg";
    const ram = extractRAM(database.size || "");

    // Get limits for the engine and RAM combination
    type StorageLimitKey = keyof typeof STORAGE_LIMITS;
    const engineLimits = STORAGE_LIMITS[engine as StorageLimitKey];
    
    if (!engineLimits) {
      // Fallback: return current + 20 GiB in steps of 10
      return Array.from({ length: 3 }, (_, i) => currentStorageGiB + (i + 1) * 10);
    }

    type RamKey = keyof typeof engineLimits;
    const limits = engineLimits[ram as RamKey];
    
    if (!limits) {
      // Fallback: return current + 20 GiB in steps of 10
      return Array.from({ length: 3 }, (_, i) => currentStorageGiB + (i + 1) * 10);
    }

    // Generate options from minGiB to maxGiB in steps of 10
    const options: number[] = [];
    for (let size = limits.minGiB; size <= limits.maxGiB; size += 10) {
      // Only include options greater than current storage
      if (size > currentStorageGiB) {
        options.push(size);
      }
    }

    return options;
  };

  // Transform products into storage tiers format
  // const storageTiers = products.map((product) => ({
  //   slug: `db-s-${product.resources.cpu}vcpu-${product.resources.ram}gb`,
  //   storage: `${product.resources.storage} GB`,
  //   vcpu: `${product.resources.cpu}`,
  //   ram: `${product.resources.ram} GB`,
  //   diskGB: product.resources.storage,
  // }));

  // Helper function to get current storage info
  // const getCurrentStorageInfo = (currentSize: string) => {
  //   const tier = storageTiers.find((t) => t.slug === currentSize);
  //   return tier
  //     ? `${tier.storage} Storage (${tier.vcpu} vCPU, ${tier.ram} RAM)`
  //     : currentSize;
  // };

  // Helper function to get only tiers with MORE storage than current
  // const getUpgradeTiers = (currentSize: string) => {
  //   const current = storageTiers.find((t) => t.slug === currentSize);
  //   if (!current) return storageTiers;

  //   return storageTiers.filter((t) => t.diskGB > current.diskGB);
  // };

  // Fetch current maintenance window on mount
  useEffect(() => {
    const fetchMaintenanceWindow = async () => {
      try {
        const response = await axios.get(
          `/api/services/database/maintenance/read?database_id=${database.cluster_id}`
        );
        if (response?.data?.maintenance_window) {
          const window = response?.data?.maintenance_window;
          const normalizedWindow = {
            day: normalizeMaintenanceDay(window.day),
            hour: normalizeMaintenanceHour(window.hour),
          };
          setCurrentMaintenanceWindow(normalizedWindow);
          setMaintenanceDay(normalizedWindow.day);
          setMaintenanceHour(normalizedWindow.hour);
        } else {
          // Set defaults if no maintenance window exists
          setCurrentMaintenanceWindow({ day: "monday", hour: "00:00" });
          setMaintenanceDay("monday");
          setMaintenanceHour("00:00");
        }
      } catch (error) {
        console.error("Error fetching maintenance window:", error);
        // Set defaults on error
        setCurrentMaintenanceWindow({ day: "monday", hour: "00:00" });
        setMaintenanceDay("monday");
        setMaintenanceHour("00:00");
      }
    };

    fetchMaintenanceWindow();
  }, [database.cluster_id]);

  // Poll for migration completion
  useEffect(() => {
    if (!isMigrating) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(
          `/api/services/database/readForMigrate?database_id=${database.cluster_id}&target_region=${targetRegion}`
        );
        
        if (response?.data?.migration_complete) {
          setIsMigrating(false);
          setSelectedRegion(targetRegion);
          toast.success("Database migration completed successfully!");
          onDatabaseUpdate?.();
          clearInterval(pollInterval);


        }
      } catch (error) {
        console.error("Error checking migration status:", error);
      }
    }, 60000); // Poll every 1 minute

    return () => clearInterval(pollInterval);
  }, [isMigrating, targetRegion, database.cluster_id, onDatabaseUpdate]);

  // Get current day and time for highlighting
  // const getCurrentDay = () => {
  //   const days = [
  //     "sunday",
  //     "monday",
  //     "tuesday",
  //     "wednesday",
  //     "thursday",
  //     "friday",
  //     "saturday",
  //   ];
  //   return days[new Date().getDay()];
  // };

  // const getCurrentHour = () => {
  //   const hour = new Date().getHours().toString().padStart(2, "0");
  //   return `${hour}:00`;
  // };

  // const currentDay = getCurrentDay();
  // const currentHour = getCurrentHour();

  // Update Project
  const handleUpdateProject = async () => {
    if (loading) return;
    if (!selectedProject) {
      toast.error("Please select a project");
      return;
    }

    setLoading("project");
    try {
      const response = await axios.put("/api/services/database/update", {
        cluster_id: database.cluster_id,
        project_id: selectedProject,
      });

      if (response.status === 200) {
        toast.success("Project updated successfully");
        onDatabaseUpdate?.();
        router.push('/dashboard/services/database/');
      }
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to update project."));
    } finally {
      setLoading(null);
    }
  };

  // Configure Maintenance Window
  const handleUpdateMaintenanceWindow = async () => {
    if (loading) return;
    if (!maintenanceDay || !maintenanceHour) {
      toast.error("Please select both maintenance day and time.");
      return;
    }

    if (!hasMaintenanceChanges) {
      toast.info("No maintenance changes to save.");
      return;
    }

    setLoading("maintenance");
    try {
      const response = await axios.put("/api/services/database/maintenance", {
        database_id: database.cluster_id,
        day: maintenanceDay,
        hour: maintenanceHour,
      });

      if (response.status === 200) {
        toast.success("Maintenance window configured successfully");
        setCurrentMaintenanceWindow({ day: maintenanceDay, hour: maintenanceHour });
        onDatabaseUpdate?.();
      }
    } catch (error) {
      console.error("Error updating maintenance window:", error);
      toast.error(
        getDatabaseErrorMessage(
          error,
          "Failed to update maintenance window."
        )
      );
    } finally {
      setLoading(null);
    }
  };

  // Update Database Region
  const handleUpdateRegion = async () => {
    if (loading) return;
    if (isMongoDbCluster) {
      toast.info("Region migration is currently unavailable for MongoDB clusters.");
      return;
    }

    if (!selectedRegion) {
      toast.error("Please select a region");
      return;
    }

    if (selectedRegion === database.region) {
      toast.info("Database is already in this region");
      return;
    }

    setLoading("region");
    try {
      const response = await axios.put("/api/services/database/region", {
        database_id: database.cluster_id,
        region: selectedRegion,
      });

      if (response.status === 200) {
        toast.success(
          "Database migration initiated. The cluster will be migrated to the new region."
        );
        setIsMigrating(true);
        setTargetRegion(selectedRegion);
        onDatabaseUpdate?.();
        router.push('/dashboard/services/database/');
      }
    } catch (error) {
      console.error("Error migrating database:", error);
      toast.error(
       getDatabaseErrorMessage(error, "Failed to migrate database region.")
      );
    } finally {
      setLoading(null);
    }
  };

  // Upsize Storage (Disk Only)
  const handleUpsizeStorage = async () => {
    if (loading) return;
    if (isMongoDbCluster) {
      toast.info("Storage upsize is currently unavailable for MongoDB clusters.");
      return;
    }

    if (!selectedStorageGiB || selectedStorageGiB === 0) {
      toast.error("Please select a storage size");
      return;
    }

    if (selectedStorageGiB <= currentStorageGiB) {
      toast.error("New storage must be greater than current storage");
      return;
    }

    setLoading("upsize");
    try {
      const response = await axios.put("/api/services/database/upsize-storage", {
        database_id: database.cluster_id,
        storage_size_mib: selectedStorageGiB * 1024,
      });

      if (response.status === 200) {
        toast.success("Storage upsize success");
        onDatabaseUpdate?.();
        setSelectedStorageGiB(0);
      }
    } catch (error) {
      console.error("Error upsizing storage:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to upsize storage."));
    } finally {
      setLoading(null);
    }
  };

  // Upgrade Plan Tier
  // const handleUpdateStorage = async () => {
  //   if (!selectedSize) {
  //     toast.error("Please select a storage tier");
  //     return;
  //   }

  //   if (selectedSize === database.size) {
  //     toast.info("Database is already using this storage tier");
  //     return;
  //   }

  //   setLoading("storage");
  //   try {
  //     const response = await axios.put("/api/services/database/storage", {
  //       database_id: database.cluster_id,
  //       size: selectedSize,
  //     });

  //     if (response.status === 200) {
  //       toast.success("Storage tier upgrade initiated successfully");
  //       onDatabaseUpdate?.();
  //     }
  //   } catch (error) {
  //     console.error("Error upgrading storage:", error);
  //     toast.error(getErrorMessage(error, "Failed to upgrade storage tier"));
  //   } finally {
  //     setLoading(null);
  //   }
  // };

  // Delete Database Cluster
  const handleDeleteCluster = async () => {
    if (loading) return;
    if (deleteConfirmInput.trim().toLowerCase() !== database.name.trim().toLowerCase()) {
      toast.error(`Please type "${database.name}" to confirm deletion`);
      return;
    }

    setLoading("delete");
    try {
      const response = await axios.post("/api/services/database/delete", {
        id: database.cluster_id,
        id2:database.id
      });

      if (response.status === 200) {
        toast.success("Database cluster deleted successfully");
        // Redirect to database list
        window.location.href = "/dashboard/services/database";
      }
    } catch (error) {
      console.error("Error deleting database:", error);
      toast.error(
        getDatabaseErrorMessage(error, "Failed to delete database cluster.")
      );
    } finally {
      setLoading(null);
      setShowDeleteConfirm(false);
      setDeleteConfirmInput("");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Column */}
        <div className="space-y-3">
          {/* Update Project */}
          <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-blue-400/20 bg-blue-500/10 text-[#33adff]">
                <FolderKanban className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                  Project
                </p>
                <h3 className="mt-0.5 text-sm font-semibold text-white truncate">Update Project</h3>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-white/60 mb-4 leading-5">
                Assign this database to a different project
              </p>
              <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/50 mb-2">
                  Select Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-400/40 focus:bg-white/[0.06] transition-all duration-150"
                  disabled={loading === "project"}
                >
                  <option value="" className="bg-slate-900">
                    {projects.length === 0 ? "No projects available" : "Select a project"}
                  </option>
                  {projects.length > 0 ? projects.map((project) => (
                    <option
                      key={project.id}
                      value={project.id}
                      className="bg-slate-900"
                    >
                      {project.name}
                    </option>
                  )) : null}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleUpdateProject}
                  disabled={loading === "project" || !selectedProject}
                  className="inline-flex items-center gap-1.5 border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-xs font-medium text-white transition-all duration-150 hover:bg-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading === "project" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</>
                  ) : (
                    <><Save className="h-3.5 w-3.5" />Save</>  
                  )}
                </button>
                <button
                  onClick={() => setSelectedProject(database.project_id || "")}
                  disabled={loading === "project"}
                  className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-transparent px-3 py-2 text-xs font-medium text-white/60 transition-all duration-150 hover:text-white hover:border-white/[0.14] disabled:opacity-40"
                  aria-label="Cancel project selection"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
              </div>
            </div>
          </div>

          {/* Configure Maintenance Window */}
          <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-purple-400/20 bg-purple-500/10 text-purple-300">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Maintenance</p>
                <h3 className="mt-0.5 text-sm font-semibold text-white truncate">Configure Maintenance Window</h3>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-white/60 mb-4 leading-5">
                Set the preferred time for automatic maintenance updates
              </p>
              <div className="space-y-4">

              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/50 mb-2">
                  Day of Week
                </label>
                <select
                  value={maintenanceDay}
                  onChange={(e) => setMaintenanceDay(e.target.value)}
                  className="w-full border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-400/40 focus:bg-white/[0.06] transition-all duration-150"
                  disabled={loading === "maintenance"}
                >
                  {DAYS.map((day) => (
                    <option
                      key={day}
                      value={day}
                      className={`bg-slate-900 ${
                        day === currentMaintenanceWindow?.day ? "font-bold" : ""
                      }`}
                    >
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                      {day === currentMaintenanceWindow?.day && " ✓"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/50 mb-2">
                  Time (UTC)
                </label>
                <select
                  value={maintenanceHour}
                  onChange={(e) => setMaintenanceHour(e.target.value)}
                  className="w-full border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-400/40 focus:bg-white/[0.06] transition-all duration-150"
                  disabled={loading === "maintenance"}
                >
                  {TIME_SLOTS.map((time) => (
                    <option
                      key={time}
                      value={time}
                      className={`bg-slate-900 ${
                        time === currentMaintenanceWindow?.hour ? "font-bold" : ""
                      }`}
                    >
                      {time}
                      {time === currentMaintenanceWindow?.hour && " ✓"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleUpdateMaintenanceWindow}
                  disabled={
                    loading === "maintenance" ||
                    !maintenanceDay ||
                    !maintenanceHour ||
                    !hasMaintenanceChanges
                  }
                  className="inline-flex items-center gap-1.5 border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-xs font-medium text-white transition-all duration-150 hover:bg-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading === "maintenance" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</>
                  ) : (
                    <><Save className="h-3.5 w-3.5" />Save</>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (currentMaintenanceWindow) {
                      setMaintenanceDay(currentMaintenanceWindow.day);
                      setMaintenanceHour(currentMaintenanceWindow.hour);
                    }
                  }}
                  disabled={loading === "maintenance"}
                  className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-transparent px-3 py-2 text-xs font-medium text-white/60 transition-all duration-150 hover:text-white hover:border-white/[0.14] disabled:opacity-40"
                  aria-label="Cancel maintenance window selection"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
              {!hasMaintenanceChanges && maintenanceDay && maintenanceHour && (
                <p className="text-xs text-white/45 pt-1">
                  No maintenance changes detected.
                </p>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          {/* Update Database Region */}
          <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Region</p>
                <h3 className="mt-0.5 text-sm font-semibold text-white truncate">Update Database Region</h3>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-white/60 mb-4 leading-5">
                Migrate your database cluster to a different datacenter
              </p>
              <div className="space-y-4">
              {isMigrating && (
                <div className="flex items-start gap-2.5 border border-amber-400/20 bg-amber-500/10 px-3 py-3">
                  <Loader2 className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5 animate-spin" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-300 mb-0.5">Migration In Progress</p>
                    <p className="text-xs text-white/60 leading-5">
                      Migrating to {REGIONS.find((r) => r.slug === targetRegion)?.name}. This typically takes 10–30 minutes.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/50 mb-2">
                  Select Region
                </label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400/40 focus:bg-white/[0.06] transition-all duration-150"
                  disabled={loading === "region" || isMigrating || isMongoDbCluster}
                >
                  <option value="" className="bg-slate-900">
                    {REGIONS.length === 0 ? "No regions available" : "Select a region"}
                  </option>
                  {REGIONS && REGIONS.length > 0 ? REGIONS.map((region) => (
                    <option
                      key={region.slug}
                      value={region.slug}
                      className={`bg-slate-900 ${region.slug === database.region ? "font-bold" : ""}`}
                    >
                      {region.name}
                      {region.slug === database.region && " (Current)"}
                    </option>
                  )) : null}
                </select>
              </div>

              {isMongoDbCluster && (
                <div className="border border-blue-400/20 bg-blue-500/10 px-3 py-2.5">
                  <p className="text-xs text-white/60">
                    Region migration is currently unavailable for MongoDB clusters.
                  </p>
                </div>
              )}

              {selectedRegion && selectedRegion !== database.region && !isMigrating && (
                <div className="flex items-start gap-2.5 border border-amber-400/20 bg-amber-500/10 px-3 py-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-300 mb-0.5">Migration Notice</p>
                    <p className="text-xs text-white/60 leading-5">
                      Migrating will cause temporary unavailability. The cluster will transition back to online when complete.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleUpdateRegion}
                  disabled={
                    loading === "region" ||
                    !selectedRegion ||
                    selectedRegion === database.region ||
                    isMigrating ||
                    isMongoDbCluster
                  }
                  className="inline-flex items-center gap-1.5 border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-xs font-medium text-white transition-all duration-150 hover:bg-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading === "region" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Migrating...</>
                  ) : (
                    <><MapPin className="h-3.5 w-3.5" />Migrate</>
                  )}
                </button>
                <button
                  onClick={() => setSelectedRegion(database.region || "")}
                  disabled={loading === "region" || isMigrating || isMongoDbCluster}
                  className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-transparent px-3 py-2 text-xs font-medium text-white/60 transition-all duration-150 hover:text-white hover:border-white/[0.14] disabled:opacity-40"
                  aria-label="Cancel region selection"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
              </div>
            </div>
          </div>

          {/* Upsize Storage */}
          <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/[0.06]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
            <HardDrive className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Storage</p>
            <h3 className="mt-0.5 text-sm font-semibold text-white">Upsize Storage — Current: {currentStorageGiB > 0 ? `${currentStorageGiB} GiB` : "Managed"}</h3>
          </div>
        </div>
        <div className="px-5 py-3 space-y-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/50 mb-2">
              Select New Storage Size (GiB)
            </label>
            <select
              value={selectedStorageGiB}
              onChange={(e) => setSelectedStorageGiB(Number(e.target.value))}
              className="w-full border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-400/40 focus:bg-white/[0.06] transition-all duration-150"
              disabled={loading === "upsize" || isMongoDbCluster}
            >
              <option value={0} className="bg-slate-900">
                {getStorageOptions().length === 0 ? "No storage options available" : "Select storage size"}
              </option>
              {getStorageOptions().length > 0 ? getStorageOptions().map((size) => (
                <option key={size} value={size} className="bg-slate-900">
                  {size} GiB
                </option>
              )) : null}
            </select>
          </div>
          {isMongoDbCluster && (
            <div className="border border-blue-400/20 bg-blue-500/10 px-3 py-2">
              <p className="text-xs text-white/60">Storage upsize unavailable for MongoDB clusters.</p>
            </div>
          )}

          {selectedStorageGiB > 0 && (
            <div className="flex items-start gap-2 border border-amber-400/20 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-xs text-white/60">+{selectedStorageGiB - currentStorageGiB} GiB permanent increase.</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpsizeStorage}
              disabled={
                loading === "upsize" ||
                isMongoDbCluster ||
                !selectedStorageGiB ||
                selectedStorageGiB === 0 ||
                selectedStorageGiB <= currentStorageGiB
              }
              className="inline-flex items-center gap-1 border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:bg-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading === "upsize" ? (
                <><Loader2 className="h-3 w-3 animate-spin" />Upsizing Storage</>
              ) : (
                <><HardDrive className="h-3 w-3" />Upsize Storage</>
              )}
            </button>
            <button
              onClick={() => setSelectedStorageGiB(0)}
              disabled={loading === "upsize"}
              className="inline-flex items-center gap-1 border border-white/[0.08] bg-transparent px-3 py-1.5 text-xs font-medium text-white/60 transition-all duration-150 hover:text-white hover:border-white/[0.14] disabled:opacity-40"
              aria-label="Clear storage selection"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
          </div>
        </div>
      </div>

      {/* Delete Database Cluster - Full Width */}
      <div className="border border-red-400/20 bg-red-500/[0.04]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-red-400/[0.12]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-red-400/25 bg-red-500/15 text-red-300">
            <Trash2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-400/70">Danger Zone</p>
            <h3 className="mt-0.5 text-sm font-semibold text-white truncate">Delete Database Cluster</h3>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start gap-2.5 border border-red-400/20 bg-red-500/[0.06] px-3 py-3">
            <AlertTriangle className="h-3.5 w-3.5 text-red-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-300 mb-0.5">This action cannot be undone</p>
              <p className="text-xs text-white/60 leading-5">
                Deleting will permanently remove all data, backups, and configurations associated with this cluster.
              </p>
            </div>
          </div>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-all duration-150 hover:bg-red-500/20 hover:border-red-400/50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Cluster
            </button>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-medium text-white/70">
                  Type the cluster name <span className="font-semibold text-white">&quot;</span><span className="font-semibold text-red-400">{database.name}</span><span className="font-semibold text-white">&quot;</span> to confirm deletion
                </p>
                <input
                  type="text"
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  placeholder={`Type: ${database.name}`}
                  className="w-full border border-red-400/30 bg-red-500/5 px-3 py-2 text-sm text-white placeholder:text-red-300/40 focus:outline-none focus:border-red-400/60 focus:bg-red-500/10 transition-all duration-150"
                  disabled={loading === "delete"}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteCluster}
                  disabled={loading === "delete" || deleteConfirmInput.trim().toLowerCase() !== database.name.trim().toLowerCase()}
                  className="inline-flex items-center gap-1.5 border border-red-500/50 bg-red-500/20 px-3 py-2 text-xs font-medium text-red-200 transition-all duration-150 hover:bg-red-500/35 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading === "delete" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Deleting...</>
                  ) : (
                    <><Trash2 className="h-3.5 w-3.5" />Yes, Delete Permanently</>
                  )}
                </button>
                <button
                  onClick={() => {setShowDeleteConfirm(false); setDeleteConfirmInput("");}}
                  disabled={loading === "delete"}
                  className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-transparent px-3 py-2 text-xs font-medium text-white/60 transition-all duration-150 hover:text-white hover:border-white/[0.14] disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
