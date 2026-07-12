import { z } from '@/lib/openapi/init';

import { PaginationMetaSchema } from '@/lib/openapi/schemas/common';

// ─── Instance ────────────────────────────────────────────────────────────────

const ComputeSpecsSchema = z.object({
  vcpus: z.number().openapi({ example: 2, description: 'Virtual CPU cores' }),
  memory_mb: z.number().openapi({ example: 4096, description: 'Memory in MB' }),
  disk_gb: z.number().openapi({ example: 80, description: 'Disk size in GB' }),
}).openapi('ComputeSpecs');

const ComputePricingSchema = z.object({
  hourly: z.number().nullable().openapi({ example: 0.036, description: 'Hourly price in USD (frozen at create/last re-rate)' }),
  monthly: z.number().nullable().openapi({ example: 25.92, description: 'Monthly price in USD (hourly × 720)' }),
}).openapi('ComputePricing');

export const ComputeInstanceSchema = z.object({
  id: z.number().openapi({ example: 1042, description: 'Instance ID (use this for /compute/instances/{instanceId} routes)' }),
  label: z.string().nullable().openapi({ example: 'web-01-k3f9a', description: 'Instance display label' }),
  status: z.string().nullable().openapi({ example: 'running', description: 'Instance status (provisioning, running, stopped, failed, ...)' }),
  provider: z.string().openapi({ example: 'linode', description: 'Backing provider for this instance' }),
  region: z.string().nullable().openapi({ example: 'us-east', description: 'Region ID the instance is deployed in' }),
  type: z.string().nullable().openapi({ example: 'g6-standard-2', description: 'Instance type/plan ID' }),
  image: z.string().nullable().openapi({ example: 'Ubuntu 24.04 LTS', description: 'Operating system image label' }),
  ipv4: z.string().nullable().openapi({ example: '203.0.113.10', description: 'Primary IPv4 address (null while provisioning)' }),
  specs: ComputeSpecsSchema,
  pricing: ComputePricingSchema,
  backups_enabled: z.boolean().openapi({ example: false, description: 'Whether the backups add-on is enabled' }),
  created_at: z.string().nullable().openapi({ example: '2026-02-27T10:00:00Z' }),
}).openapi('ComputeInstance');

export const ComputeInstanceListResponseSchema = z.object({
  data: z.array(ComputeInstanceSchema),
  meta: PaginationMetaSchema,
}).openapi('ComputeInstanceListResponse');

export const ComputeInstanceResponseSchema = z.object({
  data: ComputeInstanceSchema,
}).openapi('ComputeInstanceResponse');

export const ComputeInstanceDeleteResponseSchema = z.object({
  data: z.object({
    id: z.number().openapi({ example: 1042 }),
    deleted: z.boolean().openapi({ example: true }),
  }),
}).openapi('ComputeInstanceDeleteResponse');

// ─── Create ──────────────────────────────────────────────────────────────────

export const CreateComputeInstanceRequestSchema = z.object({
  label: z.string().min(3).max(64).openapi({
    example: 'web-01',
    description: 'Instance label: 3-64 characters of letters, numbers, dots, dashes or underscores, starting and ending with a letter or number. A short random suffix is appended on creation.',
  }),
  region: z.string().openapi({ example: 'us-east', description: 'Region ID (see GET /api/v1/compute/regions)' }),
  type: z.string().openapi({ example: 'g6-standard-2', description: 'Instance type ID (see GET /api/v1/compute/types)' }),
  image: z.string().openapi({ example: 'linode/ubuntu24.04', description: 'Image ID (see GET /api/v1/compute/images)' }),
  root_pass: z.string().min(11).max(128).openapi({
    description: 'Root password (11-128 characters, at least two of: uppercase, lowercase, numbers, punctuation)',
  }),
  ssh_key_ids: z.array(z.string().uuid()).max(25).optional().openapi({
    description: 'IDs of SSH keys from your account to authorize for root (max 25)',
  }),
  backups_enabled: z.boolean().optional().openapi({ example: false, description: 'Enable the backups add-on (billed additionally)' }),
  disk_encryption: z.boolean().optional().openapi({ example: true, description: 'Enable disk encryption where the region supports it (default true)' }),
}).openapi('CreateComputeInstanceRequest');

