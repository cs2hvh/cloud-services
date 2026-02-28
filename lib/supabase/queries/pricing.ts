import { createClient, createServiceClient } from "../server";
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
  price: {
    monthly: number;
    yearly: number;
  };
  billingPeriod?: string;
  specs?: string[];
  features: string[];
  summary?: {
    billing: string;
    support: string;
    provisioning: string;
    guarantee: string;
    buttonText: string;
  };
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

// Transform product to pricing tier format
function productToPricingTier(product: Product): PricingTier {
  const monthlyPrice = product.price || 0;
  const yearlyPrice = product.yearly_price || monthlyPrice * 12 * 0.8; // 20% discount if not specified

  return {
    id: product.id,
    name: product.name || "",
    shortDescription: product.short_description || product.description || undefined,
    price: {
      monthly: monthlyPrice,
      yearly: yearlyPrice,
    },
    billingPeriod: product.billing_period || "per month",
    specs: product.specs || undefined,
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
    const supabase = await createClient();

    // Fetch all categories
    const categories = await PricingCategories.get_all();

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
    const serviceCategories: ServiceCategory[] = categories.map((category) => {
      const products = productsByType[category.slug] || [];
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
