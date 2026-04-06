import { z } from '@/lib/openapi/init';

import { PaginationMetaSchema } from '@/lib/openapi/schemas/common';

const ControlPlaneSchema = z.object({
  public_ip: z.string().nullable().openapi({ example: '139.59.1.6', description: 'Public IP of the control plane' }),
  droplet_id: z.number().nullable().openapi({ example: 539342401, description: 'DigitalOcean droplet ID' }),
  private_ip: z.string().nullable().openapi({ example: '10.122.0.14', description: 'Private IP of the control plane' }),
}).openapi('ControlPlane');

const WorkerNodeSchema = z.object({
  public_ip: z.string().nullable().openapi({ example: '157.245.111.205' }),
  droplet_id: z.number().nullable().openapi({ example: 539342404 }),
  private_ip: z.string().nullable().openapi({ example: '10.122.0.18' }),
}).openapi('WorkerNode');

const NodeConfigSchema = z.object({
  cpu: z.number().openapi({ example: 2, description: 'CPU cores per node' }),
  ram: z.number().openapi({ example: 4096, description: 'RAM in MB per node' }),
  storage: z.number().openapi({ example: 80, description: 'Storage in GB per node' }),
}).openapi('NodeConfig');

export const KubernetesClusterSchema = z.object({
  id: z.string().uuid().openapi({ example: '23549dc5-53ee-4ff2-904d-a59250065545', description: 'Cluster ID (use this for /kubernetes/{id} routes)' }),
  cluster_name: z.string().openapi({ example: 'cluster-for-app-d', description: 'Cluster display name' }),
  control_plane: ControlPlaneSchema.nullable().openapi({ description: 'Control plane node info' }),
  workers: z.array(WorkerNodeSchema).nullable().openapi({ description: 'Worker nodes (null while cluster is being created)' }),
  create_status: z.boolean().openapi({ example: true, description: 'Whether cluster creation is complete' }),
  connect_status: z.boolean().openapi({ example: true, description: 'Whether cluster is connected' }),
  verify_status: z.boolean().openapi({ example: true, description: 'Whether cluster is verified' }),
  node_config: NodeConfigSchema.nullable().openapi({ description: 'Node hardware configuration' }),
  cni_plugin: z.string().nullable().openapi({ example: 'calico', description: 'CNI plugin (e.g., calico, flannel)' }),
  k8s_version: z.string().nullable().openapi({ example: 'v1.31', description: 'Kubernetes version' }),
  status: z.enum(['pending', 'creating', 'ready', 'failed', 'deleted']).openapi({ example: 'ready', description: 'Cluster status' }),
  created_at: z.string().datetime().openapi({ example: '2026-02-27T10:00:00Z' }),
  updated_at: z.string().datetime().optional().openapi({ example: '2026-02-27T12:00:00Z' }),
  project_id: z.string().uuid().openapi({ example: '25bb74a1-d21e-4282-a3f9-8cc18a298e7e', description: 'Project this cluster belongs to' }),
}).openapi('KubernetesCluster');

export const CreateKubernetesClusterRequestSchema = z.object({
  name: z.string().min(3).max(63).openapi({
    example: 'my-k8s-cluster',
    description: 'Cluster name (DNS-1123 subdomain: lowercase alphanumeric and hyphens)',
  }),
  region: z.string().openapi({ example: 'sgp1', description: 'DigitalOcean region slug' }),
  version: z.string().openapi({ example: '1.29.1-do.0', description: 'Kubernetes version' }),
  node_pool: z.object({
    size: z.string().openapi({ example: 's-2vcpu-4gb', description: 'DigitalOcean droplet size slug' }),
    count: z.number().int().min(1).max(20).openapi({ example: 3, description: 'Number of worker nodes (1-20)' }),
    name: z.string().optional().openapi({ example: 'worker-pool', description: 'Node pool name' }),
  }).openapi({ description: 'Worker node pool configuration' }),
  project_id: z.string().uuid().openapi({ example: '25bb74a1-d21e-4282-a3f9-8cc18a298e7e' }),
  plan_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Billing plan UUID' }),
}).openapi('CreateKubernetesClusterRequest');

export const UpdateKubernetesClusterRequestSchema = z.object({
  project_id: z.string().uuid().optional().openapi({ example: '25bb74a1-d21e-4282-a3f9-8cc18a298e7e' }),
  node_pool: z.object({
    size: z.string().optional().openapi({ example: 's-4vcpu-8gb' }),
    count: z.number().int().min(1).max(20).optional().openapi({ example: 5 }),
  }).optional().openapi({ description: 'Updated node pool configuration' }),
}).openapi('UpdateKubernetesClusterRequest');

export const KubernetesClusterListResponseSchema = z.object({
  data: z.array(KubernetesClusterSchema),
  meta: PaginationMetaSchema,
}).openapi('KubernetesClusterListResponse');

export const KubernetesClusterResponseSchema = z.object({
  data: KubernetesClusterSchema,
}).openapi('KubernetesClusterResponse');

export const KubernetesClusterDeleteResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    deleted: z.boolean().openapi({ example: true }),
  }),
}).openapi('KubernetesClusterDeleteResponse');
