-- Add fixed_price to products for upfront billing per plan/service
ALTER TABLE products
ADD COLUMN IF NOT EXISTS fixed_price numeric DEFAULT 0;
COMMENT ON COLUMN products.fixed_price IS 'Upfront fixed price charged at provisioning time';
