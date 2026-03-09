import { z } from '@/lib/openapi/init';

import { PaginationMetaSchema } from '@/lib/openapi/schemas/common';

export const DatabaseConnectionSchema = z.object({
  host: z.string().openapi({ example: '10.10.10.10' }),
  port: z.number().openapi({ example: 25060 }),
  user: z.string().openapi({ example: 'doadmin' }),
  database: z.string().optional().openapi({ example: 'defaultdb' }),
  password: z.string().nullable().optional().openapi({ example: 'secret-password' }),
  uri: z.string().optional().openapi({ example: 'postgres://doadmin:password@10.10.10.10:25060/defaultdb' }),
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
  data: DatabaseClusterSchema.extend({
    connection: DatabaseConnectionSchema.nullable().optional(),
  }).passthrough(),
}).openapi('CreateDatabaseClusterResponse');

export const CreateClusterDatabaseRequestSchema = z.object({
  name: z.string().min(1).max(63).openapi({ example: 'appdb' }),
}).openapi('CreateClusterDatabaseRequest');

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
