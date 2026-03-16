import type React from "react";
import { Products } from "@/lib/supabase/queries/products";

interface Plan {
  nodes: number;
  vcpu: number;
  ram: string;
  storage: string;
  price: number;
  gpu?: string;
}

export interface KubernetesCategory {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  description: string;
  features: string[];
  plans: Plan[];
}

/**
 * Fetches kubernetes categories from the database.
 * This is a server-side only function.
 * Falls back to component's FALLBACK_CATEGORIES if no data is found or on error.
 */
export async function getKubernetesCategories(): Promise<KubernetesCategory[] | null> {
  try {
    // Fetch featured kubernetes products
    const products = await Products.get_featured_by_service_type("kubernetes");
    
    if (products.length === 0) {
      return null; // Use component fallback
    }
    
    // Map products to categories structure
    // In a real implementation, you'd have more sophisticated mapping logic
    // For now, we return null to use fallback data in the component
    return null;
  } catch (error) {
    console.error("Error fetching kubernetes categories:", error);
    return null;
  }
}
