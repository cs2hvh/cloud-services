-- Extend cpu_type CHECK constraint to support Kubernetes CPU types (shared, dedicated, gpu)
-- and add machine_type column for Kubernetes machine type categorization

DO $$
BEGIN
  IF to_regclass('public.products') IS NULL THEN
    RAISE NOTICE 'Skipping products cpu_type/machine_type migration: public.products does not exist.';
    RETURN;
  END IF;

  -- 1. Drop existing cpu_type check constraint
  ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_cpu_type_check;

  -- 2. Add updated check constraint only when cpu_type exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'cpu_type'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_cpu_type_check
      CHECK (cpu_type IN ('basic', 'general_purpose', 'storage_optimized', 'shared', 'dedicated', 'gpu'));
  ELSE
    RAISE NOTICE 'Skipping products_cpu_type_check creation: public.products.cpu_type does not exist.';
  END IF;

  -- 3. Add machine_type column (e.g., basic, premium-intel, premium-amd, general-purpose)
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS machine_type TEXT;
END $$;
