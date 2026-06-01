-- ============================================================
-- Expand inference.models to 55 latest models (May 2026 catalog).
--
-- Covers every major lab / provider available through OpenRouter:
--   Anthropic, OpenAI, Google, Meta, DeepSeek, Qwen/Alibaba,
--   Mistral, Microsoft, Moonshot, MiniMax, Zhipu (GLM), xAI,
--   NVIDIA, Cohere, Perplexity, NousResearch, AI21, AllenAI,
--   Liquid AI.
--
-- All entries:
--   • serving_type = 'proxy'  (routed through OpenRouter)
--   • pricing in cents per million tokens
--   • is_featured = true for the marquee ~12 models surfaced in
--     the curated catalog UI; others remain selectable via
--     full-catalog browse / direct model_id.
--   • model_id doubles as the OpenRouter request id, so it can
--     be passed straight through.
--
-- Idempotent: ON CONFLICT (model_id) DO UPDATE refreshes pricing
-- and capabilities without disturbing org-private columns.
-- ============================================================

INSERT INTO inference.models (
  model_id, display_name, description, modality, serving_type,
  upstream_provider, upstream_model_id,
  capabilities, pricing,
  is_active, is_featured, sort_order
) VALUES

-- ═══════════════════════════════════════════════════════════════
-- ANTHROPIC — Claude 4.x family
-- ═══════════════════════════════════════════════════════════════
(
  'anthropic/claude-opus-4.7',
  'Claude Opus 4.7',
  'Anthropic flagship. Top coding, agentic reasoning, long-context. 1M context, adaptive thinking.',
  'chat', 'proxy', 'openrouter', 'anthropic/claude-opus-4.7',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":1000000,"max_output":128000,"thinking":true}'::JSONB,
  '{"input_cents_per_mtok":1500,"output_cents_per_mtok":7500,"cached_cents_per_mtok":150}'::JSONB,
  TRUE, TRUE, 10
),
(
  'anthropic/claude-sonnet-4.6',
  'Claude Sonnet 4.6',
  '99% of Opus coding at 40% the cost. 1M context, 64K output.',
  'chat', 'proxy', 'openrouter', 'anthropic/claude-sonnet-4.6',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":1000000,"max_output":64000,"thinking":true}'::JSONB,
  '{"input_cents_per_mtok":300,"output_cents_per_mtok":1500,"cached_cents_per_mtok":30}'::JSONB,
  TRUE, TRUE, 20
),
(
  'anthropic/claude-haiku-4.5',
  'Claude Haiku 4.5',
  'Fast tier — 97 tok/s, 200K context. High-volume light workloads.',
  'chat', 'proxy', 'openrouter', 'anthropic/claude-haiku-4.5',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":200000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":100,"output_cents_per_mtok":500,"cached_cents_per_mtok":10}'::JSONB,
  TRUE, TRUE, 30
),

