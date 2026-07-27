import {
  required,
  optional,
  optionalInt,
  loadCoreEnv,
  type CoreRunnerEnv,
} from "@ahura/runner-core";

export interface RunnerEnv extends CoreRunnerEnv {
  // The inference gateway to call for embeddings. Typically
  // https://api.ahurasense.com/v1 — every embed goes through our own gateway
  // so it's metered + attributed to the customer org via on-behalf-of.
  inferenceBaseUrl: string;
  // Platform key authenticating the runner against the inference gateway. Must
  // have access to the embedding models connectors use. Flagged is_internal_service
  // so the gateway resolves billing to the customer org (X-Ahura-On-Behalf-Of-Org).
  inferencePlatformKey: string;
  // Decrypts connector source credentials (S3 secret) — the same DEK the
  // Next.js app's BYOK_DEK encrypts with (lib/inference/crypto.ts). Null = a
  // connector with a stored credential can't be synced (fail closed, error).
  credentialDek: string | null;

  // ── Scalability tunables (§4.3 of doc 20) ─────────────────────────────────
  // Documents fetched/extracted/embedded in parallel within one sync (bounded
  // so we never open thousands of sockets or flood the embed gateway).
  fetchConcurrency: number;
  // Chunks embedded per /v1/embeddings call (array input) — ~50-100x fewer
  // round-trips than one call per chunk.
  embedBatch: number;
  // Per-HTTP-call timeout for embed / source fetches.
  requestTimeoutMs: number;
  // Hard ceiling on documents processed in a single sync (cost/DoS bound;
  // a connector's config.max_documents can lower it further).
  maxDocumentsPerSync: number;
  // DEV-ONLY: allow crawl + webhook to reach private/loopback addresses (for a
  // local test server). NEVER set in production — same posture as agent-runner's
  // AGENT_WEBHOOK_ALLOW_PRIVATE. Default false everywhere.
  crawlAllowPrivate: boolean;
  // DEV-ONLY: allow custom S3-compatible endpoints to resolve to private
  // addresses (for local MinIO/s3rver only). Separate from crawlAllowPrivate so
  // a local crawl test cannot accidentally make S3 metadata endpoints reachable.
  s3EndpointAllowPrivate: boolean;

  // ── OCR fallback (§2 of doc 20) ───────────────────────────────────────────
  // When on, a text-less PDF (scanned page) and image objects are extracted via
  // /v1/ocr (billed per page, on-behalf-of). Off = scanned PDFs index empty and
  // images are skipped. Default on — the PDF path only fires when there's no
  // text layer, so a text-PDF corpus never triggers it.
  ocrEnabled: boolean;
  // The OCR model id the gateway routes (ahura/ocr-doc → Gemini-vision proxy).
  ocrModel: string;
  // A PDF whose extracted text is shorter than this is treated as scanned and
  // sent to OCR. Low enough that a real text PDF never trips it.
  ocrMinChars: number;
}

export function loadEnv(): RunnerEnv {
  return {
    ...loadCoreEnv(),

    inferenceBaseUrl: optional("INFERENCE_BASE_URL", "https://api.ahurasense.com/v1").replace(/\/+$/, ""),
    inferencePlatformKey: required("INFERENCE_PLATFORM_KEY"),
    credentialDek: process.env.BYOK_DEK?.trim() || null,

    fetchConcurrency: Math.max(1, optionalInt("FETCH_CONCURRENCY", 8)),
    embedBatch: Math.max(1, optionalInt("EMBED_BATCH", 96)),
    requestTimeoutMs: optionalInt("REQUEST_TIMEOUT_MS", 30_000),
    maxDocumentsPerSync: optionalInt("MAX_DOCUMENTS_PER_SYNC", 10_000),
    crawlAllowPrivate: optional("CRAWL_ALLOW_PRIVATE", "false").toLowerCase() === "true",
    s3EndpointAllowPrivate: optional("S3_ENDPOINT_ALLOW_PRIVATE", "false").toLowerCase() === "true",

    ocrEnabled: optional("OCR_ENABLED", "true").toLowerCase() !== "false",
    ocrModel: optional("OCR_MODEL", "ahura/ocr-doc"),
    ocrMinChars: optionalInt("OCR_MIN_CHARS", 20),
  };
}
