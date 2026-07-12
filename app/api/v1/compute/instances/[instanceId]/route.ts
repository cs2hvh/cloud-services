// GET    /api/v1/compute/instances/{instanceId} — get a compute instance
// PATCH  /api/v1/compute/instances/{instanceId} — update (relabel) an instance
// DELETE /api/v1/compute/instances/{instanceId} — destroy an instance
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  COMPUTE_INSTANCE_COLUMNS,
  serializeComputeInstance,
  v1ExtractInstanceId,
  v1LoadOwnedInstance,
} from "@/lib/api/v1-compute-helpers";
import { createWorkerClient } from "@/lib/supabase/server";
import { renameLinodeInstance } from "@/lib/services/compute/providers/linode/ops";
import { destroyServer } from "@/lib/services/compute/server-lifecycle";
import { updateComputeInstanceSchema } from "@/lib/validation/compute";

export const GET = withV1Auth("compute:get", async (_req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  const supabase = await createWorkerClient();
  const { server, error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "access");
  if (error) return error;

  return v1Ok({
    data: serializeComputeInstance(server!),
  });
});

export const PATCH = withV1Auth("compute:update", async (req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = updateComputeInstanceSchema.safeParse(body);
  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const supabase = await createWorkerClient();
  const { server, error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "modify");
  if (error) return error;

  const newLabel = validation.data.label;
  const { data: updated, error: updateError } = await supabase
    .from("servers")
    .update({ name: newLabel })
    .eq("id", instanceId!)
    .select(COMPUTE_INSTANCE_COLUMNS)
    .single();

  if (updateError) {
    console.error("[v1/compute:update] rename failed:", updateError.message);
    return v1Error("UPDATE_FAILED", 500, "Failed to update instance");
  }

  // Push the rename upstream for Linode rows (best-effort — the DB row is the
  // display truth; a failure here never blocks the rename).
  if (server!.provider === "linode" && server!.linode_id) {
    renameLinodeInstance(
      {
        id: instanceId!,
        linode_id: server!.linode_id as number,
        location: (server!.location as string | null) ?? null,
        plan_slug: (server!.plan_slug as string | null) ?? null,
      },
      newLabel
    ).catch((e) =>
      console.warn(
        "[v1/compute:update] upstream label update failed:",
        e instanceof Error ? e.message : e
      )
    );
  }

  return v1Ok({
    data: serializeComputeInstance(updated as Record<string, unknown>),
  });
});

export const DELETE = withV1Auth("compute:delete", async (_req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  const supabase = await createWorkerClient();
  const { error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "delete");
  if (error) return error;

  // Tears down the provider resource (Linode instance or Proxmox VM), settles
  // billing (prorated final hour + meter removal), and deletes the record.
  const result = await destroyServer(instanceId!);
  if (!result.success) {
    console.error("[v1/compute:delete] teardown failed:", result.message);
    return v1Error("DELETE_FAILED", 500, "Failed to delete instance");
  }

  return v1Ok({
    data: {
      id: instanceId,
      deleted: true,
    },
  });
});
