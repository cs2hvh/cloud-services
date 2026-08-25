/**
 * The source abstraction: a connector's source (S3 / web-crawl) exposes a
 * uniform, streamed list of documents. `list()` is an async generator so
 * memory stays O(page), not O(bucket) (§4.3). `load()` is lazy so the
 * etag/hash skip can avoid fetching an unchanged document's content entirely.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§6, Slice C2/C3).
 */
export interface SourceDoc {
  /** Stable identity of the document (s3://bucket/key | https://site/page). */
  sourceUri: string;
  /** S3 ETag / HTTP ETag — a cheap pre-hash skip when it matches the stored one. */
  etag: string | null;
  /** Fetch + extract + chunk this document. For web-crawl the page is already
   *  fetched (BFS needs its links), so this is pre-resolved; for S3 it lazily
   *  gets the object only when the etag skip didn't apply. */
  load(): Promise<{ chunks: string[]; contentSha256: string }>;
}

export interface Source {
  /** Stream the source's documents. Bounded by the connector's max_documents. */
  list(): AsyncGenerator<SourceDoc>;
  /** Release any client/connection (S3 client, etc.). */
  close?(): Promise<void>;
}
