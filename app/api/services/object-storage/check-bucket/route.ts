import { NextRequest, NextResponse } from "next/server";
import { HeadBucketCommand } from "@aws-sdk/client-s3";

import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { logError } from "@/lib/api/error-sanitizer";
import { validateBucketNameFormat } from "@/lib/validation/object-storage";

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

// SECURITY (F4, 2026-09-06 live pentest). This route was the one file under
// object-storage/ with no guard: anyone on the internet could make the server
// sign seven HeadBucket requests with the platform's Spaces credentials for any
// name, with no rate limit, and read the exists/not-exists answer. Worse, the
// `region` parameter went straight into the S3 endpoint host
// (`https://${region}.digitaloceanspaces.com`), so a crafted value pointed the
// signed request at a host of the caller's choosing. Now: a session is
// required, the name must be a valid bucket name (it becomes a hostname label),
// the region must be one of ours, and each user gets a small budget per minute.
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:bucket-check", limit: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const name = (url.searchParams.get("name") || "").trim();
    const requestedRegion = (url.searchParams.get("region") || DEFAULT_REGION).trim();

    if (!name) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }
    const shape = validateBucketNameFormat(name);
    if (!shape.valid) {
      return NextResponse.json({ error: shape.error ?? "Invalid bucket name" }, { status: 400 });
    }
    if (!GLOBAL_SPACES_REGIONS.includes(requestedRegion)) {
      return NextResponse.json({ error: "Unknown region" }, { status: 400 });
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
        logError("services/object-storage/check-bucket", err);
        return NextResponse.json({
          exists: true,
          available: false,
          statusCode: status,
          checkedRegion: region,
          error: "Failed to check bucket availability",
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
