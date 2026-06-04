import { z } from '@/lib/openapi/init';

// ─── Shared ───────────────────────────────────────────────────────

export const InferenceMgmtErrorSchema = z.object({
  error: z.string().openapi({ example: 'Validation error' }),
  message: z.string().optional().openapi({ example: 'Invalid request body' }),
  details: z.array(z.unknown()).optional().openapi({ description: 'Zod issue list on validation errors.' }),
  code: z.string().optional().openapi({ example: 'insufficient_credits' }),
}).openapi('InferenceMgmtError');

export const InferenceOrgSchema = z.object({
  id: z.string().uuid().openapi({ example: 'org_01hwxyz' }),
  slug: z.string().openapi({ example: 'acme-ai' }),
  name: z.string().openapi({ example: 'Acme AI' }),
  role: z.enum(['owner', 'admin', 'developer', 'viewer']).optional().openapi({ example: 'owner' }),
}).openapi('InferenceOrg');

// ─── API Keys ──────────────────────────────────────────────────────

export const InferenceApiKeySchema = z.object({
  id: z.string().uuid().openapi({ example: 'a1b2c3d4-...' }),
  name: z.string().openapi({ example: 'Production key' }),
  preview: z.string().openapi({
    example: 'ahu_live_xxxx••••zzzz',
    description: 'Masked key: prefix + 4 trailing chars. The full key is returned only at creation.',
  }),
  allowed_models: z.array(z.string()).nullable().openapi({
    example: null,
    description: 'Model allowlist. `null` = unrestricted.',
  }),
  allowed_ip_cidrs: z.array(z.string()).nullable().openapi({
    example: ['192.168.1.0/24'],
    description: 'Source IP allowlist (CIDR notation). `null` = unrestricted.',
  }),
  zdr_enabled: z.boolean().openapi({ example: false }),
  semantic_cache_enabled: z.boolean().openapi({ example: false }),
  rate_limit_rpm: z.number().int().nullable().openapi({
    example: 600,
    description: 'Per-key rate limit override in RPM. `null` = platform default (600 RPM).',
  }),
  monthly_budget_cents: z.number().int().nullable().openapi({ example: 10000 }),
  hard_cap_cents: z.number().int().nullable().openapi({ example: 5000 }),
  expires_at: z.string().datetime().nullable().openapi({ example: null }),
  last_used_at: z.string().datetime().nullable().openapi({ example: '2026-06-03T14:00:00Z' }),
  created_at: z.string().datetime().openapi({ example: '2026-05-01T10:00:00Z' }),
}).openapi('InferenceApiKey');

export const InferenceApiKeyCreateRequestSchema = z.object({
  name: z.string().min(1).max(100).openapi({ example: 'Production key' }),
  allowed_models: z.array(z.string()).nullable().optional().openapi({
    example: ['openai/gpt-4o', 'anthropic/claude-3-5-sonnet'],
    description: 'Model allowlist. Omit or `null` for unrestricted.',
  }),
  allowed_ip_cidrs: z.array(z.string()).nullable().optional().openapi({
    example: ['10.0.0.0/8'],
    description: 'Source IP CIDR allowlist. Omit or `null` for unrestricted.',
  }),
  zdr_enabled: z.boolean().optional().openapi({
    description: 'Enable Zero Data Retention. No request/response content will be cached or logged.',
    example: false,
  }),
  semantic_cache_enabled: z.boolean().optional().openapi({ example: false }),
  monthly_budget_cents: z.number().int().nonnegative().nullable().optional().openapi({
    example: 10000,
    description: 'Soft monthly spend limit in USD cents (informational).',
  }),
  hard_cap_cents: z.number().int().nonnegative().nullable().optional().openapi({
    example: 5000,
    description: 'Hard monthly spend cap in USD cents. Requests return 402 once hit.',
  }),
  rate_limit_rpm: z.number().int().min(1).max(10000).nullable().optional().openapi({
    example: 1200,
    description: 'Per-key RPM override (1–10 000). Omit or `null` for platform default (600 RPM).',
  }),
  expires_at: z.string().datetime().nullable().optional().openapi({
    example: '2027-01-01T00:00:00Z',
  }),
}).openapi('InferenceApiKeyCreateRequest');

export const InferenceApiKeyCreatedSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    name: z.string(),
    key_prefix: z.string().openapi({ example: 'ahu_live_xxxx' }),
    key_last_four: z.string().openapi({ example: 'zzzz' }),
    created_at: z.string().datetime(),
    api_key: z.string().openapi({
      example: 'ahu_live_abc123def456...',
      description: '**Show-once.** The full plaintext key — copy it now. It will never be returned again.',
    }),
  }),
  message: z.string().openapi({
    example: 'Copy this key now — for security, the full key will never be shown again.',
  }),
}).openapi('InferenceApiKeyCreated');

export const InferenceApiKeyListSchema = z.object({
  success: z.literal(true),
  org: InferenceOrgSchema,
  data: z.array(InferenceApiKeySchema),
}).openapi('InferenceApiKeyList');

// ─── Deployments ───────────────────────────────────────────────────

export const DeploymentAutoscaleSchema = z.object({
  min_workers: z.number().int().min(0).max(50).openapi({ example: 0 }),
  max_workers: z.number().int().min(1).max(50).openapi({ example: 4 }),
  idle_timeout_s: z.number().int().min(5).max(3600).openapi({ example: 60 }),
}).openapi('DeploymentAutoscale');

export const DeploymentSchema = z.object({
  id: z.string().uuid().openapi({ example: 'd1b2c3d4-...' }),
  name: z.string().openapi({ example: 'my-llama-deploy' }),
  source: z.enum(['docker', 'huggingface', 'truss']).openapi({ example: 'huggingface' }),
  source_ref: z.string().openapi({ example: 'meta-llama/Llama-3.1-8B-Instruct' }),
  source_revision: z.string().nullable().optional().openapi({ example: null }),
  gpu_sku: z.string().openapi({ example: 'NVIDIA A100 80GB PCIe' }),
  autoscale: DeploymentAutoscaleSchema,
  status: z.enum(['building', 'active', 'failed', 'stopped']).openapi({ example: 'active' }),
  endpoint_id: z.string().nullable().optional().openapi({ description: 'RunPod Serverless endpoint ID once provisioned.' }),
  image_uri: z.string().nullable().optional().openapi({ example: 'runpod/worker-vllm:stable-cuda12.1.0' }),
  model_id: z.string().nullable().optional().openapi({ description: 'The `inference.models` ID registered for this deployment.' }),
  error_message: z.string().nullable().optional(),
  deployed_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().openapi({ example: '2026-05-01T10:00:00Z' }),
  updated_at: z.string().datetime().openapi({ example: '2026-05-01T10:05:00Z' }),
}).openapi('Deployment');

