/**
 * Service Registry — single source of truth for every supported engine.
 *
 * Adding a new engine (e.g. MySQL, MongoDB) requires only a new entry here.
 * All UI components, provisioners, and API routes read from this registry.
 */

export type ServiceCategory = 'web' | 'worker' | 'database' | 'cache' | 'queue';

export type ConnectionTemplate = {
  id: string;
  label: string;
  vars: { key: string; template: string }[];
};

export type ConfigField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  options?: string[];
  default?: string | number | boolean;
};

export type ServiceDefinition = {
  engine: string;
  category: ServiceCategory;
  label: string;
  /** lucide-react icon name — resolved to a component via getServiceIcon() */
  icon: string;
  color: { text: string; bg: string; border: string; ring: string };
  defaultImage: string;
  defaultPort: number;
  defaultPublic: boolean;
  /** wire protocol for endpoint URL generation */
  protocol: string;
  /** default volume mount path; null means no persistent volume by default */
  mountPath: string | null;
  defaultVolumeSizeGb: number;
  /** default env vars injected when this service is created via a template */
  defaultEnv: Record<string, { kind: string } & Record<string, unknown>>;
  /** connection templates shown when another service connects to this one */
  connectionTemplates: ConnectionTemplate[];
  /** type-specific config fields shown in the Settings tab */
  configFields: ConfigField[];
};

// ─── Registry ──────────────────────────────────────────────────────────────────

