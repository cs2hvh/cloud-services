import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import axios from "axios";

// Supported database engines (DO uses 'pg' for PostgreSQL)
const SUPPORTED_ENGINES = ['mongodb', 'mysql', 'pg'];

// Map DO engine names to display names
const ENGINE_DISPLAY_NAMES: { [key: string]: string } = {
  'mongodb': 'MongoDB',
  'mysql': 'MySQL',
  'pg': 'PostgreSQL',
};

// CPU type mapping based on DigitalOcean size prefix
function getCpuTypeFromSlug(slug: string | undefined | null): 'basic' | 'general_purpose' | 'storage_optimized' {
  if (slug?.startsWith('db-s')) return 'basic';
  if (slug?.startsWith('gd-')) return 'general_purpose';
  if (slug?.startsWith('so1')) return 'storage_optimized';
  return 'basic'; // db-s-* prefix
}

// Parse resources from slug (e.g., "db-s-1vcpu-1gb" -> { cpu: 1, ram: 1 })
function parseResourcesFromSlug(slug: string | undefined | null): { cpu: number; ram: number } {
  if (!slug) return { cpu: 1, ram: 1 };
  // Pattern: prefix-{cpu}vcpu-{ram}gb or similar
  const vcpuMatch = slug.match(/(\d+)vcpu/);
  const ramMatch = slug.match(/(\d+)gb/);
  
  return {
    cpu: vcpuMatch ? parseInt(vcpuMatch[1]) : 1,
    ram: ramMatch ? parseInt(ramMatch[1]) : 1,
  };
}

// DigitalOcean response structure - layouts contain sizes array
interface DOLayout {
  num_nodes: number;
  sizes: string[];  // Array of size slugs like ["db-s-1vcpu-1gb", "db-s-2vcpu-4gb"]
}

interface DOEngineOptions {
  layouts: DOLayout[];
  versions: string[];
  regions: string[];
}

interface DOOptionsResponse {
  options: {
    [engine: string]: DOEngineOptions;
  };
  version_availability?: {
    [engine: string]: {
      [version: string]: string[];
    };
  };
}

interface ProcessedSize {
  slug: string;
  cpu_type: 'basic' | 'general_purpose' | 'storage_optimized';
  cpu: number;
  ram: number;
  display_name: string;
  num_nodes: number;
}

interface ProcessedEngineOptions {
  layouts: ProcessedSize[];
  versions: string[];
  regions: string[];
}

// GET: Fetch database options from DigitalOcean
export async function GET() {
  // Check admin authentication
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    );
  }

  try {
    const response = await axios.get<DOOptionsResponse>(
      "https://api.digitalocean.com/v2/databases/options",
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const options = response.data.options;
    
    // Process and enrich the data - only for supported engines
    const processedOptions: { [engine: string]: ProcessedEngineOptions } = {};
    
    for (const [engine, engineOptions] of Object.entries(options)) {
      // Only process supported engines (mongodb, mysql, pg/postgres)
      if (!SUPPORTED_ENGINES.includes(engine)) {
        continue;
      }
      
      // Extract all size slugs from layouts (each layout has num_nodes and sizes array)
      const allSizes: ProcessedSize[] = [];
      
      for (const layout of (engineOptions.layouts || [])) {
        const sizes = layout.sizes || [];
        const numNodes = layout.num_nodes || 1;
        
        for (const sizeSlug of sizes) {
          if (!sizeSlug) continue;
          
          const cpuType = getCpuTypeFromSlug(sizeSlug);
          const resources = parseResourcesFromSlug(sizeSlug);
          
          // Create a display name
          const cpuTypeLabel = {
            basic: 'Basic',
            general_purpose: 'General Purpose',
            storage_optimized: 'Storage Optimized',
          }[cpuType];
          
          allSizes.push({
            slug: sizeSlug,
            cpu_type: cpuType,
            cpu: resources.cpu,
            ram: resources.ram,
            display_name: `${cpuTypeLabel} - ${resources.cpu} vCPU, ${resources.ram} GB RAM`,
            num_nodes: numNodes,
          });
        }
      }
      
      // Remove duplicates (same slug might appear in multiple layouts)
      const uniqueSizes = allSizes.filter((size, index, self) =>
        index === self.findIndex((s) => s.slug === size.slug)
      );
      
      // Sort by cpu_type then by resources
      uniqueSizes.sort((a, b) => {
        const typeOrder = { basic: 0, general_purpose: 1, storage_optimized: 2 };
        if (typeOrder[a.cpu_type] !== typeOrder[b.cpu_type]) {
          return typeOrder[a.cpu_type] - typeOrder[b.cpu_type];
        }
        if (a.cpu !== b.cpu) return a.cpu - b.cpu;
        return a.ram - b.ram;
      });
      
      processedOptions[engine] = {
        layouts: uniqueSizes,
        versions: engineOptions.versions || [],
        regions: engineOptions.regions || [],
      };
    }
    
    // Group sizes by cpu_type for easier frontend consumption
    const sizesByType: {
      [engine: string]: {
        basic: ProcessedSize[];
        general_purpose: ProcessedSize[];
        storage_optimized: ProcessedSize[];
      };
    } = {};
    
    for (const [engine, engineOptions] of Object.entries(processedOptions)) {
      sizesByType[engine] = {
        basic: engineOptions.layouts.filter(l => l.cpu_type === 'basic'),
        general_purpose: engineOptions.layouts.filter(l => l.cpu_type === 'general_purpose'),
        storage_optimized: engineOptions.layouts.filter(l => l.cpu_type === 'storage_optimized'),
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        options: processedOptions,
        sizesByType,
        engineDisplayNames: ENGINE_DISPLAY_NAMES,
        supportedEngines: SUPPORTED_ENGINES,
        version_availability: response.data.version_availability || null,
      },
    });
  } catch (error) {
    console.error("[Database Options API] Error fetching options:", error);
    
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { 
          error: "Failed to fetch database options from provider",
          details: error.response?.data?.message || error.message,
        },
        { status: error.response?.status || 500 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch database options" },
      { status: 500 }
    );
  }
}
