/**
 * Validation constants for database API requests
 * These constants define allowed values and limits to prevent:
 * - Excessive resource provisioning
 * - Cost overruns
 * - Invalid configurations
 */

// Valid DigitalOcean regions for database clusters
export const VALID_DATABASE_REGIONS = [
  'nyc1', 'nyc3',
  'sfo1', 'sfo2', 'sfo3',
  'ams2', 'ams3',
  'sgp1',
  'lon1',
  'fra1',
  'tor1',
  'blr1',
  'syd1'
] as const;

// Valid database engines
export const VALID_DATABASE_ENGINES = [
  'pg',        // PostgreSQL
  'mysql',     // MySQL
  'redis',     // Redis
  'mongodb',   // MongoDB
  'kafka'      // Apache Kafka
] as const;

// Engine versions the provider will actually accept on a create.
//
// These mirror DigitalOcean's GET /v2/databases/options. They drifted badly:
// the lists below said MySQL 8, MongoDB 4-8 and Kafka 3.5-3.8, while the
// provider offers MySQL 8.4, MongoDB 7.0/8.0 and Kafka 3.9/4.1. The wizard is
// fed from the database_types table, which had been kept current — so the
// picker offered MySQL 8.4, the customer configured a whole cluster, and the
// create call rejected it with "Version 8.4 isn't available for the selected
// engine". The table was right; this file was three releases stale.
//
// Note the format matters as much as the number: MongoDB is '7.0', not '7'.
//
// When DigitalOcean adds or retires a version, update these AND the
// database_types rows. /api/database-types reconciles the two at read time and
// logs any drift, so a mismatch shows up in the logs instead of at checkout.

// Valid PostgreSQL versions
export const VALID_PG_VERSIONS = ['15', '16', '17', '18'] as const;

// Valid MySQL versions
export const VALID_MYSQL_VERSIONS = ['8.4'] as const;

// Valid Redis versions. DigitalOcean has retired Redis in favour of Valkey and
// no longer lists it under /v2/databases/options; kept for existing rows until
// the catalog moves over.
export const VALID_REDIS_VERSIONS = ['6', '7'] as const;

// Valid MongoDB versions
export const VALID_MONGODB_VERSIONS = ['7.0', '8.0'] as const;

// Valid Kafka versions
export const VALID_KAFKA_VERSIONS = ['3.9', '4.1'] as const;

// Valid database cluster size patterns (regex-based validation)
// - db-s-* : Basic tier (shared CPU)
// - db-intel-*, db-amd-* : Basic tier (dedicated CPU)
// - gd-*   : General Purpose tier  
// - so1_5-* : Storage Optimized 1.5x tier
export const VALID_DATABASE_SIZE_PATTERN = /^(db-s-|db-intel-|db-amd-|gd-|so1_5-)\d+vcpu-\d+gb$/;

// Legacy array for backward compatibility (basic tier only)
// NOTE: Use VALID_DATABASE_SIZE_PATTERN for validation instead
export const VALID_DATABASE_SIZES = [
  // Basic tier
  'db-s-1vcpu-1gb',
  'db-s-1vcpu-2gb',
  'db-s-2vcpu-2gb',
  'db-s-2vcpu-4gb',
  'db-s-4vcpu-8gb',
  'db-s-6vcpu-6gb',
  'db-s-6vcpu-12gb',
  // General Purpose tier
  'gd-2vcpu-8gb',
  'gd-4vcpu-16gb',
  'gd-8vcpu-32gb',
  'gd-16vcpu-64gb',
  'gd-32vcpu-128gb',
  'gd-40vcpu-160gb',
  // Storage Optimized tier
  'so1_5-2vcpu-16gb-100gb',
  'so1_5-4vcpu-32gb-200gb',
  'so1_5-8vcpu-64gb-400gb',
  'so1_5-16vcpu-128gb-800gb',
  'so1_5-24vcpu-192gb-1200gb',
  'so1_5-32vcpu-256gb-1600gb',
] as const;

// Resource limits to prevent cost overruns
export const RESOURCE_LIMITS = {
  MAX_NODES_PER_CLUSTER: 3,        // Maximum nodes in a cluster
  MIN_NODES_PER_CLUSTER: 1,        // Minimum nodes (required)
  MAX_CLUSTERS_PER_USER: 10,       // Maximum clusters per user
  MAX_USERS_PER_CLUSTER: 50,       // Maximum database users per cluster
  MAX_DBS_PER_CLUSTER: 25,         // Maximum databases per cluster
  MAX_FIREWALL_RULES: 100,         // Maximum firewall rules
} as const;

// Database naming constraints
export const NAMING_RULES = {
  MIN_CLUSTER_NAME_LENGTH: 3,
  MAX_CLUSTER_NAME_LENGTH: 63,
  MIN_USER_NAME_LENGTH: 1,
  MAX_USER_NAME_LENGTH: 63,
  MIN_DB_NAME_LENGTH: 1,
  MAX_DB_NAME_LENGTH: 63,
  
  // Regex patterns
  CLUSTER_NAME_PATTERN: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
  USER_NAME_PATTERN: /^[a-zA-Z][a-zA-Z0-9_]*$/,
  DB_NAME_PATTERN: /^[a-zA-Z][a-zA-Z0-9_]*$/,
} as const;

// Maintenance window constraints
export const VALID_MAINTENANCE_DAYS = [
  'monday',
  'tuesday', 
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const;

// Time format: HH:MM (24-hour)
export const MAINTENANCE_HOUR_PATTERN = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

// IP address validation helpers
export const IP_PATTERNS = {
  // Validates each octet is 0-255
  IPV4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  IPV6: /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/,
  // CIDR notation with valid octets
  CIDR_V4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[12][0-9]|3[0-2])$/,
  CIDR_V6: /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}\/\d{1,3}$/,
} as const;

// Special IP values
export const SPECIAL_IPS = {
  ALLOW_ALL_IPV4: '0.0.0.0/0',
  ALLOW_ALL_IPV6: '::/0',
} as const;

// Cost tier mapping (for future cost calculation)
export const SIZE_COST_TIERS = {
  'db-s-1vcpu-1gb': 1,
  'db-s-1vcpu-2gb': 2,
  'db-s-2vcpu-4gb': 3,
  'db-s-4vcpu-8gb': 4,
} as const;
