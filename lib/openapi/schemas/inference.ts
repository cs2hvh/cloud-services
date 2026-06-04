import { z } from '@/lib/openapi/init';

// ─── Error shapes ────────────────────────────────────────────────

export const InferenceErrorSchema = z.object({
  error: z.object({
    message: z.string().openapi({ example: 'Model "openai/gpt-99" is not allowed for this API key' }),
    type: z.enum([
      'invalid_request_error',
      'authentication_error',
      'billing_error',
      'permission_error',
      'rate_limit_error',
      'internal_error',
      'service_unavailable',
    ]).openapi({ example: 'invalid_request_error' }),
    code: z.enum([
      'invalid_json',
      'invalid_request',
      'model_required',
      'model_not_allowed',
      'model_unavailable',
      'preset_not_found',
      'guardrail_blocked',
      'byok_unavailable',
      'self_serve_model',
      'key_missing',
      'key_malformed',
      'key_invalid',
      'key_expired',
      'ip_not_permitted',
      'hard_cap_reached',
      'org_hard_cap_reached',
      'rate_limit_exceeded',
      'catalog_error',
      'internal_error',
      'not_found',
    ]).openapi({ example: 'model_not_allowed' }),
    request_id: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  }),
}).openapi('InferenceError');

export const InferenceBillingErrorSchema = z.object({
  error: z.object({
    message: z.string().openapi({
      example: "Reached the organization's monthly hard cap of 50.00 USD for 2026-06.",
    }),
    type: z.literal('billing_error'),
    code: z.enum(['hard_cap_reached', 'org_hard_cap_reached']).openapi({
      description: '`hard_cap_reached` = key-level cap; `org_hard_cap_reached` = org-level cap.',
    }),
    scope: z.enum(['key', 'org']).openapi({ description: 'Which cap was triggered.' }),
    spent_cents: z.number().int().openapi({ example: 5000, description: 'Month-to-date spend in USD cents.' }),
    hard_cap_cents: z.number().int().openapi({ example: 5000, description: 'The cap that was reached.' }),
  }),
}).openapi('InferenceBillingError');

export const InferenceRateLimitErrorSchema = z.object({
  error: z.object({
    message: z.string().openapi({ example: 'Rate limit exceeded' }),
    type: z.literal('rate_limit_error'),
    code: z.literal('rate_limit_exceeded'),
    retry_after_ms: z.number().int().openapi({
      example: 850,
      description: 'Milliseconds until a bucket token is available. Complements the `Retry-After` header (seconds).',
    }),
  }),
}).openapi('InferenceRateLimitError');

// ─── Health ──────────────────────────────────────────────────────

export const HealthResponseSchema = z.object({
  status: z.literal('ok').openapi({ example: 'ok' }),
  version: z.string().openapi({ example: '1.2.0', description: 'Gateway deployment version.' }),
  env: z.enum(['production', 'preview', 'development']).openapi({ example: 'production' }),
  timestamp: z.string().datetime().openapi({ example: '2026-06-04T12:00:00.000Z' }),
}).openapi('HealthResponse');

// ─── Shared request headers schema ───────────────────────────────

