import { createClient, createServiceClient, createServerSupabase } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Tables, TablesInsert, TablesUpdate } from "../types";

type PricingCategory = Tables<"pricing_categories">;
type PricingPromo = Tables<"pricing_promos">;
type Product = Tables<"products">;

// Types for the pricing page
export interface PricingTier {
  id?: string;
  name: string;
  shortDescription?: string;
  badge?: string;
  subType?: string;
  cpuType?: string;
  machineType?: string;
  price: {
    monthly: number;
    yearly: number;
  };
  billingPeriod?: string;
  specs?: string[];
  features: string[];
 summary?: {
            billing?: string|undefined;
            support?: string|undefined;
            provisioning?: string|undefined;
            guarantee?: string|undefined;
            buttonText?: string|undefined;
          } | null;
  highlighted?: boolean;
  isFeatured?: boolean;
  ctaText: string;
  ctaLink: string;
}

export interface PricingPromoDisplay {
  badge: string;
  badgeNote?: string;
  title: string;
  description: string;
  subtext?: string;
  priceOld?: string;
  priceCurrent?: string;
  linkText: string;
  linkHref: string;
}

export interface ServiceCategory {
  id: string;
  label: string;
  description?: string;
  startingPriceLabel?: string;
  startingPriceDescription?: string;
  promos?: PricingPromoDisplay[];
  tiers: PricingTier[];
}

// Pricing Categories CRUD
export const PricingCategories = {
  get_all: async (): Promise<PricingCategory[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("pricing_categories")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (error) {
        handleQueryError("getting all pricing categories", error, "PricingCategories");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting all pricing categories", err, "PricingCategories");
      return [];
    }
  },

  get_all_admin: async (): Promise<PricingCategory[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("pricing_categories")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) {
        handleQueryError("getting all pricing categories for admin", error, "PricingCategories");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting all pricing categories for admin", err, "PricingCategories");
      return [];
    }
  },

  get_by_slug: async (slug: string): Promise<PricingCategory | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("pricing_categories")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error) {
        handleQueryError("getting pricing category by slug", error, "PricingCategories");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("getting pricing category by slug", err, "PricingCategories");
      return null;
    }
  },

  create: async (
    props: TablesInsert<"pricing_categories">
  ): Promise<{ success: boolean; data?: PricingCategory; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("pricing_categories")
        .insert(props)
        .select("*")
        .single();

      if (error) {
        handleQueryError("creating pricing category", error, "PricingCategories");
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      handleQueryError("creating pricing category", err, "PricingCategories");
      return { success: false, error: String(err) };
    }
  },

  update: async (
    id: string,
    props: TablesUpdate<"pricing_categories">
  ): Promise<{ success: boolean; data?: PricingCategory; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("pricing_categories")
        .update({ ...props, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        handleQueryError("updating pricing category", error, "PricingCategories");
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      handleQueryError("updating pricing category", err, "PricingCategories");
      return { success: false, error: String(err) };
    }
  },

  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("pricing_categories")
        .delete()
        .eq("id", id);

      if (error) {
        handleQueryError("deleting pricing category", error, "PricingCategories");
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      handleQueryError("deleting pricing category", err, "PricingCategories");
      return { success: false, error: String(err) };
    }
  },
};

// Pricing Promos CRUD
export const PricingPromos = {
  get_by_category: async (categorySlug: string): Promise<PricingPromo[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("pricing_promos")
        .select("*")
        .eq("category_slug", categorySlug)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (error) {
        handleQueryError("getting promos by category", error, "PricingPromos");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting promos by category", err, "PricingPromos");
      return [];
    }
  },

  get_all_admin: async (): Promise<PricingPromo[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("pricing_promos")
        .select("*")
        .order("category_slug", { ascending: true })
        .order("sort_order", { ascending: true });

      if (error) {
        handleQueryError("getting all promos for admin", error, "PricingPromos");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting all promos for admin", err, "PricingPromos");
      return [];
    }
  },

  create: async (
    props: TablesInsert<"pricing_promos">
  ): Promise<{ success: boolean; data?: PricingPromo; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("pricing_promos")
        .insert(props)
        .select("*")
        .single();

      if (error) {
        handleQueryError("creating pricing promo", error, "PricingPromos");
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      handleQueryError("creating pricing promo", err, "PricingPromos");
      return { success: false, error: String(err) };
    }
  },

  update: async (
    id: string,
    props: TablesUpdate<"pricing_promos">
  ): Promise<{ success: boolean; data?: PricingPromo; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("pricing_promos")
        .update({ ...props, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        handleQueryError("updating pricing promo", error, "PricingPromos");
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      handleQueryError("updating pricing promo", err, "PricingPromos");
      return { success: false, error: String(err) };
    }
  },

  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("pricing_promos")
        .delete()
        .eq("id", id);

      if (error) {
        handleQueryError("deleting pricing promo", error, "PricingPromos");
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      handleQueryError("deleting pricing promo", err, "PricingPromos");
      return { success: false, error: String(err) };
    }
  },
};

// Build spec strings the pricing table can parse (vCPU / Memory / Storage)
// from the product's structured `resources` field. Products store cores/RAM/
// disk in `resources`, not always in `specs`, which is why the comparison
// columns rendered empty. We synthesize specs from resources and only fall
// back to the free-form `specs` array when resources are absent.
function buildSpecsFromResources(product: Product): string[] | undefined {
  const r = product.resources;
  const out: string[] = [];
  if (r && typeof r === "object") {
    if (r.cpu) out.push(`${r.cpu} vCPU`);
    if (r.ram) out.push(`${r.ram} GB RAM`);
    if (r.storage) out.push(`${r.storage} GB NVMe`);
  }
  if (out.length > 0) return out;
  return product.specs || undefined;
}