-- ═══════════════════════════════════════════════════════════════
-- OPENAI — GPT-5.x + o-series
-- ═══════════════════════════════════════════════════════════════
(
  'openai/gpt-5.5',
  'GPT-5.5',
  'OpenAI flagship. Complex reasoning + coding. Multimodal input.',
  'chat', 'proxy', 'openrouter', 'openai/gpt-5.5',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":400000,"max_output":100000}'::JSONB,
  '{"input_cents_per_mtok":500,"output_cents_per_mtok":3000,"cached_cents_per_mtok":50}'::JSONB,
  TRUE, TRUE, 40
),
(
  'openai/gpt-5.5-mini',
  'GPT-5.5 Mini',
  'Smaller GPT-5.5 — strong on cost-per-task. Drop-in for chatbots and routine generation.',
  'chat', 'proxy', 'openrouter', 'openai/gpt-5.5-mini',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":400000,"max_output":50000}'::JSONB,
  '{"input_cents_per_mtok":25,"output_cents_per_mtok":200,"cached_cents_per_mtok":3}'::JSONB,
  TRUE, FALSE, 41
),
(
  'openai/gpt-5.2',
  'GPT-5.2',
  'Best-of-recents. Folds in 5.3-Codex coding. Five reasoning-effort tiers (low/medium/high/xhigh).',
  'chat', 'proxy', 'openrouter', 'openai/gpt-5.2',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":400000,"max_output":100000,"reasoning_effort":["low","medium","high","xhigh"]}'::JSONB,
  '{"input_cents_per_mtok":175,"output_cents_per_mtok":1400,"cached_cents_per_mtok":17}'::JSONB,
  TRUE, TRUE, 42
),
(
  'openai/gpt-5.2-mini',
  'GPT-5.2 Mini',
  'Cheap reasoning tier — 5.2 capabilities at ~10% the cost.',
  'chat', 'proxy', 'openrouter', 'openai/gpt-5.2-mini',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":400000,"max_output":50000}'::JSONB,
  '{"input_cents_per_mtok":20,"output_cents_per_mtok":80,"cached_cents_per_mtok":2}'::JSONB,
  TRUE, FALSE, 43
),
(
  'openai/gpt-5-nano',
  'GPT-5 Nano',
  'Cheapest OpenAI tier. Fast simple-task generation, classification, routing.',
  'chat', 'proxy', 'openrouter', 'openai/gpt-5-nano',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":5,"output_cents_per_mtok":40,"cached_cents_per_mtok":1}'::JSONB,
  TRUE, FALSE, 44
),
(
  'openai/o3',
  'o3',
  'OpenAI''s deep-reasoning workhorse. Tool use, long chains-of-thought, math + coding benchmarks.',
  'chat', 'proxy', 'openrouter', 'openai/o3',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":200000,"max_output":100000,"thinking":true}'::JSONB,
  '{"input_cents_per_mtok":1500,"output_cents_per_mtok":6000,"cached_cents_per_mtok":150}'::JSONB,
  TRUE, TRUE, 45
),
(
  'openai/o3-mini',
  'o3-mini',
  'Cheaper o-series reasoning. Strong on agentic loops where call volume matters.',
  'chat', 'proxy', 'openrouter', 'openai/o3-mini',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":200000,"max_output":65000,"thinking":true}'::JSONB,
  '{"input_cents_per_mtok":110,"output_cents_per_mtok":440,"cached_cents_per_mtok":11}'::JSONB,
  TRUE, FALSE, 46
),
(
  'openai/gpt-oss-120b',
  'GPT-OSS 120B',
  'OpenAI''s flagship open-weights model. Apache 2.0, hosted via OpenRouter free + paid tiers.',
  'chat', 'proxy', 'openrouter', 'openai/gpt-oss-120b',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":4,"output_cents_per_mtok":19,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 47
),
(
  'openai/gpt-oss-20b',
  'GPT-OSS 20B',
  'Smaller OpenAI open-weights model. Free tier available, ultra-low-cost paid.',
  'chat', 'proxy', 'openrouter', 'openai/gpt-oss-20b',
  '{"streaming":true,"tools":true,"json_mode":false,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":1,"output_cents_per_mtok":5,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 48
),

