import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import {
  InferenceMgmtErrorSchema,
  InferenceApiKeySchema,
  InferenceApiKeyCreateRequestSchema,
  InferenceApiKeyCreatedSchema,
  InferenceApiKeyListSchema,
  DeploymentSchema,
  DeploymentCreateRequestSchema,
  DeploymentListSchema,
  FineTuneJobSchema,
  FineTuneJobCreateRequestSchema,
  FineTuneJobListSchema,
  InferenceFileSchema,
  InferenceFileListSchema,
  InferenceFileDeletedSchema,
  BatchSchema,
  BatchCreateRequestSchema,
  BatchListSchema,
  ByokKeySchema,
  ByokKeyCreateRequestSchema,
  ByokKeyListSchema,
  VectorCollectionSchema,
  VectorCollectionCreateRequestSchema,
  VectorCollectionListSchema,
  VectorQueryRequestSchema,
  VectorQueryResultSchema,
  UsageSummarySchema,
  PresetSchema,
  PresetCreateRequestSchema,
  PresetListSchema,
  OrgMemberSchema,
  OrgMemberListSchema,
} from '@/lib/openapi/schemas/inference-mgmt';

// ─── Shared response helpers ──────────────────────────────────────

function err(description: string, example: Record<string, unknown>) {
  return { description, content: { 'application/json': { schema: InferenceMgmtErrorSchema, example } } };
}

const r401 = err('Unauthorized — session expired or API key invalid.', { error: 'Unauthorized' });
const r403 = err('Forbidden — viewer role cannot perform this action.', { error: 'Viewers cannot create resources' });
const r404 = err('Not found.', { error: 'Not found' });
const r429 = err('Too Many Requests — per-user rate limit (30–60 req/min depending on operation).', { error: 'Too Many Requests' });
const r500 = err('Internal server error.', { error: 'Internal server error' });

const auth = [{ bearerAuth: [] }];

// ─── Path registrations ───────────────────────────────────────────

