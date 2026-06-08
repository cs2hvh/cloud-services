import { z } from '@/lib/openapi/init';

import { PaginationMetaSchema } from '@/lib/openapi/schemas/common';

export const DatabaseConnectionSchema = z.object({
  host: z.string().openapi({ example: '10.10.10.10' }),
  port: z.number().openapi({ example: 25060 }),
  user: z.string().openapi({ example: 'doadmin' }),
  database: z.string().optional().openapi({ example: 'defaultdb' }),
  password: z.string().nullable().optional().openapi({ example: 'secret-password' }),
  uri: z.string().nullable().optional().openapi({ example: 'postgres://doadmin:password@10.10.10.10:25060/defaultdb' }),
  protocol: z.string().optional().openapi({ example: 'postgresql' }),
  ssl: z.boolean().optional().openapi({ example: true }),
}).openapi('DatabaseConnection');

export const DatabaseUserSchema = z.object({
  id: z.string().optional().openapi({ example: 'doadmin' }),
  name: z.string().openapi({ example: 'readonly_user' }),
  role: z.string().openapi({ example: 'normal' }),
  password: z.string().nullable().optional().openapi({ example: 'temp-password' }),
  created_at: z.string().datetime().optional().openapi({ example: '2026-03-07T09:00:00Z' }),
}).openapi('DatabaseUser');

export const DatabaseInstanceSchema = z.object({
  id: z.string().openapi({ example: 'appdb' }),
  name: z.string().openapi({ example: 'appdb' }),
  created_at: z.string().datetime().optional().openapi({ example: '2026-03-07T09:00:00Z' }),
}).openapi('DatabaseInstance');

export const DatabaseClusterSchema = z.object({
  id: z.string().uuid().optional().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
  cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
  name: z.string().openapi({ example: 'prod-db-cluster' }),
  engine: z.string().openapi({ example: 'pg' }),
  version: z.string().nullable().optional().openapi({ example: '16' }),
  region: z.string().nullable().optional().openapi({ example: 'blr1' }),
  size: z.string().nullable().optional().openapi({ example: 'db-s-1vcpu-1gb' }),
  status: z.string().openapi({ example: 'online' }),
  project_id: z.string().uuid().nullable().optional().openapi({ example: '77ef5894-cc88-468d-98f4-6e861c24be86' }),
  owner_id: z.string().uuid().optional().openapi({ example: '2fcb2166-ff41-4a35-ae1b-b2667dc43a8f' }),
  num_nodes: z.number().optional().openapi({ example: 1 }),
  storage_size_mib: z.number().nullable().optional().openapi({ example: 10240 }),
  public_connection: DatabaseConnectionSchema.optional(),
  private_connection: DatabaseConnectionSchema.optional(),
  users: z.array(DatabaseUserSchema).optional(),
  dbs: z.array(DatabaseInstanceSchema).optional(),
  window: z.object({
    day: z.string().openapi({ example: 'monday' }),
    hour: z.string().openapi({ example: '13:00' }),
  }).optional(),
  created_at: z.string().datetime().optional().openapi({ example: '2026-03-07T09:00:00Z' }),
  updated_at: z.string().datetime().optional().openapi({ example: '2026-03-07T09:05:00Z' }),
}).passthrough().openapi('DatabaseCluster');

export const DatabaseClusterListResponseSchema = z.object({
  data: z.array(DatabaseClusterSchema),
  meta: PaginationMetaSchema,
}).openapi('DatabaseClusterListResponse');

export const DatabaseClusterResponseSchema = z.object({
  data: DatabaseClusterSchema,
}).openapi('DatabaseClusterResponse');

export const CreateDatabaseClusterRequestSchema = z.object({
  name: z.string().min(3).max(63).openapi({ example: 'prod-db-cluster' }),
  engine: z.string().openapi({ example: 'pg' }),
  version: z.string().openapi({ example: '16' }),
  region: z.string().openapi({ example: 'blr1' }),
  size: z.string().openapi({ example: 'db-s-1vcpu-1gb' }),
  project_id: z.string().uuid().openapi({ example: '77ef5894-cc88-468d-98f4-6e861c24be86' }),
  plan_id: z.string().uuid().openapi({ example: 'f15eca8f-032e-4c35-99ee-b5a15f1ec18a' }),
  num_nodes: z.number().int().min(1).max(3).optional().openapi({ example: 1 }),
  storage_size_mib: z.number().int().min(10240).optional().openapi({ example: 10240 }),
}).openapi('CreateDatabaseClusterRequest');

export const CreateDatabaseClusterResponseSchema = z.object({
  data: DatabaseClusterSchema.passthrough(),
}).openapi('CreateDatabaseClusterResponse');

export const CreateClusterDatabaseRequestSchema = z.object({
  name: z.string().min(1).max(63).openapi({ example: 'appdb' }),
}).openapi('CreateClusterDatabaseRequest');

export const UpdateDatabaseStorageRequestSchema = z.object({
  size: z.string().openapi({ example: 'db-s-2vcpu-4gb' }),
}).openapi('UpdateDatabaseStorageRequest');

export const UpsizeDatabaseStorageRequestSchema = z.object({
  storage_size_mib: z.number().int().min(10240).openapi({ example: 20480 }),
}).openapi('UpsizeDatabaseStorageRequest');

