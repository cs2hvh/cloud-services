import { clusterLifecycleOperations } from "./operations/cluster-lifecycle-operations";
import { clusterReadOperations } from "./operations/cluster-read-operations";

export const clusterOperations = {
  ...clusterLifecycleOperations,
  ...clusterReadOperations,
};
