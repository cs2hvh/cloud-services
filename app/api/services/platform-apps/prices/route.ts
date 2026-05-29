import { NextResponse } from "next/server";
import { getAllPlatformAppRates } from "@/config/pricing";
import { PlatformAppBandwidthService } from "@/lib/services/platform-app-bandwidth";

const PLATFORM_APP_SIZES = ["small", "medium", "large", "xlarge", "xxlarge"] as const;

/**
 * GET /api/services/platform-apps/prices
 * Returns platform app pricing and quota details for all sizes from the products table.
 */
export async function GET() {
  try {
    const rates = await getAllPlatformAppRates();
    const quotas = Object.fromEntries(
      await Promise.all(
        PLATFORM_APP_SIZES.map(async (size) => [
          size,
          await PlatformAppBandwidthService.getQuotaForSize(size),
        ])
      )
    );
    
    // Extract just the monthly prices for each size
    const prices: Record<string, number> = {};
    for (const [size, data] of Object.entries(rates)) {
      prices[size] = data.price;
    }

    return NextResponse.json({
      success: true,
      prices,
      rates,
      quotas,
    });
  } catch (error) {
    console.error("[platform-apps/prices] Error fetching prices:", error);
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
