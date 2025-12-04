import { NextRequest, NextResponse } from "next/server";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const name = (url.searchParams.get("name") || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }

    const endpoint = process.env.DO_SPACES_ENDPOINT || "https://nyc3.digitaloceanspaces.com";
    const accessKeyId = process.env.DO_SPACES_KEY || "";
    const secretAccessKey = process.env.DO_SPACES_SECRET || "";

    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    try {
      await client.send(new HeadBucketCommand({ Bucket: name }));
      // If it succeeds (200), bucket exists
      return NextResponse.json({ exists: true, statusCode: 200 });
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? null;
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
      return NextResponse.json({ exists: true, statusCode: status, error: String(err?.message || err) });
    }
  } catch (error: any) {
    console.error("check-bucket handler error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
