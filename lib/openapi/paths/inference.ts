import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import {
  InferenceErrorSchema,
  InferenceBillingErrorSchema,
  InferenceRateLimitErrorSchema,
  HealthResponseSchema,
  ChatRequestHeadersSchema,
  InferenceRequestHeadersSchema,
  ChatRequestSchema,
  ChatResponseSchema,
  AnthropicRequestSchema,
  AnthropicResponseSchema,
  EmbeddingsRequestSchema,
  EmbeddingsResponseSchema,
  ModelListResponseSchema,
  KeyInfoSchema,
} from '@/lib/openapi/schemas/inference';

// ─── Shared response helpers ──────────────────────────────────────

function errorResponse(description: string, schema: z.ZodType, example: unknown) {
  return {
    description,
    content: { 'application/json': { schema, example } },
  };
}

const responses401 = errorResponse(
  'Unauthorized — API key missing, malformed (must start with `ahu_`), invalid, or expired.',
  InferenceErrorSchema,
  { error: { message: 'Missing API key', type: 'authentication_error', code: 'key_missing' } }
);

const responses402 = {
  description: 'Payment Required — monthly hard cap reached. The request was **not** forwarded upstream; you were not charged.',
  content: {
    'application/json': {
      schema: InferenceBillingErrorSchema,
      example: {
        error: {
          message: "Reached the organization's monthly hard cap of 50.00 USD for 2026-06. Raise the org cap on the Inference Settings page.",
          type: 'billing_error',
          code: 'org_hard_cap_reached',
          scope: 'org',
          spent_cents: 5000,
          hard_cap_cents: 5000,
        },
      },
    },
  },
};

const responses429 = {
  description: 'Too Many Requests — per-key token bucket exhausted. Back off by `Retry-After` seconds (or `error.retry_after_ms` milliseconds).\n\nDefault limit: **600 RPM** (10 RPS) with a burst of ~60 tokens. Configurable per key (1–10 000 RPM) from the API Keys dashboard.',
  content: {
    'application/json': {
      schema: InferenceRateLimitErrorSchema,
      example: {
        error: { message: 'Rate limit exceeded', type: 'rate_limit_error', code: 'rate_limit_exceeded', retry_after_ms: 850 },
      },
    },
  },
};

const responses500 = errorResponse(
  'Internal gateway error. Stack traces are never included.',
  InferenceErrorSchema,
  { error: { message: 'Internal gateway error', type: 'internal_error', code: 'internal_error', request_id: '550e8400-e29b-41d4-a716-446655440000' } }
);

const responses503 = errorResponse(
  'Service Unavailable — the model\'s serving pod is not reachable (e.g. still warming up after a cold start).',
  InferenceErrorSchema,
  { error: { message: 'Model "my-finetune-v2" serving pod is warming up. Retry in ~30 seconds.', type: 'service_unavailable', code: 'model_unavailable' } }
);

// ─── Path registrations ───────────────────────────────────────────