// Some catalog rows bake the type + specs into the name, e.g.
// "Basic 1vCPU 2GB" or "General Purpose 4vCPU 16GB". The table already shows
// type and specs in their own columns, so strip that noise to a clean name.
function cleanTierName(rawName: string): string {
  let name = rawName;
  // Drop trailing "<n>vCPU <n>GB" / "<n> vCPU" / "<n>GB" tokens.
  name = name.replace(/\s+\d+\s*v?cpu(\s+\d+\s*gb)?/gi, "");
  name = name.replace(/\s+\d+\s*gb\b/gi, "");
  return name.trim() || rawName.trim();
}

// Transform product to pricing tier format
function productToPricingTier(product: Product): PricingTier {
  const monthlyPrice = product.price || 0;
  const yearlyPrice = product.yearly_price || monthlyPrice * 12 * 0.8; // 20% discount if not specified

  return {
    id: product.id,
    name: cleanTierName(product.name || ""),
    shortDescription: product.short_description || product.description || undefined,
    subType: product.sub || undefined,
    cpuType: product.cpu_type || undefined,
    machineType: product.machine_type || undefined,
    price: {
      monthly: monthlyPrice,
      yearly: yearlyPrice,
    },
    billingPeriod: product.billing_period || "per month",
    specs: buildSpecsFromResources(product),
    features: product.features || [],
    summary: product.summary || undefined,
    highlighted: product.is_highlighted || false,
    isFeatured: product.is_featured || false,
    ctaText: product.cta_text || "Get Started",
    ctaLink: product.cta_link || "/signup",
  };
}

// Transform promo to display format
function promoToDisplay(promo: PricingPromo): PricingPromoDisplay {
  return {
    badge: promo.badge,
    badgeNote: promo.badge_note || undefined,
    title: promo.title,
    description: promo.description,
    subtext: promo.subtext || undefined,
    priceOld: promo.price_old || undefined,
    priceCurrent: promo.price_current || undefined,
    linkText: promo.link_text,
    linkHref: promo.link_href,
  };
}

// Get pricing tiers for a category
export const PricingTiers = {
  get_by_category: async (categorySlug: string): Promise<PricingTier[]> => {
    try {
      const supabase = await createClient();
      
      // Map category slug to product type
      const typeMapping: Record<string, string> = {
        "compute": "compute",
        "gpu": "gpu",
        "gpu-instance": "gpu",
        "object-storage": "object-storage",
        "database": "database",
        "security": "security",
        "kubernetes": "kubernetes",
        "ai-deployment": "ai-deployment",
        "app-deployment": "app-deployment",
        "network-ddos": "network-ddos",
      };

      const productType = typeMapping[categorySlug] || categorySlug;

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("type", productType)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("price", { ascending: true });

      if (error) {
        handleQueryError("getting pricing tiers by category", error, "PricingTiers");
        return [];
      }

      return (data || []).map(productToPricingTier);
    } catch (err) {
      handleQueryError("getting pricing tiers by category", err, "PricingTiers");
      return [];
    }
  },
};

// Get full pricing data for the pricing page
export async function getFullPricingData(): Promise<ServiceCategory[]> {
  try {
    // Public catalog — read with the cookieless anon client so the /pricing
    // page can be statically generated / ISR'd (reading cookies here forced it
    // to render dynamically per request). Anon RLS behaviour is identical to the
    // previous unauthenticated path.
    const supabase = createServerSupabase();

    // Fetch all categories (inlined with the cookieless client rather than
    // PricingCategories.get_all(), which uses the cookie-bound client).
    const { data: categoriesData } = await supabase
      .from("pricing_categories")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    const categories = categoriesData || [];

    // Fetch all active promos
    const { data: allPromos } = await supabase
      .from("pricing_promos")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    // Fetch all products for pricing
    const { data: allProducts } = await supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("price", { ascending: true });

    // Group promos by category
    const promosByCategory: Record<string, PricingPromoDisplay[]> = {};
    (allPromos || []).forEach((promo) => {
      if (!promosByCategory[promo.category_slug]) {
        promosByCategory[promo.category_slug] = [];
      }
      promosByCategory[promo.category_slug].push(promoToDisplay(promo));
    });

    // Group products by type
    const productsByType: Record<string, Product[]> = {};
    (allProducts || []).forEach((product) => {
      const type = product.type;
      if (!productsByType[type]) {
        productsByType[type] = [];
      }
      productsByType[type].push(product);
    });

    // Build service categories
    const typeMapping: Record<string, string> = {
      "compute": "compute",
      "gpu": "gpu",
      "gpu-instance": "gpu",
      "object-storage": "object-storage",
      "database": "database",
      "security": "security",
      "kubernetes": "kubernetes",
      "ai-deployment": "ai-deployment",
      "app-deployment": "app-deployment",
      "network-ddos": "network-ddos",
    };

    const serviceCategories: ServiceCategory[] = categories.map((category) => {
      const categoryType = typeMapping[category.slug] || category.slug;
      const products = productsByType[categoryType] || [];
      const tiers = products.map(productToPricingTier);

      return {
        id: category.slug,
        label: category.label,
        description: category.description || undefined,
        startingPriceLabel: category.starting_price_label || undefined,
        startingPriceDescription: category.starting_price_description || undefined,
        promos: promosByCategory[category.slug] || [],
        tiers,
      };
    });

    return serviceCategories;
  } catch (err) {
    handleQueryError("getting full pricing data", err, "Pricing");
    return [];
  }
}
