-- Add receipt_url column to transactions for invoice/receipt downloads
-- Run after 20260309_transactions_balance_after_coupon.sql

-- 1. Add receipt_url column (stores Stripe receipt or invoice URL)
ALTER TABLE billing.transactions
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;
COMMENT ON COLUMN billing.transactions.receipt_url IS 'Stripe receipt/invoice URL for completed payment transactions';
