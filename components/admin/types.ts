export type IpRow = { ip: string };

export type Pool = {
  mac: string;
  ips: IpRow[];
  label?: string;
};

export type TemplateRow = {
  name: string;
  vmid: string;
  type?: 'qemu' | 'lxc';
};

export type HostRow = {
  id: string;
  name?: string | null;
  host_url?: string | null;
  node?: string | null;
  location?: string | null;
  template_vmid?: number | null;
  allow_insecure_tls?: boolean | null;
  storage?: string | null;
  bridge?: string | null;
  gateway_ip?: string | null;
  dns_primary?: string | null;
  dns_secondary?: string | null;
  provider?: string | null;
  server_series?: string | null;
  network_mode?: string | null;
  vm_private_cidr?: string | null;
  vm_private_gateway?: string | null;
  vm_private_ip_start?: number | null;
  public_prefix_length?: number | null;
  snippet_storage?: string | null;
  is_active?: boolean | null;
  created_by_email?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  public_ip_pools?: Array<{
    id?: string | number | null;
    mac?: string | null;
    label?: string | null;
    public_ip_pool_ips?: Array<{
      id?: string | number | null;
      ip?: string | null;
    }> | null;
  }> | null;
  proxmox_templates?: Array<{
    id?: string | number | null;
    name?: string | null;
    vmid?: number | null;
    type?: string | null;
    is_active?: boolean | null;
  }> | null;
};

export type ServerFormState = {
  id: string | null;
  name: string;
  ip: string;
  ownerId: string;
  ownerEmail: string;
  status: string;
  location: string;
  os: string;
  node: string;
  vmid: string;
  cpuCores: string;
  memoryMb: string;
  diskGb: string;
  details: string;
};

export type ServerRow = {
  id: string;
  name?: string | null;
  ip?: string | null;
  owner_id?: string | null;
  owner_email?: string | null;
  status?: string | null;
  location?: string | null;
  os?: string | null;
  node?: string | null;
  vmid?: number | null;
  cpu_cores?: number | null;
  memory_mb?: number | null;
  disk_gb?: number | null;
  details?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
