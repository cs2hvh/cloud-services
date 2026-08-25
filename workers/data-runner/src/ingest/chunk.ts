/**
 * Chunking + content hashing for connector ingestion.
 *
 * chunkPlainText is ported from lib/inference/doc-ingest.ts's chunkPlainText
 * (used for S3 file text in C3). For web-crawl the extractor already returns
 * paragraphs, which ARE the chunks. sha256 is the change-detection key (§6).
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§6, Slice C2/C3).
 */
import { createHash } from "node:crypto";

const MAX_CHUNKS_PER_DOC = 200;

/** SHA-256 of the extracted text — the incremental-sync change key. */
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Blank-line-delimited paragraph chunks, dropping short boilerplate and
 *  de-duping repeats — same convention as the manual ingest paths so
 *  connector-sourced rows read the same as file/URL-sourced ones. */
export function chunkPlainText(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length >= 40)
    .filter((line, i, arr) => arr.indexOf(line) === i)
    .slice(0, MAX_CHUNKS_PER_DOC);
}

/** Cap an already-extracted paragraph list (the web-crawl path). */
export function capChunks(paragraphs: string[]): string[] {
  return paragraphs.filter((p) => p.trim().length >= 40).slice(0, MAX_CHUNKS_PER_DOC);
}
