/**
 * OCR fallback client — extracts text from scanned/image documents by calling
 * the inference gateway's /v1/ocr (model ahura/ocr-doc, a Gemini-vision proxy,
 * billed per page), attributed to the customer org via X-Ahura-On-Behalf-Of-Org.
 * That is the same on-behalf-of metering path embed.ts uses, which is why
 * connector OCR needs NO new billing wiring — it rides the existing /v1/ocr
 * usage pipeline exactly like ingestion embeddings ride /v1/embeddings.
 *
 * Used by extract.ts when a PDF has no text layer (a scanned page → pdfjs
 * yields nothing) or the object is an image. A 402 (org over its spend cap) is
 * surfaced via isSpendBlocked so the lifecycle stops the whole sync cleanly,
 * exactly like a 402 from embeddings.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§2, OCR-in-ingestion).
 */
import type { RunnerEnv } from "../env.js";

export class OcrError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "OcrError";
  }
  /** A spend-cap / balance rejection — the whole sync should stop, not retry. */
  get isSpendBlocked(): boolean {
    return this.status === 402;
  }
}

/** Extract text from a document's raw bytes. `mediaType` is an OCR-supported
 *  MIME (application/pdf, image/png, image/jpeg, image/webp, image/gif). */
export type OcrFn = (bytes: Buffer, mediaType: string) => Promise<string>;

interface OcrResponse {
  pages?: Array<{ page: number; markdown: string }>;
}

/** Build an OcrFn bound to one org's billing context. */
export function makeOcrFn(env: RunnerEnv, orgId: string): OcrFn {
  return async (bytes, mediaType) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.requestTimeoutMs);
    try {
      const res = await fetch(`${env.inferenceBaseUrl}/ocr`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.inferencePlatformKey}`,
          "Content-Type": "application/json",
          "X-Ahura-On-Behalf-Of-Org": orgId,
        },
        body: JSON.stringify({
          model: env.ocrModel,
          document: { type: "base64", data: bytes.toString("base64"), media_type: mediaType },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new OcrError(res.status, `ocr HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const body = (await res.json()) as OcrResponse;
      // One document → many pages; join into a single text blob that chunk.ts
      // then splits normally (page structure isn't preserved beyond a blank line).
      return (body.pages ?? [])
        .map((p) => p.markdown)
        .join("\n\n")
        .trim();
    } catch (err) {
      if (err instanceof OcrError) throw err;
      // Network/abort/timeout — transient 503-class failure (per-doc, not fatal).
      throw new OcrError(503, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  };
}
