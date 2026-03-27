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
        if (response.data.maintenance_window) {
          const window = response.data.maintenance_window;
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
        
        if (response.data.migration_complete) {
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
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Two Column Layout for Large Screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Update Project */}
          <div className="rounded-xl bg-white/5 shadow-lg ring-1 ring-white/10 p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <FolderKanban className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Update Project</h3>
                <p className="text-sm text-slate-400">
                  Assign this database to a different project
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-48 overflow-y-auto"
                  disabled={loading === "project"}
                >
                  <option value="" className="bg-slate-900">
                    Select a project
                  </option>
                  {projects.map((project) => (
                    <option
                      key={project.id}
                      value={project.id}
                      className="bg-slate-900"
                    >
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleUpdateProject}
                  disabled={loading === "project" || !selectedProject}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 disabled:bg-slate-700 disabled:text-slate-500 text-black rounded-lg font-medium transition-colors"
                >
                  {loading === "project" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedProject(database.project_id || "")}
                  disabled={loading === "project"}
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* Configure Maintenance Window */}
          <div className="rounded-xl bg-white/5 shadow-lg ring-1 ring-white/10 p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Configure Maintenance Window
                </h3>
                <p className="text-sm text-slate-400">
                  Set the preferred time for automatic maintenance updates
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* {currentMaintenanceWindow && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-slate-300">
                      <p className="font-semibold text-blue-400 mb-1">
                        Current Window
                      </p>
                      <p className="text-xs">
                        {currentMaintenanceWindow.day.charAt(0).toUpperCase() +
                          currentMaintenanceWindow.day.slice(1)}{" "}
                        at {currentMaintenanceWindow.hour} (UTC)
                      </p>
                    </div>
                  </div>
                </div>
              )} */}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Day of Week
                </label>
                <select
                  value={maintenanceDay}
                  onChange={(e) => setMaintenanceDay(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-48 overflow-y-auto"
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
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Time (UTC)
                </label>
                <select
                  value={maintenanceHour}
                  onChange={(e) => setMaintenanceHour(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-48 overflow-y-auto"
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

              <div className="flex gap-3">
                <button
                  onClick={handleUpdateMaintenanceWindow}
                  disabled={
                    loading === "maintenance" ||
                    !maintenanceDay ||
                    !maintenanceHour ||
                    !hasMaintenanceChanges
                  }
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 disabled:bg-slate-700 disabled:text-slate-500 text-black rounded-lg font-medium transition-colors"
                >
                  {loading === "maintenance" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save
                    </>
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
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
              {!hasMaintenanceChanges && maintenanceDay && maintenanceHour && (
                <p className="text-xs text-slate-400">
                  No maintenance changes detected.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Update Database Region */}
          <div className="rounded-xl bg-white/5 shadow-lg ring-1 ring-white/10 p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Update Database Region
                </h3>
                <p className="text-sm text-slate-400">
                  Migrate your database cluster to a different datacenter
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {isMigrating && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Loader2 className="h-4 w-4 text-orange-400 flex-shrink-0 mt-0.5 animate-spin" />
                    <div className="text-xs text-slate-300">
                      <p className="font-semibold text-orange-400 mb-1">
                        Migration In Progress
                      </p>
                      <p>
                        Migrating to{" "}
                        {REGIONS.find((r) => r.slug === targetRegion)?.name}. This
                        typically takes 10-30 minutes.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select Region
                </label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500 max-h-48 overflow-y-auto"
                  disabled={loading === "region" || isMigrating || isMongoDbCluster}
                >
                  <option value="" className="bg-slate-900">
                    Select a region
                  </option>
                  {REGIONS.map((region) => (
                    <option
                      key={region.slug}
                      value={region.slug}
                      className={`bg-slate-900 ${region.slug === database.region ? "font-bold" : ""}`}
                    >
                      {region.name}
                      {region.slug === database.region && " (Current)"}
                    </option>
                  ))}
                </select>
              </div>

              {isMongoDbCluster && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-xs text-slate-300">
                    Region migration is currently unavailable for MongoDB clusters.
                  </p>
                </div>
              )}

              {selectedRegion && selectedRegion !== database.region && !isMigrating && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-300">
                      <p className="font-semibold text-yellow-400 mb-1">
                        Migration Notice
                      </p>
                      <p>
                        Migrating will cause temporary unavailability. The cluster will transition back to online when complete.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleUpdateRegion}
                  disabled={
                    loading === "region" ||
                    !selectedRegion ||
                    selectedRegion === database.region ||
                    isMigrating ||
                    isMongoDbCluster
                  }
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 disabled:bg-slate-700 disabled:text-slate-500 text-black rounded-lg font-medium transition-colors"
                >
                  {loading === "region" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Migrate
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedRegion(database.region || "")}
                  disabled={loading === "region" || isMigrating || isMongoDbCluster}
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* Upgrade Plan Tier */}



           {/* Upsize Storage - Full Width */}
      <div className="rounded-xl bg-white/5 shadow-lg ring-1 ring-white/10 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <HardDrive className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              Upsize Storage (Disk Only)
            </h3>
            <p className="text-sm text-slate-400">
              Increase disk storage without changing CPU/RAM
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Storage Info */}
          <div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
              <div className="text-xs text-slate-300">
                <p className="font-semibold text-blue-400 mb-1">
                  Current Storage
                </p>
                <p className="text-white font-medium text-lg">
                  {currentStorageGiB > 0 ? `${currentStorageGiB} GiB` : "Managed"}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  {database.storage_size_mib ? `${database.storage_size_mib} MiB` : "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Storage Selection and Action */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select New Storage Size (GiB)
              </label>
              <select
                value={selectedStorageGiB}
                onChange={(e) => setSelectedStorageGiB(Number(e.target.value))}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                disabled={loading === "upsize" || isMongoDbCluster}
              >
                <option value={0} className="bg-slate-900">
                  Select storage size
                </option>
                {getStorageOptions().map((size) => (
                  <option key={size} value={size} className="bg-slate-900">
                    {size} GiB
                  </option>
                ))}
              </select>
            </div>

            {isMongoDbCluster && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-xs text-slate-300">
                  Storage upsize is currently unavailable for MongoDB clusters.
                </p>
              </div>
            )}

            {/* Warning Notice */}
            {selectedStorageGiB > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <p className="font-semibold text-yellow-400 mb-1">
                      Storage Upsize Notice
                    </p>
                    <p>
                      Storage can only be increased, not decreased. Increase of{" "}
                      {selectedStorageGiB - currentStorageGiB} GiB will be applied.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleUpsizeStorage}
                disabled={
                  loading === "upsize" ||
                  isMongoDbCluster ||
                  !selectedStorageGiB ||
                  selectedStorageGiB === 0 ||
                  selectedStorageGiB <= currentStorageGiB
                }
                className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 disabled:bg-slate-700 disabled:text-slate-500 text-black rounded-lg font-medium transition-colors"
              >
                {loading === "upsize" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Upsizing...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Upsize Storage
                  </>
                )}
              </button>
              <button
                onClick={() => setSelectedStorageGiB(0)}
                disabled={loading === "upsize"}
                className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
         
        </div>
      </div>

     

      {/* Delete Database Cluster - Full Width */}
      <div className="rounded-xl bg-black border border-red-500/30 shadow-lg p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              Delete Database Cluster
            </h3>
            <p className="text-sm text-red-300">
              Permanently delete this database cluster and all its data
            </p>
          </div>
        </div>

        <div className="bg-black border border-red-500/30 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">
              <p className="font-semibold text-red-400 mb-1">
                Warning: This action cannot be undone!
              </p>
              <p>
                Deleting will permanently remove all data, backups, and configurations.
              </p>
            </div>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500 text-red-400 rounded-lg font-medium transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete Cluster
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-300 font-medium">
              Are you absolutely sure you want to delete this cluster?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteCluster}
                disabled={loading === "delete"}
                className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors"
              >
                {loading === "delete" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Yes, Delete Permanently
                  </>
                )}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={loading === "delete"}
                className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