export const ClusterDatabaseListResponseSchema = z.object({
  data: z.array(DatabaseInstanceSchema),
  meta: z.object({
    total: z.number().openapi({ example: 2 }),
    warning: z.string().optional().openapi({ example: 'Sync failed but provider data returned' }),
  }),
}).openapi('ClusterDatabaseListResponse');

export const ClusterDatabaseResponseSchema = z.object({
  data: DatabaseInstanceSchema,
}).openapi('ClusterDatabaseResponse');

export const CreateDatabaseUserRequestSchema = z.object({
  name: z.string().min(1).max(63).openapi({ example: 'readonly_user' }),
}).openapi('CreateDatabaseUserRequest');

export const DatabaseUserListResponseSchema = z.object({
  data: z.array(DatabaseUserSchema),
  meta: z.object({
    total: z.number().openapi({ example: 2 }),
    warning: z.string().optional().openapi({ example: 'Sync failed but provider data returned' }),
  }),
}).openapi('DatabaseUserListResponse');

export const DatabaseUserResponseSchema = z.object({
  data: DatabaseUserSchema,
}).openapi('DatabaseUserResponse');

export const DatabaseDeleteResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    deleted: z.boolean().openapi({ example: true }),
  }),
}).openapi('DatabaseDeleteResponse');

export const DatabaseSubResourceDeleteResponseSchema = z.object({
  data: z.object({
    cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    name: z.string().optional().openapi({ example: 'appdb' }),
    username: z.string().optional().openapi({ example: 'readonly_user' }),
    deleted: z.boolean().openapi({ example: true }),
  }),
}).openapi('DatabaseSubResourceDeleteResponse');

export const DatabaseStorageUpdateResponseSchema = z.object({
  data: z.object({
    cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    size: z.string().openapi({ example: 'db-s-2vcpu-4gb' }),
    updated: z.boolean().openapi({ example: true }),
  }),
}).openapi('DatabaseStorageUpdateResponse');

export const DatabaseStorageUpsizeResponseSchema = z.object({
  data: z.object({
    cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    storage_size_mib: z.number().int().openapi({ example: 20480 }),
    updated: z.boolean().openapi({ example: true }),
  }),
}).openapi('DatabaseStorageUpsizeResponse');

export const DatabaseFirewallRuleSchema = z.object({
  uuid: z.string().uuid().openapi({ example: '90f543fc-cf87-4f77-ab47-acddf8ebde7f' }),
  cluster_uuid: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
  type: z.string().openapi({ example: 'ip_addr' }),
  value: z.string().openapi({ example: '203.0.113.42' }),
  created_at: z.string().datetime().openapi({ example: '2026-03-20T10:00:00Z' }),
}).openapi('DatabaseFirewallRule');

export const AddDatabaseFirewallRuleRequestSchema = z.object({
  ip_address: z.string().openapi({ example: '203.0.113.42/32' }),
}).openapi('AddDatabaseFirewallRuleRequest');

export const DatabaseFirewallRuleListResponseSchema = z.object({
  data: z.array(DatabaseFirewallRuleSchema),
}).openapi('DatabaseFirewallRuleListResponse');

export const DatabaseFirewallRuleUpdateResponseSchema = z.object({
  data: z.object({
    cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    rules: z.array(DatabaseFirewallRuleSchema),
    updated: z.boolean().openapi({ example: true }),
  }),
}).openapi('DatabaseFirewallRuleUpdateResponse');

export const DatabaseFirewallRuleDeleteResponseSchema = z.object({
  data: z.object({
    cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    rule_uuid: z.string().uuid().openapi({ example: '90f543fc-cf87-4f77-ab47-acddf8ebde7f' }),
    deleted: z.boolean().openapi({ example: true }),
    warning: z.string().optional().openapi({
      example: 'IP address deleted from firewall, but failed to update database',
    }),
  }),
}).openapi('DatabaseFirewallRuleDeleteResponse');

export const DatabaseMaintenanceWindowSchema = z.object({
  day: z.string().openapi({ example: 'monday' }),
  hour: z.string().openapi({ example: '13:00' }),
}).openapi('DatabaseMaintenanceWindow');

export const UpdateDatabaseMaintenanceWindowRequestSchema = z.object({
  day: z.string().openapi({ example: 'monday' }),
  hour: z.string().openapi({ example: '13:00' }),
}).openapi('UpdateDatabaseMaintenanceWindowRequest');

export const DatabaseMaintenanceWindowResponseSchema = z.object({
  data: DatabaseMaintenanceWindowSchema.nullable().openapi({ example: { day: 'monday', hour: '13:00' } }),
}).openapi('DatabaseMaintenanceWindowResponse');

export const DatabaseMaintenanceWindowUpdateResponseSchema = z.object({
  data: z.object({
    cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    window: DatabaseMaintenanceWindowSchema,
    updated: z.boolean().openapi({ example: true }),
  }),
}).openapi('DatabaseMaintenanceWindowUpdateResponse');

export const MigrateDatabaseRegionRequestSchema = z.object({
  region: z.string().openapi({ example: 'nyc1' }),
}).openapi('MigrateDatabaseRegionRequest');

export const DatabaseRegionMigrationResponseSchema = z.object({
  data: z.object({
    cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    region: z.string().openapi({ example: 'nyc1' }),
    status: z.literal('migrating').openapi({ example: 'migrating' }),
    migration_started: z.boolean().openapi({ example: true }),
  }),
}).openapi('DatabaseRegionMigrationResponse');
