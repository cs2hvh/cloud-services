import { NextResponse } from "next/server";
import { getAllPlatformAppRates } from "@/config/pricing";

/**
 * GET /api/services/platform-apps/prices
 * Returns platform app pricing for all sizes from the products table
 */
export async function GET() {
  try {
    const rates = await getAllPlatformAppRates();
    
    // Extract just the monthly prices for each size
    const prices: Record<string, number> = {};
    for (const [size, data] of Object.entries(rates)) {
      prices[size] = data.price;
    }

    return NextResponse.json({
      success: true,
      prices,
      rates, // Also include full rates data if needed
    });
  } catch (error) {
    console.error("[platform-apps/prices] Error fetching prices:", error);
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
