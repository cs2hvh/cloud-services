-- Create promocodes table in billing schema
CREATE TABLE IF NOT EXISTS billing.promocodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    redeem_by JSONB DEFAULT '[]'::jsonb,
    valid_till TIMESTAMP WITH TIME ZONE NOT NULL,
    coupon_type TEXT NOT NULL,
    max_redemptions INTEGER,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_promocodes_code ON billing.promocodes(code);
CREATE INDEX IF NOT EXISTS idx_promocodes_is_active ON billing.promocodes(is_active);
CREATE INDEX IF NOT EXISTS idx_promocodes_valid_till ON billing.promocodes(valid_till);

-- Add comment to table
COMMENT ON TABLE billing.promocodes IS 'Stores promotional coupon codes for user credits';

-- Add comments to columns
COMMENT ON COLUMN billing.promocodes.code IS 'Unique coupon code (uppercase)';
COMMENT ON COLUMN billing.promocodes.amount IS 'Credit amount to be added when redeemed';
COMMENT ON COLUMN billing.promocodes.redeem_by IS 'Array of users who have redeemed this coupon: [{email, userId, redeemedAt}]';
COMMENT ON COLUMN billing.promocodes.valid_till IS 'Expiration date of the coupon';
COMMENT ON COLUMN billing.promocodes.coupon_type IS 'Type of coupon: one-time, multi-use, or limited';
COMMENT ON COLUMN billing.promocodes.max_redemptions IS 'Maximum number of times this coupon can be redeemed (null for unlimited)';
COMMENT ON COLUMN billing.promocodes.created_by IS 'User ID of the admin who created the coupon';
COMMENT ON COLUMN billing.promocodes.is_active IS 'Whether the coupon is active or has been deleted';

-- Enable Row Level Security
ALTER TABLE billing.promocodes ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
DO $$ BEGIN
    CREATE POLICY "Admins have full access to promocodes"
    ON billing.promocodes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND 'admin' = ANY(user_profiles.roles)
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Policy: Users can read active, non-expired coupons they haven't redeemed
DO $$ BEGIN
    CREATE POLICY "Users can view available promocodes"
    ON billing.promocodes FOR SELECT
    USING (
        is_active = true 
        AND valid_till > NOW()
        AND auth.uid() IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Grant necessary permissions
GRANT SELECT ON billing.promocodes TO authenticated;
GRANT ALL ON billing.promocodes TO service_role;
