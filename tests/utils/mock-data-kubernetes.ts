import { Tables } from '@/lib/supabase/types';

/**
 * Mock data for testing Kubernetes cluster functionality
 */

export const mockKubernetesUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test.k8s@example.com',
  name: 'K8s Test User',
};

export const mockKubernetesProject: Tables<'projects'> = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test K8s Project',
  owner: mockKubernetesUser.id,
  description: 'Test project for Kubernetes cluster tests',
  default_project: false,
  users: [],
  created_at: '2024-01-01T00:00:00Z',
};

export const mockKubernetesCluster = {
  id: 'cluster-uuid-001',
  cluster_id: 'k8s-cluster-001',
  cluster_name: 'test-k8s-cluster',
  status: 'ready' as const,
  workers: [
    { id: 'worker-1', droplet_id: 123, public_ip: '1.2.3.4', private_ip: '10.0.0.1' },
    { id: 'worker-2', droplet_id: 124, public_ip: '1.2.3.5', private_ip: '10.0.0.2' },
  ],
  control_plane: {
    droplet_id: 122,
    public_ip: '1.2.3.3',
    private_ip: '10.0.0.0',
  },
  created_at: '2024-01-01T00:00:00Z',
  k8s_version: '1.31.0',
  kubeconfig: {
    data: Array.from(Buffer.from('apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://1.2.3.3:6443\n  name: test-cluster'))
  },
  owner_id: mockKubernetesUser.id,
  project_id: mockKubernetesProject.id,
  node_config: { cpu: 2, ram: 4096, storage: 50 },
  create_status: true,
  connect_status: true,
  verify_status: true,
  cni_plugin: 'calico',
  password: null,
};

export const mockPendingCluster = {
  ...mockKubernetesCluster,
  id: 'cluster-pending-001',
  cluster_id: 'k8s-cluster-pending',
  cluster_name: 'pending-cluster',
  status: 'pending' as const,
  create_status: false,
  connect_status: false,
  verify_status: false,
};

export const mockCreatingCluster = {
  ...mockKubernetesCluster,
  id: 'cluster-creating-001',
  cluster_id: 'k8s-cluster-creating',
  cluster_name: 'creating-cluster',
  status: 'creating' as const,
  create_status: true,
  connect_status: false,
  verify_status: false,
};

export const mockFailedCluster = {
  ...mockKubernetesCluster,
  id: 'cluster-failed-001',
  cluster_id: 'k8s-cluster-failed',
  cluster_name: 'failed-cluster',
  status: 'failed' as const,
  create_status: false,
  connect_status: false,
  verify_status: false,
};

export const mockEncryptedPassword = {
  encrypted: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  iv: '1a2b3c4d5e6f7g8h',
  tag: 'q1w2e3r4t5y6u7i8',
  salt: 'z9x8c7v6b5n4m3a2',
};

export const mockCreateKubernetesPayload = {
  provider: 'existing' as const,
  cluster: {
    name: 'test-cluster-new',
    location: 'nyc1',
    pod_cidr: '10.244.0.0/16',
    k8s_minor: '1.31.0',
  },
  auth: {
    method: 'password' as const,
    user: 'ubuntu',
    password: mockEncryptedPassword,
  },
  nodes: [
    {
      host: '1.2.3.4',
      role: 'control-plane' as const,
      hostname: 'cp-01',
      cpu: 2,
      memory_mb: 4096,
      storage: 50,
      private_ip: '10.0.0.1',
      droplet_id: 123,
    },
    {
      host: '1.2.3.5',
      role: 'worker' as const,
      hostname: 'worker-01',
      cpu: 2,
      memory_mb: 4096,
      storage: 50,
      private_ip: '10.0.0.2',
      droplet_id: 124,
    },
  ],
  ips: ['1.2.3.4', '1.2.3.5'],
  ownerId: mockKubernetesUser.id,
  projectId: mockKubernetesProject.id,
  planId: '550e8400-e29b-41d4-a716-446655440010', // Required for kubernetes create
};

export const mockInvalidKubernetesPayloads = {
  invalidName: {
    ...mockCreateKubernetesPayload,
    cluster: { ...mockCreateKubernetesPayload.cluster, name: 'ab' }, // Too short
  },
  invalidNameWithUnderscore: {
    ...mockCreateKubernetesPayload,
    cluster: { ...mockCreateKubernetesPayload.cluster, name: 'test_cluster' }, // Underscore not allowed
  },
  invalidNameStartsWithHyphen: {
    ...mockCreateKubernetesPayload,
    cluster: { ...mockCreateKubernetesPayload.cluster, name: '-test-cluster' },
  },
  invalidNameEndsWithHyphen: {
    ...mockCreateKubernetesPayload,
    cluster: { ...mockCreateKubernetesPayload.cluster, name: 'test-cluster-' },
  },
  invalidNameOnlyNumbers: {
    ...mockCreateKubernetesPayload,
    cluster: { ...mockCreateKubernetesPayload.cluster, name: '12345' }, // No letters
  },
  invalidNameOneLetter: {
    ...mockCreateKubernetesPayload,
    cluster: { ...mockCreateKubernetesPayload.cluster, name: 'a123' }, // Only 1 letter
  },
  emptyNodes: {
    ...mockCreateKubernetesPayload,
    nodes: [],
  },
  invalidPrivateIP: {
    ...mockCreateKubernetesPayload,
    nodes: [
      { ...mockCreateKubernetesPayload.nodes[0], private_ip: 'invalid-ip' },
    ],
  },
  missingRequiredFields: {
    provider: 'existing',
    cluster: { name: 'test' },
    // Missing auth, nodes, ips, etc.
  },
};