export const DeploymentCreateRequestSchema = z.object({
  name: z.string().min(1).max(64).openapi({
    example: 'my-llama-deploy',
    description: 'Deployment name — letters, digits, hyphens, underscores.',
  }),
  source: z.enum(['docker', 'huggingface', 'truss']).openapi({
    example: 'huggingface',
    description: '`docker` for any public OCI image; `huggingface` for a model repo ID (uses vLLM worker). `truss` is accepted but currently returns an explicit unsupported-source error.',
  }),
  source_ref: z.string().min(1).max(500).openapi({
    example: 'meta-llama/Llama-3.1-8B-Instruct',
    description: 'Docker image URI or Hugging Face repo ID depending on `source`.',
  }),
  source_revision: z.string().max(200).nullable().optional().openapi({
    example: 'main',
    description: 'Git revision / tag for the source. Optional.',
  }),
  gpu_sku: z.string().min(1).openapi({
    example: 'NVIDIA A100 80GB PCIe',
    description: 'RunPod `gpuTypeId`. Use `GET /v1/models` or the dashboard GPU picker to see available SKUs.',
  }),
  autoscale: z.object({
    min_workers: z.number().int().min(0).max(50).default(0).openapi({ example: 0 }),
    max_workers: z.number().int().min(1).max(50).default(4).openapi({ example: 4 }),
    idle_timeout_s: z.number().int().min(5).max(3600).default(60).openapi({
      example: 60,
      description: 'Seconds of idle time before a worker scales down.',
    }),
  }).optional().openapi({ description: 'Auto-scaling configuration. Defaults: min=0, max=4, idle=60s.' }),
  hf_token: z.string().min(1).max(200).optional().openapi({
    description: 'Hugging Face access token. Required in practice for gated models (Meta, Google). **Never echoed back in any response.** Only meaningful when `source = "huggingface"`.',
  }),
}).openapi('DeploymentCreateRequest');

export const DeploymentListSchema = z.object({
  success: z.literal(true),
  org: InferenceOrgSchema,
  data: z.array(DeploymentSchema),
}).openapi('DeploymentList');

// ─── Fine-Tuning Jobs ─────────────────────────────────────────────

export const FineTuneHyperparamsSchema = z.object({
  rank: z.number().int().min(1).max(256).optional().openapi({ example: 16, description: 'LoRA rank.' }),
  alpha: z.number().int().min(1).max(512).optional().openapi({ example: 32, description: 'LoRA alpha.' }),
  lr: z.number().positive().max(1).optional().openapi({ example: 0.0002, description: 'Learning rate.' }),
  epochs: z.number().int().min(1).max(50).optional().openapi({ example: 3 }),
  batch_size: z.number().int().min(1).max(64).optional().openapi({ example: 4 }),
  gradient_accumulation_steps: z.number().int().min(1).max(64).optional().openapi({ example: 4 }),
  max_seq_length: z.number().int().min(128).max(131072).optional().openapi({ example: 4096 }),
  warmup_steps: z.number().int().min(0).max(10000).optional().openapi({ example: 100 }),
  target_modules: z.array(z.string()).optional().openapi({ example: ['q_proj', 'v_proj'] }),
}).openapi('FineTuneHyperparams');

export const FineTuneJobSchema = z.object({
  id: z.string().uuid().openapi({ example: 'ft_01hwxyz' }),
  name: z.string().openapi({ example: 'llama-support-v1' }),
  base_model_id: z.string().openapi({ example: 'meta-llama/llama-3.3-8b-instruct' }),
  method: z.enum(['lora', 'qlora', 'full']).openapi({ example: 'lora' }),
  hyperparams: FineTuneHyperparamsSchema,
  dataset_url: z.string().url().openapi({ example: 'https://storage.example.com/dataset.jsonl' }),
  validation_dataset_url: z.string().url().nullable().optional(),
  gpu_sku: z.string().openapi({ example: 'NVIDIA A100 80GB PCIe' }),
  status: z.enum(['queued', 'preparing', 'running', 'completed', 'failed', 'cancelled']).openapi({ example: 'running' }),
  pod_id: z.string().nullable().optional().openapi({ description: 'RunPod job ID.' }),
  output_model_id: z.string().nullable().optional().openapi({ description: 'Model ID in the inference catalog once training completes.' }),
  output_artifact_url: z.string().url().nullable().optional(),
  training_seconds: z.number().int().nullable().optional(),
  cost_cents: z.number().int().nullable().optional().openapi({ description: 'Actual cost charged in USD cents.' }),
  error_message: z.string().nullable().optional(),
  current_step: z.number().int().nullable().optional(),
  max_steps: z.number().int().nullable().optional(),
  current_epoch: z.number().nullable().optional(),
  latest_loss: z.number().nullable().optional(),
  hourly_cost_cents: z.number().int().nullable().optional(),
  training_log_url: z.string().nullable().optional(),
  is_managed: z.boolean().nullable().optional(),
  serving_url: z.string().nullable().optional(),
  serving_pod_state: z.string().nullable().optional(),
  serving_pod_gpu_sku: z.string().nullable().optional(),
  serving_pod_started_at: z.string().datetime().nullable().optional(),
  serving_pod_stopped_at: z.string().datetime().nullable().optional(),
  serving_pod_hourly_cents: z.number().int().nullable().optional(),
  serving_pod_auto_stop_at: z.string().datetime().nullable().optional(),
  serving_pod_error_message: z.string().nullable().optional(),
  queued_at: z.string().datetime().nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().openapi({ example: '2026-05-01T10:00:00Z' }),
  updated_at: z.string().datetime().nullable().optional(),
}).openapi('FineTuneJob');

