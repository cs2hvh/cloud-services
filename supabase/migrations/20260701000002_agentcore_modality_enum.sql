-- Doc: nextstespsAI/12-agent-execution-stages.md (T0.4)
-- Adds the 'agent_tool' modality so agentcore hosted-tool pricing rows can live
-- in inference.models and be resolved by the USAGE_EVENTS consumer.
--
-- MUST be a separate migration from the INSERT that uses it: Postgres forbids
-- using a newly-added enum value in the same transaction that adds it (mirrors
-- 20260622000000_multimodal_modality_enums.sql → ...001 split).

ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'agent_tool';
