import type { Database_Connection, DatabaseInstance, DatabaseUser, Rule } from "@/lib/supabase/types";

export interface CreateDatabaseClusterRequest {
  // Provider cluster name (forwarded to DigitalOcean API).
  name: string;
  engine: string;
  version: string;
  region: string;
  size: string;
  plan_id: string;
  num_nodes?: number;
  storage_size_mib?: number;
  owner_id: string;
  project_id: string;
  user_email?: string;
}

export interface CreateDatabaseClusterResult {
  success: boolean;
  clusterId?: string;
  data?: unknown;
  connection?: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    uri: string;
  };
  error?: string;
  errorCode?: string;
  balance?: number;
  required?: number;
}

export interface GetDatabaseClusterRequest {
  clusterId: string;
  userId: string;
  checkStatus?: boolean;
}

export interface GetDatabaseClusterResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
}

export interface UpdateDatabaseClusterProjectRequest {
  clusterId: string;
  projectId: string;
  userId: string;
}

export interface DeleteDatabaseClusterRequest {
  clusterId: string;
  userId: string;
  force?: boolean;
}

export interface DeleteDatabaseClusterResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  linkedAppsCount?: number;
  linkedAppNames?: string[];
}

export interface CreateDatabaseRequest {
  clusterId: string;
  name: string;
  userId: string;
}

export interface DeleteDatabaseRequest {
  clusterId: string;
  dbName: string;
  userId: string;
}

export interface DeleteDatabaseUserRequest {
  clusterId: string;
  username: string;
  userId?: string;
  userEmail?: string;
}

export interface CreateDatabaseUserRequest {
  clusterId: string;
  name: string;
  userId: string;
}

export interface ResetDatabaseUserPasswordRequest {
  clusterId: string;
  username: string;
  userId: string;
}

export interface ListDatabasesRequest {
  clusterId: string;
  userId: string;
}

export interface ListDatabasesResult {
  success: boolean;
  data?: DatabaseInstance[];
  error?: string;
  warning?: string;
}

export interface ListDatabaseUsersRequest {
  clusterId: string;
  userId: string;
}

export interface ListDatabaseUsersResult {
  success: boolean;
  data?: DatabaseUser[];
  error?: string;
  warning?: string;
}

export interface UpdateDatabaseStatusRequest {
  clusterId: string;
  publicConnection: Database_Connection;
  privateConnection: Database_Connection;
}

export interface DeleteFirewallRuleRequest {
  clusterId: string;
  ruleUuid: string;
}

export interface AddFirewallRuleResult {
  success: boolean;
  rules?: Rule[];
  error?: string;
  statusCode?: number;
}

export interface DeleteFirewallRuleResult {
  success: boolean;
  error?: string;
  warning?: string;
  statusCode?: number;
}

export interface RetrieveDatabaseRequest {
  clusterId: string;
  name: string;
}

export interface InternalListDatabasesRequest {
  clusterId: string;
}

export interface InternalRetrieveDatabaseRequest {
  clusterId: string;
  name: string;
}

export interface InternalCreateDatabaseRequest {
  clusterId: string;
  name: string;
  userId: string;
}

export interface InternalDeleteDatabaseRequest {
  clusterId: string;
  dbName: string;
}

export interface ReadMigrationStatusRequest {
  clusterId: string;
  targetRegion: string;
}

export interface ReadMigrationStatusResult {
  success: boolean;
  data?: {
    migration_complete: boolean;
    current_region: string;
    current_status: string;
    target_region: string;
  };
  error?: string;
}

export interface UpsizeStorageRequest {
  clusterId: string;
  storageSizeMib: number;
}