export const FineTuneJobCreateRequestSchema = z.object({
  name: z.string().min(1).max(80).openapi({
    example: 'llama-support-v1',
    description: 'Job name — letters, digits, hyphens, underscores.',
  }),
  base_model_id: z.string().min(1).openapi({
    example: 'meta-llama/llama-3.3-8b-instruct',
    description: `Base model to fine-tune. Supported bases: \`meta-llama/llama-4-scout\`, \`meta-llama/llama-4-maverick\`, \`meta-llama/llama-3.3-70b-instruct\`, \`meta-llama/llama-3.3-8b-instruct\`, \`deepseek/deepseek-v3.2\`, \`qwen/qwen-3-235b-instruct\`, \`qwen/qwen-3-32b-instruct\`, \`qwen/qwen-3-14b-instruct\`, \`qwen/qwen-3-8b-instruct\`, \`mistralai/mistral-large-3\`, \`mistralai/mistral-nemo\`, \`microsoft/phi-4\`, \`google/gemma-4-27b-it\``,
  }),
  method: z.enum(['lora', 'qlora', 'full']).optional().openapi({
    example: 'lora',
    description: 'Fine-tuning method. `lora` (default) — parameter-efficient; `qlora` — quantised LoRA for large models; `full` — full weight update.',
  }),
  dataset_url: z.string().url().openapi({
    example: 'https://storage.example.com/train.jsonl',
    description: 'HTTPS, S3, or R2 URL to a JSONL dataset. Each line must be a chat-formatted example `{"messages": [...]}`. Max 200 MB.',
  }),
  validation_dataset_url: z.string().url().nullable().optional().openapi({
    description: 'Optional validation dataset URL for eval loss tracking.',
  }),
  gpu_sku: z.string().min(1).openapi({
    example: 'NVIDIA A100 80GB PCIe',
    description: 'RunPod `gpuTypeId`. Must be sufficient for the selected base model.',
  }),
  hyperparams: FineTuneHyperparamsSchema.optional().openapi({
    description: 'Hyperparameter overrides. Unset fields use platform defaults (rank=16, alpha=32, lr=0.0002, epochs=3, batch_size=4, max_seq_length=4096).',
  }),
}).openapi('FineTuneJobCreateRequest');

export const FineTuneJobListSchema = z.object({
  success: z.literal(true),
  org: InferenceOrgSchema,
  data: z.array(FineTuneJobSchema),
}).openapi('FineTuneJobList');

// ─── Files ─────────────────────────────────────────────────────────

export const InferenceFileSchema = z.object({
  id: z.string().openapi({ example: 'file_abc123def456', description: 'File ID (prefix `file_`).' }),
  object: z.literal('file'),
  purpose: z.enum(['batch']).openapi({ example: 'batch' }),
  filename: z.string().openapi({ example: 'train-data.jsonl' }),
  bytes: z.number().int().openapi({ example: 102400 }),
  created_at: z.number().int().openapi({ example: 1749038400, description: 'Unix timestamp (seconds).' }),
  produced_by_batch_id: z.string().nullable().optional().openapi({ description: 'Set if this file was produced as output by a batch job.' }),
}).openapi('InferenceFile');

