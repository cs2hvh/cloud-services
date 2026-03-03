import { Products } from "@/lib/supabase/queries/products";
import type { Plan } from "@/types/pricing";

const FALLBACK_PLANS: Plan[] = [
  {
    name: "Starter",
    description: "For dev environments and side projects.",
    monthly: 0,
    yearly: 0,
    cta: "Start Free",
    featured: false,
    highlighted:false,
    features: [
      "1 database",
      "1 GB storage",
      "Shared CPU",
      "Daily backups (7-day retention)",
      "Community support",
      "Single node",
    ],
  },
  {
    name: "Pro",
    description: "For production apps and growing teams.",
    monthly: 25,
    yearly: 20,
    cta: "Get Started",
    featured: true,
    highlighted: true,
    features: [
      "Unlimited databases",
      "Up to 500 GB storage",
      "Dedicated CPU",
      "Point-in-time recovery (30 days)",
      "Read replicas",
      "Connection pooling",
      "VPC peering",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    description: "For teams that need compliance and scale.",
    monthly: 0,
    yearly: 0,
    cta: "Contact Sales",
    featured: false,
    highlighted:false,
    isCustom: true,
    features: [
      "Everything in Pro",
      "Multi-region replication",
      "SSO / SAML",
      "SOC 2 & HIPAA compliance",
      "99.999% SLA",
      "Dedicated support engineer",
      "Custom retention policies",
      "Audit logs",
    ],
  },
];

/**
 * Fetches database pricing plans from the database.
 * This is a server-side only function.
 * Falls back to static plans if no data is found or on error.
 */
export async function getDatabasePlans(): Promise<Plan[]> {
  try {
    // Fetch featured database products
    const products = await Products.get_featured_by_service_type("database");
    
    // Map products to plans structure
    const dynamicPlans = products.map((product) => ({
      name: product.name || "",
      description: product.short_description || product.description || "",
      monthly: product.price || 0,
      yearly: product.yearly_price || product.price || 0,
      cta: product.cta_text || "Get Started",
      featured: product.is_featured || false,
      features: product.features || [],
      isCustom: product.cta_text?.toLowerCase().includes("contact") || false,
      highlighted: product.is_highlighted || false,
    }));
    
    // Return dynamic plans if available, otherwise fallback
    return dynamicPlans.length > 0 ? dynamicPlans : FALLBACK_PLANS;
  } catch (error) {
    console.error("Error fetching database plans:", error);
    return FALLBACK_PLANS;
  }
}