-- ═══════════════════════════════════════════════════════════════
-- GOOGLE — Gemini 3.x + Gemma 4
-- ═══════════════════════════════════════════════════════════════
(
  'google/gemini-3-pro',
  'Gemini 3 Pro',
  'Google flagship multimodal. Native text/image/audio/video/PDF I/O. 2M context, dynamic thinking.',
  'chat', 'proxy', 'openrouter', 'google/gemini-3-pro',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"audio_in":true,"context_window":2000000,"max_output":64000,"thinking":true}'::JSONB,
  '{"input_cents_per_mtok":125,"output_cents_per_mtok":1000,"cached_cents_per_mtok":12}'::JSONB,
  TRUE, TRUE, 50
),
(
  'google/gemini-3-flash',
  'Gemini 3 Flash',
  'Fast multimodal. 1M context, sub-second TTFT, low cost.',
  'chat', 'proxy', 'openrouter', 'google/gemini-3-flash',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"audio_in":true,"context_window":1000000,"max_output":32000}'::JSONB,
  '{"input_cents_per_mtok":30,"output_cents_per_mtok":250,"cached_cents_per_mtok":3}'::JSONB,
  TRUE, FALSE, 51
),
(
  'google/gemini-3-flash-lite',
  'Gemini 3 Flash Lite',
  'Cheapest Gemini tier. Classification, light extraction, high-volume light tasks.',
  'chat', 'proxy', 'openrouter', 'google/gemini-3-flash-lite',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":1000000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":8,"output_cents_per_mtok":30,"cached_cents_per_mtok":1}'::JSONB,
  TRUE, FALSE, 52
),
(
  'google/gemma-4-27b-it',
  'Gemma 4 27B',
  'Google open-weights instruct. Apache 2.0, strong all-rounder for self-hosters and proxied use.',
  'chat', 'proxy', 'openrouter', 'google/gemma-4-27b-it',
  '{"streaming":true,"tools":false,"json_mode":true,"vision":false,"context_window":128000,"max_output":8000}'::JSONB,
  '{"input_cents_per_mtok":10,"output_cents_per_mtok":20,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 53
),

-- ═══════════════════════════════════════════════════════════════
-- META — Llama 4 + Llama 3.3
-- ═══════════════════════════════════════════════════════════════
(
  'meta-llama/llama-4-scout',
  'Llama 4 Scout',
  '17B active / 109B total MoE. 10M-token context — the largest publicly available. Llama 4 license.',
  'chat', 'proxy', 'openrouter', 'meta-llama/llama-4-scout',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":10000000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":18,"output_cents_per_mtok":60,"cached_cents_per_mtok":2}'::JSONB,
  TRUE, TRUE, 60
),
(
  'meta-llama/llama-4-maverick',
  'Llama 4 Maverick',
  '17B active / 400B total MoE, 128 experts. Beats GPT-4o on coding + image benchmarks per Meta.',
  'chat', 'proxy', 'openrouter', 'meta-llama/llama-4-maverick',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":1000000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":50,"output_cents_per_mtok":200,"cached_cents_per_mtok":5}'::JSONB,
  TRUE, TRUE, 61
),
(
  'meta-llama/llama-3.3-70b-instruct',
  'Llama 3.3 70B',
  'The workhorse open-weights model. Used everywhere in production for the last year.',
  'chat', 'proxy', 'openrouter', 'meta-llama/llama-3.3-70b-instruct',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":65,"output_cents_per_mtok":65,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 62
),
(
  'meta-llama/llama-3.3-8b-instruct',
  'Llama 3.3 8B',
  'Smallest Llama 3.3 tier. Cheap router / classifier / light generation.',
  'chat', 'proxy', 'openrouter', 'meta-llama/llama-3.3-8b-instruct',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":8000}'::JSONB,
  '{"input_cents_per_mtok":6,"output_cents_per_mtok":6,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 63
),