export const InferenceFileListSchema = z.object({
  object: z.literal('list'),
  data: z.array(InferenceFileSchema),
}).openapi('InferenceFileList');

export const InferenceFileDeletedSchema = z.object({
  id: z.string().openapi({ example: 'file_abc123def456' }),
  object: z.literal('file'),
  deleted: z.literal(true),
}).openapi('InferenceFileDeleted');

// ─── Batches ───────────────────────────────────────────────────────

export const BatchRequestCountsSchema = z.object({
  total: z.number().int().openapi({ example: 250 }),
  completed: z.number().int().openapi({ example: 240 }),
  failed: z.number().int().openapi({ example: 10 }),
}).openapi('BatchRequestCounts');

export const BatchSchema = z.object({
  id: z.string().openapi({ example: 'batch_abc123def456', description: 'Batch ID (prefix `batch_`).' }),
  object: z.literal('batch'),
  endpoint: z.enum(['/v1/chat/completions', '/v1/embeddings']).openapi({ example: '/v1/chat/completions' }),
  status: z.enum(['validating', 'in_progress', 'completed', 'failed', 'cancelled', 'cancelling']).openapi({ example: 'completed' }),
  input_file_id: z.string().openapi({ example: 'file_abc123def456' }),
  output_file_id: z.string().nullable().optional().openapi({ description: 'Output file ID once the batch completes.' }),
  error_file_id: z.string().nullable().optional(),
  completion_window: z.literal('24h'),
  request_counts: BatchRequestCountsSchema.optional(),
  metadata: z.record(z.string(), z.string()).nullable().optional().openapi({ description: 'Up to 16 key-value pairs of caller-supplied metadata.' }),
  created_at: z.number().int().openapi({ example: 1749038400 }),
  in_progress_at: z.number().int().nullable().optional(),
  completed_at: z.number().int().nullable().optional(),
  failed_at: z.number().int().nullable().optional(),
  cancelled_at: z.number().int().nullable().optional(),
  expires_at: z.number().int().nullable().optional(),
}).openapi('Batch');

export const BatchCreateRequestSchema = z.object({
  input_file_id: z.string().openapi({
    example: 'file_abc123def456',
    description: 'ID of a previously uploaded file with `purpose: "batch"`. Each line must be a JSON object `{custom_id, method, url, body}`.',
  }),
  endpoint: z.enum(['/v1/chat/completions', '/v1/embeddings']).openapi({
    example: '/v1/chat/completions',
    description: 'The inference endpoint to call for each line in the file.',
  }),
  completion_window: z.literal('24h').openapi({
    description: 'Time window for batch completion. Currently only `"24h"` is supported.',
  }),
  metadata: z.record(z.string(), z.string()).optional().openapi({
    description: 'Up to 16 string key-value pairs for your own reference.',
    example: { env: 'production', job: 'nightly-eval' },
  }),
}).openapi('BatchCreateRequest');

export const BatchListSchema = z.object({
  object: z.literal('list'),
  data: z.array(BatchSchema),
}).openapi('BatchList');

// ─── BYOK Keys ─────────────────────────────────────────────────────

export const ByokKeySchema = z.object({
  id: z.string().uuid().openapi({ example: 'b1b2c3d4-...' }),
  name: z.string().openapi({ example: 'My OpenAI key' }),
  provider: z.enum(['openrouter', 'openai', 'anthropic', 'google', 'mistral', 'custom']).openapi({ example: 'openai' }),
  preview: z.string().openapi({
    example: '••••••••1234',
    description: 'Masked preview of the stored key. The plaintext is never returned.',
  }),
  is_valid: z.boolean().openapi({ example: true }),
  last_verified_at: z.string().datetime().nullable().optional(),
  last_verify_error: z.string().nullable().optional(),
  created_at: z.string().datetime().openapi({ example: '2026-05-01T10:00:00Z' }),
}).openapi('ByokKey');

