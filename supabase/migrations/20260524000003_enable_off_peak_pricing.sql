-- ============================================================
-- Enable off-peak pricing on a curated set of open-weight models.
--
-- Window: 05:00-11:00 UTC daily (6-hour band — matches DigitalOcean's
-- published off-peak pattern). Discount: 30% off the listed input + output
-- rate when the request's `occurred_at` falls inside the window.
--
-- Why these models: cheap open-weight workhorses where price-sensitive
-- workloads (batch processing, overnight pipelines, fine-tune evals) most
-- benefit from a time-shift. Frontier closed models (Claude/GPT/Gemini)
-- have no off-peak pricing because upstream rates don't move on time-of-day.
--
-- Off-peak enforcement lives in workers/inference/src/consumers/usage.ts
-- computeCost() — already deployed. Setting these jsonb fields makes the
-- discount take effect on the next usage event.
-- ============================================================

UPDATE inference.models
SET off_peak = '{"window_utc": "05:00-11:00", "discount_pct": 30}'::JSONB,
    updated_at = NOW()
WHERE model_id IN (
  'meta-llama/llama-4-scout',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.3-8b-instruct',
  'deepseek/deepseek-v3.2',
  'qwen/qwen-3-235b-instruct',
  'qwen/qwen-3-32b-instruct',
  'qwen/qwen-3-14b-instruct',
  'mistralai/mistral-large-3',
  'mistralai/mistral-nemo',
  'moonshotai/kimi-k2.5',
  'minimax/minimax-m2.5',
  'thudm/glm-4.7',
  'microsoft/phi-4',
  'google/gemma-4-27b-it'
);

-- Verify after running:
--   SELECT model_id, off_peak FROM inference.models
--   WHERE off_peak IS NOT NULL ORDER BY sort_order;
