-- Vector store: bring-your-own embeddings + open-weight embedding models.
--
-- 1) Make embedding_model_id optional. A NULL model = a "bring your own
--    embeddings" collection: the customer computes vectors with whatever model
--    they run and passes pre-computed `embedding` arrays; the server never
--    auto-embeds. (Auto-embed collections still pin a catalog model.)
-- 2) Add open-weight embedding models to the catalog alongside the OpenAI ones.
--    Auto-embed for these depends on the upstream serving the model — if one
--    isn't available, set is_active=FALSE. BYO works regardless of the catalog.

ALTER TABLE inference.vector_collections
  ALTER COLUMN embedding_model_id DROP NOT NULL;

COMMENT ON COLUMN inference.vector_collections.embedding_model_id IS
  'Embedding model for server-side auto-embed. NULL = bring-your-own-embeddings (caller always supplies pre-computed vectors).';

INSERT INTO inference.models (
  model_id, display_name, description, modality, serving_type,
  upstream_provider, upstream_model_id,
  capabilities, pricing,
  is_active, is_featured, sort_order
) VALUES
(
  'baai/bge-m3',
  'BGE-M3 (open weight)',
  'Open-weight multilingual embedding model (BAAI). 1024-dim, ~8k context, strong multilingual + long-document retrieval.',
  'embedding', 'proxy', 'openrouter', 'baai/bge-m3',
  '{"dimensions": 1024, "context_window": 8192, "open_weight": true}'::JSONB,
  '{"input_cents_per_mtok": 2, "output_cents_per_mtok": 0, "cached_cents_per_mtok": 0}'::JSONB,
  TRUE, FALSE, 210
),
(
  'intfloat/multilingual-e5-large',
  'E5 Large Multilingual (open weight)',
  'Open-weight multilingual embedding model (Microsoft E5). 1024-dim, 512 context. Solid general-purpose retrieval across 100+ languages.',
  'embedding', 'proxy', 'openrouter', 'intfloat/multilingual-e5-large',
  '{"dimensions": 1024, "context_window": 512, "open_weight": true}'::JSONB,
  '{"input_cents_per_mtok": 2, "output_cents_per_mtok": 0, "cached_cents_per_mtok": 0}'::JSONB,
  TRUE, FALSE, 211
),
(
  'nomic-ai/nomic-embed-text-v1.5',
  'Nomic Embed v1.5 (open weight)',
  'Open-weight English embedding model (Nomic). 768-dim, ~8k context, supports Matryoshka dimension reduction. Cheap and fast.',
  'embedding', 'proxy', 'openrouter', 'nomic-ai/nomic-embed-text-v1.5',
  '{"dimensions": 768, "context_window": 8192, "supports_dimension_reduction": true, "open_weight": true}'::JSONB,
  '{"input_cents_per_mtok": 1, "output_cents_per_mtok": 0, "cached_cents_per_mtok": 0}'::JSONB,
  TRUE, FALSE, 212
),
(
  'mixedbread-ai/mxbai-embed-large-v1',
  'mxbai Embed Large (open weight)',
  'Open-weight English embedding model (Mixedbread). 1024-dim, 512 context. Top-tier MTEB retrieval for its size.',
  'embedding', 'proxy', 'openrouter', 'mixedbread-ai/mxbai-embed-large-v1',
  '{"dimensions": 1024, "context_window": 512, "open_weight": true}'::JSONB,
  '{"input_cents_per_mtok": 2, "output_cents_per_mtok": 0, "cached_cents_per_mtok": 0}'::JSONB,
  TRUE, FALSE, 213
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_featured  = EXCLUDED.is_featured,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
