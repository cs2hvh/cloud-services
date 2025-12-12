import { NextRequest, NextResponse } from "next/server";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { createS3ClientFromAccessKey} from "@/lib/aws/s3-client";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const name = (url.searchParams.get("name") || "").trim();
    const region = (url.searchParams.get("region") || "nyc3").trim();
    if (!name) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }

    // Create S3 client from centralized factory (no direct key exposure here)
    const client = createS3ClientFromAccessKey(region);

    try {
      await client.send(new HeadBucketCommand({ Bucket: name }));
      // If it succeeds (200), bucket exists
      return NextResponse.json({ exists: true, statusCode: 200 });
    } catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number }; statusCode?: number }).$metadata?.httpStatusCode ?? (err as { statusCode?: number }).statusCode ?? null;
      if (status === 404) {
        // Bucket does not exist
        return NextResponse.json({ exists: false, statusCode: 404 });
      }
      // Treat 403/301/etc as the bucket existing but inaccessible/private
      if (status === 403 || status === 301 || status === 301) {
        return NextResponse.json({ exists: true, statusCode: status });
      }

      // Unknown error: log and fail conservatively (treat as existing)
      console.error("check-bucket error:", err);
      return NextResponse.json({ exists: true, statusCode: status, error: String(err instanceof Error ? err.message : err) });
    }
  } catch (error: unknown) {
    console.error("check-bucket handler error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
