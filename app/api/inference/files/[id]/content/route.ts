/**
 * GET /api/inference/files/[id]/content
 * Returns inline NDJSON stream or presigned R2 URL based on Accept header.
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceFileService } from "@/lib/services/inference";

function isFileId(s: string) { return /^file_[a-z0-9]+$/i.test(s); }

export const GET = withInferenceAuth("files-content", { limit: 60 }, async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx.params as { id: string };
  if (!isFileId(id)) return NextResponse.json({ error: "Invalid file id" }, { status: 400 });

  const accept = req.headers.get("accept") ?? "";
  const wantPresigned = accept.includes("application/json") && !accept.includes("application/x-ndjson");

  const result = await InferenceFileService.content(ctx.orgId, id, wantPresigned);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  if (result.data.type === "url") {
    return NextResponse.json({ url: result.data.url, expires_in: 6 * 3600 });
  }
  return new NextResponse(result.data.text, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson",
      "content-disposition": `attachment; filename="${result.data.filename.replace(/"/g, "")}"`,
    },
  });
});