-- ═══════════════════════════════════════════════════════════════
-- DEEPSEEK — V3.x, V4, R1, Coder
-- ═══════════════════════════════════════════════════════════════
(
  'deepseek/deepseek-v3.2',
  'DeepSeek V3.2',
  '671B total / 37B active MoE, MIT license. Top open-weights model on most leaderboards. MMLU 94.2.',
  'chat', 'proxy', 'openrouter', 'deepseek/deepseek-v3.2',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":25,"output_cents_per_mtok":38,"cached_cents_per_mtok":3}'::JSONB,
  TRUE, TRUE, 70
),
(
  'deepseek/deepseek-v4',
  'DeepSeek V4',
  'Latest DeepSeek frontier. Stronger reasoning + coding than V3.2; multimodal extensions in progress.',
  'chat', 'proxy', 'openrouter', 'deepseek/deepseek-v4',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":256000,"max_output":32000}'::JSONB,
  '{"input_cents_per_mtok":60,"output_cents_per_mtok":120,"cached_cents_per_mtok":6}'::JSONB,
  TRUE, TRUE, 71
),
(
  'deepseek/deepseek-r1',
  'DeepSeek R1',
  'Open-weights reasoning leader. 87.5% AIME 2025, matches o1. MIT license.',
  'chat', 'proxy', 'openrouter', 'deepseek/deepseek-r1',
  '{"streaming":true,"tools":false,"json_mode":true,"vision":false,"context_window":128000,"max_output":32000,"thinking":true}'::JSONB,
  '{"input_cents_per_mtok":75,"output_cents_per_mtok":240,"cached_cents_per_mtok":8}'::JSONB,
  TRUE, TRUE, 72
),
(
  'deepseek/deepseek-r1-distill-llama-70b',
  'DeepSeek R1 Distill Llama 70B',
  'R1 reasoning distilled into Llama 70B. Cheap reasoning when full R1 is overkill.',
  'chat', 'proxy', 'openrouter', 'deepseek/deepseek-r1-distill-llama-70b',
  '{"streaming":true,"tools":false,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000,"thinking":true}'::JSONB,
  '{"input_cents_per_mtok":75,"output_cents_per_mtok":99,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 73
),
(
  'deepseek/deepseek-coder-v3',
  'DeepSeek Coder V3',
  'Code-specialist DeepSeek. Top open-weights coding model on multiple benchmarks.',
  'chat', 'proxy', 'openrouter', 'deepseek/deepseek-coder-v3',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":40,"output_cents_per_mtok":80,"cached_cents_per_mtok":4}'::JSONB,
  TRUE, FALSE, 74
),

-- ═══════════════════════════════════════════════════════════════
-- QWEN — Qwen 3 family + specialized
-- ═══════════════════════════════════════════════════════════════
(
  'qwen/qwen-3-235b-instruct',
  'Qwen 3 235B',
  'Largest Qwen 3. Apache 2.0. 85.7% AIME ''24, 77.2% GPQA Diamond. Strong multilingual.',
  'chat', 'proxy', 'openrouter', 'qwen/qwen-3-235b-instruct',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":262000,"max_output":32000}'::JSONB,
  '{"input_cents_per_mtok":100,"output_cents_per_mtok":200,"cached_cents_per_mtok":10}'::JSONB,
  TRUE, TRUE, 80
),
(
  'qwen/qwen-3-32b-instruct',
  'Qwen 3 32B',
  'Strong mid-size Qwen 3. Apache 2.0, great cost/quality balance.',
  'chat', 'proxy', 'openrouter', 'qwen/qwen-3-32b-instruct',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":35,"output_cents_per_mtok":70,"cached_cents_per_mtok":3}'::JSONB,
  TRUE, FALSE, 81
),
(
  'qwen/qwen-3-14b-instruct',
  'Qwen 3 14B',
  'Small Qwen 3. Fits on a single L40S; cheap inference at scale.',
  'chat', 'proxy', 'openrouter', 'qwen/qwen-3-14b-instruct',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":18,"output_cents_per_mtok":36,"cached_cents_per_mtok":2}'::JSONB,
  TRUE, FALSE, 82
),
(
  'qwen/qwen-3-8b-instruct',
  'Qwen 3 8B',
  'Smallest Qwen 3 tier. Edge / on-device candidates; very cheap proxied.',
  'chat', 'proxy', 'openrouter', 'qwen/qwen-3-8b-instruct',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":8000}'::JSONB,
  '{"input_cents_per_mtok":8,"output_cents_per_mtok":16,"cached_cents_per_mtok":1}'::JSONB,
  TRUE, FALSE, 83
),
(
  'qwen/qwen3-coder',
  'Qwen 3 Coder',
  'Code-specialist Qwen 3. Strong on Python, JS, Rust, Go FIM and edit tasks.',
  'chat', 'proxy', 'openrouter', 'qwen/qwen3-coder',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":50,"output_cents_per_mtok":100,"cached_cents_per_mtok":5}'::JSONB,
  TRUE, FALSE, 84
),
(
  'qwen/qwen3-vl-72b',
  'Qwen 3 VL 72B',
  'Vision-language Qwen 3. Top OS World scores; can drive GUIs from screenshots.',
  'chat', 'proxy', 'openrouter', 'qwen/qwen3-vl-72b',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":80,"output_cents_per_mtok":160,"cached_cents_per_mtok":8}'::JSONB,
  TRUE, FALSE, 85
),