export const InferenceRequestHeadersSchema = z.object({
  'x-ahura-billing': z.enum(['platform', 'byok']).optional().openapi({
    description: 'Billing mode. `platform` (default) charges your AhuraCloud account. `byok` uses your own upstream API key (also set `X-Ahura-BYOK-Provider`).',
  }),
  'x-ahura-byok-provider': z.enum(['openrouter', 'openai', 'anthropic', 'google', 'mistral']).optional().openapi({
    description: 'Required when `X-Ahura-Billing: byok`. Selects which stored BYOK key to decrypt and use.',
  }),
  'x-ahura-request-id': z.string().uuid().optional().openapi({
    description: 'Client-supplied trace ID. Echoed in the response `X-Ahura-Request-Id` header. Gateway generates one if omitted.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  }),
  'x-ahura-idempotency-key': z.string().max(128).optional().openapi({
    description: 'Idempotency key for safe retries. Requests sharing this key return the cached response without a new upstream call.',
  }),
  'x-ahura-cache': z.enum(['on', 'off']).optional().openapi({
    description: 'Override caching for this request. `off` bypasses both L1 exact-match and semantic caches. ZDR-enabled keys always bypass regardless of this setting.',
  }),
  'x-ahura-cache-ttl': z.coerce.number().int().min(60).max(86400).optional().openapi({
    description: 'Override L1 cache TTL in seconds (60–86400).',
    example: 3600,
  }),
});

export const ChatRequestHeadersSchema = InferenceRequestHeadersSchema.extend({
  'x-ahura-preset': z.string().optional().openapi({
    description: 'Saved preset name to apply (model list, temperature, system prompt, etc.). Body fields override preset values.',
    example: 'production-claude',
  }),
  'x-ahura-guardrail': z.enum(['off', 'warn', 'block']).optional().openapi({
    description: 'Prompt-injection guardrail policy. `off` skips evaluation; `warn` (default) logs detections but proceeds; `block` returns 400 if patterns found.',
  }),
});

// ─── Chat Completions ────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool', 'developer']).openapi({ example: 'user' }),
  content: z.union([z.string(), z.array(z.unknown()), z.null()]).optional().openapi({
    description: 'Message content — plain string or an array of content blocks (text, image_url, etc.).',
    example: 'What is 2+2?',
  }),
  name: z.string().optional().openapi({ description: 'Optional participant name for disambiguation.' }),
  tool_call_id: z.string().optional().openapi({ description: 'ID of the tool call this message is responding to. Required for `role: tool` messages.' }),
  tool_calls: z.array(z.unknown()).optional().openapi({ description: 'Tool calls the assistant wants to make.' }),
}).openapi('ChatMessage');

export const ChatRequestSchema = z.object({
  model: z.string().min(1).optional().openapi({
    description: 'Model ID to use (e.g. `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`). Required unless an `X-Ahura-Preset` header provides a model.',
    example: 'openai/gpt-4o',
  }),
  messages: z.array(ChatMessageSchema).min(1).openapi({
    description: 'Conversation history. At least one message is required.',
  }),
  stream: z.boolean().optional().openapi({
    description: 'If `true`, responses are streamed as Server-Sent Events (`text/event-stream`). Each `data:` line is a ChatCompletionChunk JSON object. Stream ends with `data: [DONE]`.',
    example: false,
  }),
  temperature: z.number().min(0).max(2).optional().openapi({
    description: 'Sampling temperature (0–2). Higher = more random.',
    example: 0.7,
  }),
  top_p: z.number().min(0).max(1).optional().openapi({
    description: 'Nucleus sampling — only tokens within the top `top_p` probability mass are sampled.',
    example: 1.0,
  }),
  max_tokens: z.number().int().positive().optional().openapi({
    description: 'Maximum tokens to generate.',
    example: 1024,
  }),
  n: z.number().int().positive().max(8).optional().openapi({
    description: 'Number of completion choices to generate (1–8).',
    example: 1,
  }),
  stop: z.union([z.string(), z.array(z.string()).max(4)]).optional().openapi({
    description: 'Up to 4 stop sequences.',
    example: ['\\n\\n'],
  }),
  presence_penalty: z.number().min(-2).max(2).optional().openapi({
    description: 'Penalise tokens that have already appeared. Positive → more new topics.',
    example: 0,
  }),
  frequency_penalty: z.number().min(-2).max(2).optional().openapi({
    description: 'Penalise tokens by their frequency so far. Positive → less repetition.',
    example: 0,
  }),
  tools: z.array(z.unknown()).optional().openapi({
    description: 'Tools the model may call. Each entry must have `type: "function"` and a `function` definition.',
  }),
  tool_choice: z.union([
    z.enum(['none', 'auto', 'required']),
    z.unknown(),
  ]).optional().openapi({
    description: '`"auto"`, `"none"`, `"required"`, or `{type:"function", function:{name}}` to force a specific tool.',
    example: 'auto',
  }),
  response_format: z.unknown().optional().openapi({
    description: '`{type:"json_object"}` for JSON mode or `{type:"json_schema", json_schema:{...}}` for structured output.',
  }),
  seed: z.number().int().optional().openapi({
    description: 'Seed for deterministic sampling (best-effort; model must support it).',
    example: 42,
  }),
  user: z.string().optional().openapi({
    description: 'End-user identifier for abuse detection. Not forwarded upstream.',
  }),
}).openapi('ChatRequest');

export const ChatChoiceSchema = z.object({
  index: z.number().int().openapi({ example: 0 }),
  message: z.object({
    role: z.literal('assistant'),
    content: z.string().nullable().openapi({ example: 'The answer is 4.' }),
    tool_calls: z.array(z.unknown()).optional().openapi({ description: 'Tool calls the model wants to make.' }),
  }),
  finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter']).nullable().openapi({ example: 'stop' }),
}).openapi('ChatChoice');