export const ByokKeyCreateRequestSchema = z.object({
  name: z.string().min(1).max(100).openapi({ example: 'My OpenAI key' }),
  provider: z.enum(['openrouter', 'openai', 'anthropic', 'google', 'mistral', 'custom']).openapi({
    example: 'openai',
    description: 'Upstream provider this key authenticates against. Must match the `X-Ahura-BYOK-Provider` header you send when calling the gateway.',
  }),
  api_key: z.string().min(10).max(500).openapi({
    example: 'sk-proj-abc123...',
    description: 'The raw upstream API key. Encrypted with AES-GCM server-side before storage. **Never echoed back in any response.**',
  }),
}).openapi('ByokKeyCreateRequest');

export const ByokKeyListSchema = z.object({
  success: z.literal(true),
  org: InferenceOrgSchema,
  data: z.array(ByokKeySchema),
}).openapi('ByokKeyList');

// ─── Vector Collections ────────────────────────────────────────────

export const VectorCollectionSchema = z.object({
  id: z.string().uuid().openapi({ example: 'vc_01hwxyz' }),
  name: z.string().openapi({ example: 'product-docs' }),
  description: z.string().nullable().optional().openapi({ example: 'Product documentation for RAG' }),
  dimensions: z.number().int().openapi({ example: 1536 }),
  distance_metric: z.enum(['cosine', 'l2', 'inner_product']).openapi({ example: 'cosine' }),
  embedding_model_id: z.string().nullable().optional().openapi({
    example: 'openai/text-embedding-3-small',
    description: 'Server-side auto-embed model. If set, you can pass `text` instead of `embedding` on upsert/query.',
  }),
  index_type: z.enum(['hnsw', 'ivfflat', 'none']).openapi({ example: 'hnsw' }),
  index_params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  row_count: z.number().int().openapi({ example: 12450 }),
  size_bytes: z.number().int().openapi({ example: 5242880 }),
  created_at: z.string().datetime().openapi({ example: '2026-05-01T10:00:00Z' }),
  updated_at: z.string().datetime().openapi({ example: '2026-05-15T12:00:00Z' }),
}).openapi('VectorCollection');

export const VectorCollectionCreateRequestSchema = z.object({
  name: z.string().min(1).max(60).openapi({
    example: 'product-docs',
    description: 'Collection name — letters, digits, hyphens, underscores.',
  }),
  description: z.string().max(500).nullable().optional().openapi({ example: 'Product documentation vectors' }),
  dimensions: z.number().int().positive().max(4096).optional().openapi({
    example: 1536,
    description: 'Vector dimensions. Required when `embedding_model_id` is omitted (bring-your-own embeddings). Derived automatically from the catalog when `embedding_model_id` is set.',
  }),
  distance_metric: z.enum(['cosine', 'l2', 'inner_product']).optional().openapi({
    example: 'cosine',
    description: 'Similarity function. Default: `cosine`.',
  }),
  embedding_model_id: z.string().nullable().optional().openapi({
    example: 'openai/text-embedding-3-small',
    description: 'If set, the server auto-embeds text on upsert and query using this catalog model. Omit to manage embeddings yourself.',
  }),
  index_type: z.enum(['hnsw', 'ivfflat', 'none']).optional().openapi({
    example: 'hnsw',
    description: 'Vector index type. `hnsw` (default) — best for recall+speed; `ivfflat` — better for high-volume bulk inserts; `none` — exact search, small collections only.',
  }),
  index_params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().openapi({
    description: 'Index-specific tuning params. For HNSW: `{m: 16, ef_construction: 64}`. Omit to use defaults.',
  }),
}).openapi('VectorCollectionCreateRequest');

