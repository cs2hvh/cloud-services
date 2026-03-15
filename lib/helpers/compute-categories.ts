import { Products } from "@/lib/supabase/queries/products";

interface VirtualPlan {
  vcpu: number;
  ram: string;
  storage: string;
  bandwidth: string;
  price: number;
}

interface BareMetalPlan {
  processor: string;
  cores: string;
  ram: string;
  storage: string;
  bandwidth: string;
  network: string;
  price: number;
}

export interface ComputeCategory {
  key: string;
  label: string;
  icon: any; // React.ComponentType will be mapped in component
  tagline: string;
  description: string;
  features: string[];
  isBareMetalCategory?: boolean;
  plans: (VirtualPlan | BareMetalPlan)[];
}

/**
 * Fetches compute categories from the database.
 * This is a server-side only function.
 * Falls back to component's FALLBACK_CATEGORIES if no data is found or on error.
 */
export async function getComputeCategories(): Promise<ComputeCategory[] | null> {
  try {
    // Fetch featured compute products
    const products = await Products.get_featured_by_service_type("compute");
    
    if (products.length === 0) {
      return null; // Use component fallback
    }
    
    // Map products to categories structure
    // In a real implementation, you'd have more sophisticated mapping logic
    // For now, we return null to use fallback data in the component
    return null;
  } catch (error) {
    console.error("Error fetching compute categories:", error);
    return null;
  }
}