const REGISTRY: Record<string, ServiceDefinition> = {
  // ── Application engines ──────────────────────────────────────────────────────
  generic: {
    engine: 'generic',
    category: 'web',
    label: 'Web Service',
    icon: 'Globe',
    color: { text: 'text-blue-300', bg: 'bg-blue-500/20', border: 'border-blue-500/30', ring: 'ring-blue-500/40' },
    defaultImage: '',
    defaultPort: 3000,
    defaultPublic: true,
    protocol: 'http',
    mountPath: null,
    defaultVolumeSizeGb: 0,
    defaultEnv: {},
    connectionTemplates: [],
    configFields: [],
  },

  // ── Database engines ─────────────────────────────────────────────────────────
  postgres: {
    engine: 'postgres',
    category: 'database',
    label: 'PostgreSQL',
    icon: 'Database',
    color: { text: 'text-indigo-300', bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', ring: 'ring-indigo-500/40' },
    defaultImage: 'postgres:16-alpine',
    defaultPort: 5432,
    defaultPublic: false,
    protocol: 'postgres',
    mountPath: '/var/lib/postgresql/data',
    defaultVolumeSizeGb: 10,
    defaultEnv: {
      POSTGRES_DB:       { kind: 'literal', value: 'app' },
      POSTGRES_USER:     { kind: 'literal', value: 'postgres' },
      POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32 },
    },
    connectionTemplates: [
      {
        id: 'url',
        label: 'DATABASE_URL',
        vars: [{ key: 'DATABASE_URL', template: 'postgresql://{{POSTGRES_USER}}:{{POSTGRES_PASSWORD}}@{{host}}:{{port}}/{{POSTGRES_DB}}' }],
      },
      {
        id: 'split',
        label: 'Split variables (PG_*)',
        vars: [
          { key: 'PG_HOST',     template: '{{host}}'              },
          { key: 'PG_PORT',     template: '{{port}}'              },
          { key: 'PG_USER',     template: '{{POSTGRES_USER}}'     },
          { key: 'PG_PASSWORD', template: '{{POSTGRES_PASSWORD}}' },
          { key: 'PG_DATABASE', template: '{{POSTGRES_DB}}'       },
        ],
      },
    ],
    configFields: [
      { key: 'version', label: 'Version', type: 'select', options: ['16', '15', '14', '13'], default: '16' },
      { key: 'sizeGb',  label: 'Volume (GB)', type: 'number', default: 10 },
    ],
  },

  mysql: {
    engine: 'mysql',
    category: 'database',
    label: 'MySQL',
    icon: 'Database',
    color: { text: 'text-orange-300', bg: 'bg-orange-500/20', border: 'border-orange-500/30', ring: 'ring-orange-500/40' },
    defaultImage: 'mysql:8.0',
    defaultPort: 3306,
    defaultPublic: false,
    protocol: 'mysql',
    mountPath: '/var/lib/mysql',
    defaultVolumeSizeGb: 10,
    defaultEnv: {
      MYSQL_DATABASE:      { kind: 'literal',          value: 'app'    },
      MYSQL_USER:          { kind: 'literal',          value: 'mysql'  },
      MYSQL_PASSWORD:      { kind: 'generatedSecret', length: 32       },
      MYSQL_ROOT_PASSWORD: { kind: 'generatedSecret', length: 32       },
    },
    connectionTemplates: [
      {
        id: 'url',
        label: 'DATABASE_URL',
        vars: [{ key: 'DATABASE_URL', template: 'mysql://{{MYSQL_USER}}:{{MYSQL_PASSWORD}}@{{host}}:{{port}}/{{MYSQL_DATABASE}}' }],
      },
      {
        id: 'split',
        label: 'Split variables',
        vars: [
          { key: 'DB_HOST',     template: '{{host}}'           },
          { key: 'DB_PORT',     template: '{{port}}'           },
          { key: 'DB_USER',     template: '{{MYSQL_USER}}'     },
          { key: 'DB_PASSWORD', template: '{{MYSQL_PASSWORD}}' },
          { key: 'DB_NAME',     template: '{{MYSQL_DATABASE}}' },
        ],
      },
    ],
    configFields: [
      { key: 'version', label: 'Version', type: 'select', options: ['8.0', '5.7'], default: '8.0' },
      { key: 'sizeGb',  label: 'Volume (GB)', type: 'number', default: 10 },
    ],
  },

  mongodb: {
    engine: 'mongodb',
    category: 'database',
    label: 'MongoDB',
    icon: 'Leaf',
    color: { text: 'text-green-300', bg: 'bg-green-500/20', border: 'border-green-500/30', ring: 'ring-green-500/40' },
    defaultImage: 'mongo:7',
    defaultPort: 27017,
    defaultPublic: false,
    protocol: 'mongodb',
    mountPath: '/data/db',
    defaultVolumeSizeGb: 10,
    defaultEnv: {
      MONGO_INITDB_DATABASE:     { kind: 'literal',         value: 'app'   },
      MONGO_INITDB_ROOT_USERNAME: { kind: 'literal',         value: 'mongo' },
      MONGO_INITDB_ROOT_PASSWORD: { kind: 'generatedSecret', length: 32    },
    },
    connectionTemplates: [
      {
        id: 'url',
        label: 'MONGODB_URL',
        vars: [{ key: 'MONGODB_URL', template: 'mongodb://{{MONGO_INITDB_ROOT_USERNAME}}:{{MONGO_INITDB_ROOT_PASSWORD}}@{{host}}:{{port}}/{{MONGO_INITDB_DATABASE}}' }],
      },
    ],
    configFields: [
      { key: 'version', label: 'Version', type: 'select', options: ['7', '6', '5'], default: '7' },
      { key: 'sizeGb',  label: 'Volume (GB)', type: 'number', default: 10 },
    ],
  },

  clickhouse: {
    engine: 'clickhouse',
    category: 'database',
    label: 'ClickHouse',
    icon: 'BarChart3',
    color: { text: 'text-yellow-300', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', ring: 'ring-yellow-500/40' },
    defaultImage: 'clickhouse/clickhouse-server:latest',
    defaultPort: 9000,
    defaultPublic: false,
    protocol: 'tcp',
    mountPath: '/var/lib/clickhouse',
    defaultVolumeSizeGb: 20,
    defaultEnv: {
      CLICKHOUSE_USER:     { kind: 'literal',         value: 'clickhouse' },
      CLICKHOUSE_PASSWORD: { kind: 'generatedSecret', length: 32          },
      CLICKHOUSE_DB:       { kind: 'literal',         value: 'app'        },
    },
    connectionTemplates: [
      {
        id: 'url',
        label: 'CLICKHOUSE_URL',
        vars: [{ key: 'CLICKHOUSE_URL', template: 'clickhouse://{{CLICKHOUSE_USER}}:{{CLICKHOUSE_PASSWORD}}@{{host}}:{{port}}/{{CLICKHOUSE_DB}}' }],
      },
    ],
    configFields: [
      { key: 'sizeGb', label: 'Volume (GB)', type: 'number', default: 20 },
    ],
  },

  // ── Cache engines ────────────────────────────────────────────────────────────
  redis: {
    engine: 'redis',
    category: 'cache',
    label: 'Redis',
    icon: 'Zap',
    color: { text: 'text-red-300', bg: 'bg-red-500/20', border: 'border-red-500/30', ring: 'ring-red-500/40' },
    defaultImage: 'redis:7-alpine',
    defaultPort: 6379,
    defaultPublic: false,
    protocol: 'redis',
    mountPath: '/data',
    defaultVolumeSizeGb: 2,
    defaultEnv: {},
    connectionTemplates: [
      {
        id: 'url',
        label: 'REDIS_URL',
        vars: [{ key: 'REDIS_URL', template: 'redis://{{host}}:{{port}}' }],
      },
    ],
    configFields: [
      { key: 'maxMemory',      label: 'Max memory',      type: 'text',   default: '256mb'     },
      { key: 'evictionPolicy', label: 'Eviction policy', type: 'select', options: ['noeviction', 'allkeys-lru', 'volatile-lru', 'allkeys-lfu'], default: 'noeviction' },
      { key: 'sizeGb',         label: 'Volume (GB)',     type: 'number', default: 2            },
    ],
  },

  valkey: {
    engine: 'valkey',
    category: 'cache',
    label: 'Valkey',
    icon: 'Zap',
    color: { text: 'text-purple-300', bg: 'bg-purple-500/20', border: 'border-purple-500/30', ring: 'ring-purple-500/40' },
    defaultImage: 'valkey/valkey:latest',
    defaultPort: 6379,
    defaultPublic: false,
    protocol: 'redis',
    mountPath: '/data',
    defaultVolumeSizeGb: 2,
    defaultEnv: {},
    connectionTemplates: [
      {
        id: 'url',
        label: 'REDIS_URL',
        vars: [{ key: 'REDIS_URL', template: 'redis://{{host}}:{{port}}' }],
      },
    ],
    configFields: [
      { key: 'maxMemory',      label: 'Max memory',      type: 'text',   default: '256mb'    },
      { key: 'evictionPolicy', label: 'Eviction policy', type: 'select', options: ['noeviction', 'allkeys-lru', 'volatile-lru'], default: 'noeviction' },
      { key: 'sizeGb',         label: 'Volume (GB)',     type: 'number', default: 2           },
    ],
  },

  // ── Queue engines ────────────────────────────────────────────────────────────
  rabbitmq: {
    engine: 'rabbitmq',
    category: 'queue',
    label: 'RabbitMQ',
    icon: 'Layers',
    color: { text: 'text-orange-300', bg: 'bg-orange-500/20', border: 'border-orange-500/30', ring: 'ring-orange-500/40' },
    defaultImage: 'rabbitmq:3-management-alpine',
    defaultPort: 5672,
    defaultPublic: false,
    protocol: 'tcp',
    mountPath: '/var/lib/rabbitmq',
    defaultVolumeSizeGb: 5,
    defaultEnv: {
      RABBITMQ_DEFAULT_USER: { kind: 'literal',         value: 'rabbitmq' },
      RABBITMQ_DEFAULT_PASS: { kind: 'generatedSecret', length: 32        },
    },
    connectionTemplates: [
      {
        id: 'url',
        label: 'RABBITMQ_URL',
        vars: [{ key: 'RABBITMQ_URL', template: 'amqp://{{RABBITMQ_DEFAULT_USER}}:{{RABBITMQ_DEFAULT_PASS}}@{{host}}:{{port}}' }],
      },
    ],
    configFields: [
      { key: 'sizeGb', label: 'Volume (GB)', type: 'number', default: 5 },
    ],
  },
};

// ─── Lookups ───────────────────────────────────────────────────────────────────

export function getServiceDefinition(engine: string): ServiceDefinition {
  return REGISTRY[engine] ?? REGISTRY.generic;
}

export function getAllServiceDefinitions(): ServiceDefinition[] {
  return Object.values(REGISTRY);
}

export function getServicesByCategory(category: ServiceCategory): ServiceDefinition[] {
  return Object.values(REGISTRY).filter(d => d.category === category);
}

/**
 * Best-effort lookup when only type+engine are available (e.g. from DB rows).
 * For generic engine, returns the web or worker definition based on type.
 */
export function getServiceDefinitionByTypeEngine(type: string, engine?: string | null): ServiceDefinition {
  if (engine && engine !== 'generic' && REGISTRY[engine]) return REGISTRY[engine];
  // Category fallback defaults
  const defaults: Record<string, string> = {
    database: 'postgres',
    cache:    'redis',
    queue:    'rabbitmq',
    web:      'generic',
    worker:   'generic',
  };
  return REGISTRY[defaults[type] ?? 'generic'] ?? REGISTRY.generic;
}

// ─── Protocol / URL helpers ────────────────────────────────────────────────────

/** Determines the wire protocol for an endpoint. Engine-specific protocols win. */
export function resolveEndpointProtocol(engine: string, declaredProtocol?: string): string {
  const def = getServiceDefinition(engine);
  const engineProtocols = ['postgres', 'redis', 'mysql', 'mongodb'];
  if (engineProtocols.includes(def.protocol)) return def.protocol;
  return declaredProtocol ?? def.protocol;
}

/** Builds a connection URL from host + port + protocol. */
export function buildEndpointUrl(host: string, port: number, protocol: string): string {
  const schemes: Record<string, string> = {
    http:     `http://${host}:${port}`,
    https:    `https://${host}:${port}`,
    postgres: `postgresql://${host}:${port}`,
    mysql:    `mysql://${host}:${port}`,
    mongodb:  `mongodb://${host}:${port}`,
    redis:    `redis://${host}:${port}`,
  };
  return schemes[protocol] ?? `${host}:${port}`;
}
