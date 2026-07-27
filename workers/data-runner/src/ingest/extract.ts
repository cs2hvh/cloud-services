/**
 * Extract readable text from an S3 object's bytes, dispatched by the key's
 * extension. Ported from lib/inference/doc-ingest.ts (PDF via pdfjs-dist's Node
 * "legacy" build, DOCX via mammoth), plus HTML (reuses fetch.ts's tag-stripper)
 * and plain txt/md/json. Runs entirely in-process on the downloaded bytes.
 *
 * OCR fallback (§2): a scanned PDF has no text layer, so pdfjs yields ~nothing
 * and the page would be indexed as empty. When an OcrConfig is supplied, such a
 * PDF — and image objects, which have no text at all — are sent to /v1/ocr
 * (ingest/ocr.ts) and indexed from the returned markdown instead.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§4.2, §2, Slice C3).
 */
import mammoth from "mammoth";
import { extractParagraphs } from "./fetch.js";
import type { OcrFn } from "./ocr.js";

/** Types we extract text from directly (no model needed). */
export const TEXT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".html", ".htm", ".json"] as const;

/** Image types that are indexable ONLY via OCR — skipped entirely when OCR is
 *  off, so a bucket full of logos/screenshots isn't silently billed. */
export const OCR_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** OCR wiring passed down from the runner: the call itself + the char threshold
 *  below which a PDF is treated as scanned (empty text layer). */
export interface OcrConfig {
  fn: OcrFn;
  minChars: number;
}

function extOf(key: string): string {
  const base = key.split("/").pop() ?? key;
  const i = base.lastIndexOf(".");
  return i === -1 ? "" : base.slice(i).toLowerCase();
}

/** Whether a key is worth downloading. Image types count only when OCR is on. */
export function isSupportedKey(key: string, ocrEnabled = false): boolean {
  const ext = extOf(key);
  if ((TEXT_EXTENSIONS as readonly string[]).includes(ext)) return true;
  if (ocrEnabled && (OCR_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return true;
  return false;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const doc = await getDocument({ data, disableFontFace: true, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Extract text from an object's bytes. Returns "" for an unsupported/empty
 * type — the caller skips objects that yield no text (the lifecycle records a
 * per-doc note rather than aborting the sync). PDF/DOCX use their libraries;
 * HTML is tag-stripped; txt/md/json are decoded as UTF-8. When `ocr` is given,
 * a text-less PDF and image objects fall back to /v1/ocr.
 */
export async function extractText(key: string, buffer: Buffer, ocr?: OcrConfig): Promise<string> {
  const ext = extOf(key);
  switch (ext) {
    case ".pdf": {
      const text = await extractPdf(buffer);
      // No text layer → a scanned/image PDF. OCR it rather than index nothing.
      if (ocr && text.trim().length < ocr.minChars) {
        return (await ocr.fn(buffer, "application/pdf")).trim();
      }
      return text;
    }
    case ".docx":
      return extractDocx(buffer);
    case ".html":
    case ".htm":
      return extractParagraphs(buffer.toString("utf-8")).paragraphs.join("\n\n");
    case ".txt":
    case ".md":
    case ".json":
      return buffer.toString("utf-8");
    default:
      // Image types: OCR when available, else unsupported (skipped upstream).
      if (ocr && (OCR_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
        return (await ocr.fn(buffer, IMAGE_MIME[ext] ?? "image/png")).trim();
      }
      return ""; // unsupported — caller skips it
  }
}
