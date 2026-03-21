-- Add slug column to products table for DigitalOcean droplet integration
-- This column will store the DigitalOcean droplet size slug for Kubernetes plans

ALTER TABLE products ADD COLUMN IF NOT EXISTS slug TEXT;
-- Add a comment to describe the column
COMMENT ON COLUMN products.slug IS 'DigitalOcean droplet size slug for Kubernetes plans';
