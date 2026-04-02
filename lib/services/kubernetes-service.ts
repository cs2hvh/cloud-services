/**
 * Kubernetes Service - Centralized Business Logic
 *
 * This module composes kubernetes service operations from focused modules.
 */

import { clusterOperations } from "./kubernetes/cluster-operations";

export const KubernetesService = {
  ...clusterOperations,
};

export type {
  CreateKubernetesClusterRequest,
  CreateKubernetesClusterResult,
  GetKubernetesClusterRequest,
  GetKubernetesClusterResult,
  InitKubernetesClusterRequest,
  InitKubernetesClusterResult,
  UpdateKubernetesClusterRequest,
  DeleteKubernetesClusterRequest,
  DeleteKubernetesClusterResult,
  ListKubernetesClustersByOwnerRequest,
  ListKubernetesClustersByOwnerResult,
} from "./kubernetes/types";
