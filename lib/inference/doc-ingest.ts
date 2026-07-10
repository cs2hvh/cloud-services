/**
 * Extracts readable text from an uploaded document (PDF, DOCX, or plain
 * text/markdown), for seeding a vector collection from a file instead of
 * pasted text or a URL. Used by
 * /api/inference/vector/collections/[id]/ingest-file.
 *
 * PDF via pdfjs-dist's Node ("legacy") build — already a project dependency,
 * previously unused. DOCX via mammoth (raw-text mode, no styling/HTML kept).
 * Both run entirely in-process on the uploaded bytes; nothing is written to
 * disk or fetched over the network, so this has no SSRF surface like
 * url-ingest.ts does.
 */
import mammoth from "mammoth";

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export const MAX_FILE_BYTES = 10_000_000; // 10MB per file

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

export function isSupportedFilename(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extOf(filename));
}

/**
 * Same paragraph-chunking convention as url-ingest.ts's extractParagraphs:
 * blank-line-delimited, drop short boilerplate (<40 chars), de-dupe repeats,
 * cap at 100 — kept consistent so file-sourced and URL-sourced rows read the
 * same way in a collection.
 */
export function chunkPlainText(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length >= 40)
    .filter((line, i, arr) => arr.indexOf(line) === i)
    .slice(0, 100);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const doc = await getDocument({ data, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

export type ExtractedDocument = { filename: string; paragraphs: string[] };

/**
 * Dispatches by file extension, extracts text, and chunks it into
 * paragraphs. Throws a customer-facing error for unsupported types or files
 * that yield no usable text (scanned/image-only PDF, empty file, ...).
 */
export async function extractDocumentText(filename: string, buffer: Buffer): Promise<ExtractedDocument> {
  const ext = extOf(filename);
  let text: string;
  switch (ext) {
    case ".pdf":
      text = await extractPdfText(buffer);
      break;
    case ".docx":
      text = await extractDocxText(buffer);
      break;
    case ".txt":
    case ".md":
      text = buffer.toString("utf-8");
      break;
    default:
      throw new Error(`Unsupported file type "${ext || filename}" — supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }

  const paragraphs = chunkPlainText(text);
  if (paragraphs.length === 0) {
    throw new Error(`No readable text extracted from "${filename}" — it may be empty, scanned, or image-only`);
  }
  return { filename, paragraphs };
}
