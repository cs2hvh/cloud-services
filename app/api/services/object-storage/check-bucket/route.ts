import { NextRequest, NextResponse } from "next/server";
import { HeadBucketCommand } from "@aws-sdk/client-s3";

import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";

const DEFAULT_REGION = "nyc3";
const GLOBAL_SPACES_REGIONS = ["nyc3", "sfo3", "ams3", "sgp1", "fra1", "tor1", "blr1"];

function extractStatus(err: unknown): number | null {
  const e = err as {
    $metadata?: { httpStatusCode?: number };
    statusCode?: number;
  };
  return e.$metadata?.httpStatusCode ?? e.statusCode ?? null;
}

function shouldTreatAsExisting(err: unknown, status: number | null): boolean {
  const e = err as { name?: string; Code?: string; code?: string };
  const code = e.Code || e.code || e.name || "";

  if (
    code === "BucketAlreadyExists" ||
    code === "BucketAlreadyOwnedByYou" ||
    code === "AccessDenied" ||
    code === "PermanentRedirect" ||
    code === "MovedPermanently"
  ) {
    return true;
  }

  // Common bucket-exists statuses for inaccessible / other-region buckets.
  return status === 200 || status === 301 || status === 302 || status === 307 || status === 308 || status === 403;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const name = (url.searchParams.get("name") || "").trim();
    const requestedRegion = (url.searchParams.get("region") || DEFAULT_REGION).trim();

    if (!name) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }

    // Probe requested region first, then all other known Spaces regions.
    const regionsToCheck = [
      requestedRegion,
      ...GLOBAL_SPACES_REGIONS.filter((region) => region !== requestedRegion),
    ];

    for (const region of regionsToCheck) {
      const client = createS3ClientFromAccessKey(region);

      try {
        await client.send(new HeadBucketCommand({ Bucket: name }));
        return NextResponse.json({
          exists: true,
          available: false,
          statusCode: 200,
          checkedRegion: region,
        });
      } catch (err: unknown) {
        const status = extractStatus(err);

        // 404 in one region is inconclusive for global uniqueness; keep probing.
        if (status === 404) {
          continue;
        }

        if (shouldTreatAsExisting(err, status)) {
          return NextResponse.json({
            exists: true,
            available: false,
            statusCode: status,
            checkedRegion: region,
          });
        }

        // Unknown issue: fail conservative (unavailable) so we don't allow collisions.
        console.error("check-bucket error:", err);
        return NextResponse.json({
          exists: true,
          available: false,
          statusCode: status,
          checkedRegion: region,
          error: String(err instanceof Error ? err.message : err),
        });
      }
    }

    // If all checks returned 404, treat as globally available.
    return NextResponse.json({
      exists: false,
      available: true,
      statusCode: 404,
      checkedRegions: regionsToCheck,
    });
  } catch (error: unknown) {
    console.error("check-bucket handler error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
