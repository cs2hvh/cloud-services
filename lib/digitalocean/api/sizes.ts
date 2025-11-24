import { DigitalOceanClient } from "../axios";

/**
 * DigitalOcean Droplet Size Interface
 */
export interface DropletSize {
  slug: string;
  memory: number; // in MB
  vcpus: number;
  disk: number; // in GB
  transfer: number; // in TB
  price_monthly: number;
  price_hourly: number;
  regions: string[];
  available: boolean;
  description: string;
  networking_throughput?: number;
  disk_info?: Array<{
    type: string;
    size: {
      amount: number;
      unit: string;
    };
  }>;
}

/**
 * DigitalOcean API Response for Sizes
 */
interface SizesResponse {
  sizes: DropletSize[];
  links?: {
    pages?: {
      first?: string;
      prev?: string;
      next?: string;
      last?: string;
    };
  };
  meta?: {
    total?: number;
  };
}

/**
 * Fetch all available droplet sizes from DigitalOcean
 */
export async function getDropletSizes(): Promise<DropletSize[]> {
  try {
    const doClient = new DigitalOceanClient();
    const response = await doClient.client.get<SizesResponse>("/v2/sizes");


    console.log(response.data,".....................sizes response data...................");
    if (response.data && response.data.sizes) {
      // Filter only available sizes and sort by price
      return response.data.sizes
        .filter((size) => size.available)
        .sort((a, b) => a.price_monthly - b.price_monthly);
    }

    return [];
  } catch (error) {
    console.error("[DigitalOcean] Error fetching droplet sizes:", error);
    throw new Error("Failed to fetch droplet sizes from DigitalOcean");
  }
}

/**
 * Get a specific droplet size by slug
 */
export async function getDropletSizeBySlug(
  slug: string
): Promise<DropletSize | null> {
  try {
    const sizes = await getDropletSizes();
    return sizes.find((size) => size.slug === slug) || null;
  } catch (error) {
    console.error(
      `[DigitalOcean] Error fetching droplet size ${slug}:`,
      error
    );
    return null;
  }
}

/**
 * Get droplet sizes suitable for Kubernetes (minimum requirements)
 */
export async function getKubernetesSuitableSizes(): Promise<DropletSize[]> {
  try {
    const sizes = await getDropletSizes();

    // Filter sizes suitable for Kubernetes
    // Minimum: 2 vCPUs, 2GB RAM, 50GB disk
    return sizes.filter(
      (size) =>
        size.vcpus >= 1 && size.memory >= 1024 && size.disk >= 25
    );
  } catch (error) {
    console.error(
      "[DigitalOcean] Error fetching Kubernetes suitable sizes:",
      error
    );
    return [];
  }
}