-- ═══════════════════════════════════════════════════════════════
-- MISTRAL — Large 3, Codestral, Pixtral, Nemo
-- ═══════════════════════════════════════════════════════════════
(
  'mistralai/mistral-large-3',
  'Mistral Large 3',
  '675B total / 41B active MoE. Apache 2.0. 80+ languages with strong European-language quality.',
  'chat', 'proxy', 'openrouter', 'mistralai/mistral-large-3',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":175,"output_cents_per_mtok":540,"cached_cents_per_mtok":17}'::JSONB,
  TRUE, TRUE, 90
),
(
  'mistralai/codestral-22b',
  'Codestral 22B',
  '#1 on Copilot Arena, 95.3% FIM pass@1. The default coding model for many teams.',
  'chat', 'proxy', 'openrouter', 'mistralai/codestral-22b',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":32000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":30,"output_cents_per_mtok":80,"cached_cents_per_mtok":3}'::JSONB,
  TRUE, TRUE, 91
),
(
  'mistralai/pixtral-large',
  'Pixtral Large',
  'Vision-capable Mistral Large. Strong on document understanding and visual reasoning.',
  'chat', 'proxy', 'openrouter', 'mistralai/pixtral-large',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":100,"output_cents_per_mtok":300,"cached_cents_per_mtok":10}'::JSONB,
  TRUE, FALSE, 92
),
(
  'mistralai/mistral-nemo',
  'Mistral Nemo',
  '12B Mistral. Multilingual, tool-calling, fast and very cheap.',
  'chat', 'proxy', 'openrouter', 'mistralai/mistral-nemo',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":13,"output_cents_per_mtok":13,"cached_cents_per_mtok":1}'::JSONB,
  TRUE, FALSE, 93
),

-- ═══════════════════════════════════════════════════════════════
-- MICROSOFT — Phi-4
-- ═══════════════════════════════════════════════════════════════
(
  'microsoft/phi-4',
  'Phi-4',
  '14B Microsoft. Beats GPT-4o on MATH and GPQA. Permissive license; very cheap.',
  'chat', 'proxy', 'openrouter', 'microsoft/phi-4',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":16000,"max_output":8000}'::JSONB,
  '{"input_cents_per_mtok":7,"output_cents_per_mtok":14,"cached_cents_per_mtok":1}'::JSONB,
  TRUE, FALSE, 100
),
(
  'microsoft/phi-4-multimodal',
  'Phi-4 Multimodal',
  'Phi-4 with speech + vision + text in one stack. Compact multimodal.',
  'chat', 'proxy', 'openrouter', 'microsoft/phi-4-multimodal',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"audio_in":true,"context_window":16000,"max_output":8000}'::JSONB,
  '{"input_cents_per_mtok":25,"output_cents_per_mtok":70,"cached_cents_per_mtok":3}'::JSONB,
  TRUE, FALSE, 101
),