export function registerInferencePaths(registry: OpenAPIRegistry) {
  // ── GET /v1/health ──────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/v1/health',
    tags: ['Health'],
    summary: 'Gateway health check',
    operationId: 'getHealth',
    security: [],
    description: 'Returns the operational status of the gateway. No authentication required. Use this for uptime monitoring and readiness probes.',
    responses: {
      200: {
        description: 'Gateway is healthy',
        content: {
          'application/json': {
            schema: HealthResponseSchema,
            example: { status: 'ok', version: '1.2.0', env: 'production', timestamp: '2026-06-04T12:00:00.000Z' },
          },
        },
      },
    },
  });

  // ── POST /v1/chat/completions ───────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/v1/chat/completions',
    tags: ['Chat'],
    summary: 'Create chat completion',
    operationId: 'createChatCompletion',
    security: [{ bearerAuth: [] }],
    description: `Creates a model response for the given conversation. OpenAI Chat Completions API-compatible — any SDK targeting OpenAI works by changing \`base_url\` and \`api_key\`.

**Streaming** — set \`"stream": true\` to receive a Server-Sent Events stream. Each \`data:\` line contains a ChatCompletionChunk JSON object (OpenAI delta format). The stream ends with \`data: [DONE]\`.

**Presets** — pass \`X-Ahura-Preset: <name>\` to apply a saved org configuration (model, temperature, system prompt, etc.). Body fields override preset values.

**Guardrails** — pass \`X-Ahura-Guardrail: block\` to enforce prompt-injection protection (default policy: \`warn\`).

**Model routing** — proxy (frontier) models are forwarded to OpenRouter; fine-tuned and BYO models are forwarded to their RunPod serving URL.

**Response headers set on every request:**
- \`X-Ahura-Request-Id\` — trace ID
- \`X-Ahura-Model\` — resolved model (after preset expansion)
- \`X-Ahura-RateLimit-Remaining\` — tokens left in the bucket
- \`X-Ahura-Cache\` — \`hit | miss | bypass\`
- \`X-Ahura-Cache-Age\` — seconds (only on cache hits)
- \`X-Ahura-Guardrail\` — \`clean | flagged | blocked\`
- \`X-Ahura-Cost-Cents\` — cost in USD cents (non-cached upstream responses)`,
    request: {
      headers: ChatRequestHeadersSchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: ChatRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Successful completion. Returns `application/json` for non-streaming and `text/event-stream` for streaming.',
        content: {
          'application/json': {
            schema: ChatResponseSchema,
            example: {
              id: 'chatcmpl-abc123',
              object: 'chat.completion',
              created: 1749038400,
              model: 'openai/gpt-4o',
              choices: [{ index: 0, message: { role: 'assistant', content: 'The answer is 4.' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 18, completion_tokens: 7, total_tokens: 25 },
            },
          },
          'text/event-stream': {
            schema: z.string().openapi({
              description: 'SSE stream. Lines: `data: <ChatCompletionChunk json>`. Ends with `data: [DONE]`.\n\nExample chunk:\n```\ndata: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n```',
            }),
          },
        },
      },
      400: errorResponse(
        'Bad request — validation failure, bad JSON, guardrail blocked, BYOK unavailable, or preset not found.',
        InferenceErrorSchema,
        {
          error: {
            message: 'Request blocked by prompt-injection guardrail (patterns: role_override_1)',
            type: 'invalid_request_error',
            code: 'guardrail_blocked',
            request_id: '550e8400-e29b-41d4-a716-446655440000',
          },
        }
      ),
      401: responses401,
      402: responses402,
      403: errorResponse(
        'Forbidden — model not on this key\'s allowlist, or source IP blocked.',
        InferenceErrorSchema,
        { error: { message: 'Model "openai/gpt-4o" is not allowed for this API key', type: 'permission_error', code: 'model_not_allowed' } }
      ),
      429: responses429,
      500: responses500,
      503: responses503,
    },
  });

  // ── POST /v1/messages ───────────────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/v1/messages',
    tags: ['Messages'],
    summary: 'Create message (Anthropic API shim)',
    operationId: 'createMessage',
    security: [{ bearerAuth: [] }],
    description: `Anthropic Messages API compatibility shim. Accepts an Anthropic-shaped request and returns an Anthropic-shaped response, so code written against the Anthropic SDK works without modification.

Internally the gateway translates to OpenAI Chat Completions, forwards to OpenRouter, then translates the response back.

**Supported (Phase 1):**
- Text content (string or \`[{type:"text"}]\` blocks)
- Image content (base64 source blocks → OpenAI \`image_url\` data URIs)
- System prompt as string or array of text blocks
- Streaming — OpenAI SSE is translated to Anthropic event-named SSE (\`message_start\`, \`content_block_delta\`, \`message_delta\`, \`message_stop\`)
- Tool calling pass-through

**Not yet supported (Phase 2):**
- Tool-use response streaming (streams as text-only deltas)
- \`cache_control\` block hints
- Container/code-execution tools`,
    request: {
      headers: InferenceRequestHeadersSchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: AnthropicRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Successful completion. Returns `application/json` or `text/event-stream` (Anthropic SSE event format).',
        content: {
          'application/json': {
            schema: AnthropicResponseSchema,
            example: {
              id: 'msg_01abc',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
              model: 'claude-3-5-sonnet-20241022',
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 12, output_tokens: 10 },
            },
          },
          'text/event-stream': {
            schema: z.string().openapi({
              description: 'Anthropic-format SSE. Events: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`.',
            }),
          },
        },
      },
      400: errorResponse('Bad request.', InferenceErrorSchema, {
        error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 'invalid_json' },
      }),
      401: responses401,
      402: responses402,
      403: errorResponse('Forbidden.', InferenceErrorSchema, {
        error: { message: 'Model "claude-3-opus" is not allowed for this API key', type: 'permission_error', code: 'model_not_allowed' },
      }),
      429: responses429,
      500: responses500,
      503: responses503,
    },
  });

  // ── POST /v1/embeddings ─────────────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/v1/embeddings',
    tags: ['Embeddings'],
    summary: 'Create embeddings',
    operationId: 'createEmbeddings',
    security: [{ bearerAuth: [] }],
    description: `Generates vector embeddings for one or more text inputs. OpenAI Embeddings API-compatible.

Embedding results are deterministic — the same input always produces the same vector. The gateway caches results in Cloudflare KV so repeated identical inputs return immediately without a new upstream call or billing event.

**Response headers:**
- \`X-Ahura-Request-Id\` — trace ID
- \`X-Ahura-Model\` — resolved model
- \`X-Ahura-RateLimit-Remaining\` — bucket tokens remaining
- \`X-Ahura-Cache\` — \`hit | miss | bypass\`
- \`X-Ahura-Cache-Age\` — seconds (only on cache hits)`,
    request: {
      headers: InferenceRequestHeadersSchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: EmbeddingsRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Embedding vectors',
        content: {
          'application/json': {
            schema: EmbeddingsResponseSchema,
            example: {
              object: 'list',
              data: [{ object: 'embedding', embedding: [0.0023, -0.0095, 0.0156], index: 0 }],
              model: 'openai/text-embedding-3-small',
              usage: { prompt_tokens: 9, total_tokens: 9 },
            },
          },
        },
      },
      400: errorResponse('Bad request.', InferenceErrorSchema, {
        error: { message: 'messages.0.content: Required', type: 'invalid_request_error', code: 'invalid_request' },
      }),
      401: responses401,
      402: responses402,
      403: errorResponse('Forbidden.', InferenceErrorSchema, {
        error: { message: 'Model "openai/text-embedding-3-large" is not allowed for this API key', type: 'permission_error', code: 'model_not_allowed' },
      }),
      429: responses429,
      500: responses500,
    },
  });

  // ── GET /v1/models ──────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/v1/models',
    tags: ['Models'],
    summary: 'List available models',
    operationId: 'listModels',
    security: [{ bearerAuth: [] }],
    description: `Returns the full model catalog visible to the calling org:

- **Public models** (\`org_id: null\`) — frontier models proxied through OpenRouter
- **Private models** (\`owned_by: "ahura-private"\`) — the org's fine-tuned outputs or BYO deployments

Models are returned sorted by \`sort_order\`. The \`capabilities\`, \`pricing\`, and \`off_peak\` fields contain model-specific metadata for building pricing UIs and routing logic.`,
    responses: {
      200: {
        description: 'Model catalog',
        content: {
          'application/json': {
            schema: ModelListResponseSchema,
            example: {
              object: 'list',
              data: [
                {
                  id: 'openai/gpt-4o',
                  object: 'model',
                  created: 0,
                  owned_by: 'openrouter',
                  display_name: 'GPT-4o',
                  description: "OpenAI's most capable multimodal model",
                  modality: 'chat',
                  capabilities: { streaming: true, tool_use: true, vision: true, json_mode: true },
                  pricing: { input_cents_per_mtok: 250, output_cents_per_mtok: 1000 },
                  off_peak: null,
                  featured: true,
                },
              ],
            },
          },
        },
      },
      401: responses401,
      429: responses429,
      500: responses500,
    },
  });

  // ── GET /v1/key ─────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/v1/key',
    tags: ['Keys'],
    summary: 'Get API key info',
    operationId: 'getKeyInfo',
    security: [{ bearerAuth: [] }],
    description: `Returns the identity and configuration of the calling API key, plus a best-effort current-month spend snapshot from the KV spend counter.

Useful for SDK integrations that need to check budget remaining or verify which models the key is scoped to — without loading the dashboard.

The \`usage.spent_cents\` value is read from a KV counter that is updated asynchronously after each completed request; it may lag by a few seconds.`,
    responses: {
      200: {
        description: 'Key info and spend snapshot',
        content: {
          'application/json': {
            schema: KeyInfoSchema,
            example: {
              key_id: 'key_01hwxyz',
              org_id: 'org_abc123',
              zdr_enabled: false,
              allowed_models: null,
              billing: 'platform',
              usage: {
                month: '2026-06',
                spent_cents: 4231,
                monthly_budget_cents: 10000,
                hard_cap_cents: 5000,
              },
            },
          },
        },
      },
      401: responses401,
      429: responses429,
      500: responses500,
    },
  });
}
