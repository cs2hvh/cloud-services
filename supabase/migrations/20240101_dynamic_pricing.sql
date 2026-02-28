-- Migration: Dynamic Pricing System
-- Description: Creates tables for dynamic pricing management and extends products table with pricing-specific fields
-- Date: 2024

-- =========================================
-- 1. Create pricing_categories table
-- =========================================
-- =========================================
CREATE TABLE IF NOT EXISTS pricing_categories (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    starting_price_label TEXT,
    starting_price_description TEXT,
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE pricing_categories IS 'Categories for grouping pricing tiers on the pricing page';

-- Create index for sorting
CREATE INDEX IF NOT EXISTS idx_pricing_categories_sort ON pricing_categories(sort_order);

-- Create index for active categories
CREATE INDEX IF NOT EXISTS idx_pricing_categories_active ON pricing_categories(active) WHERE active = true;

-- =========================================
-- 2. Create pricing_promos table
-- =========================================
CREATE TABLE IF NOT EXISTS pricing_promos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_slug TEXT NOT NULL,
    badge TEXT NOT NULL,
    badge_note TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    subtext TEXT,
    price_old TEXT,
    price_current TEXT,
    link_text TEXT NOT NULL,
    link_href TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE pricing_promos IS 'Promotional cards displayed on the pricing page';

-- Create index for sorting
CREATE INDEX IF NOT EXISTS idx_pricing_promos_sort ON pricing_promos(sort_order);

-- Create index for active promos
CREATE INDEX IF NOT EXISTS idx_pricing_promos_active ON pricing_promos(active) WHERE active = true;

-- =========================================
-- 3. Extend products table with pricing-specific fields
-- =========================================

-- Add yearly pricing support
ALTER TABLE products ADD COLUMN IF NOT EXISTS yearly_price NUMERIC;

-- Add billing period (e.g., "per month", "per hour")
ALTER TABLE products ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'per month';

-- Add specs array for displayed specs (e.g., ["8 vCPU", "32GB RAM"])
ALTER TABLE products ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '[]'::jsonb;

-- Add features array (e.g., ["Root access", "Managed backups"])
ALTER TABLE products ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;

-- Add summary object for additional info
ALTER TABLE products ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}'::jsonb;

-- Add featured flag
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- Add highlighted flag (for special visual treatment)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_highlighted BOOLEAN DEFAULT false;

-- Add CTA text and link
ALTER TABLE products ADD COLUMN IF NOT EXISTS cta_text TEXT DEFAULT 'Get Started';
ALTER TABLE products ADD COLUMN IF NOT EXISTS cta_link TEXT DEFAULT '/signup';

-- Add sort order for ordering within category
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add short description for pricing card subtitle
ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description TEXT;

-- =========================================
-- 4. Update products type enum (if needed)
-- =========================================
-- Note: Run this only if you need to add new types to the existing enum
-- This depends on how your type column is defined (text vs enum)

-- If type is TEXT, no action needed
-- If type is an ENUM, you'll need to alter it:
-- ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'compute';
-- ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'gpu';
-- ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'security';
-- ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'ai-deployment';
-- ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'app-deployment';

-- =========================================
-- 5. Create indexes for new columns
-- =========================================
CREATE INDEX IF NOT EXISTS idx_products_sort_order ON products(sort_order);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_is_highlighted ON products(is_highlighted) WHERE is_highlighted = true;

-- =========================================
-- 6. Create updated_at triggers
-- =========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for pricing_categories
DROP TRIGGER IF EXISTS update_pricing_categories_updated_at ON pricing_categories;
CREATE TRIGGER update_pricing_categories_updated_at
    BEFORE UPDATE ON pricing_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for pricing_promos
DROP TRIGGER IF EXISTS update_pricing_promos_updated_at ON pricing_promos;
CREATE TRIGGER update_pricing_promos_updated_at
    BEFORE UPDATE ON pricing_promos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- 7. Row Level Security (RLS)
-- =========================================

-- Enable RLS on pricing_categories
ALTER TABLE pricing_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active categories
CREATE POLICY "Allow public read access to active pricing categories"
    ON pricing_categories
    FOR SELECT
    USING (active = true);

-- Policy: Allow authenticated users with admin role to manage categories
CREATE POLICY "Allow admins to manage pricing categories"
    ON pricing_categories
    FOR ALL
    USING (
        auth.uid() IN (
            SELECT id FROM user_profiles WHERE roles @> ARRAY['admin'::user_role]
        )
    )
    WITH CHECK (
        auth.uid() IN (
            SELECT id FROM user_profiles WHERE roles @> ARRAY['admin'::user_role]
        )
    );

-- Enable RLS on pricing_promos
ALTER TABLE pricing_promos ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active promos
CREATE POLICY "Allow public read access to active pricing promos"
    ON pricing_promos
    FOR SELECT
    USING (active = true);

-- Policy: Allow authenticated users with admin role to manage promos
CREATE POLICY "Allow admins to manage pricing promos"
    ON pricing_promos
    FOR ALL
    USING (
        auth.uid() IN (
            SELECT id FROM user_profiles WHERE roles @> ARRAY['admin'::user_role]
        )
    )
    WITH CHECK (
        auth.uid() IN (
            SELECT id FROM user_profiles WHERE roles @> ARRAY['admin'::user_role]
        )
    );

-- =========================================
-- 8. Sample Data (Optional)
-- =========================================
-- Uncomment to insert sample categories

/*
INSERT INTO pricing_categories (id, title, description, sort_order) VALUES
('compute', 'Cloud Compute', 'Virtual machines for every workload', 1),
('gpu', 'GPU Instances', 'Accelerated computing for AI/ML', 2),
('object-storage', 'Object Storage', 'Scalable storage for your data', 3),
('database', 'Managed Databases', 'Fully managed database services', 4),
('security', 'Security & Compliance', 'Enterprise-grade protection', 5),
('kubernetes', 'Kubernetes', 'Managed container orchestration', 6),
('ai-deployment', 'AI Deployment', 'Deploy AI models at scale', 7),
('app-deployment', 'App Deployment', 'Deploy applications easily', 8);

INSERT INTO pricing_promos (title, description, badge_text, link, link_text) VALUES
('Free Trial', 'Get $100 in credits for 60 days. No credit card required to start.', 'Limited Time', '/signup', 'Start Free Trial'),
('Enterprise Solutions', 'Need custom infrastructure? Get personalized solutions with dedicated support.', 'Enterprise', '/contact', 'Contact Sales');
*/

-- =========================================
-- End of Migration
-- =========================================