export const ChatUsageSchema = z.object({
  prompt_tokens: z.number().int().openapi({ example: 18 }),
  completion_tokens: z.number().int().openapi({ example: 7 }),
  total_tokens: z.number().int().openapi({ example: 25 }),
  prompt_tokens_details: z.object({
    cached_tokens: z.number().int().optional().openapi({
      example: 0,
      description: 'Tokens served from the upstream model\'s prompt cache.',
    }),
  }).optional(),
}).openapi('ChatUsage');

export const ChatResponseSchema = z.object({
  id: z.string().openapi({ example: 'chatcmpl-abc123' }),
  object: z.literal('chat.completion'),
  created: z.number().int().openapi({ example: 1749038400 }),
  model: z.string().openapi({ example: 'openai/gpt-4o' }),
  choices: z.array(ChatChoiceSchema).min(1),
  usage: ChatUsageSchema.optional(),
}).openapi('ChatResponse');

// ─── Anthropic Messages shim ─────────────────────────────────────

export const AnthropicContentBlockSchema = z.object({
  type: z.string().openapi({ example: 'text', description: 'Block type: `text`, `image`, `tool_use`, or `tool_result`.' }),
}).passthrough().openapi('AnthropicContentBlock');

export const AnthropicMessageSchema = z.object({
  role: z.enum(['user', 'assistant']).openapi({ example: 'user' }),
  content: z.union([
    z.string(),
    z.array(AnthropicContentBlockSchema),
  ]).openapi({ description: 'Plain string or array of content blocks.' }),
}).openapi('AnthropicMessage');

export const AnthropicRequestSchema = z.object({
  model: z.string().min(1).openapi({
    example: 'claude-3-5-sonnet-20241022',
    description: 'Anthropic model ID.',
  }),
  messages: z.array(AnthropicMessageSchema).min(1),
  system: z.union([z.string(), z.array(AnthropicContentBlockSchema)]).optional().openapi({
    description: 'System prompt — plain string or array of text content blocks.',
  }),
  max_tokens: z.number().int().positive().openapi({
    example: 1024,
    description: '**Required**. Maximum tokens to generate (unlike OpenAI this field is mandatory).',
  }),
  stream: z.boolean().optional().openapi({ example: false }),
  temperature: z.number().min(0).max(1).optional().openapi({ example: 0.7 }),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().int().positive().optional().openapi({ description: 'Only the top `k` tokens are considered.' }),
  stop_sequences: z.array(z.string()).optional().openapi({ description: 'Sequences that stop generation when produced.' }),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional().openapi({
    description: '`{type:"auto"}`, `{type:"any"}`, or `{type:"tool", name:"<name>"}`.',
  }),
  metadata: z.object({
    user_id: z.string().optional().openapi({ description: 'External identifier for the end user.' }),
  }).passthrough().optional(),
}).openapi('AnthropicRequest');

export const AnthropicResponseSchema = z.object({
  id: z.string().openapi({ example: 'msg_01abc' }),
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(AnthropicContentBlockSchema),
  model: z.string().openapi({ example: 'claude-3-5-sonnet-20241022' }),
  stop_reason: z.enum(['end_turn', 'max_tokens', 'stop_sequence', 'tool_use']).nullable().openapi({ example: 'end_turn' }),
  stop_sequence: z.string().nullable().optional().openapi({ description: 'The stop sequence that triggered a stop, if applicable.' }),
  usage: z.object({
    input_tokens: z.number().int().openapi({ example: 12 }),
    output_tokens: z.number().int().openapi({ example: 42 }),
  }),
}).openapi('AnthropicResponse');

// ─── Embeddings ───────────────────────────────────────────────────

export const EmbeddingsRequestSchema = z.object({
  model: z.string().min(1).openapi({
    example: 'openai/text-embedding-3-small',
    description: 'Embedding model ID. Supported: `openai/text-embedding-3-small`, `openai/text-embedding-3-large`, `openai/text-embedding-ada-002`.',
  }),
  input: z.union([
    z.string(),
    z.array(z.string()).min(1).max(2048),
  ]).openapi({
    description: 'Single string or array of strings to embed (max 2048 in a batch).',
    example: 'The quick brown fox jumps over the lazy dog',
  }),
  dimensions: z.number().int().positive().optional().openapi({
    description: 'Desired output dimensions. Only supported by `text-embedding-3-*` models.',
    example: 512,
  }),
  encoding_format: z.enum(['float', 'base64']).optional().openapi({
    description: '`float` (default) returns a number array; `base64` returns a compact encoded string.',
    example: 'float',
  }),
  user: z.string().optional().openapi({ description: 'End-user identifier for abuse detection.' }),
}).openapi('EmbeddingsRequest');

