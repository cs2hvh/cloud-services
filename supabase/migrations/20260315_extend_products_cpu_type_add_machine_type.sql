-- Extend cpu_type CHECK constraint to support Kubernetes CPU types (shared, dedicated, gpu)
-- and add machine_type column for Kubernetes machine type categorization

-- 1. Drop existing cpu_type check constraint
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_cpu_type_check;

-- 2. Add updated check constraint with Kubernetes CPU types
ALTER TABLE products ADD CONSTRAINT products_cpu_type_check
  CHECK (cpu_type IN ('basic', 'general_purpose', 'storage_optimized', 'shared', 'dedicated', 'gpu'));

-- 3. Add machine_type column (e.g., 'basic', 'premium-intel', 'premium-amd', 'general-purpose', etc.)
ALTER TABLE products ADD COLUMN IF NOT EXISTS machine_type TEXT;
