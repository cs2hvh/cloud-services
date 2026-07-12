// GET  /api/v1/compute/instances/{instanceId}/resize — list resize targets
// POST /api/v1/compute/instances/{instanceId}/resize — { type } start a resize
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1ComputeFlowError,
  v1ExtractInstanceId,
  v1LoadOwnedInstance,
} from "@/lib/api/v1-compute-helpers";
import { createWorkerClient } from "@/lib/supabase/server";
import { getLinodeResizeOptions } from "@/lib/services/compute/providers/linode/ops";
import { startLinodeResizeFlow } from "@/lib/services/compute/providers/linode/flows";
import { resizeComputeInstanceSchema } from "@/lib/validation/compute";

export const GET = withV1Auth("compute:resize:options", async (_req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  const supabase = await createWorkerClient();
  const { server, error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "access");
  if (error) return error;

  if (server!.provider !== "linode") {
    return v1Error("NOT_SUPPORTED", 400, "Resize is not supported for this server");
  }
  if (!server!.location) {
    return v1Error("INVALID_STATE", 422, "Instance is not fully provisioned");
  }

  try {
    const options = await getLinodeResizeOptions(
      {
        id: instanceId!,
        linode_id: (server!.linode_id as number | null) ?? null,
        location: (server!.location as string | null) ?? null,
        plan_slug: (server!.plan_slug as string | null) ?? null,
        memory_mb: (server!.memory_mb as number | null) ?? null,
        disk_gb: (server!.disk_gb as number | null) ?? null,
      },
      supabase
    );
    return v1Ok({ data: options });
  } catch (e) {
    console.error("[v1/compute:resize] options failed:", e instanceof Error ? e.message : e);
    return v1Error("INTERNAL_ERROR", 500, "Unable to load resize options");
  }
});

export const POST = withV1Auth("compute:resize", async (req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = resizeComputeInstanceSchema.safeParse(body);
  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const supabase = await createWorkerClient();
  const { server, error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "modify");
  if (error) return error;

  if (server!.provider !== "linode") {
    return v1Error("NOT_SUPPORTED", 400, "Resize is not supported for this server");
  }

  // Shared flow (same as the dashboard): validates the target against the
  // synced catalog, gates on funds, starts the upstream migration, and
  // re-rates the billing meter in the background once it settles.
  const result = await startLinodeResizeFlow({
    supabase,
    server: {
      id: instanceId!,
      status: (server!.status as string | null) ?? null,
      linode_id: (server!.linode_id as number | null) ?? null,
      location: (server!.location as string | null) ?? null,
      plan_slug: (server!.plan_slug as string | null) ?? null,
      memory_mb: (server!.memory_mb as number | null) ?? null,
      disk_gb: (server!.disk_gb as number | null) ?? null,
      details: (server!.details as Record<string, unknown> | null) ?? null,
      billing_service_id: (server!.billing_service_id as string | null) ?? null,
    },
    userId: auth.userId,
    planSlug: validation.data.type,
  });

  if (!result.ok) return v1ComputeFlowError(result);

  return v1Ok(
    {
      data: {
        id: instanceId,
        status: "resizing",
      },
    },
    202
  );
});