export const EmbeddingObjectSchema = z.object({
  object: z.literal('embedding'),
  embedding: z.union([
    z.array(z.number()),
    z.string(),
  ]).openapi({ description: 'Float32 vector (float format) or base64-encoded Float32 vector (base64 format).' }),
  index: z.number().int().openapi({ example: 0, description: 'Position in the input array.' }),
}).openapi('EmbeddingObject');

export const EmbeddingsResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(EmbeddingObjectSchema),
  model: z.string().openapi({ example: 'openai/text-embedding-3-small' }),
  usage: z.object({
    prompt_tokens: z.number().int().openapi({ example: 9 }),
    total_tokens: z.number().int().openapi({ example: 9 }),
  }),
}).openapi('EmbeddingsResponse');

// ─── Models ───────────────────────────────────────────────────────

export const ModelSchema = z.object({
  id: z.string().openapi({ example: 'openai/gpt-4o', description: 'Model ID used in API requests.' }),
  object: z.literal('model'),
  created: z.number().int().openapi({ example: 0, description: 'Unix timestamp (0 for proxied frontier models).' }),
  owned_by: z.string().openapi({
    example: 'openrouter',
    description: '`openrouter` for proxied frontier models, `ahura` for platform-hosted models, `ahura-private` for this org\'s fine-tunes or BYO deployments.',
  }),
  display_name: z.string().openapi({ example: 'GPT-4o' }),
  description: z.string().nullable().optional().openapi({ example: "OpenAI's most capable multimodal model." }),
  modality: z.string().openapi({
    example: 'chat',
    description: 'Primary modality: `chat`, `completion`, `embedding`, `image`, `audio_stt`, `audio_tts`, `video`, `rerank`.',
  }),
  capabilities: z.record(z.unknown()).openapi({
    description: 'Feature flags (e.g. `{streaming: true, tool_use: true, vision: true, json_mode: true}`).',
  }),
  pricing: z.record(z.unknown()).openapi({
    description: 'Pricing metadata (e.g. `{input_cents_per_mtok: 250, output_cents_per_mtok: 1000}`).',
  }),
  off_peak: z.record(z.unknown()).nullable().optional().openapi({
    description: 'Off-peak discount window if offered (e.g. `{window: "00:00-06:00 UTC", discount_pct: 50}`).',
  }),
  featured: z.boolean().openapi({ example: true, description: 'Whether this model is featured in the UI.' }),
}).openapi('InferenceModel');

export const ModelListResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(ModelSchema),
}).openapi('ModelListResponse');

// ─── Key info ──────────────────────────────────────────────────────

export const KeyInfoSchema = z.object({
  key_id: z.string().openapi({ example: 'key_01hwxyz' }),
  org_id: z.string().openapi({ example: 'org_abc123' }),
  zdr_enabled: z.boolean().openapi({
    description: 'Zero Data Retention mode. If `true`, no request/response content is cached or logged.',
    example: false,
  }),
  allowed_models: z.array(z.string()).nullable().openapi({
    description: 'Model allowlist for this key. `null` means unrestricted — any model the org can access.',
    example: null,
  }),
  billing: z.enum(['platform', 'byok']).openapi({ example: 'platform' }),
  usage: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/).openapi({ example: '2026-06', description: 'Current billing month (YYYY-MM).' }),
    spent_cents: z.number().int().openapi({
      example: 4231,
      description: 'Accumulated spend in USD cents this month. Best-effort read from KV; may lag a few seconds.',
    }),
    monthly_budget_cents: z.number().int().nullable().openapi({
      example: 10000,
      description: 'Soft monthly budget in USD cents. Informational only. `null` if not set.',
    }),
    hard_cap_cents: z.number().int().nullable().openapi({
      example: 5000,
      description: 'Hard cap in USD cents. Requests return 402 once this is reached. `null` if not set.',
    }),
  }),
}).openapi('KeyInfo');
