/**
 * Web-crawl source: BFS from a seed URL, same-origin only, bounded by
 * max_pages / max_depth / max_documents. Each visited page is one document
 * (source_uri = the URL). Crawl fetches every page to discover its links, so
 * load() returns the already-fetched chunks (the content-hash skip in the
 * lifecycle then avoids re-embedding an unchanged page).
 *
 * Sequential by design in C2 — BFS needs a page's links before its children,
 * so per-page parallelism is awkward; the FETCH_CONCURRENCY pool is reserved
 * for S3 (C3), where objects are independent. Embed batching (the real cost)
 * still applies. A page that fails to fetch is skipped, never aborting the crawl.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§6, §9, Slice C2).
 */
import { assertPublicHttpUrl, fetchPage, PageFetchError } from "../ingest/fetch.js";
import { capChunks, sha256 } from "../ingest/chunk.js";
import type { Source, SourceDoc } from "./types.js";
import type { Logger } from "../logger.js";

export interface WebCrawlConfig {
  seed_url: string;
  max_pages?: number;
  max_depth?: number;
  max_documents?: number;
}

const HARD_MAX_PAGES = 1000;

export function createWebCrawlSource(
  config: WebCrawlConfig,
  hardMaxDocuments: number,
  logger: Logger,
  allowPrivate = false
): Source {
  const seed = config.seed_url;
  const maxPages = Math.min(Math.max(config.max_pages ?? 50, 1), HARD_MAX_PAGES);
  const maxDepth = Math.min(Math.max(config.max_depth ?? 2, 0), 5);
  const maxDocs = Math.min(config.max_documents ?? maxPages, maxPages, hardMaxDocuments);

  return {
    async *list(): AsyncGenerator<SourceDoc> {
      await assertPublicHttpUrl(seed, allowPrivate); // fail fast on a bad/internal seed

      const visited = new Set<string>();
      const queue: Array<{ url: string; depth: number }> = [{ url: seed, depth: 0 }];
      let emitted = 0;

      while (queue.length > 0 && emitted < maxDocs) {
        const { url, depth } = queue.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        let page;
        try {
          page = await fetchPage(url, allowPrivate);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // The SEED failing means there is no crawl at all — that's a
          // connector-level failure the customer must see (status=error +
          // sync.failed webhook), not a "completed sync with 1 bad doc"
          // (found live, C4 testing). Child-page failures below stay per-doc.
          if (depth === 0) {
            throw new Error(`Could not fetch the starting URL: ${msg}`);
          }
          // GONE (404/410/unindexable) → skip entirely, so the reconcile
          // tombstones its rows: the page really is no longer there.
          if (err instanceof PageFetchError && err.isGone) {
            logger.warn({ url, err: msg }, "crawl: page gone, will be tombstoned");
            continue;
          }
          // TEMPORARILY BROKEN (5xx / network / timeout) → still emit the doc,
          // with a load() that rejects. The lifecycle then records a per-doc
          // failure and marks it SEEN, so the reconcile does NOT delete its
          // existing rows — a transient outage must not wipe good content
          // from the KB (found live, C4 testing).
          emitted++;
          logger.warn({ url, err: msg }, "crawl: page temporarily failed, keeping existing rows");
          yield {
            sourceUri: url,
            etag: null,
            load: async () => {
              throw new Error(msg);
            },
          };
          continue;
        }

        // Enqueue same-origin children for BFS (bounded by depth).
        if (depth < maxDepth) {
          for (const link of page.links) {
            if (!visited.has(link) && queue.length + visited.size < maxPages * 4) {
              queue.push({ url: link, depth: depth + 1 });
            }
          }
        }

        const chunks = capChunks(page.paragraphs);
        if (chunks.length === 0) continue; // no readable content — don't emit an empty doc

        emitted++;
        const contentSha256 = sha256(chunks.join("\n\n"));
        const etag = page.etag;
        yield {
          sourceUri: url,
          etag,
          load: async () => ({ chunks, contentSha256 }),
        };
      }
    },
  };
}
