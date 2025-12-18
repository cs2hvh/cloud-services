import { z } from "zod";
import {
  VALID_DATABASE_REGIONS,
  VALID_DATABASE_ENGINES,
  VALID_PG_VERSIONS,
  VALID_MYSQL_VERSIONS,
  VALID_REDIS_VERSIONS,
  VALID_MONGODB_VERSIONS,
  VALID_KAFKA_VERSIONS,
  VALID_DATABASE_SIZES,
  RESOURCE_LIMITS,
  NAMING_RULES,
  VALID_MAINTENANCE_DAYS,
  MAINTENANCE_HOUR_PATTERN,
  IP_PATTERNS,
  SPECIAL_IPS,
} from "./constants";

/**
 * Database Cluster Creation Schema
 * Validates payload before forwarding to DigitalOcean API
 * Prevents: cost overruns, invalid configurations, malicious payloads
 */
export const createDatabaseSchema = z.object({
  name: z
    .string()
    .min(NAMING_RULES.MIN_CLUSTER_NAME_LENGTH, "Cluster name must be at least 3 characters")
    .max(NAMING_RULES.MAX_CLUSTER_NAME_LENGTH, "Cluster name must be at most 63 characters")
    .regex(
      NAMING_RULES.CLUSTER_NAME_PATTERN,
      "Cluster name must start and end with alphanumeric, contain only lowercase letters, numbers, and hyphens"
    ),
  engine: z.enum(VALID_DATABASE_ENGINES, {
    errorMap: () => ({ message: `Engine must be one of: ${VALID_DATABASE_ENGINES.join(", ")}` }),
  }),
  version: z.string().refine(
    (val) => {
      // Version validation depends on engine, will be checked in route
      return /^\d+(\.\d+)?$/.test(val);
    },
    { message: "Version must be a valid number (e.g., '14', '8', '3.8')" }
  ),
  num_nodes: z
    .number()
    .int("Number of nodes must be an integer")
    .min(RESOURCE_LIMITS.MIN_NODES_PER_CLUSTER, "At least 1 node is required")
    .max(
      RESOURCE_LIMITS.MAX_NODES_PER_CLUSTER,
      `Maximum ${RESOURCE_LIMITS.MAX_NODES_PER_CLUSTER} nodes allowed per cluster`
    ),
  size: z.enum(VALID_DATABASE_SIZES, {
    errorMap: () => ({
      message: `Size must be one of the allowed tiers: ${VALID_DATABASE_SIZES.join(", ")}`,
    }),
  }),
  region: z.enum(VALID_DATABASE_REGIONS, {
    errorMap: () => ({
      message: `Region must be one of: ${VALID_DATABASE_REGIONS.join(", ")}`,
    }),
  }),
  project_id: z.string().uuid("project_id must be a valid UUID"),
  owner_id: z.string().uuid("owner_id must be a valid UUID"),
  plan_id: z.string().uuid("plan_id must be a valid UUID"),
});

export type CreateDatabasePayload = z.infer<typeof createDatabaseSchema>;

/**
 * Network/Firewall Update Schema
 * Validates IP addresses and prevents injection
 */
export const updateNetworkSchema = z.object({
  id: z.string().uuid("Database ID must be a valid UUID"),
  ip_address: z
    .string()
    .refine(
      (val) => {
        // Allow special "allow all" values
        if (val === SPECIAL_IPS.ALLOW_ALL_IPV4 || val === SPECIAL_IPS.ALLOW_ALL_IPV6) {
          return true;
        }
        // Validate IPv4, IPv6, or CIDR notation
        return (
          IP_PATTERNS.IPV4.test(val) ||
          IP_PATTERNS.IPV6.test(val) ||
          IP_PATTERNS.CIDR_V4.test(val) ||
          IP_PATTERNS.CIDR_V6.test(val)
        );
      },
      { message: "Must be a valid IPv4, IPv6, or CIDR notation" }
    ),
});

