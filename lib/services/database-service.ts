/**
 * Database Service - Centralized Business Logic
 *
 * This module composes database service operations from focused modules.
 */

import { clusterOperations } from "./database/cluster-operations";
import { resourceOperations } from "./database/resource-operations";

export const DatabaseService = {
  ...clusterOperations,
  ...resourceOperations,
};

export type {
  CreateDatabaseClusterRequest,
  CreateDatabaseClusterResult,
  GetDatabaseClusterRequest,
  GetDatabaseClusterResult,
  UpdateDatabaseClusterProjectRequest,
  DeleteDatabaseClusterRequest,
  DeleteDatabaseClusterResult,
  CreateDatabaseRequest,
  DeleteDatabaseRequest,
  DeleteDatabaseUserRequest,
  CreateDatabaseUserRequest,
  ResetDatabaseUserPasswordRequest,
  ListDatabasesRequest,
  ListDatabasesResult,
  ListDatabaseUsersRequest,
  ListDatabaseUsersResult,
  UpdateDatabaseStatusRequest,
  DeleteFirewallRuleRequest,
  DeleteFirewallRuleResult,
  AddFirewallRuleResult,
  RetrieveDatabaseRequest,
  ReadMigrationStatusRequest,
  ReadMigrationStatusResult,
  UpsizeStorageRequest,
} from "./database/types";
