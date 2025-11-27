import { Tables } from '@/lib/supabase/types';

/**
 * Mock data for testing database cluster functionality
 */

export const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'pankaj.soni@ahurasense.com',
  name: 'Test User',
};

export const mockProject = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Project',
  owner: mockUser.id,
  description: 'Test project for database cluster tests',
  default_project: false,
  users: [],
  created_at: '2024-01-01T00:00:00Z',
} as Tables<'projects'>;

export const mockDatabaseCluster: Tables<'database_clusters'> = {
  id: 'db-550e8400-e29b-41d4-a716-446655440002',
  cluster_id: '550e8400-e29b-41d4-a716-446655440001' as any,
  name: 'test-mysql-db',
  engine: 'mysql',
  version: '8',
  status: 'online',
  num_nodes: 1,
  size: 'db-s-1vcpu-1gb',
  region: 'nyc1',
  project_id: mockProject.id,
  owner_id: mockUser.id,
  password: {
    iv: 'test-iv-hex-string',
    encrypted: 'encrypted-password-hex',
    tag: 'test-tag-hex-string',
    salt: 'test-salt-hex-string',
  },
  public_connection: {
    host: 'test-mysql-db-do-user-123.db.ondigitalocean.com',
    port: 25060,
    database: 'defaultdb',
    user: 'doadmin',
    password: {
      iv: 'test-iv-hex-string',
      encrypted: 'encrypted-password-hex',
      tag: 'test-tag-hex-string',
      salt: 'test-salt-hex-string',
    },
    uri: 'mysql://doadmin:password@host:25060/defaultdb?ssl-mode=REQUIRED',
    ssl: true,
    protocol: 'mysql',
  },
  private_connection: {
    host: 'private-test-mysql-db-do-user-123.db.ondigitalocean.com',
    port: 25060,
    database: 'defaultdb',
    user: 'doadmin',
    password: {
      iv: 'test-iv-hex-string',
      encrypted: 'encrypted-private-password-hex',
      tag: 'test-tag-hex-string',
      salt: 'test-salt-hex-string',
    },
    uri: 'mysql://doadmin:password@private-host:25060/defaultdb?ssl-mode=REQUIRED',
    ssl: true,
    protocol: 'mysql',
  },
  window: {
    day: 'tuesday',
    hour: '02:00',
  },
  users: [
    {
      id: 'doadmin',
      name: 'doadmin',
      role: 'primary',
      password: 'plain-admin-password',
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
  dbs: [
    {
      id: 'defaultdb',
      name: 'defaultdb',
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
};

export const mockCreatingCluster: Tables<'database_clusters'> = {
  ...mockDatabaseCluster,
  id: 'db-creating-123',
  cluster_id: '550e8400-e29b-41d4-a716-446655440002' as any,
  name: 'creating-cluster',
  status: 'creating',
};

export const mockFailedCluster: Tables<'database_clusters'> = {
  ...mockDatabaseCluster,
  id: 'db-failed-123',
  cluster_id: '550e8400-e29b-41d4-a716-446655440003' as any,
  name: 'failed-cluster',
  status: 'pending', // Use valid status since 'failed' is not in the enum
};

export const mockDatabaseUser = {
  id: 'testuser',
  name: 'testuser',
  role: 'normal',
  password: {
    iv: 'test-iv',
    encryptedData: 'encrypted-user-password',
  },
  created_at: '2024-01-01T00:00:00Z',
};

export const mockFirewallRule = {
  uuid: 'rule-123',
  cluster_uuid: mockDatabaseCluster.cluster_id,
  type: 'ip_addr',
  value: '203.0.113.0/24',
  created_at: '2024-01-01T00:00:00Z',
};

export const mockLocation: Tables<'locations'> = {
  id: 1, // Changed from string to number
  city: 'New York',
  country: 'United States',
  country_code: 'US',
  short: 'NYC',
  cluster_type: 'database',
  available: true,
};

export const mockProduct: Tables<'products'> = {
  id: 'prod-mysql-1vcpu',
  name: 'MySQL - 1 vCPU, 1GB RAM',
  description: 'Basic MySQL database cluster',
  type: 'database',
  price: 15.0,
  resources: { cpu: 1, ram: 1, storage: 35 },
  sub: 'mysql-basic',
  image: null,
  discount: null,
  created_at: '2024-01-01T00:00:00Z',
};

export const mockProducts: Tables<'products'>[] = [
  mockProduct,
  {
    ...mockProduct,
    id: 'prod-mysql-2vcpu',
    name: 'MySQL - 2 vCPU, 2GB RAM',
    resources: { cpu: 2, ram: 2, storage: 70 },
    price: 30.0,
  },
  {
    ...mockProduct,
    id: 'prod-pg-1vcpu',
    name: 'PostgreSQL - 1 vCPU, 1GB RAM',
    sub: 'pg-basic',
  },
];

export const mockDigitalOceanCluster = {
  database: {
    id: mockDatabaseCluster.cluster_id,
    name: mockDatabaseCluster.name,
    engine: mockDatabaseCluster.engine,
    version: mockDatabaseCluster.version,
    status: mockDatabaseCluster.status,
    num_nodes: mockDatabaseCluster.num_nodes,
    size: mockDatabaseCluster.size,
    region: mockDatabaseCluster.region,
    created_at: '2024-01-01T00:00:00Z',
    connection: {
      protocol: 'mysql',
      host: mockDatabaseCluster.public_connection?.host || '',
      port: mockDatabaseCluster.public_connection?.port || 25060,
      database: mockDatabaseCluster.public_connection?.database || 'defaultdb',
      user: mockDatabaseCluster.public_connection?.user || 'doadmin',
      password: 'plain-text-password',
      uri: mockDatabaseCluster.public_connection?.uri || '',
      ssl: true,
    },
    private_connection: {
      protocol: 'mysql',
      host: mockDatabaseCluster.private_connection?.host || '',
      port: mockDatabaseCluster.private_connection?.port || 25060,
      database: mockDatabaseCluster.private_connection?.database || 'defaultdb',
      user: mockDatabaseCluster.private_connection?.user || 'doadmin',
      password: 'plain-text-private-password',
      uri: mockDatabaseCluster.private_connection?.uri || '',
      ssl: true,
    },
    maintenance_window: mockDatabaseCluster.window,
    users: [
      {
        name: 'doadmin',
        role: 'primary',
        password: 'plain-admin-password',
      },
    ],
    db_names: ['defaultdb'],
  },
};

export const mockCreateDatabasePayload = {
  name: 'test-mysql-01',
  engine: 'mysql' as const,
  version: '8',
  num_nodes: 1,
  size: 'db-s-1vcpu-1gb',
  region: 'nyc1',
  project_id: mockProject.id,
  owner_id: mockUser.id,
};

export const mockInvalidPayloads = {
  invalidName: {
    ...mockCreateDatabasePayload,
    name: 'AB', // Too short
  },
  invalidNameUppercase: {
    ...mockCreateDatabasePayload,
    name: 'Test-DB', // Has uppercase
  },
  invalidNameUnderscore: {
    ...mockCreateDatabasePayload,
    name: 'test_db', // Has underscore
  },
  invalidEngine: {
    ...mockCreateDatabasePayload,
    engine: 'invalid-engine' as any,
  },
  invalidNodes: {
    ...mockCreateDatabasePayload,
    num_nodes: 0, // Must be >= 1
  },
  invalidRegion: {
    ...mockCreateDatabasePayload,
    region: 'invalid-region',
  },
  invalidProjectId: {
    ...mockCreateDatabasePayload,
    project_id: 'not-a-uuid',
  },
};

/**
 * Mock data for Spectrum / Network DDoS Protection testing
 */

export const mockEncryptedDNS = {
  iv: 'test-iv-hex-string',
  encrypted: 'encrypted-ip-address',
  tag: 'test-tag-hex-string',
  salt: 'test-salt-hex-string',
};

export const mockSpectrumApp: Tables<'spectrum_apps'> = {
  id: 'spec-550e8400-e29b-41d4-a716-446655440001',
  spectrum_id: 'cf-spectrum-app-123456',
  dns: {
    name: mockEncryptedDNS,
    type: 'A',
    original_name: 'myapp',
  },
  protocol: 'tcp/22',
  origin_direct: ['tcp://192.168.1.100:22'],
  tls: 'off',
  edge_ips: {
    type: 'dynamic',
    connectivity: 'all',
  },
  ip_firewall: false,
  traffic_type: 'direct',
  proxy_protocol: 'off',
  owner_id: mockUser.id,
  project_id: mockProject.id,
  status: 'created',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockAdminSpectrumApp = {
  ...mockSpectrumApp,
  owner_email: 'test@example.com',
  owner_username: 'testuser',
};

export const mockSpectrumAppSSH: Tables<'spectrum_apps'> = {
  ...mockSpectrumApp,
  id: 'spec-ssh-123',
  spectrum_id: 'cf-spectrum-ssh-123',
  dns: {
    name: mockEncryptedDNS,
    type: 'A',
    original_name: 'ssh-server',
  },
  protocol: 'tcp/22',
  origin_direct: ['tcp://10.0.0.5:22'],
};

export const mockSpectrumAppRDP: Tables<'spectrum_apps'> = {
  ...mockSpectrumApp,
  id: 'spec-rdp-123',
  spectrum_id: 'cf-spectrum-rdp-123',
  dns: {
    name: mockEncryptedDNS,
    type: 'A',
    original_name: 'rdp-server',
  },
  protocol: 'tcp/3389',
  origin_direct: ['tcp://10.0.0.10:3389'],
};

export const mockSpectrumAppMinecraft: Tables<'spectrum_apps'> = {
  ...mockSpectrumApp,
  id: 'spec-mc-123',
  spectrum_id: 'cf-spectrum-mc-123',
  dns: {
    name: mockEncryptedDNS,
    type: 'A',
    original_name: 'mc-server',
  },
  protocol: 'tcp/25565',
  origin_direct: ['tcp://10.0.0.20:25565'],
  tls: 'full',
  ip_firewall: true,
};

export const mockCloudflareSpectrumApp = {
  id: 'cf-spectrum-app-123456',
  dns: {
    name: 'myapp.hostguardian.net',
    type: 'A',
  },
  protocol: 'tcp/22',
  origin_direct: ['tcp://192.168.1.100:22'],
  tls: 'off',
  edge_ips: {
    type: 'dynamic',
    connectivity: 'all',
  },
  ip_firewall: false,
  traffic_type: 'direct',
  proxy_protocol: 'off',
  argo_smart_routing: true,
};

export const mockCreateSpectrumPayload = {
  project_id: mockProject.id,
  owner_id: mockUser.id,
  dns: {
    name: 'myapp',
    type: 'A' as const,
  },
  protocol: 'tcp/22',
  origin_direct: ['192.168.1.100:22'],
  tls: 'off' as const,
  edge_ips: {
    type: 'dynamic',
    connectivity: 'all',
  },
  ip_firewall: false,
  traffic_type: 'direct',
  proxy_protocol: 'off',
  role: 'user',
};

export const mockInvalidSpectrumPayloads = {
  invalidProtocol: {
    ...mockCreateSpectrumPayload,
    protocol: 'http/80', // Invalid protocol
  },
  invalidProtocolNoPort: {
    ...mockCreateSpectrumPayload,
    protocol: 'tcp', // Missing port
  },
  invalidProjectId: {
    ...mockCreateSpectrumPayload,
    project_id: 'not-a-uuid',
  },
  invalidOwnerId: {
    ...mockCreateSpectrumPayload,
    owner_id: 'not-a-uuid',
  },
  emptyOrigins: {
    ...mockCreateSpectrumPayload,
    origin_direct: [],
  },
  invalidDNSType: {
    ...mockCreateSpectrumPayload,
    dns: {
      name: 'myapp',
      type: 'MX' as any,
    },
  },
  shortDNSName: {
    ...mockCreateSpectrumPayload,
    dns: {
      name: 'ab',
      type: 'A' as const,
    },
  },
  invalidTLS: {
    ...mockCreateSpectrumPayload,
    tls: 'partial' as any,
  },
  invalidPortRange: {
    ...mockCreateSpectrumPayload,
    protocol: 'tcp/9000-8000', // Reversed range
  },
  invalidPortTooHigh: {
    ...mockCreateSpectrumPayload,
    protocol: 'tcp/99999', // Port > 65535
  },
};
