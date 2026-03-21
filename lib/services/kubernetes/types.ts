/**
 * Kubernetes Service Types
 */

import { NextRequest } from "next/server";

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
}

export interface CreateKubernetesClusterResult extends ServiceResult {
  clusterId?: string;
  data?: Record<string, unknown>;
  kubeconfig?: string;
}

export interface GetKubernetesClusterRequest {
  clusterId: string;
  userId: string;
}

export interface GetKubernetesClusterResult extends ServiceResult {
  data?: Record<string, unknown>;
}

export interface UpdateKubernetesClusterRequest {
  clusterId: string;
  userId: string;
  node_pool?: {
    size?: string;
    count?: number;
  };
  project_id?: string;
}

export interface DeleteKubernetesClusterRequest {
  clusterId: string;
  userId: string;
}

export interface DeleteKubernetesClusterResult extends ServiceResult {
  clusterId?: string;
}

export interface ListKubernetesClustersByOwnerRequest {
  userId: string;
}

export interface ListKubernetesClustersByOwnerResult extends ServiceResult {
  data?: Array<Record<string, unknown>>;
}
