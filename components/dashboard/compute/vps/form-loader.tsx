"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import VPSSelect from "./new";
import { serviceLocations } from "@/config/locations";

interface ComputeOptions {
  locations: Array<{ id: string; name: string; node: string }>;
  osTemplates: Array<{ id: string; name: string; type: string }>;
  specs: Array<{ id: string; name: string; cpuCores: number; memoryMB: number; diskGB: number; hourlyRate: number; monthlyRate: number }>;
}

/**
 * Loads compute options from API and falls back to static config
 * Maps Proxmox hosts to locations format for compatibility
 */
export default function VPSFormLoader() {
  const [options, setOptions] = useState<ComputeOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch("/api/services/compute/options");
        
        if (!res.ok) {
          // Fallback to static config if API fails
          console.warn("Failed to fetch compute options, using static config");
          setOptions({
            locations: serviceLocations.map(loc => ({
              id: String(loc.id || `${loc.city}-${loc.country}`),
              name: `${loc.city}, ${loc.country}`,
              node: String(loc.id || `${loc.city.toLowerCase()}-node`),
            })),
            osTemplates: [],
            specs: [],
          });
          setLoading(false);
          return;
        }

        const data = await res.json();
        
        if (data.success && data.data) {
          setOptions(data.data);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (err) {
        console.error("Error fetching compute options:", err);
        setError(err instanceof Error ? err.message : "Failed to load options");
        // Fallback to static config
        setOptions({
          locations: serviceLocations.map(loc => ({
            id: String(loc.id || `${loc.city}-${loc.country}`),
            name: `${loc.city}, ${loc.country}`,
            node: String(loc.id || `${loc.city.toLowerCase()}-node`),
          })),
          osTemplates: [],
          specs: [],
        });
      } finally {
        setLoading(false);
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
    console.warn("VPS Form Error (using fallback):", error);
  }

  if (!options) {
    return (
      <div className="text-red-400">
        Failed to load compute options. Please try again later.
      </div>
    );
  }

  // Pass static locations to VPSSelect for now
  // The form will be updated in the next step to use dynamic options
  return <VPSSelect locations={serviceLocations} />;
}
