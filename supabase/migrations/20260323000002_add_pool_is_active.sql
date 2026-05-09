-- Add is_active flag to public_ip_pools for provider-based filtering
-- IPXO pools (BGP pending) must be set inactive until routing is confirmed
ALTER TABLE public_ip_pools ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Mark all IPXO pools as inactive (subnets 14.137.226.x)
-- These IPs are not externally routable until BGP peering is established
UPDATE public_ip_pools
SET is_active = FALSE
WHERE id IN (
  SELECT DISTINCT p.id
  FROM public_ip_pools p
  JOIN public_ip_pool_ips i ON i.pool_id = p.id
  WHERE i.ip LIKE '14.137.%'
);
