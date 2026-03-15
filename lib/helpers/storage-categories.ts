import { Products } from "@/lib/supabase/queries/products";

interface Plan {
  storage: string;
  priceStorage: number | string;
  priceTransfer: number | string;
  retrievalFee?: number;
  retrievalTime?: string;
  sla?: string;
  free?: boolean;
}

export interface StorageCategory {
  key: string;
  label: string;
  icon: any; // React.ComponentType will be mapped in component
  tagline: string;
  description: string;
  features: string[];
  plans: Plan[];
}

/**
 * Fetches object storage categories from the database.
 * This is a server-side only function.
 * Falls back to component's FALLBACK_CATEGORIES if no data is found or on error.
 */
// Interface for ServicesHomeSectionFour plans
export interface StorageOverviewPlan {
  badge: string;
  badgePlacement: string;
  title: string;
  description: string;
  features: string[];
}

const FALLBACK_OVERVIEW_PLANS: StorageOverviewPlan[] = [
  {
    badge: "Starter",
    badgePlacement: "inside",
    title: "Starter",
    description: "Cost-effective object storage for small projects and backups.",
    features: ["50 GB storage", "5 GB/month transfer", "S3-compatible API", "Basic support"],
  },
  {
    badge: "Most Popular",
    badgePlacement: "inside",
    title: "Standard",
    description: "Durable and scalable object storage for web apps and media.",
    features: ["1 TB storage", "1 TB/month transfer", "S3 API + lifecycle rules", "99.99% durability"],
  },
  {
    badge: "Enterprise",
    badgePlacement: "inside",
    title: "Enterprise",
    description: "High-performance storage with SLA and dedicated support.",
    features: ["Custom capacity", "Unlimited transfer", "Private networking", "Dedicated support"],
  },
];

export async function getStorageCategories(): Promise<StorageCategory[] | null> {
  try {
    // Fetch featured storage products
    const products = await Products.get_featured_by_service_type("object-storage");
    
    if (products.length === 0) {
      return null; // Use component fallback
    }
    
    // Map products to categories structure
    // In a real implementation, you'd have more sophisticated mapping logic
    // For now, we return null to use fallback data in the component
    return null;
  } catch (error) {
    console.error("Error fetching storage categories:", error);
    return null;
  }
}

/**
 * Fetches storage overview plans for ServicesHomeSectionFour.
 * This is a server-side only function.
 * Falls back to static plans if no data is found or on error.
 */
export async function getStorageOverviewPlans(): Promise<StorageOverviewPlan[]> {
  try {
    // Fetch featured storage products
    const products = await Products.get_featured_by_service_type("object-storage");
    
    // Map products to overview plans structure
    const dynamicPlans = products.map((product) => ({
      badge: product.is_featured ? "Most Popular" : product.name || "",
      badgePlacement: "inside",
      title: product.name || "",
      description: product.short_description || product.description || "",
      features: product.features || [],
    }));
    
    // Return dynamic plans if available, otherwise fallback
    return dynamicPlans.length > 0 ? dynamicPlans : FALLBACK_OVERVIEW_PLANS;
  } catch (error) {
    console.error("Error fetching storage overview plans:", error);
    return FALLBACK_OVERVIEW_PLANS;
  }
}