export const VectorCollectionListSchema = z.object({
  success: z.literal(true),
  org: InferenceOrgSchema,
  data: z.array(VectorCollectionSchema),
}).openapi('VectorCollectionList');

export const VectorQueryRequestSchema = z.object({
  embedding: z.array(z.number()).optional().openapi({
    description: 'Pre-computed query vector. Either `embedding` or `text` is required.',
  }),
  text: z.string().optional().openapi({
    example: 'How do I reset my password?',
    description: 'Query text. The server auto-embeds it using the collection\'s `embedding_model_id`. Either `text` or `embedding` is required.',
  }),
  top_k: z.number().int().positive().max(100).optional().openapi({
    example: 10,
    description: 'Number of nearest neighbours to return (1–100). Default: 10.',
  }),
  min_similarity: z.number().min(0).max(1).optional().openapi({
    example: 0.75,
    description: 'Minimum cosine similarity threshold. Results below this score are excluded. Default: 0.',
  }),
  filter: z.record(z.string(), z.unknown()).optional().openapi({
    example: { tenant: 'acme', lang: 'en' },
    description: 'JSONB containment filter on row `metadata`. Returns only rows whose metadata contains all specified key-value pairs. Useful for multi-tenant RAG.',
  }),
}).openapi('VectorQueryRequest');

export const VectorQueryResultSchema = z.object({
  success: z.literal(true),
  results: z.array(z.object({
    id: z.string().uuid().openapi({ example: 'row_01hwxyz' }),
    external_id: z.string().openapi({ example: 'doc-42-chunk-3' }),
    content: z.string().nullable().openapi({ example: 'Password reset instructions: click Forgot Password...' }),
    metadata: z.record(z.unknown()).openapi({ example: { tenant: 'acme', source: 'kb' } }),
    similarity: z.number().openapi({ example: 0.923 }),
  })),
  count: z.number().int().openapi({ example: 1 }),
}).openapi('VectorQueryResult');

// ─── Usage Summary ─────────────────────────────────────────────────

export const UsageDailyBreakdownSchema = z.object({
  day: z.string().openapi({ example: '2026-06-04', description: 'UTC date YYYY-MM-DD.' }),
  spent_cents: z.number().int().openapi({ example: 1234 }),
  requests: z.number().int().openapi({ example: 450 }),
}).openapi('UsageDailyBreakdown');

export const UsageSummarySchema = z.object({
  success: z.literal(true),
  org: InferenceOrgSchema,
  summary: z.object({
    month: z.string().openapi({ example: '2026-06' }),
    month_spent_cents: z.number().int().openapi({ example: 8640 }),
    month_requests: z.number().int().openapi({ example: 3200 }),
    window_days: z.number().int().openapi({ example: 7 }),
    window_spent_cents: z.number().int().openapi({ example: 4320 }),
    window_requests: z.number().int().openapi({ example: 1600 }),
    success_count: z.number().int().openapi({ example: 1550 }),
    error_count: z.number().int().openapi({ example: 50 }),
    input_tokens: z.number().int().openapi({ example: 640000 }),
    output_tokens: z.number().int().openapi({ example: 128000 }),
    latency_ms_p50: z.number().int().nullable(),
    latency_ms_p95: z.number().int().nullable(),
    latency_ms_p99: z.number().int().nullable(),
    cache_l1_hits: z.number().int(),
    cache_semantic_hits: z.number().int(),
    cache_hit_rate: z.number().nullable(),
  }),
  day_series: z.array(UsageDailyBreakdownSchema).openapi({ description: 'Per-day breakdown for the requested window.' }),
  top_models: z.array(z.object({
    model_id: z.string().openapi({ example: 'openai/gpt-4o' }),
    spent_cents: z.number().int().openapi({ example: 5200 }),
    requests: z.number().int().openapi({ example: 1800 }),
  })).openapi({ description: 'Top models by cost, descending.' }),
  top_api_keys: z.array(z.object({
    id: z.string(),
    name: z.string(),
    preview: z.string(),
    spent_cents: z.number().int(),
    requests: z.number().int(),
    cache_l1_hits: z.number().int(),
    cache_semantic_hits: z.number().int(),
    cache_hit_rate: z.number().nullable(),
  })).openapi({ description: 'Top API keys by cost, descending.' }),
  recent: z.array(z.object({
    created_at: z.string().datetime(),
    model_id: z.string(),
    modality: z.string(),
    input_tokens: z.number().int().nullable(),
    output_tokens: z.number().int().nullable(),
    cost_cents: z.number().int(),
    latency_ms: z.number().int().nullable(),
    status: z.string(),
    billed_to: z.string(),
    cache_kind: z.string(),
  })).openapi({ description: 'Most recent 20 requests.' }),
}).openapi('UsageSummary');

