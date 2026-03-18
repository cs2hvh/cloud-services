import { Products } from "@/lib/supabase/queries/products";

export interface AppDeployPlan {
  name: string;
  description: string;
  monthly: number;
  yearly: number;
  cta: string;
  featured: boolean;
  isCustom?: boolean;
  features: string[];
}

const FALLBACK_PLANS: AppDeployPlan[] = [
  {
    name: "Starter",
    description: "For hobby projects and side experiments.",
    monthly: 0,
    yearly: 0,
    cta: "Start Free",
    featured: false,
    features: [
      "3 apps",
      "512 MB RAM per app",
      "Automatic SSL",
      "Git auto-deploy",
      "100 GB bandwidth/mo",
      "Community support",
    ],
  },
  {
    name: "Pro",
    description: "For production apps and growing teams.",
    monthly: 25,
    yearly: 20,
    cta: "Get Started",
    featured: true,
    features: [
      "Unlimited apps",
      "Up to 8 GB RAM per app",
      "Auto-scaling (horizontal & vertical)",
      "Custom domains & SSL",
      "Staging environments",
      "Zero-downtime deploys",
      "1 TB bandwidth/mo",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    description: "For teams that need compliance and SLAs.",
    monthly: 0,
    yearly: 0,
    cta: "Contact Sales",
    featured: false,
    isCustom: true,
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "Private networking",
      "Dedicated resources",
      "99.99% SLA",
      "Custom retention",
      "24/7 priority support",
      "SOC 2 & HIPAA ready",
    ],
  },
];

/**
 * Fetches app deployment plans from the database.
 * This is a server-side only function.
 * Falls back to static plans if no data is found or on error.
 */
export async function getAppDeployPlans(): Promise<AppDeployPlan[]> {
  try {
    // Fetch featured app deployment products
    const products = await Products.get_featured_by_service_type("platform-apps");
    
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
    console.error("Error fetching app deployment plans:", error);
    return FALLBACK_PLANS;
  }
}
