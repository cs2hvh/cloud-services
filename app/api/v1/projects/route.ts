// GET /api/v1/projects — list projects available to authenticated user
// POST /api/v1/projects — create a new project
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { v1ProjectServiceError } from "@/lib/api/v1-project-helpers";
import { ProjectService } from "@/lib/services/project-service";
import { createProjectSchema } from "@/lib/validation/projects";

export const GET = withV1Auth("projects:list", async (_req, auth) => {
  const result = await ProjectService.listProjects(auth.userId);

  if (!result.success) {
    return v1ProjectServiceError(result, "INTERNAL_ERROR", "Failed to fetch projects");
  }

  return v1Ok({
    data: result.data,
    meta: {
      total: result.data.length,
    },
  });
});

export const POST = withV1Auth("projects:create", async (req, auth) => {
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }

  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};
  const validation = createProjectSchema.safeParse(body);

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await ProjectService.createProject({
    userId: auth.userId,
    payload: validation.data,
  });

  if (!result.success) {
    return v1ProjectServiceError(result, "CREATE_FAILED", "Failed to create project");
  }

  return v1Ok({ data: result.data }, 201);
});
