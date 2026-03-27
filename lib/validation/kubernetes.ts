import { z } from "zod";
import { VALID_DATABASE_REGIONS } from "./constants";

/**
 * Kubernetes Cluster Name Validation
 * Must follow DNS-1123 subdomain naming rules
 */
const clusterNameSchema = z
  .string()
  .min(3, "Cluster name must be at least 3 characters")
  .max(63, "Cluster name must be at most 63 characters")
  .regex(
    /^[a-z]([-a-z0-9]*[a-z0-9])?$/,
    "Cluster name must start with a letter, end with alphanumeric, and contain only lowercase letters, numbers, and hyphens"
  );

/**
 * Valid Kubernetes versions available on DigitalOcean
 * Update this list periodically
 */
const VALID_K8S_VERSIONS = [
  "1.29.1-do.0",
  "1.28.6-do.0",
  "1.27.10-do.0",
] as const;

/**
 * Valid node pool sizes for Kubernetes clusters
 * Based on DigitalOcean droplet slugs
 */
const VALID_NODE_SIZES = [
  "s-1vcpu-2gb",
  "s-2vcpu-2gb",
  "s-2vcpu-4gb",
  "s-4vcpu-8gb",
  "s-8vcpu-16gb",
  "c-2",
  "c-4",
  "c-8",
  "c-16",
  "m-2vcpu-16gb",
  "m-4vcpu-32gb",
  "m-8vcpu-64gb",
] as const;

/**
 * Kubernetes Cluster Creation Schema for API
 * Validates payload before forwarding to DigitalOcean API
 */
export const createKubernetesClusterSchema = z.object({
  name: clusterNameSchema,
  region: z.enum(VALID_DATABASE_REGIONS, {
    errorMap: () => ({
      message: `Region must be one of: ${VALID_DATABASE_REGIONS.join(", ")}`,
    }),
  }),
  version: z.string().refine(
    (val) => VALID_K8S_VERSIONS.includes(val as typeof VALID_K8S_VERSIONS[number]) || /^\d+\.\d+\.\d+/.test(val),
    { message: "Version must be a valid Kubernetes version (e.g., '1.29.1-do.0')" }
  ),
  node_pool: z.object({
    size: z.string().refine(
      (val) => VALID_NODE_SIZES.includes(val as typeof VALID_NODE_SIZES[number]) || /^[scm]-\d+vcpu-\d+gb/.test(val),
      { message: "Node size must be a valid DigitalOcean droplet size (e.g., 's-2vcpu-4gb', 'c-4', 'm-4vcpu-32gb')" }
    ),
    count: z
      .number()
      .int("Node count must be an integer")
      .min(1, "At least 1 node is required")
      .max(20, "Maximum 20 nodes allowed per pool"),
    name: z.string().min(1).max(50).optional(),
  }),
  project_id: z.string().uuid("project_id must be a valid UUID"),
  plan_id: z.string().uuid("plan_id must be a valid UUID"),
  owner_id: z.string().uuid("owner_id must be a valid UUID"),
});

export type CreateKubernetesClusterPayload = z.infer<typeof createKubernetesClusterSchema>;

/**
 * Legacy schema for dashboard compatibility
 */
export const kubernetesClusterSchema = z.object({
  name: z.string()
    .min(3, "Name must be at least 3 characters")
    .regex(/^(?=.*[a-zA-Z].*[a-zA-Z])[a-zA-Z0-9-]+$/, "Name must contain at least 2 letters and only alphanumeric characters or hyphens"),
  nodes: z.number()
    .min(1, "Must have at least 1 node")
    .nonnegative("Number of nodes cannot be negative")
    .int("Number of nodes must be a whole number")
});

/**
 * Update Kubernetes Cluster Schema
 */
export const updateKubernetesClusterSchema = z.object({
  project_id: z.string().uuid("project_id must be a valid UUID").optional(),
  node_pool: z.object({
    size: z.string().optional(),
    count: z.number().int().min(1).max(20).optional(),
  }).optional(),
});