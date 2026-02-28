import { NextRequest, NextResponse } from "next/server";
import { getFullPricingData, PricingCategories, PricingPromos, PricingTiers } from "@/lib/supabase/queries/pricing";

// Cache pricing data for 5 minutes
const CACHE_MAX_AGE = 300; // 5 minutes

// GET - Fetch pricing data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    // If category is specified, return data for that category only
    if (category) {
      const [categoryData, promos, tiers] = await Promise.all([
        PricingCategories.get_by_slug(category),
        PricingPromos.get_by_category(category),
        PricingTiers.get_by_category(category),
      ]);

      if (!categoryData) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 404 }
        );
      }

      const response = NextResponse.json({
        category: {
          id: categoryData.slug,
          label: categoryData.label,
          description: categoryData.description,
          startingPriceLabel: categoryData.starting_price_label,
          startingPriceDescription: categoryData.starting_price_description,
          promos: promos.map((p) => ({
            badge: p.badge,
            badgeNote: p.badge_note,
            title: p.title,
            description: p.description,
            subtext: p.subtext,
            priceOld: p.price_old,
            priceCurrent: p.price_current,
            linkText: p.link_text,
            linkHref: p.link_href,
          })),
          tiers,
        },
      });

      // Add cache headers
      response.headers.set(
        "Cache-Control",
        `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_MAX_AGE * 2}`
      );

      return response;
    }

    // Return all pricing data
    const pricingData = await getFullPricingData();

    const response = NextResponse.json({
      categories: pricingData,
      count: pricingData.length,
    });

    // Add cache headers
    response.headers.set(
      "Cache-Control",
      `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_MAX_AGE * 2}`
    );

    return response;
  } catch (error) {
    console.error("[Pricing API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing data" },
      { status: 500 }
    );
  }
}