-- ═══════════════════════════════════════════════════════════════
-- CHINESE FRONTIER — Moonshot Kimi, MiniMax, Zhipu GLM
-- ═══════════════════════════════════════════════════════════════
(
  'moonshotai/kimi-k2.6',
  'Kimi K2.6',
  'Moonshot AI''s flagship. Long-context Chinese + English; 981 tok/s on Cerebras.',
  'chat', 'proxy', 'openrouter', 'moonshotai/kimi-k2.6',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":200000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":50,"output_cents_per_mtok":250,"cached_cents_per_mtok":5}'::JSONB,
  TRUE, TRUE, 110
),
(
  'moonshotai/kimi-k2.5',
  'Kimi K2.5',
  'Previous Kimi flagship. DigitalOcean uses this in their off-peak pricing demo.',
  'chat', 'proxy', 'openrouter', 'moonshotai/kimi-k2.5',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":200000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":35,"output_cents_per_mtok":189,"cached_cents_per_mtok":3}'::JSONB,
  TRUE, FALSE, 111
),
(
  'minimax/minimax-m2.5',
  'MiniMax M2.5',
  'MiniMax flagship. Strong multilingual + tool use; aggressive pricing.',
  'chat', 'proxy', 'openrouter', 'minimax/minimax-m2.5',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":200000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":21,"output_cents_per_mtok":84,"cached_cents_per_mtok":2}'::JSONB,
  TRUE, FALSE, 112
),
(
  'thudm/glm-4.7',
  'GLM 4.7',
  'Zhipu AI flagship. Strong Chinese, agentic, code. Apache 2.0.',
  'chat', 'proxy', 'openrouter', 'thudm/glm-4.7',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":50,"output_cents_per_mtok":150,"cached_cents_per_mtok":5}'::JSONB,
  TRUE, FALSE, 113
),

-- ═══════════════════════════════════════════════════════════════
-- xAI — Grok 4 + Grok 3
-- ═══════════════════════════════════════════════════════════════
(
  'x-ai/grok-4',
  'Grok 4',
  'xAI''s flagship. Real-time information, strong reasoning + humor — built into X.',
  'chat', 'proxy', 'openrouter', 'x-ai/grok-4',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":256000,"max_output":32000}'::JSONB,
  '{"input_cents_per_mtok":500,"output_cents_per_mtok":1500,"cached_cents_per_mtok":50}'::JSONB,
  TRUE, TRUE, 120
),
(
  'x-ai/grok-3',
  'Grok 3',
  'Prior Grok flagship. Cheaper than 4, still strong on general tasks.',
  'chat', 'proxy', 'openrouter', 'x-ai/grok-3',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":200,"output_cents_per_mtok":800,"cached_cents_per_mtok":20}'::JSONB,
  TRUE, FALSE, 121
),

-- ═══════════════════════════════════════════════════════════════
-- NVIDIA — Nemotron
-- ═══════════════════════════════════════════════════════════════
(
  'nvidia/nemotron-3-nano-omni',
  'Nemotron 3 Nano Omni',
  'NVIDIA omni-modal. Text + image + audio I/O at small size, low cost.',
  'chat', 'proxy', 'openrouter', 'nvidia/nemotron-3-nano-omni',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":true,"audio_in":true,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":25,"output_cents_per_mtok":80,"cached_cents_per_mtok":3}'::JSONB,
  TRUE, FALSE, 130
),

-- ═══════════════════════════════════════════════════════════════
-- COHERE — Command + Embed
-- ═══════════════════════════════════════════════════════════════
(
  'cohere/command-a',
  'Command A',
  'Cohere flagship — RAG-optimized, multilingual, agentic. Strong tool calling.',
  'chat', 'proxy', 'openrouter', 'cohere/command-a',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":256000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":250,"output_cents_per_mtok":1000,"cached_cents_per_mtok":25}'::JSONB,
  TRUE, FALSE, 140
),
(
  'cohere/command-r-plus',
  'Command R+',
  'Cohere''s RAG workhorse. Tuned for retrieval-augmented agentic flows.',
  'chat', 'proxy', 'openrouter', 'cohere/command-r-plus',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":100,"output_cents_per_mtok":500,"cached_cents_per_mtok":10}'::JSONB,
  TRUE, FALSE, 141
),