export const CreateComputeInstanceResponseSchema = z.object({
  ok: z.boolean().openapi({ example: true }),
  serverId: z.number().nullable().openapi({ example: 1042, description: 'Instance ID — poll GET /api/v1/compute/instances/{instanceId} to track provisioning' }),
  name: z.string().openapi({ example: 'web-01-k3f9a', description: 'Final label (requested label + random suffix)' }),
  ip: z.string().nullable().openapi({ example: '203.0.113.10' }),
  os: z.string().openapi({ example: 'Ubuntu 24.04 LTS' }),
  region: z.string().openapi({ example: 'us-east' }),
  specs: z.object({
    cpuCores: z.number().openapi({ example: 2 }),
    memoryMB: z.number().openapi({ example: 4096 }),
    diskGB: z.number().openapi({ example: 80 }),
  }),
  status: z.string().openapi({ example: 'provisioning' }),
  pricing: z.object({
    hourlyCost: z.number().openapi({ example: 0.036 }),
    monthlyCost: z.number().openapi({ example: 25.92 }),
    initialCharge: z.number().openapi({ example: 0.036 }),
    backupsHourly: z.number().openapi({ example: 0 }),
  }),
  ssh: z.object({
    username: z.string().openapi({ example: 'root' }),
    port: z.number().openapi({ example: 22 }),
  }),
}).openapi('CreateComputeInstanceResponse');

// ─── Update ──────────────────────────────────────────────────────────────────

export const UpdateComputeInstanceRequestSchema = z.object({
  label: z.string().min(3).max(64).openapi({
    example: 'web-02',
    description: 'New instance label (3-64 characters of letters, numbers, dots, dashes or underscores)',
  }),
}).openapi('UpdateComputeInstanceRequest');

// ─── Power actions ───────────────────────────────────────────────────────────

export const ComputeActionRequestSchema = z.object({
  action: z.enum(['boot', 'reboot', 'shutdown']).openapi({
    example: 'reboot',
    description: 'Power action to perform',
  }),
}).openapi('ComputeActionRequest');

export const ComputeActionResponseSchema = z.object({
  data: z.object({
    id: z.number().openapi({ example: 1042 }),
    action: z.enum(['boot', 'reboot', 'shutdown']).openapi({ example: 'reboot' }),
    status: z.string().openapi({ example: 'running', description: 'Expected status after the action completes' }),
  }),
}).openapi('ComputeActionResponse');

// ─── Resize ──────────────────────────────────────────────────────────────────

export const ResizeComputeInstanceRequestSchema = z.object({
  type: z.string().openapi({
    example: 'g6-standard-4',
    description: 'Target instance type ID (see GET .../resize for valid targets)',
  }),
}).openapi('ResizeComputeInstanceRequest');

const ComputeResizePlanSchema = z.object({
  slug: z.string().openapi({ example: 'linode:g6-standard-4', description: 'Plan slug — pass the type ID (with or without the linode: prefix) to POST .../resize' }),
  name: z.string().openapi({ example: 'Linode 8GB' }),
  tier: z.enum(['shared', 'dedicated']).openapi({ example: 'shared' }),
  vcpu: z.number().openapi({ example: 4 }),
  memoryMB: z.number().openapi({ example: 8192 }),
  diskGB: z.number().openapi({ example: 160 }),
  hourlyUSD: z.number().openapi({ example: 0.072 }),
  monthlyUSD: z.number().openapi({ example: 51.84 }),
  isCurrent: z.boolean().openapi({ example: false }),
  fits: z.boolean().openapi({ example: true, description: 'Whether the instance can be resized to this plan' }),
  reason: z.string().optional().openapi({ example: 'Smaller disk than current plan', description: 'Why the plan does not fit (when fits is false)' }),
}).openapi('ComputeResizePlan');

