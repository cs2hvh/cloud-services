export type ServerRow = {
  id: number;
  name: string;
  ip: string | null;
  provider: "linode" | "proxmox";
  linode_id: number | null;
  vmid: number | null;
  node: string | null;
  location: string | null;
  plan_slug: string | null;
  os: string | null;
  cpu_cores: number | null;
  memory_mb: number | null;
  disk_gb: number | null;
  status: string;
  region_label?: string | null;
  owner_id: string | null;
  owner_email: string | null;
  hourly_cost: number | null;
  monthly_cost: number | null;
  created_at: string;
};

export type FleetOverview = {
  totals: {
    servers: number;
    running: number;
    stopped: number;
    provisioning: number;
    suspended: number;
    issues: number;
    mrr: number;
    linode: number;
    proxmox: number;
  };
  margin: {
    customerHourly: number;
    listHourly: number;
    marginPct: number | null;
  };
  byStatus: { status: string; count: number }[];
  byRegion: { region: string; count: number }[];
  createdSeries: { week: string; count: number }[];
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
