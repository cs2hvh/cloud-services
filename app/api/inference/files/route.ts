/**
 * GET  /api/inference/files — list files (OpenAI shape)
 * POST /api/inference/files — upload file (multipart or raw NDJSON)
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { InferenceFileService } from "@/lib/services/inference";
import { auditContextFrom } from "@/lib/inference/audit";

export const GET = withInferenceAuth("files-list", { limit: 60 }, async (req: NextRequest, ctx) => {
  const purposeFilter = new URL(req.url).searchParams.get("purpose") ?? undefined;
  const result = await InferenceFileService.list(ctx.orgId, purposeFilter);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ object: "list", data: result.data });
});

export const POST = withInferenceAuth("files-upload", { limit: 30 }, async (req: NextRequest, ctx) => {
  if (ctx.orgRole === "viewer") return NextResponse.json({ error: "Viewers cannot upload files" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  const purpose = "batch" as const;
  let filename = "upload.jsonl";
  let body: Buffer;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") return NextResponse.json({ error: "Missing `file` field in multipart body" }, { status: 400 });
      const purposeFromForm = form.get("purpose");
      if (purposeFromForm && purposeFromForm !== "batch") return NextResponse.json({ error: `purpose must be "batch" (got "${purposeFromForm}")` }, { status: 400 });
      filename = (file as File).name || "upload.jsonl";
      body = Buffer.from(await (file as File).arrayBuffer());
    } else {
      const url = new URL(req.url);
      const purposeParam = url.searchParams.get("purpose");
      if (purposeParam && purposeParam !== "batch") return NextResponse.json({ error: `purpose must be "batch" (got "${purposeParam}")` }, { status: 400 });
      filename = url.searchParams.get("filename") || "upload.jsonl";
      body = Buffer.from(await req.arrayBuffer());
    }
  } catch (err) {
    console.error("[files/route] body parse failed:", err);
    return NextResponse.json({ error: "Failed to read upload body" }, { status: 400 });
  }

  const result = await InferenceFileService.upload(ctx.orgId, ctx.userId, body, filename, purpose, auditContextFrom(req));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data, { status: 201 });
});