export type UpdateNetworkPayload = z.infer<typeof updateNetworkSchema>;

/**
 * Network/Firewall Delete Schema
 * Validates deletion of specific firewall rule
 */
export const deleteNetworkSchema = z.object({
  id: z.string().uuid("Database ID must be a valid UUID"),
  rule_uuid: z.string().uuid("Rule UUID must be a valid UUID"),
});

export type DeleteNetworkPayload = z.infer<typeof deleteNetworkSchema>;

/**
 * Maintenance Window Update Schema
 */
export const updateMaintenanceSchema = z.object({
  database_id: z.string().uuid("Database ID must be a valid UUID"),
  day: z.enum(VALID_MAINTENANCE_DAYS, {
    errorMap: () => ({
      message: `Day must be one of: ${VALID_MAINTENANCE_DAYS.join(", ")}`,
    }),
  }),
  hour: z
    .string()
    .regex(MAINTENANCE_HOUR_PATTERN, "Hour must be in HH:MM format (24-hour)"),
});

export type UpdateMaintenancePayload = z.infer<typeof updateMaintenanceSchema>;

/**
 * Region Migration Schema
 */
export const migrateRegionSchema = z.object({
  database_id: z.string().uuid("Database ID must be a valid UUID"),
  region: z.enum(VALID_DATABASE_REGIONS, {
    errorMap: () => ({
      message: `Region must be one of: ${VALID_DATABASE_REGIONS.join(", ")}`,
    }),
  }),
});

export type MigrateRegionPayload = z.infer<typeof migrateRegionSchema>;

/**
 * Storage Tier Upgrade Schema
 */
export const updateStorageSchema = z.object({
  database_id: z.string().uuid("Database ID must be a valid UUID"),
  size: z.enum(VALID_DATABASE_SIZES, {
    errorMap: () => ({
      message: `Size must be one of the allowed tiers: ${VALID_DATABASE_SIZES.join(", ")}`,
    }),
  }),
});

export type UpdateStoragePayload = z.infer<typeof updateStorageSchema>;

/**
 * Storage Upsize Schema
 * Validates storage upsize requests (disk only)
 */
export const upsizeStorageSchema = z.object({
  database_id: z.string().uuid("Database ID must be a valid UUID"),
  storage_size_mib: z
    .number()
    .int("Storage size must be an integer")
    .min(10240, "Storage size must be at least 10 GiB (10240 MiB)")
    .max(16384000, "Storage size must not exceed 16000 GiB (16384000 MiB)"),
});

export type UpsizeStoragePayload = z.infer<typeof upsizeStorageSchema>

/**
 * Database User Management Schemas
 */
export const createDatabaseUserSchema = z.object({
  cluster_id: z.string().uuid("Cluster ID must be a valid UUID"),
  name: z
    .string()
    .min(NAMING_RULES.MIN_USER_NAME_LENGTH, "Username must be at least 1 character")
    .max(NAMING_RULES.MAX_USER_NAME_LENGTH, "Username must be at most 63 characters")
    .regex(
      NAMING_RULES.USER_NAME_PATTERN,
      "Username must start with a letter and contain only letters, numbers, and underscores"
    ),
});

export type CreateDatabaseUserPayload = z.infer<typeof createDatabaseUserSchema>;

export const deleteDatabaseUserSchema = z.object({
  cluster_id: z.string().uuid("Cluster ID must be a valid UUID"),
  username: z.string().min(1, "Username is required"),
});

export type DeleteDatabaseUserPayload = z.infer<typeof deleteDatabaseUserSchema>;

export const resetUserPasswordSchema = z.object({
  cluster_id: z.string().uuid("Cluster ID must be a valid UUID"),
  username: z.string().min(1, "Username is required"),
});

export type ResetUserPasswordPayload = z.infer<typeof resetUserPasswordSchema>;

/**
 * Database (within cluster) Management Schemas
 */
