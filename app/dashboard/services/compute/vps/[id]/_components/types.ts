import { type LucideIcon } from 'lucide-react';
import {
  Server,
  BarChart3,
  Terminal,
  Network,
  Settings2,
  DatabaseBackup,
} from 'lucide-react';

/* ─── types ──────────────────────────────────────────────────────── */

export interface ProvisioningInfo {
  stage: string;
  progress: number;
  message: string;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
}

/** Linode-specific metadata stored on details.linode for resold instances. */
export interface LinodeDetails {
  type?: string;
  class?: string;
  image?: string;
  image_label?: string;
  region?: string;
  region_label?: string;
  ipv6?: string | null;
  backups_enabled?: boolean;
  disk_encryption?: boolean;
}

export interface ServerData {
  id: number;
  vmid: number | null;
  node: string | null;
  name: string;
  ip: string;
  os: string;
  cpu_cores: number;
  memory_mb: number;
  disk_gb: number;
  status: string;
  hourly_cost: number;
  monthly_cost?: number | null;
  billing_start: string | null;
  created_at: string;
  location: string | null;
  provider?: 'proxmox' | 'linode' | null;
  linode_id?: number | null;
  details?: { provisioning?: ProvisioningInfo; linode?: LinodeDetails } | null;
  region?: string | null;
  displayRegion?: string | null;
}

export type TabItem = {
  value: string;
  label: string;
  icon: LucideIcon;
  eyebrow: string;
  description: string;
};

/* ─── constants ──────────────────────────────────────────────────── */

export const TABS: TabItem[] = [
  {
    value: 'overview',
    label: 'Overview',
    icon: Server,
    eyebrow: 'Overview',
    description: 'Specs and access.',
  },
  {
    value: 'monitoring',
    label: 'Monitoring',
    icon: BarChart3,
    eyebrow: 'Live',
    description: 'Usage and telemetry.',
  },
  {
    value: 'console',
    label: 'Console',
    icon: Terminal,
    eyebrow: 'Access',
    description: 'Direct console.',
  },
  {
    value: 'networking',
    label: 'Networking',
    icon: Network,
    eyebrow: 'Network',
    description: 'IP and traffic.',
  },
  {
    value: 'backups',
    label: 'Backups',
    icon: DatabaseBackup,
    eyebrow: 'Protection',
    description: 'Automatic + snapshots.',
  },
  {
    value: 'settings',
    label: 'Settings',
    icon: Settings2,
    eyebrow: 'Operations',
    description: 'Lifecycle actions.',
  },
];

/** Tabs applicable to a server row — Backups is Linode-only. */
export function tabsForServer(server: Pick<ServerData, 'provider'>): TabItem[] {
  if (server.provider === 'linode') return TABS;
  return TABS.filter((t) => t.value !== 'backups');
}

/* ─── helpers ────────────────────────────────────────────────────── */

export function statusColor(status: string) {
  switch (status) {
    case 'running':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'stopped':
      return 'bg-white/[0.06] text-white/50 border-white/10';
    case 'provisioning':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
    case 'suspended':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    default:
      return 'bg-red-500/15 text-red-400 border-red-500/20';
  }
}

export function getAccessInfo(os: string) {
  const osL = os.toLowerCase();
  const isRDP = osL.includes('windows') || osL.includes('desktop');
  const user = osL.includes('windows')
    ? 'admin'
    : osL.includes('debian')
      ? 'debian'
      : osL.includes('centos')
        ? 'centos'
        : 'ubuntu';
  return { isRDP, user };
}

export function formatUptime(startDate: string): string {
  const diff = Date.now() - new Date(startDate).getTime();
  if (diff < 0) return '0s';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${(bytes / Math.pow(k, idx)).toFixed(idx > 1 ? 1 : 0)} ${sizes[idx]}`;
}

/** Common action props passed down from the page to tab components */
export interface ServerActions {
  copyToClipboard: (text: string, label: string) => void;
}