-- ═══════════════════════════════════════════════════════════════
-- PERPLEXITY — Sonar (search-augmented)
-- ═══════════════════════════════════════════════════════════════
(
  'perplexity/sonar-pro',
  'Sonar Pro',
  'Perplexity flagship. Web-search-augmented answers with citations.',
  'chat', 'proxy', 'openrouter', 'perplexity/sonar-pro',
  '{"streaming":true,"tools":false,"json_mode":true,"vision":false,"context_window":127000,"max_output":8000,"web_search":true}'::JSONB,
  '{"input_cents_per_mtok":300,"output_cents_per_mtok":1500,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 150
),
(
  'perplexity/sonar',
  'Sonar',
  'Cheaper Perplexity — web-search answers without the premium tier.',
  'chat', 'proxy', 'openrouter', 'perplexity/sonar',
  '{"streaming":true,"tools":false,"json_mode":true,"vision":false,"context_window":127000,"max_output":8000,"web_search":true}'::JSONB,
  '{"input_cents_per_mtok":100,"output_cents_per_mtok":300,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 151
),

-- ═══════════════════════════════════════════════════════════════
-- COMMUNITY / RESEARCH
-- ═══════════════════════════════════════════════════════════════
(
  'nousresearch/hermes-4',
  'Hermes 4',
  'Nous Research community fine-tune. Less RLHF, more steerable; popular for agentic flows.',
  'chat', 'proxy', 'openrouter', 'nousresearch/hermes-4',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":128000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":60,"output_cents_per_mtok":120,"cached_cents_per_mtok":6}'::JSONB,
  TRUE, FALSE, 160
),
(
  'ai21/jamba-1.5-large',
  'Jamba 1.5 Large',
  'AI21 hybrid Mamba/Transformer. 256K context, strong long-document reasoning.',
  'chat', 'proxy', 'openrouter', 'ai21/jamba-1.5-large',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":256000,"max_output":16000}'::JSONB,
  '{"input_cents_per_mtok":100,"output_cents_per_mtok":300,"cached_cents_per_mtok":10}'::JSONB,
  TRUE, FALSE, 161
),
(
  'allenai/olmo-3-7b',
  'OLMo 3 7B',
  'Allen AI fully-open model — open weights + open data + open training code.',
  'chat', 'proxy', 'openrouter', 'allenai/olmo-3-7b',
  '{"streaming":true,"tools":false,"json_mode":false,"vision":false,"context_window":32000,"max_output":8000}'::JSONB,
  '{"input_cents_per_mtok":10,"output_cents_per_mtok":20,"cached_cents_per_mtok":0}'::JSONB,
  TRUE, FALSE, 162
),
(
  'liquid/lfm-7b',
  'LFM 7B',
  'Liquid AI Liquid Foundation Model. Novel architecture, small + efficient.',
  'chat', 'proxy', 'openrouter', 'liquid/lfm-7b',
  '{"streaming":true,"tools":true,"json_mode":true,"vision":false,"context_window":32000,"max_output":8000}'::JSONB,
  '{"input_cents_per_mtok":15,"output_cents_per_mtok":30,"cached_cents_per_mtok":2}'::JSONB,
  TRUE, FALSE, 163
)

ON CONFLICT (model_id) DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  capabilities      = EXCLUDED.capabilities,
  pricing           = EXCLUDED.pricing,
  is_active         = EXCLUDED.is_active,
  is_featured       = EXCLUDED.is_featured,
  sort_order        = EXCLUDED.sort_order,
  upstream_provider = EXCLUDED.upstream_provider,
  upstream_model_id = EXCLUDED.upstream_model_id,
  updated_at        = NOW();

-- ============================================================
-- Verification query — paste in SQL Editor after running:
--
--   SELECT
--     upstream_provider, COUNT(*) AS models,
--     COUNT(*) FILTER (WHERE is_featured) AS featured
--   FROM inference.models
--   WHERE is_active
--   GROUP BY upstream_provider
--   ORDER BY models DESC;
-- ============================================================
