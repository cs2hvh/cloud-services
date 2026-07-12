// POST /api/v1/compute/instances/{instanceId}/actions — power management
//   { action: "boot" | "reboot" | "shutdown" }
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { v1ExtractInstanceId, v1LoadOwnedInstance } from "@/lib/api/v1-compute-helpers";
import { createWorkerClient } from "@/lib/supabase/server";
import { linodePower } from "@/lib/services/compute/providers/linode/ops";
import { computeActionSchema } from "@/lib/validation/compute";

/** v1 wire action → provider power op. */
const ACTION_MAP = {
  boot: "start",
  reboot: "reboot",
  shutdown: "stop",
} as const;

export const POST = withV1Auth("compute:action", async (req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = computeActionSchema.safeParse(body);
  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const supabase = await createWorkerClient();
  const { server, error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "modify");
  if (error) return error;

  if (server!.provider !== "linode") {
    return v1Error("NOT_SUPPORTED", 400, "Power actions are not supported for this server");
  }
  if (!server!.linode_id) {
    return v1Error("INVALID_STATE", 422, "Instance is still provisioning");
  }

  const action = validation.data.action;
  try {
    const result = await linodePower(
      {
        id: instanceId!,
        linode_id: server!.linode_id as number,
        location: (server!.location as string | null) ?? null,
        plan_slug: (server!.plan_slug as string | null) ?? null,
      },
      ACTION_MAP[action]
    );

    // Optimistic final status — realtime sync corrects if the action stalls.
    await supabase.from("servers").update({ status: result.status }).eq("id", instanceId!);

    return v1Ok({
      data: {
        id: instanceId,
        action,
        status: result.status,
      },
    });
  } catch (e) {
    console.error("[v1/compute:action] power action failed:", e instanceof Error ? e.message : e);
    return v1Error("PROVIDER_ERROR", 502, `Unable to ${action} the instance. Please try again later.`);
  }
});
