"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import VPSSelect from "./simple";
import LinodeCreate from "./linode";
import type { LinodeComputeOptions } from "@/lib/services/compute/providers/linode/options";

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
  /** Set when the platform provisions on Linode — routes to the Linode form. */
  provider?: "linode";
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
 * Loads compute options from API with retry logic, then renders the deploy
 * form for the active provisioning backend (Linode resell or legacy Proxmox).
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
      <div className="border border-red-500/20 bg-red-500/[0.06] px-5 py-5">
        <p className="text-sm font-semibold text-red-400">Unable to load server options</p>
        <p className="mt-1 text-sm text-white/45">Please refresh the page or try again later. If the problem persists, contact support.</p>
      </div>
    );
  }

  if (!options?.regions || options.regions.length === 0) {
    return (
      <div className="border border-amber-500/20 bg-amber-500/[0.06] px-5 py-5">
        <p className="text-sm font-semibold text-amber-400">No regions available</p>
        <p className="mt-1 text-sm text-white/45">No active servers available. Please contact support.</p>
      </div>
    );
  }

  if (options.provider === "linode") {
    return <LinodeCreate options={options as unknown as LinodeComputeOptions} />;
  }

  return <VPSSelect computeOptions={options} />;
}
