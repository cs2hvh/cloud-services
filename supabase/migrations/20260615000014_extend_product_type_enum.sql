-- Extend product_type enum with all billable/usable product types.
--
-- Migration 20251115073909_dynamic_pricing.sql had these ALTER TYPE statements
-- commented out, so compute, gpu, security, ai-deployment, app-deployment were
-- never added to the enum. inference_vector and custom_image are new types added
-- as part of the billing system expansion.
--
-- Without these values:
--   - GET /api/v1/resources?type=compute returns 500 (invalid enum input)
--   - Admin cannot create products of these types via the UI
--   - Billing rate admin UI for inference_vector / custom_image is blocked

ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'compute';
ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'gpu';
ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'security';
ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'ai-deployment';
ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'app-deployment';
ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'inference_vector';
ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'custom_image';
