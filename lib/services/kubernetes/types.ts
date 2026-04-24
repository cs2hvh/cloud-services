/**
 * Kubernetes Service Types
 */

import type { EncryptedData } from "@/config/functions";
import type { AuditContext } from "@/lib/audit/types";

// import { NextRequest } from "next/server";

// Base result type
export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

// Cluster operations
export interface CreateKubernetesClusterRequest {
  name: string;
  region: string;
  version: string;
  node_pool: {
    size: string;
    count: number;
    name?: string;
  };
  project_id: string;
  plan_id: string;
  owner_id: string;
  user_email?: string;
  isAdmin?: boolean;
}

export interface CreateKubernetesClusterResult extends ServiceResult {
  clusterId?: string;
  data?: Record<string, unknown>;
  kubeconfig?: string;
}

export interface GetKubernetesClusterRequest {
  clusterId: string;
  userId: string;
  isAdmin?: boolean;
}

export interface InitKubernetesClusterRequest {
  name: string;
  region: string;
  version: string;
  nodeCount: number;
  size: string;
  ownerId: string;
  actorUserId?: string;
  projectId: string;
  planId: string;
  resources: {
    cpu: number;
    ram: number;
    storage: number;
  };
  userEmail?: string;
  isAdmin?: boolean;
}

export interface InitKubernetesClusterResult extends ServiceResult {
  clusterId?: string;
}

export interface GetKubernetesClusterResult extends ServiceResult {
  data?: Record<string, unknown>;
}

export interface UpdateKubernetesClusterRequest {
  clusterId: string;
  userId: string;
  isAdmin?: boolean;
  node_pool?: {
    size?: string;
    count?: number;
  };
  project_id?: string;
}

export interface DeleteKubernetesClusterRequest {
  clusterId: string;
  userId: string;
  isAdmin?: boolean;
}

export interface DeleteKubernetesClusterResult extends ServiceResult {
  clusterId?: string;
  droplet_warnings?: string[];
}

export interface ListKubernetesClustersByOwnerRequest {
  userId: string;
}

export interface ListKubernetesClustersByOwnerResult extends ServiceResult {
  data?: Array<Record<string, unknown>>;
}

export interface RemoveKubernetesNodeRequest {
  clusterId: string;
  dropletId: string;
  userId: string;
  userEmail?: string | null;
  auditContext?: AuditContext;
}

export interface RemoveKubernetesNodeResult extends ServiceResult {
  workers?: Array<Record<string, unknown>>;
}

export interface AddKubernetesNodeRequest {
  clusterId: string;
  planId?: string;
  userId: string;
  userEmail?: string | null;
  /** When true, skip upfront setup charge and activate billing later when cluster is fully ready. */
  deferBillingUntilReady?: boolean;
  /** Whitelisted fields to forward to DigitalOcean droplet creation API */
  dropletPayload: Record<string, unknown>;
  /** Upfront balance required (caller-supplied, used for pre-flight check) */
  initialCost?: number;
  /** Expected node count AFTER this node is added (caller-supplied to avoid race condition) */
  expectedNodeCount?: number;
  auditContext?: AuditContext;
}

export interface AddKubernetesNodeResult extends ServiceResult {
  dropletData?: Record<string, unknown>;
  vmPassword?: EncryptedData;
}