export const ComputeResizeOptionsResponseSchema = z.object({
  data: z.object({
    current: z.object({
      planSlug: z.string().nullable().openapi({ example: 'linode:g6-standard-2' }),
      vcpu: z.number().openapi({ example: 2 }),
      memoryMB: z.number().openapi({ example: 4096 }),
      diskGB: z.number().openapi({ example: 80 }),
      tier: z.string().openapi({ example: 'shared' }),
    }),
    plans: z.array(ComputeResizePlanSchema),
  }),
}).openapi('ComputeResizeOptionsResponse');

export const ComputeResizeAcceptedResponseSchema = z.object({
  data: z.object({
    id: z.number().openapi({ example: 1042 }),
    status: z.string().openapi({ example: 'resizing' }),
  }),
}).openapi('ComputeResizeAcceptedResponse');

// ─── Rebuild ─────────────────────────────────────────────────────────────────

export const RebuildComputeInstanceRequestSchema = z.object({
  image: z.string().openapi({ example: 'linode/debian12', description: 'Image ID to redeploy (see GET /api/v1/compute/images)' }),
  root_pass: z.string().min(11).max(128).openapi({
    description: 'New root password (11-128 characters, at least two of: uppercase, lowercase, numbers, punctuation)',
  }),
  ssh_key_ids: z.array(z.string().uuid()).max(25).optional().openapi({
    description: 'IDs of SSH keys from your account to authorize for root (max 25)',
  }),
}).openapi('RebuildComputeInstanceRequest');

export const ComputeRebuildAcceptedResponseSchema = z.object({
  data: z.object({
    id: z.number().openapi({ example: 1042 }),
    status: z.string().openapi({ example: 'rebuilding' }),
  }),
}).openapi('ComputeRebuildAcceptedResponse');

// ─── Backups ─────────────────────────────────────────────────────────────────

const ComputeBackupSchema = z.object({
  id: z.number().openapi({ example: 123456 }),
  label: z.string().nullable().openapi({ example: 'manual-2026-07-11' }),
  status: z.string().openapi({ example: 'successful' }),
  type: z.enum(['auto', 'snapshot']).openapi({ example: 'snapshot' }),
  created: z.string().openapi({ example: '2026-07-10T02:00:00' }),
  finished: z.string().nullable().openapi({ example: '2026-07-10T02:04:30' }),
  disks: z.array(z.object({
    label: z.string().openapi({ example: 'Ubuntu 24.04 Disk' }),
    size: z.number().openapi({ example: 81408 }),
    filesystem: z.string().openapi({ example: 'ext4' }),
  })).optional(),
}).openapi('ComputeBackup');

export const ComputeBackupsResponseSchema = z.object({
  data: z.object({
    enabled: z.boolean().openapi({ example: true, description: 'Whether the backups add-on is enabled' }),
    backups: z.object({
      automatic: z.array(ComputeBackupSchema).openapi({ description: 'Automatic daily/weekly backups' }),
      snapshot: z.object({
        current: ComputeBackupSchema.nullable(),
        in_progress: ComputeBackupSchema.nullable(),
      }).openapi({ description: 'Manual snapshot slot' }),
    }),
    pricing: z.object({
      hourly: z.number().nullable().openapi({ example: 0.003, description: 'Backups add-on hourly price in USD' }),
      monthly: z.number().nullable().openapi({ example: 2.16, description: 'Backups add-on monthly price in USD' }),
    }),
  }),
}).openapi('ComputeBackupsResponse');

export const ComputeBackupsActionRequestSchema = z.object({
  action: z.enum(['enable', 'cancel', 'snapshot', 'restore']).openapi({
    example: 'snapshot',
    description: 'Backup action. enable/cancel re-rate the instance billing meter (plan rate ± backups add-on). snapshot takes a manual snapshot. restore restores a backup in place.',
  }),
  label: z.string().max(64).optional().openapi({
    example: 'pre-upgrade',
    description: 'Snapshot label (snapshot action only; defaults to manual-<date>)',
  }),
  backup_id: z.number().int().optional().openapi({
    example: 123456,
    description: 'Backup ID to restore (restore action only)',
  }),
}).openapi('ComputeBackupsActionRequest');

