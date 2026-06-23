-- supabase disable transaction
-- Phase 0 prerequisite for multimodal Slice 0/1.
--
-- Keep enum expansion in its own earlier migration so later seed migrations can
-- use the values after commit. This avoids Postgres' "unsafe use of new value"
-- failure when ALTER TYPE ADD VALUE and INSERT happen in one transaction.

ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'image';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'moderation';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'music';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'ocr';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'realtime';

-- New docs use tts/stt; the original schema already has audio_tts/audio_stt.
-- Add aliases for forward compatibility while existing code can continue to
-- emit audio_tts/audio_stt until the catalog is migrated.
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'tts';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'stt';
