"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import VPSSelect from "./simple";
import { Tables } from "@/lib/supabase/types";

interface Location {
  id: string;
  name: string;
  node: string;
}

interface ComputeOptions {
  locations: Location[];
  osTemplates: Array<{ id: string; name: string; type: string }>;
  specs: Array<{ id: string; name: string; cpuCores: number; memoryMB: number; diskGB: number; hourlyRate: number; monthlyRate: number }>;
}

/**
 * Loads compute options from API with retry logic
 * Only shows locations that have active Proxmox hosts
 */
export default function VPSFormLoader() {
  const [options, setOptions] = useState<ComputeOptions | null>(null);
  const [locations, setLocations] = useState<Tables<"locations">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async (retryCount = 0) => {
      const MAX_RETRIES = 3;
      const RETRY_DELAY = Math.pow(2, retryCount) * 1000; // Exponential backoff

      try {
        // Use no-store to always get fresh data (hosts/templates can change)
        const res = await fetch("/api/services/compute/options", {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data = await res.json();

        if (data.ok && data.data) {
          setOptions(data.data);
          // Map Proxmox hosts to locations for form display
          const mappedLocations = (data.data.locations || []).map((host: Location) => ({
            id: host.id,
            short: host.id,
            city: host.name,
            country: "Host",
            country_code: "US",
          })) as Tables<"locations">[];
          setLocations(mappedLocations);
          setError(null);
        } else {
          throw new Error(data.error || "Invalid response format");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load compute options";
        console.error("Error fetching compute options:", err);

        // Retry with exponential backoff
        if (retryCount < MAX_RETRIES) {
          console.log(`Retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          setTimeout(() => fetchOptions(retryCount + 1), RETRY_DELAY);
        } else {
          setError(message);
        }
      } finally {
        // Only set loading to false on final attempt or success
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
        <p className="font-semibold">Failed to load compute options</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <div className="text-yellow-400 p-4 rounded border border-yellow-500">
        <p className="font-semibold">No locations available</p>
        <p className="text-sm mt-1">No active Proxmox hosts found. Please contact support.</p>
      </div>
    );
  }

  return <VPSSelect locations={locations} computeOptions={options || undefined} />;
}