export const mockKubernetesProducts: Tables<'products'>[] = [
  {
    id: 'k8s-s-2vcpu-4gb',
    name: 'Small',
    type: 'vps',
    sub: 'standard',
    resources: { cpu: 2, ram: 4, storage: 50 },
    price: 24,
    description: 'Small Kubernetes node',
    discount: null,
    image: null,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'k8s-m-4vcpu-8gb',
    name: 'Medium',
    type: 'vps',
    sub: 'standard',
    resources: { cpu: 4, ram: 8, storage: 100 },
    price: 48,
    description: 'Medium Kubernetes node',
    discount: null,
    image: null,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'k8s-l-8vcpu-16gb',
    name: 'Large',
    type: 'vps',
    sub: 'standard',
    resources: { cpu: 8, ram: 16, storage: 200 },
    price: 96,
    description: 'Large Kubernetes node',
    discount: null,
    image: null,
    created_at: '2024-01-01T00:00:00Z',
  },
];

export const mockDigitalOceanDroplet = {
  droplet: {
    id: 123,
    name: 'k8s-node-01',
    status: 'active',
    memory: 4096,
    vcpus: 2,
    disk: 50,
    region: {
      name: 'New York 1',
      slug: 'nyc1',
    },
    image: {
      name: 'Ubuntu 22.04 x64',
    },
    networks: {
      v4: [
        { ip_address: '1.2.3.4', type: 'public' },
        { ip_address: '10.0.0.1', type: 'private' },
      ],
    },
    created_at: '2024-01-01T00:00:00Z',
  },
};

export const mockDigitalOceanCreateDropletResponse = {
  droplet: mockDigitalOceanDroplet.droplet,
  links: {
    actions: [
      {
        id: 1234567890,
        status: 'in-progress',
        type: 'create',
      },
    ],
  },
};

export const mockDigitalOceanMetrics = {
  status: 'success',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric: { host_id: '123', mode: 'user' },
        values: [
          [1704067200, '25.5'],
          [1704067260, '30.2'],
          [1704067320, '28.7'],
          [1704067380, '32.1'],
        ],
      },
      {
        metric: { host_id: '123', mode: 'system' },
        values: [
          [1704067200, '10.2'],
          [1704067260, '12.5'],
          [1704067320, '11.8'],
          [1704067380, '13.2'],
        ],
      },
    ],
  },
};

export const mockDigitalOceanMemoryMetrics = {
  status: 'success',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric: { host_id: '123' },
        values: [
          [1704067200, '2048000000'],
          [1704067260, '2150000000'],
          [1704067320, '2100000000'],
          [1704067380, '2200000000'],
        ],
      },
    ],
  },
};

export const mockDigitalOceanDiskMetrics = {
  status: 'success',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric: { host_id: '123', device: 'vda1' },
        values: [
          [1704067200, '25000000000'],
          [1704067260, '25100000000'],
          [1704067320, '25200000000'],
          [1704067380, '25300000000'],
        ],
      },
    ],
  },
};

export const mockKubeconfigYAML = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: LS0tLS1...
    server: https://1.2.3.3:6443
  name: test-k8s-cluster
contexts:
- context:
    cluster: test-k8s-cluster
    user: admin
  name: test-k8s-cluster
current-context: test-k8s-cluster
kind: Config
preferences: {}
users:
- name: admin
  user:
    client-certificate-data: LS0tLS1...
    client-key-data: LS0tLS1...`;

export const mockKubeconfigBuffer = {
  data: Array.from(Buffer.from(mockKubeconfigYAML))
};

export const mockAdminUser = {
  id: '550e8400-e29b-41d4-a716-446655440099',
  email: 'admin@example.com',
  name: 'Admin User',
  roles: ['admin'],
};

export const mockAllUsersForAdmin = [
  {
    id: mockKubernetesUser.id,
    email: mockKubernetesUser.email,
    username: 'testuser',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    email: 'user2@example.com',
    username: 'user2',
  },
  {
    id: mockAdminUser.id,
    email: mockAdminUser.email,
    username: 'admin',
  },
];

export const mockProjectLog = {
  id: 'log-001',
  project_id: mockKubernetesProject.id,
  event: 'Kubernetes Create',
  text: 'Kubernetes cluster "test-k8s-cluster" creation started',
  created_at: '2024-01-01T00:00:00Z',
};
