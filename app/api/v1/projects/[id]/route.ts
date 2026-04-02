// GET /api/v1/projects/[id] — get project by ID
// PATCH /api/v1/projects/[id] — update project metadata
// DELETE /api/v1/projects/[id] — delete a project
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractId, v1TransformValidationError } from "@/lib/api/v1-helpers";
import { serializeProjectForV1, v1ProjectServiceError } from "@/lib/api/v1-project-helpers";
import { ProjectService } from "@/lib/services/project-service";
import { updateProjectSchema } from "@/lib/validation/projects";

export const GET = withV1Auth("projects:get", async (_req, auth, context) => {
  const { id, error } = await v1ExtractId(context);
  if (error) {
    return error;
  }

  const result = await ProjectService.getProject({
    projectId: id,
    userId: auth.userId,
  });

  if (!result.success) {
    return v1ProjectServiceError(result, "INTERNAL_ERROR", "Failed to fetch project");
  }

  return v1Ok({ data: serializeProjectForV1(result.data) });
});

export const PATCH = withV1Auth("projects:update", async (req, auth, context) => {
  const { id, error } = await v1ExtractId(context);
  if (error) {
    return error;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }

  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};
  const validation = updateProjectSchema.safeParse(body);

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await ProjectService.updateProject({
    projectId: id,
    userId: auth.userId,
    payload: validation.data,
  });

  if (!result.success) {
    return v1ProjectServiceError(result, "UPDATE_FAILED", "Failed to update project");
  }

  return v1Ok({ data: serializeProjectForV1(result.data) });
});

export const DELETE = withV1Auth("projects:delete", async (_req, auth, context) => {
  const { id, error } = await v1ExtractId(context);
  if (error) {
    return error;
  }

  const result = await ProjectService.deleteProject({
    projectId: id,
    userId: auth.userId,
  });

  if (!result.success) {
    return v1ProjectServiceError(result, "DELETE_FAILED", "Failed to delete project");
  }

  return v1Ok({ data: result.data });
});