export function registerInferenceMgmtPaths(registry: OpenAPIRegistry) {

  // ══════════════════════════════════════════════════════════════
  // API KEYS
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/api-keys',
    tags: ['Inference — API Keys'],
    summary: 'List API keys',
    operationId: 'listInferenceApiKeys',
    security: auth,
    description: 'Returns all active (non-revoked) Inference API keys for the calling user\'s org. Keys are returned masked — only the prefix and last 4 chars are shown. The full key is visible only once, at creation.',
    responses: {
      200: {
        description: 'API key list',
        content: { 'application/json': { schema: InferenceApiKeyListSchema } },
      },
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/api-keys',
    tags: ['Inference — API Keys'],
    summary: 'Create API key',
    operationId: 'createInferenceApiKey',
    security: auth,
    description: `Creates a new Inference API key for the org.

The generated key (\`ahu_live_...\`) is returned **once only** in the \`data.api_key\` field. Copy it immediately — the server stores only the SHA-256 hash and it cannot be recovered.

**Show-once pattern:** Subsequent \`GET /api/inference/api-keys\` calls return a masked preview (\`ahu_live_xxxx••••zzzz\`) only.`,
    request: {
      body: { required: true, content: { 'application/json': { schema: InferenceApiKeyCreateRequestSchema } } },
    },
    responses: {
      201: {
        description: 'API key created — plaintext key returned once',
        content: { 'application/json': { schema: InferenceApiKeyCreatedSchema } },
      },
      400: err('Validation error.', { error: 'Validation error', details: [{ path: 'name', message: 'Required' }] }),
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/inference/api-keys/{id}',
    tags: ['Inference — API Keys'],
    summary: 'Update API key',
    operationId: 'updateInferenceApiKey',
    security: auth,
    description: 'Update mutable fields on an existing key. All fields are optional — only supplied fields are changed.',
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'API key UUID.' }) }),
      body: { required: true, content: { 'application/json': { schema: InferenceApiKeyCreateRequestSchema.partial() } } },
    },
    responses: {
      200: { description: 'Updated key', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: InferenceApiKeySchema }) } } },
      400: err('Validation error.', { error: 'Validation error' }),
      401: r401, 403: r403, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/inference/api-keys/{id}',
    tags: ['Inference — API Keys'],
    summary: 'Revoke API key',
    operationId: 'revokeInferenceApiKey',
    security: auth,
    description: 'Permanently revokes a key. Revoked keys immediately stop authenticating at the edge gateway (KV TTL propagation ≤ 5 min). This action is irreversible.',
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'API key UUID.' }) }),
    },
    responses: {
      200: { description: 'Key revoked', content: { 'application/json': { schema: z.object({ success: z.literal(true), revoked_id: z.string().uuid() }) } } },
      401: r401, 403: r403, 404: r404, 429: r429, 500: r500,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // BYOK KEYS
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/byok-keys',
    tags: ['Inference — BYOK Keys'],
    summary: 'List BYOK keys',
    operationId: 'listByokKeys',
    security: auth,
    description: 'Lists stored Bring-Your-Own-Key (BYOK) upstream keys. Only the masked preview is returned — the plaintext is never retrievable after creation.',
    responses: {
      200: { description: 'BYOK key list', content: { 'application/json': { schema: ByokKeyListSchema } } },
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/byok-keys',
    tags: ['Inference — BYOK Keys'],
    summary: 'Store BYOK key',
    operationId: 'createByokKey',
    security: auth,
    description: `Stores an upstream provider API key, AES-GCM encrypted, for use in BYOK billing mode.

Once stored, reference it on gateway calls by setting:
- \`X-Ahura-Billing: byok\`
- \`X-Ahura-BYOK-Provider: <provider>\`

The gateway decrypts the matching key at request time. The plaintext is **never returned** in any response.`,
    request: {
      body: { required: true, content: { 'application/json': { schema: ByokKeyCreateRequestSchema } } },
    },
    responses: {
      201: { description: 'BYOK key stored', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: ByokKeySchema }) } } },
      400: err('Validation error.', { error: 'Validation error' }),
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/inference/byok-keys/{id}',
    tags: ['Inference — BYOK Keys'],
    summary: 'Delete BYOK key',
    operationId: 'deleteByokKey',
    security: auth,
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'BYOK key UUID.' }) }),
    },
    responses: {
      200: { description: 'Key deleted', content: { 'application/json': { schema: z.object({ success: z.literal(true) }) } } },
      401: r401, 403: r403, 404: r404, 429: r429, 500: r500,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // DEPLOYMENTS (BYO Model Deployments)
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/deployments',
    tags: ['Inference — Deployments'],
    summary: 'List deployments',
    operationId: 'listDeployments',
    security: auth,
    description: 'Lists BYO model deployments for the org (up to 100). Use the `status` query parameter to filter.',
    request: {
      query: z.object({
        status: z.enum(['building', 'active', 'failed', 'stopped']).optional().openapi({ description: 'Filter by deployment status.' }),
      }),
    },
    responses: {
      200: { description: 'Deployment list', content: { 'application/json': { schema: DeploymentListSchema } } },
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/deployments',
    tags: ['Inference — Deployments'],
    summary: 'Create deployment',
    operationId: 'createDeployment',
    security: auth,
    description: `Provisions a BYO model deployment on RunPod Serverless.

**Lifecycle:**
1. Row created with \`status: "building"\`
2. Deploy-runner picks up the job, provisions a RunPod Serverless endpoint
3. Once the endpoint is \`READY\`, the model is registered in the catalog and the row flips to \`status: "active"\`
4. The model is now callable at the gateway as \`POST /v1/chat/completions\` with its assigned \`model_id\`

**Sources:**
- \`docker\` — any public OCI image
- \`huggingface\` — HF model repo ID (automatically uses the vLLM worker image)

**Note:** \`truss\` source is not yet supported — build locally with \`truss build\`, push the image, and deploy with \`source: "docker"\`.`,
    request: {
      body: { required: true, content: { 'application/json': { schema: DeploymentCreateRequestSchema } } },
    },
    responses: {
      201: { description: 'Deployment created (building)', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: DeploymentSchema, preflight: z.unknown().optional() }) } } },
      400: err('Validation or preflight error.', { error: 'Source failed pre-flight checks' }),
      401: r401, 403: r403,
      409: err('Name already exists in this org.', { error: 'Deployment named "my-deploy" already exists in this org' }),
      429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/inference/deployments/{id}',
    tags: ['Inference — Deployments'],
    summary: 'Get deployment',
    operationId: 'getDeployment',
    security: auth,
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Deployment UUID.' }) }),
    },
    responses: {
      200: { description: 'Deployment details', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: DeploymentSchema }) } } },
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/inference/deployments/{id}',
    tags: ['Inference — Deployments'],
    summary: 'Delete deployment',
    operationId: 'deleteDeployment',
    security: auth,
    description: 'Tears down the RunPod Serverless endpoint and removes the deployment and its catalog model entry. Running requests will fail after teardown.',
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Deployment UUID.' }) }),
    },
    responses: {
      200: { description: 'Deployment deleted', content: { 'application/json': { schema: z.object({ success: z.literal(true) }) } } },
      401: r401, 403: r403, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/deployments/{id}/scale',
    tags: ['Inference — Deployments'],
    summary: 'Scale deployment',
    operationId: 'scaleDeployment',
    security: auth,
    description: 'Update the autoscaling configuration of an active deployment. Changes take effect within ~60 seconds.',
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Deployment UUID.' }) }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              min_workers: z.number().int().min(0).max(50).openapi({ example: 1 }),
              max_workers: z.number().int().min(1).max(50).openapi({ example: 8 }),
              idle_timeout_s: z.number().int().min(5).max(3600).openapi({ example: 30 }),
            }).openapi('ScaleDeploymentRequest'),
          },
        },
      },
    },
    responses: {
      200: { description: 'Scaling updated', content: { 'application/json': { schema: z.object({ success: z.literal(true), autoscale: z.unknown() }) } } },
      400: err('Validation error.', { error: 'Validation error' }),
      401: r401, 403: r403, 404: r404, 429: r429, 500: r500,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // FINE-TUNING JOBS
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/fine-tuning/jobs',
    tags: ['Inference — Fine-Tuning'],
    summary: 'List fine-tuning jobs',
    operationId: 'listFineTuningJobs',
    security: auth,
    request: {
      query: z.object({
        status: z.enum(['queued', 'preparing', 'running', 'completed', 'failed', 'cancelled']).optional().openapi({ description: 'Filter by job status.' }),
      }),
    },
    responses: {
      200: { description: 'Fine-tuning job list', content: { 'application/json': { schema: FineTuneJobListSchema } } },
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/fine-tuning/jobs',
    tags: ['Inference — Fine-Tuning'],
    summary: 'Create fine-tuning job',
    operationId: 'createFineTuningJob',
    security: auth,
    description: `Launches a fine-tuning job on RunPod GPU infrastructure using Axolotl.

**Prerequisites:**
- Sufficient credits (minimum $1 or estimated job cost)
- Max 3 concurrent jobs per org
- A GPU with enough VRAM for the selected base model

**Lifecycle:**
1. Dataset pre-flight validation (line count, JSONL format, token length) — fails fast before any GPU time is spent
2. Row created with \`status: "queued"\`
3. BullMQ worker picks up the job, provisions a RunPod pod with the training image
4. Pod trains the adapter, webhooks back with the S3 output location
5. Row transitions to \`status: "completed"\` and the adapter is registered in the model catalog
6. Org is charged \`cost_cents\` against their credit balance

**Billing:** Charged on completion (not upfront). The balance gate ensures sufficient funds exist before queuing.`,
    request: {
      body: { required: true, content: { 'application/json': { schema: FineTuneJobCreateRequestSchema } } },
    },
    responses: {
      201: {
        description: 'Job queued',
        content: {
          'application/json': {
            schema: z.object({ success: z.literal(true), data: FineTuneJobSchema, preflight: z.unknown().optional() }),
            example: {
              success: true,
              data: {
                id: 'ft_01hwxyz',
                name: 'llama-support-v1',
                status: 'queued',
                base_model_id: 'meta-llama/llama-3.3-8b-instruct',
                method: 'lora',
                gpu_sku: 'NVIDIA A100 80GB PCIe',
              },
            },
          },
        },
      },
      400: err('Dataset preflight failed, GPU unfit, or base model not supported.', { error: 'Dataset failed pre-flight checks', code: 'ft_gpu_unfit' }),
      401: r401, 402: err('Insufficient credits.', { error: 'Insufficient credits to start this job.', code: 'insufficient_credits', required_usd: 3.50 }),
      403: r403,
      429: err('Concurrency quota hit or rate limit.', { error: 'You already have 3 fine-tuning jobs queued or running (limit 3).', code: 'ft_concurrency_limit' }),
      500: r500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/inference/fine-tuning/jobs/{id}',
    tags: ['Inference — Fine-Tuning'],
    summary: 'Get fine-tuning job',
    operationId: 'getFineTuningJob',
    security: auth,
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Job UUID.' }) }),
    },
    responses: {
      200: { description: 'Job details', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: FineTuneJobSchema }) } } },
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // FILES
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/files',
    tags: ['Inference — Files'],
    summary: 'List files',
    operationId: 'listInferenceFiles',
    security: auth,
    description: 'Lists uploaded files for the org (OpenAI-compatible shape).',
    request: {
      query: z.object({
        purpose: z.literal('batch').optional().openapi({ description: 'Filter by purpose.' }),
      }),
    },
    responses: {
      200: { description: 'File list', content: { 'application/json': { schema: InferenceFileListSchema } } },
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/files',
    tags: ['Inference — Files'],
    summary: 'Upload file',
    operationId: 'uploadInferenceFile',
    security: auth,
    description: `Uploads a file to R2 object storage. Currently only \`purpose: "batch"\` is supported (JSONL files for batch inference).

**Two upload modes:**

1. **Multipart** (recommended, OpenAI SDK compatible):
   \`\`\`
   Content-Type: multipart/form-data
   Body fields: file=<File>, purpose=batch
   \`\`\`

2. **Raw body** (curl-friendly):
   \`\`\`
   Content-Type: application/x-ndjson
   ?purpose=batch&filename=data.jsonl
   Body: raw JSONL bytes
   \`\`\`

Max file size: **200 MB**. Each line must be a valid JSON object.`,
    request: {
      body: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: z.object({
              file: z.unknown().openapi({ description: 'JSONL file to upload.' }),
              purpose: z.literal('batch').openapi({ description: 'File purpose. Must be `"batch"`.' }),
            }).openapi('FileUploadMultipart'),
          },
          'application/x-ndjson': {
            schema: z.string().openapi({ description: 'Raw JSONL body. Pass `?purpose=batch&filename=data.jsonl` in the query string.' }),
          },
        },
      },
    },
    responses: {
      201: { description: 'File uploaded', content: { 'application/json': { schema: InferenceFileSchema } } },
      400: err('Empty body, size exceeded, or wrong purpose.', { error: 'File exceeds 200MB limit' }),
      401: r401, 403: r403, 413: err('File too large (> 200 MB).', { error: 'File exceeds 200MB limit' }),
      429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/inference/files/{id}',
    tags: ['Inference — Files'],
    summary: 'Get file metadata',
    operationId: 'getInferenceFile',
    security: auth,
    request: {
      params: z.object({ id: z.string().openapi({ example: 'file_abc123', description: 'File ID (prefix `file_`).' }) }),
    },
    responses: {
      200: { description: 'File metadata', content: { 'application/json': { schema: InferenceFileSchema } } },
      401: r401, 404: r404, 429: r429,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/inference/files/{id}',
    tags: ['Inference — Files'],
    summary: 'Delete file',
    operationId: 'deleteInferenceFile',
    security: auth,
    description: 'Soft-deletes the metadata row and purges the R2 object. Files referenced by pending batches cannot be deleted.',
    request: {
      params: z.object({ id: z.string().openapi({ example: 'file_abc123', description: 'File ID.' }) }),
    },
    responses: {
      200: { description: 'File deleted', content: { 'application/json': { schema: InferenceFileDeletedSchema } } },
      401: r401, 403: r403, 404: r404, 429: r429,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // BATCHES
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/batches',
    tags: ['Inference — Batches'],
    summary: 'List batches',
    operationId: 'listBatches',
    security: auth,
    description: 'Lists batch jobs for the org (OpenAI-compatible shape).',
    responses: {
      200: { description: 'Batch list', content: { 'application/json': { schema: BatchListSchema } } },
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/batches',
    tags: ['Inference — Batches'],
    summary: 'Create batch',
    operationId: 'createBatch',
    security: auth,
    description: `Creates an asynchronous batch job from an uploaded JSONL file.

**Input file format** — each line must be a JSON object:
\`\`\`json
{"custom_id": "req-1", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "openai/gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}}
\`\`\`

**Lifecycle:**
1. Input file is validated (line count, format)
2. Batch row created with \`status: "validating"\`
3. Processor runs each line against the gateway endpoint
4. On completion: \`status: "completed"\` + \`output_file_id\` set
5. Download results via \`GET /api/inference/files/{output_file_id}/content\`

Completion window: **24h**.`,
    request: {
      body: { required: true, content: { 'application/json': { schema: BatchCreateRequestSchema } } },
    },
    responses: {
      201: { description: 'Batch created', content: { 'application/json': { schema: BatchSchema } } },
      400: err('Validation error or input file not found.', { error: 'Input file not found' }),
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/inference/batches/{id}',
    tags: ['Inference — Batches'],
    summary: 'Get batch',
    operationId: 'getBatch',
    security: auth,
    request: {
      params: z.object({ id: z.string().openapi({ example: 'batch_abc123', description: 'Batch ID (prefix `batch_`).' }) }),
    },
    responses: {
      200: { description: 'Batch details', content: { 'application/json': { schema: BatchSchema } } },
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/batches/{id}/cancel',
    tags: ['Inference — Batches'],
    summary: 'Cancel batch',
    operationId: 'cancelBatch',
    security: auth,
    description: 'Cancels a batch that is still validating or in progress. Already-completed requests are not reversed.',
    request: {
      params: z.object({ id: z.string().openapi({ example: 'batch_abc123', description: 'Batch ID.' }) }),
    },
    responses: {
      200: { description: 'Batch cancellation initiated', content: { 'application/json': { schema: BatchSchema } } },
      400: err('Batch is already completed or cancelled.', { error: 'Cannot cancel a completed batch' }),
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // VECTOR COLLECTIONS
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/vector/collections',
    tags: ['Inference — Vector'],
    summary: 'List vector collections',
    operationId: 'listVectorCollections',
    security: auth,
    description: 'Lists pgvector collections for the org. Each collection is billed at $8/month (hourly metered).',
    responses: {
      200: { description: 'Collection list', content: { 'application/json': { schema: VectorCollectionListSchema } } },
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/vector/collections',
    tags: ['Inference — Vector'],
    summary: 'Create vector collection',
    operationId: 'createVectorCollection',
    security: auth,
    description: `Creates a new pgvector collection.

**Two modes:**
- **Auto-embed:** Set \`embedding_model_id\` to a catalog model. On upsert/query you can pass \`text\` instead of a pre-computed vector.
- **Bring-your-own embeddings:** Omit \`embedding_model_id\` and set \`dimensions\`. You must always supply \`embedding\` (float array) on upsert/query.

**Pricing:** $8/month per collection, billed hourly.`,
    request: {
      body: { required: true, content: { 'application/json': { schema: VectorCollectionCreateRequestSchema } } },
    },
    responses: {
      201: { description: 'Collection created', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: VectorCollectionSchema }) } } },
      400: err('Validation error.', { error: 'Validation error' }),
      401: r401, 402: err('Insufficient credits to create a vector collection ($1 minimum balance).', { error: 'Insufficient credits' }),
      403: r403, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/inference/vector/collections/{id}',
    tags: ['Inference — Vector'],
    summary: 'Get vector collection',
    operationId: 'getVectorCollection',
    security: auth,
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Collection UUID.' }) }),
    },
    responses: {
      200: { description: 'Collection details', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: VectorCollectionSchema }) } } },
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/inference/vector/collections/{id}',
    tags: ['Inference — Vector'],
    summary: 'Delete vector collection',
    operationId: 'deleteVectorCollection',
    security: auth,
    description: 'Deletes the collection and all its vectors. Billing stops immediately. This is irreversible.',
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Collection UUID.' }) }),
    },
    responses: {
      200: { description: 'Collection deleted', content: { 'application/json': { schema: z.object({ success: z.literal(true) }) } } },
      401: r401, 403: r403, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/vector/collections/{id}/upsert',
    tags: ['Inference — Vector'],
    summary: 'Upsert vectors',
    operationId: 'upsertVectors',
    security: auth,
    description: 'Insert or update rows in a collection. If a row with the same `external_id` already exists it is replaced.',
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Collection UUID.' }) }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              rows: z.array(z.object({
                external_id: z.string().openapi({ example: 'doc-42-chunk-3', description: 'Your identifier for this row. Used for deduplication.' }),
                embedding: z.array(z.number()).optional().openapi({ description: 'Pre-computed float vector. Required if collection has no `embedding_model_id`.' }),
                content: z.string().optional().openapi({ description: 'Raw text/content. Server auto-embeds using collection\'s model when `embedding` is omitted.' }),
                metadata: z.record(z.unknown()).optional().openapi({ example: { tenant: 'acme', source: 'kb' } }),
              })).min(1).max(100).openapi({ description: 'Rows to upsert (1–100 per request).' }),
            }).openapi('VectorUpsertRequest'),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Upsert result',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              upserted: z.number().int().openapi({ example: 42 }),
              rows: z.array(z.object({
                id: z.string().uuid(),
                external_id: z.string(),
              })),
            }),
          },
        },
      },
      400: err('Validation error.', { error: 'Validation error' }),
      401: r401, 403: r403, 404: r404, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/vector/collections/{id}/query',
    tags: ['Inference — Vector'],
    summary: 'Query vectors',
    operationId: 'queryVectors',
    security: auth,
    description: `Similarity search against a collection.

Provide either:
- \`embedding\` — a pre-computed float vector (bring-your-own embeddings collections)
- \`text\` — raw text; the server auto-embeds it using the collection's \`embedding_model_id\`

Results are ordered by similarity descending. Use \`filter\` for multi-tenant RAG.`,
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Collection UUID.' }) }),
      body: { required: true, content: { 'application/json': { schema: VectorQueryRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Query results',
        content: {
          'application/json': {
            schema: VectorQueryResultSchema,
            example: {
              success: true,
              results: [
                { id: 'row-uuid', external_id: 'doc-42-chunk-3', content: 'To reset your password...', metadata: { tenant: 'acme' }, similarity: 0.923 },
              ],
              count: 1,
            },
          },
        },
      },
      400: err('Must provide `embedding` or `text`.', { error: 'Must provide either embedding or text' }),
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // PRESETS
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/presets',
    tags: ['Inference — Presets'],
    summary: 'List presets',
    operationId: 'listPresets',
    security: auth,
    description: 'Lists saved request presets for the org. Apply a preset on gateway calls via `X-Ahura-Preset: <name>`.',
    responses: {
      200: { description: 'Preset list', content: { 'application/json': { schema: PresetListSchema } } },
      401: r401, 429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/inference/presets',
    tags: ['Inference — Presets'],
    summary: 'Create preset',
    operationId: 'createPreset',
    security: auth,
    description: `Creates a saved routing preset.

A preset bundles model preferences, fallback behaviour, and routing hints. Reference it on gateway calls:

\`\`\`
X-Ahura-Preset: production-claude
\`\`\`

The gateway merges preset config into the request (body fields override the preset).`,
    request: {
      body: { required: true, content: { 'application/json': { schema: PresetCreateRequestSchema } } },
    },
    responses: {
      201: { description: 'Preset created', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: PresetSchema }) } } },
      400: err('Validation error.', { error: 'Validation error' }),
      401: r401, 409: err('Name already exists.', { error: 'Preset "production-claude" already exists' }),
      429: r429, 500: r500,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/inference/presets/{id}',
    tags: ['Inference — Presets'],
    summary: 'Delete preset',
    operationId: 'deletePreset',
    security: auth,
    request: {
      params: z.object({ id: z.string().uuid().openapi({ description: 'Preset UUID.' }) }),
    },
    responses: {
      200: { description: 'Preset deleted', content: { 'application/json': { schema: z.object({ success: z.literal(true) }) } } },
      401: r401, 403: r403, 404: r404, 429: r429, 500: r500,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // USAGE
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/usage/summary',
    tags: ['Inference — Usage'],
    summary: 'Get usage summary',
    operationId: 'getInferenceUsageSummary',
    security: auth,
    description: 'Returns current-month spend, request counts, a per-day breakdown, top models by cost, and the most recent 20 requests for the org.',
    request: {
      query: z.object({
        days: z.coerce.number().int().min(1).max(90).optional().openapi({
          example: 7,
          description: 'Number of days to include in the daily breakdown (1–90). Default: 7.',
        }),
      }),
    },
    responses: {
      200: { description: 'Usage summary', content: { 'application/json': { schema: UsageSummarySchema } } },
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });

  // ══════════════════════════════════════════════════════════════
  // MEMBERS
  // ══════════════════════════════════════════════════════════════

  registry.registerPath({
    method: 'get',
    path: '/api/inference/members',
    tags: ['Inference — Org'],
    summary: 'List org members',
    operationId: 'listInferenceOrgMembers',
    security: auth,
    description: 'Lists all members of the calling user\'s inference org with their role and join date.',
    responses: {
      200: { description: 'Member list', content: { 'application/json': { schema: OrgMemberListSchema } } },
      401: r401, 404: r404, 429: r429, 500: r500,
    },
  });
}
