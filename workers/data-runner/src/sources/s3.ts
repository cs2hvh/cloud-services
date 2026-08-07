/**
 * S3 (and S3-compatible: R2/MinIO/…) source. Streams the bucket via paginated
 * ListObjectsV2 (memory stays O(page), not O(bucket)), yielding one document
 * per object. The ETag comes from the LISTING — no download — so the
 * lifecycle's etag-skip avoids GetObject entirely for unchanged objects (the
 * S3 scalability win). load() lazily downloads + extracts only when needed.
 *
 * A custom endpoint (R2/MinIO) is SSRF-guarded before the client is built, so a
 * customer can't point "endpoint" at an internal address.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§6, §9, Slice C3).
 */
import http from "node:http";
import https from "node:https";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { pinnedLookup, resolveValidatedHost } from "../ingest/fetch.js";
import { extractText, isSupportedKey, type OcrConfig } from "../ingest/extract.js";
import { chunkPlainText, sha256 } from "../ingest/chunk.js";
import type { Source, SourceDoc } from "./types.js";
import type { Logger } from "../logger.js";

export interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string;
  prefix?: string;
  max_documents?: number;
}

export interface S3Credential {
  access_key_id: string;
  secret_access_key: string;
}

const MAX_OBJECT_BYTES = 20_000_000; // 20 MB per object
const LIST_PAGE = 1000;

export async function createS3Source(
  config: S3Config,
  credential: S3Credential,
  hardMaxDocuments: number,
  logger: Logger,
  allowPrivate = false,
  ocr?: OcrConfig
): Promise<Source> {
  // A custom endpoint (R2/MinIO/…) is customer-supplied, so it's the SSRF
  // surface. Validating the URL isn't sufficient on its own: the SDK resolves
  // the host again when it connects, and a hostile record can flip to an
  // internal address in between (DNS rebinding). So validate AND pin every
  // socket to the address we checked — the same discipline pinnedFetch uses
  // for the crawler. Real AWS endpoints are left unpinned: they're not
  // customer-controlled and S3 legitimately rotates across many addresses.
  let pinnedHandler: NodeHttpHandler | undefined;
  if (config.endpoint) {
    // allowPrivate is the same dev-only escape hatch the crawler uses
    // (CRAWL_ALLOW_PRIVATE, default false, absent from k8s) — it exists so a
    // local MinIO can be used as a test target. Pinning still applies.
    const { ip } = await resolveValidatedHost(config.endpoint, allowPrivate);
    const lookup = pinnedLookup(ip);
    pinnedHandler = new NodeHttpHandler({
      httpAgent: new http.Agent({ lookup }),
      httpsAgent: new https.Agent({ lookup }),
    });
  }

  const client = new S3Client({
    region: config.region ?? "auto",
    ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
    ...(pinnedHandler ? { requestHandler: pinnedHandler } : {}),
    credentials: { accessKeyId: credential.access_key_id, secretAccessKey: credential.secret_access_key },
  });

  const maxDocs = Math.min(config.max_documents ?? hardMaxDocuments, hardMaxDocuments);

  return {
    async *list(): AsyncGenerator<SourceDoc> {
      let token: string | undefined;
      let emitted = 0;
      do {
        const res = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: config.prefix || undefined,
            ContinuationToken: token,
            MaxKeys: LIST_PAGE,
          })
        );
        for (const obj of res.Contents ?? []) {
          if (emitted >= maxDocs) return;
          const key = obj.Key;
          if (!key || key.endsWith("/")) continue; // skip "directory" placeholder keys
          // Image types only count as supported when OCR is on (else skipped,
          // no download) — so an OCR-off bucket never pays to download logos.
          if (!isSupportedKey(key, !!ocr)) continue;
          emitted++;
          yield {
            sourceUri: `s3://${config.bucket}/${key}`,
            etag: obj.ETag ?? null, // from the listing — the skip avoids a download
            load: async () => {
              const got = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
              const bytes = await streamToBuffer(got.Body, MAX_OBJECT_BYTES);
              const text = await extractText(key, bytes, ocr);
              const chunks = chunkPlainText(text);
              if (chunks.length === 0) {
                logger.warn({ key }, "s3: object extracted no text, skipping");
              }
              return { chunks, contentSha256: sha256(text) };
            },
          };
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
    },
    async close() {
      client.destroy();
    },
  };
}

/** Read an S3 GetObject body (a Node Readable / async-iterable) into a Buffer,
 *  capped at maxBytes so one huge object can't blow memory. */
async function streamToBuffer(body: unknown, maxBytes: number): Promise<Buffer> {
  if (!body || typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== "function") {
    throw new Error("empty or unreadable object body");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > maxBytes) throw new Error(`object too large (>${maxBytes} bytes)`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