export const ComputeBackupsActionResponseSchema = z.object({
  data: z.object({
    id: z.number().openapi({ example: 1042 }),
    action: z.enum(['enable', 'cancel', 'snapshot', 'restore']).openapi({ example: 'enable' }),
    enabled: z.boolean().optional().openapi({ example: true, description: 'New backups state (enable/cancel actions)' }),
    hourlyUSD: z.number().nullable().optional().openapi({ example: 0.039, description: 'New total hourly rate after re-rate (enable/cancel actions)' }),
    snapshot: z.string().optional().openapi({ example: 'pre-upgrade', description: 'Snapshot label (snapshot action)' }),
    restoring: z.boolean().optional().openapi({ example: true, description: 'Restore started (restore action)' }),
  }),
}).openapi('ComputeBackupsActionResponse');

// ─── Catalog: regions / types / images ──────────────────────────────────────

export const ComputeRegionSchema = z.object({
  id: z.string().openapi({ example: 'us-east', description: 'Region ID (use as `region` when creating instances)' }),
  label: z.string().openapi({ example: 'Newark, NJ' }),
  country: z.string().openapi({ example: 'us' }),
  status: z.string().openapi({ example: 'ok' }),
}).openapi('ComputeRegion');

export const ComputeRegionListResponseSchema = z.object({
  data: z.array(ComputeRegionSchema),
  meta: PaginationMetaSchema,
}).openapi('ComputeRegionListResponse');

export const ComputeTypeSchema = z.object({
  id: z.string().openapi({ example: 'g6-standard-2', description: 'Type ID (use as `type` when creating instances)' }),
  label: z.string().openapi({ example: 'Linode 4GB' }),
  class: z.string().openapi({ example: 'standard', description: 'Plan class (nanode, standard, dedicated, highmem, premium)' }),
  vcpus: z.number().openapi({ example: 2 }),
  memory_mb: z.number().openapi({ example: 4096 }),
  disk_gb: z.number().openapi({ example: 80 }),
  transfer_gb: z.number().openapi({ example: 4000, description: 'Monthly network transfer allowance in GB' }),
  network_out_mbps: z.number().openapi({ example: 4000, description: 'Outbound network speed in Mbps' }),
  pricing: z.object({
    hourly: z.number().openapi({ example: 0.036, description: 'Base hourly price in USD' }),
    monthly: z.number().openapi({ example: 25.92, description: 'Base monthly price in USD' }),
    backups_hourly: z.number().nullable().openapi({ example: 0.003, description: 'Backups add-on hourly price (null when unavailable)' }),
    backups_monthly: z.number().nullable().openapi({ example: 2.16 }),
  }),
  region_prices: z.array(z.object({
    region: z.string().openapi({ example: 'br-gru' }),
    hourly: z.number().openapi({ example: 0.043 }),
    monthly: z.number().openapi({ example: 30.96 }),
  })).openapi({ description: 'Regions where the price differs from the base price' }),
}).openapi('ComputeType');

export const ComputeTypeListResponseSchema = z.object({
  data: z.array(ComputeTypeSchema),
  meta: PaginationMetaSchema,
}).openapi('ComputeTypeListResponse');

export const ComputeImageSchema = z.object({
  id: z.string().openapi({ example: 'linode/ubuntu24.04', description: 'Image ID (use as `image` when creating or rebuilding instances)' }),
  label: z.string().openapi({ example: 'Ubuntu 24.04 LTS' }),
  vendor: z.string().nullable().openapi({ example: 'Ubuntu' }),
  size_mb: z.number().openapi({ example: 3500, description: 'Minimum disk size required in MB' }),
  deprecated: z.boolean().openapi({ example: false }),
}).openapi('ComputeImage');

export const ComputeImageListResponseSchema = z.object({
  data: z.array(ComputeImageSchema),
  meta: PaginationMetaSchema,
}).openapi('ComputeImageListResponse');