export const createDbSchema = z.object({
  cluster_id: z.string().uuid("Cluster ID must be a valid UUID"),
  name: z
    .string()
    .min(NAMING_RULES.MIN_DB_NAME_LENGTH, "Database name must be at least 1 character")
    .max(NAMING_RULES.MAX_DB_NAME_LENGTH, "Database name must be at most 63 characters")
    .regex(
      NAMING_RULES.DB_NAME_PATTERN,
      "Database name must start with a letter and contain only letters, numbers, and underscores"
    ),
});

export type CreateDbPayload = z.infer<typeof createDbSchema>;

export const deleteDbSchema = z.object({
  cluster_id: z.string().uuid("Cluster ID must be a valid UUID"),
  db_name: z.string().min(1, "Database name is required"),
});

export type DeleteDbPayload = z.infer<typeof deleteDbSchema>;

/**
 * Read Operations Schemas
 */
export const readDatabaseSchema = z.object({
  id: z.string().uuid("Database ID must be a valid UUID"),
  checkStatus: z.boolean().optional(),
});

export type ReadDatabasePayload = z.infer<typeof readDatabaseSchema>;

export const readAllOwnerSchema = z.object({
  id: z.string().uuid("Owner ID must be a valid UUID"),
});

export type ReadAllOwnerPayload = z.infer<typeof readAllOwnerSchema>;

export const readNetworkSchema = z.object({
  id: z.string().uuid("Database ID must be a valid UUID"),
});

export type ReadNetworkPayload = z.infer<typeof readNetworkSchema>;

export const listUsersSchema = z.object({
  cluster_id: z.string().uuid("Cluster ID must be a valid UUID"),
});

export type ListUsersPayload = z.infer<typeof listUsersSchema>;

export const listDbsSchema = z.object({
  cluster_id: z.string().uuid("Cluster ID must be a valid UUID"),
});

export type ListDbsPayload = z.infer<typeof listDbsSchema>;

/**
 * Retrieve Database Schema
 * Used for retrieving specific database info from a cluster
 */
export const retrieveDbSchema = z.object({
  cluster_id: z.string().uuid("Cluster ID must be a valid UUID"),
  name: z.string().min(1, "Database name is required"),
});

export type RetrieveDbPayload = z.infer<typeof retrieveDbSchema>;

/**
 * Delete Database Schema
 */
export const deleteDatabaseSchema = z.object({
  id: z.string().uuid("Database ID must be a valid UUID"),
});

export type DeleteDatabasePayload = z.infer<typeof deleteDatabaseSchema>;

/**
 * Update Status Schema (internal use)
 */
export const updateStatusSchema = z.object({
  id: z.string().uuid("Database ID must be a valid UUID"),
  public_connection: z.object({
    host: z.string(),
    password: z.string(),
    port: z.number().optional(),
    ssl: z.boolean().optional(),
    uri: z.string().optional(),
    user: z.string().optional(),
    database: z.string().optional(),
    protocol: z.string().optional(),
  }),
  private_connection: z.object({
    host: z.string(),
    password: z.string(),
    port: z.number().optional(),
    ssl: z.boolean().optional(),
    uri: z.string().optional(),
    user: z.string().optional(),
    database: z.string().optional(),
    protocol: z.string().optional(),
  }),
});

export type UpdateStatusPayload = z.infer<typeof updateStatusSchema>;

/**
 * Helper function to validate version based on engine
 */
export function validateEngineVersion(engine: string, version: string): boolean {
  switch (engine) {
    case "pg":
      return (VALID_PG_VERSIONS as readonly string[]).includes(version);
    case "mysql":
      return (VALID_MYSQL_VERSIONS as readonly string[]).includes(version);
    case "redis":
      return (VALID_REDIS_VERSIONS as readonly string[]).includes(version);
    case "mongodb":
      return (VALID_MONGODB_VERSIONS as readonly string[]).includes(version);
    case "kafka":
      return (VALID_KAFKA_VERSIONS as readonly string[]).includes(version);
    default:
      return false;
  }
}
