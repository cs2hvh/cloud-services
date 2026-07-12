import { z } from "zod";

/**
 * Compute Instance Validation (public v1 API)
 *
 * Mirrors the server-side rules enforced by the Linode create/rebuild
 * pipelines (lib/services/compute/providers/linode/*): label follows Linode's
 * 3-64 char rule, root_pass follows Linode's 11-128 length floor (character
 * class strength is re-checked by validateRootPassword in the provider).
 */

const LABEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/;

const labelSchema = z
  .string()
  .min(3, "Label must be at least 3 characters")
  .max(64, "Label must be at most 64 characters")
  .regex(
    LABEL_PATTERN,
    "Label must be 3-64 characters of letters, numbers, dots, dashes or underscores, starting and ending with a letter or number"
  );

const rootPassSchema = z
  .string()
  .min(11, "Root password must be at least 11 characters")
  .max(128, "Root password must be at most 128 characters");

const sshKeyIdsSchema = z
  .array(z.string().uuid("Each SSH key ID must be a valid UUID"))
  .max(25, "At most 25 SSH keys may be attached")
  .optional();

/**
 * POST /api/v1/compute/instances
 */
export const createComputeInstanceSchema = z.object({
  label: labelSchema,
  region: z.string().min(1, "region is required"),
  type: z.string().min(1, "type is required"),
  image: z.string().min(1, "image is required"),
  root_pass: rootPassSchema,
  ssh_key_ids: sshKeyIdsSchema,
  backups_enabled: z.boolean().optional(),
  disk_encryption: z.boolean().optional(),
});

export type CreateComputeInstancePayload = z.infer<typeof createComputeInstanceSchema>;

/**
 * POST /api/v1/compute/instances/{instanceId}/resize
 */
export const resizeComputeInstanceSchema = z.object({
  type: z.string().min(1, "type is required"),
});

export type ResizeComputeInstancePayload = z.infer<typeof resizeComputeInstanceSchema>;

/**
 * POST /api/v1/compute/instances/{instanceId}/rebuild
 */
export const rebuildComputeInstanceSchema = z.object({
  image: z.string().min(1, "image is required"),
  root_pass: rootPassSchema,
  ssh_key_ids: sshKeyIdsSchema,
});

export type RebuildComputeInstancePayload = z.infer<typeof rebuildComputeInstanceSchema>;

/**
 * PATCH /api/v1/compute/instances/{instanceId}
 */
export const updateComputeInstanceSchema = z.object({
  label: labelSchema,
});

export type UpdateComputeInstancePayload = z.infer<typeof updateComputeInstanceSchema>;

/**
 * POST /api/v1/compute/instances/{instanceId}/actions — power management
 */
export const computeActionSchema = z.object({
  action: z.enum(["boot", "reboot", "shutdown"], {
    errorMap: () => ({ message: "action must be one of: boot, reboot, shutdown" }),
  }),
});

export type ComputeActionPayload = z.infer<typeof computeActionSchema>;

/**
 * POST /api/v1/compute/instances/{instanceId}/backups
 */
export const computeBackupsActionSchema = z.object({
  action: z.enum(["enable", "cancel", "snapshot", "restore"], {
    errorMap: () => ({ message: "action must be one of: enable, cancel, snapshot, restore" }),
  }),
  label: z.string().max(64, "Snapshot label is too long").optional(),
  backup_id: z.number().int("backup_id must be an integer").positive("backup_id must be positive").optional(),
});

export type ComputeBackupsActionPayload = z.infer<typeof computeBackupsActionSchema>;
