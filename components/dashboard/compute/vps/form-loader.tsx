"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import VPSSelect from "./simple";

interface Region {
  id: string;
  name: string;
  available: boolean;
}

interface OSOption {
  id: string;
  name: string;
  regions: string[];
}

interface ComputeOptions {
  regions: Region[];
  osOptions: OSOption[];
  specs: {
    minCpuCores: number;
    maxCpuCores: number;
    minMemoryMB: number;
    maxMemoryMB: number;
    minDiskGB: number;
    maxDiskGB: number;
  };
}

/**
 * Loads compute options from API with retry logic
 * Shows regions (not raw hosts) and deduplicated OS templates
 */
export default function VPSFormLoader() {
  const [options, setOptions] = useState<ComputeOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async (retryCount = 0) => {
      const MAX_RETRIES = 3;
      const RETRY_DELAY = Math.pow(2, retryCount) * 1000;

      try {
        const res = await fetch("/api/services/compute/options", {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error("Unable to load server options");
        }

        const data = await res.json();

        if (data.ok && data.data) {
          setOptions(data.data);
          setError(null);
        } else {
          throw new Error(data.error || "Unable to load server options");
        }
      } catch (err) {
        console.error("Error fetching compute options:", err);

        if (retryCount < MAX_RETRIES) {
          setTimeout(() => fetchOptions(retryCount + 1), RETRY_DELAY);
        } else {
          setError("We're having trouble loading server options. Please refresh the page or try again later.");
        }
      } finally {
        if (retryCount === 0 || retryCount === MAX_RETRIES) {
          setLoading(false);
        }
      }
    };

    fetchOptions();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 p-4 rounded border border-red-500">
        <p className="font-semibold">Unable to load server options</p>
        <p className="text-sm mt-1">Please refresh the page or try again later. If the problem persists, contact support.</p>
      </div>
    );
  }

  if (!options?.regions || options.regions.length === 0) {
    return (
      <div className="text-yellow-400 p-4 rounded border border-yellow-500">
        <p className="font-semibold">No regions available</p>
        <p className="text-sm mt-1">No active servers available. Please contact support.</p>
      </div>
    );
  }

  return <VPSSelect computeOptions={options} />;
}
