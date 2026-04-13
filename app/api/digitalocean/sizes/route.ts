import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import {
  getDropletSizes,
  DropletSize,
} from "@/lib/digitalocean/api/sizes";

// Cache duration: 1 hour
const CACHE_DURATION = 60 * 60 * 1000;
let cachedSizes: DropletSize[] | null = null;
let cacheTimestamp: number | null = null;

/**
 * GET - Fetch DigitalOcean droplet sizes
 * Query params:
 *   - kubernetes=true : Filter only Kubernetes-suitable sizes
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const kubernetesOnly = searchParams.get("kubernetes") === "true";

    // Check cache validity
    const now = Date.now();
    const isCacheValid =
      cachedSizes &&
      cacheTimestamp &&
      now - cacheTimestamp < CACHE_DURATION;

    let sizes: DropletSize[];

    if (isCacheValid && cachedSizes) {
      sizes = cachedSizes;
    } else {
      // Fetch fresh data from DigitalOcean
      sizes = await getDropletSizes();
      cachedSizes = sizes;
      cacheTimestamp = now;
    }

    // Filter for Kubernetes if requested
    if (kubernetesOnly) {
      sizes = sizes.filter(
        (size) =>
          size.vcpus >= 1 && size.memory >= 1024 && size.disk >= 25
      );
    }

    return NextResponse.json(
      {
        sizes,
        count: sizes.length,
        cached: isCacheValid,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[DigitalOcean Sizes API] Error:", error);

    logError("[DigitalOcean Sizes API]", error);

    return NextResponse.json(
      {
        error: sanitizeError(error),
        sizes: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
