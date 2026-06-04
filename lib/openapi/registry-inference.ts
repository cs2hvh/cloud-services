/**
 * Separate OpenAPI registry for the Inference Edge Gateway.
 *
 * The gateway runs at api.ahurasense.com as a Cloudflare Worker — a
 * different service, base URL, and auth scheme from the platform API
 * (galaxyhvh.com/api/v1). Keeping it in its own registry prevents the
 * two specs from merging and means generate-inference-openapi.ts can
 * output a self-contained spec to workers/inference/openapi.json.
 */
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registerInferencePaths } from '@/lib/openapi/paths/inference';

export const inferenceRegistry = new OpenAPIRegistry();

inferenceRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'AhuraCloud Inference API Key',
  description:
    'API key prefixed with `ahu_`. Generate one from the **Inference → API Keys** dashboard.\n\nExample: `Authorization: Bearer ahu_live_abc123def456`',
});

registerInferencePaths(inferenceRegistry);

export function generateInferenceOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(inferenceRegistry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'AhuraCloud Inference Gateway API',
      version: '1.0.0',
      description: `
# AhuraCloud Inference Gateway

OpenAI-compatible LLM gateway at \`api.ahurasense.com/v1/\`. Use it as a drop-in replacement for the OpenAI SDK — change \`base_url\` and your API key.

## Authentication

All endpoints (except \`/v1/health\`) require a Bearer token:

\`\`\`
Authorization: Bearer ahu_YOUR_API_KEY
\`\`\`

Keys are managed from the **Inference → API Keys** dashboard. Keys always start with \`ahu_\`.

## Request Pipeline

Every authenticated request flows through these stages before reaching the model:

\`\`\`
Client → Auth (KV hot-cache → Postgres fallback)
       → Spend Check  (block if monthly hard-cap reached → 402)
       → Rate Limit   (token-bucket per key → 429)
       → Route Handler (preset → guardrail → cache → upstream → usage event)
\`\`\`

## Rate Limits

Token-bucket rate limiting is enforced per API key via Cloudflare Durable Objects.

| Tier | Default RPM | Burst |
|------|------------|-------|
| Platform default | 600 RPM (10 RPS) | ~60 tokens (~6 s of capacity) |
| Custom (per key) | 1 – 10 000 RPM | max(10, ceil(rps × 6)) |

Burst absorbs short spikes — a key allowed 10 RPS can still fire 60 requests in one second before being throttled. Configure per-key limits from the **API Keys** page.

Rate-limit response headers (every authenticated response):
- \`X-Ahura-RateLimit-Remaining\` — tokens remaining in the current bucket
- \`Retry-After\` — seconds until a token is available (only on **429** responses)

## Spend Controls

Two hard-cap levels are checked **before** any upstream call (so you are never charged for a rejected request):
- **Key-level hard cap** — set per API key
- **Org-level hard cap** — set in Inference Settings; prevents any single key from exceeding the org ceiling

Once the lower cap is hit, every request returns **402** until raised or the billing period resets.

## Caching

Two independent layers reduce cost and latency:

| Layer | Mechanism | Bypass |
|-------|-----------|--------|
| L1 exact-match | Cloudflare KV — identical inputs return a stored response | \`X-Ahura-Cache: off\` or \`Cache-Control: no-cache\` |
| Semantic (L2) | pgvector cosine similarity — near-duplicate prompts reuse prior answers | Same as L1 |

ZDR-enabled keys always skip cache regardless of the \`X-Ahura-Cache\` header.

## Billing Modes

- **\`platform\`** (default) — usage billed to your AhuraCloud account; the gateway uses the platform OpenRouter key.
- **\`byok\`** — your own upstream API key; no platform billing. Requires a BYOK key configured in the dashboard. Pass \`X-Ahura-Billing: byok\` + \`X-Ahura-BYOK-Provider: <provider>\`.

## Guardrails (chat endpoints only)

Prompt-injection detection scans user/system text before the upstream call:

| \`X-Ahura-Guardrail\` | Behaviour |
|----------------------|-----------|
| \`off\` | Skip evaluation |
| \`warn\` (default) | Detect, log, and set response header; request proceeds |
| \`block\` | Return **400** \`guardrail_blocked\` if patterns found |

The response header \`X-Ahura-Guardrail\` is always set to \`clean\`, \`flagged\`, or \`blocked\`.

## Errors

All error responses use a consistent envelope:

\`\`\`json
{
  "error": {
    "message": "Human-readable description",
    "type": "invalid_request_error",
    "code": "model_not_allowed",
    "request_id": "uuid"
  }
}
\`\`\`

| HTTP | \`type\` | When |
|------|---------|------|
| 400 | \`invalid_request_error\` | Validation, bad JSON, guardrail blocked, BYOK unavailable |
| 401 | \`authentication_error\` | Key missing, malformed, invalid, or expired |
| 402 | \`billing_error\` | Monthly hard cap reached |
| 403 | \`permission_error\` | Model not on key allowlist, source IP blocked |
| 429 | \`rate_limit_error\` | Token bucket exhausted |
| 500 | \`internal_error\` | Gateway fault |
| 503 | \`service_unavailable\` | Model deployment unreachable |
      `.trim(),
      contact: {
        name: 'AhuraCloud Support',
        email: 'support@ahurasense.com',
      },
    },
    servers: [
      {
        url: 'https://api.ahurasense.com',
        description: 'Production',
      },
      {
        url: 'http://localhost:8787',
        description: 'Local dev (wrangler dev)',
      },
    ],
    tags: [
      { name: 'Health', description: 'Unauthenticated gateway health endpoint.' },
      {
        name: 'Chat',
        description:
          'OpenAI-compatible chat completion endpoint. Supports streaming (SSE) and non-streaming responses, tool calling, and structured output.',
      },
      {
        name: 'Messages',
        description:
          'Anthropic Messages API compatibility shim. Accepts Anthropic-shaped requests and returns Anthropic-shaped responses; internally proxied through OpenRouter.',
      },
      {
        name: 'Embeddings',
        description:
          'OpenAI-compatible text embedding endpoint. Supports batch inputs and a deterministic L1 KV cache.',
      },
      {
        name: 'Models',
        description:
          'Model catalog — public frontier models and private org models (fine-tunes, BYO deployments).',
      },
      {
        name: 'Keys',
        description: 'API key introspection — identity, model scopes, and current-month spend snapshot.',
      },
    ],
  });
}