// ─── Presets ───────────────────────────────────────────────────────

export const PresetConfigSchema = z.object({
  models: z.array(z.string().min(1)).min(1).max(20).openapi({
    example: ['anthropic/claude-3-5-sonnet', 'openai/gpt-4o'],
    description: 'Ordered model list. The first model is tried first; subsequent models are fallbacks.',
  }),
  provider_sort: z.enum(['price', 'throughput', 'latency']).nullable().optional().openapi({
    description: 'Provider sort preference passed to OpenRouter.',
  }),
  max_latency_ms: z.number().int().positive().max(60000).nullable().optional().openapi({ example: 5000 }),
  allow_fallbacks: z.boolean().optional().openapi({ description: 'Whether to fall back to other models on upstream errors.' }),
  preferred_max_price_per_mtok: z.number().nonnegative().nullable().optional().openapi({ example: 500 }),
}).openapi('PresetConfig');

export const PresetSchema = z.object({
  id: z.string().uuid().openapi({ example: 'pr_01hwxyz' }),
  name: z.string().openapi({ example: 'production-claude' }),
  description: z.string().nullable().optional(),
  config: PresetConfigSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('Preset');

export const PresetCreateRequestSchema = z.object({
  name: z.string().min(1).max(60).openapi({
    example: 'production-claude',
    description: 'Preset name — letters, digits, hyphens. Reference via `X-Ahura-Preset: <name>` header on gateway calls.',
  }),
  description: z.string().max(500).nullable().optional(),
  config: PresetConfigSchema,
}).openapi('PresetCreateRequest');

export const PresetListSchema = z.object({
  success: z.literal(true),
  org: InferenceOrgSchema,
  data: z.array(PresetSchema),
}).openapi('PresetList');

// ─── Members ───────────────────────────────────────────────────────

export const OrgMemberSchema = z.object({
  id: z.string().uuid().openapi({ example: 'mem_01hwxyz' }),
  user_id: z.string().uuid(),
  email: z.string().email().nullable().optional().openapi({ example: 'alice@example.com' }),
  full_name: z.string().nullable().optional().openapi({ example: 'Alice' }),
  role: z.enum(['owner', 'admin', 'developer', 'viewer']).openapi({ example: 'developer' }),
  status: z.enum(['active', 'invited', 'suspended']).openapi({ example: 'active' }),
  invited_at: z.string().datetime().nullable().optional(),
  joined_at: z.string().datetime().nullable().optional(),
  is_you: z.boolean().openapi({ example: false }),
}).openapi('OrgMember');

export const OrgMemberListSchema = z.object({
  success: z.literal(true),
  org: InferenceOrgSchema.extend({
    your_role: z.enum(['owner', 'admin', 'developer', 'viewer']),
  }),
  counts: z.object({
    total: z.number().int(),
    owners: z.number().int(),
    admins: z.number().int(),
    developers: z.number().int(),
    viewers: z.number().int(),
    invited: z.number().int(),
  }),
  data: z.array(OrgMemberSchema),
}).openapi('OrgMemberList');
