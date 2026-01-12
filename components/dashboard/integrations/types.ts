/**
 * Integration Types
 * 
 * Shared type definitions for integration components
 */

export type IntegrationStatus = 'pending' | 'linked' | 'failed' | 'unlinked';

// Supported database types (limited to 3)
export type DatabaseEngineType = 'pg' | 'mysql' | 'mongodb';

export const DATABASE_ENGINES: Record<DatabaseEngineType, {
  label: string;
  icon: string;
  color: string;
  defaultPort: number;
}> = {
  pg: { label: 'PostgreSQL', icon: '🐘', color: 'text-blue-400', defaultPort: 5432 },
  mysql: { label: 'MySQL', icon: '🐬', color: 'text-orange-400', defaultPort: 3306 },
  mongodb: { label: 'MongoDB', icon: '🍃', color: 'text-green-400', defaultPort: 27017 },
};

export interface LinkedDatabase {
  integration_id: string;
  database_cluster_id: string;
  database_name?: string;
  engine?: string;
  status: IntegrationStatus;
  injected_env_keys: string[];
  linked_at: string;
}

export interface AvailableDatabase {
  id: string;
  cluster_id: string;
  name: string;
  engine: string;
  version?: string;
  region?: string;
  status: string;
  created_at?: string;
}

export interface LinkDatabaseRequest {
  app_id: string;
  database_id: string;
  force?: boolean;
  env_prefix?: string;
}

export interface LinkDatabaseResponse {
  success: boolean;
  integration_id?: string;
  injected_vars?: string[];
  redeploy_triggered?: boolean;
  conflicts?: string[];
  error?: string;
  code?: string;
}

export interface UnlinkDatabaseRequest {
  app_id: string;
  database_id: string;
}

export interface UnlinkDatabaseResponse {
  success: boolean;
  removed_vars?: string[];
  redeploy_triggered?: boolean;
  error?: string;
  code?: string;
}

// ============================================
// DATABASE CREATION FLOW TYPES
// ============================================

export type WizardStep = 
  | 'choose-source'     // Step 1: Create new or use existing
  | 'select-existing'   // Step 2a: Select from existing databases
  | 'create-database'   // Step 2b: Create new database form
  | 'configure-env'     // Step 3: Configure environment variable keys
  | 'confirm-inject';   // Step 4: Review and inject

export interface DatabasePlan {
  id: string;
  name: string;
  description?: string;
  price: number | null;
  discount?: string | null;
  sub?: string;  // Database type: mysql, pg, mongodb
  resources?: {
    cpu?: number;
    ram?: number;
    storage?: number;
  };
}

export interface CreateDatabaseData {
  name: string;
  engine: DatabaseEngineType;
  version: string;
  plan_id: string;
  region: string;
  project_id: string;
}

// Environment variable configuration - user can customize key names
export interface EnvVarConfig {
  originalKey: string;   // The default key name (e.g., DATABASE_URL)
  customKey: string;     // User's custom key name (e.g., MY_APP_DB_URL)
  value: string;         // The actual value (connection string, etc.)
  description: string;   // Description of what this var is for
}

// Database connection info after creation
export interface DatabaseConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  uri: string;
  ssl?: boolean;
}

// Available database versions per engine
export const DATABASE_VERSIONS: Record<DatabaseEngineType, string[]> = {
  pg: ['16', '15', '14', '13'],
  mysql: ['8'],
  mongodb: ['7', '6'],
};

// ============================================
// OBJECT STORAGE INTEGRATION TYPES
// ============================================

export interface LinkedBucket {
  integration_id: string;
  bucket_id: string;
  bucket_name: string;
  region: string;
  status: IntegrationStatus;
  env_prefix: string;
  injected_vars: string[];
  linked_at: string;
}

export interface AvailableBucket {
  id: string;
  name: string;
  region: string;
  status: string;
  created_at?: string;
  object_count?: number;
  size?: number;
}

export interface LinkStorageRequest {
  app_id: string;
  bucket_id: string;
  force?: boolean;
  env_configs?: EnvVarConfig[];  // Updated to support custom env configs
  env_prefix?: string;
}

export interface LinkStorageResponse {
  success: boolean;
  integration_id?: string;
  injected_vars?: string[];
  redeploy_triggered?: boolean;
  conflicts?: string[];
  error?: string;
  code?: string;
}

export interface UnlinkStorageRequest {
  app_id: string;
  bucket_id: string;
}

export interface UnlinkStorageResponse {
  success: boolean;
  removed_vars?: string[];
  redeploy_triggered?: boolean;
  error?: string;
  code?: string;
}
