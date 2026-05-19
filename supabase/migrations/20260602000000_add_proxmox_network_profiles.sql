-- Add provider/series-aware network profiles for Proxmox hosts.
-- Existing hosts keep the previous PUBLIC_IP/32 + gateway_ip behavior.

ALTER TABLE proxmox_hosts
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'ovh',
  ADD COLUMN IF NOT EXISTS server_series TEXT NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS network_mode TEXT NOT NULL DEFAULT 'legacy_public_gateway',
  ADD COLUMN IF NOT EXISTS vm_private_cidr CIDR,
  ADD COLUMN IF NOT EXISTS vm_private_gateway INET,
  ADD COLUMN IF NOT EXISTS vm_private_ip_start INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS public_prefix_length INTEGER NOT NULL DEFAULT 32,
  ADD COLUMN IF NOT EXISTS snippet_storage TEXT NOT NULL DEFAULT 'local';

ALTER TABLE proxmox_hosts
  ADD CONSTRAINT proxmox_hosts_network_mode_check
  CHECK (network_mode IN (
    'legacy_public_gateway',
    'ovh_failover_vmac',
    'ovh_hg_scale_routed',
    'ovh_advance_gen3_routed',
    'ovh_vrack_block'
  )) NOT VALID;

ALTER TABLE proxmox_hosts
  ADD CONSTRAINT proxmox_hosts_public_prefix_length_check
  CHECK (public_prefix_length BETWEEN 1 AND 32) NOT VALID;

ALTER TABLE proxmox_hosts
  ADD CONSTRAINT proxmox_hosts_vm_private_ip_start_check
  CHECK (vm_private_ip_start BETWEEN 2 AND 254) NOT VALID;

COMMENT ON COLUMN proxmox_hosts.server_series IS 'Dedicated server family/profile, e.g. generic, ovh_rise_game, ovh_high_grade_scale, ovh_advance_gen3.';
COMMENT ON COLUMN proxmox_hosts.network_mode IS 'Provisioning network profile used to generate Proxmox cloud-init network config.';
COMMENT ON COLUMN proxmox_hosts.vm_private_cidr IS 'Private VM subnet used by OVH High Grade/Scale routed BYOIP profiles, e.g. 192.168.0.0/24.';
COMMENT ON COLUMN proxmox_hosts.vm_private_gateway IS 'Private gateway on the Proxmox bridge for routed BYOIP profiles, e.g. 192.168.0.1.';
COMMENT ON COLUMN proxmox_hosts.public_prefix_length IS 'Prefix length for public IP configuration. Use 32 for routed/single IP, block prefix for vRack.';
COMMENT ON COLUMN proxmox_hosts.snippet_storage IS 'Proxmox snippets storage used for cicustom files, usually local.';
