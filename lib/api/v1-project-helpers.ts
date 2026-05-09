import { v1Error } from "@/lib/api/v1-middleware";
import type { NextResponse } from "next/server";

type ProjectServiceFailure = {
  error: string;
  errorCode: string;
};

type ProjectV1Response = {
  id: string;
  name: string;
  description: string | null;
  users: string[];
  created_at: string | null;
  default_project: boolean | null;
};

type ProjectServiceModel = ProjectV1Response & {
  owner_id?: string | null;
};

export function v1ProjectServiceError(
  failure: ProjectServiceFailure,
  fallbackCode: string,
  fallbackMessage: string
): NextResponse {
  const message = failure.error || fallbackMessage;

  switch (failure.errorCode) {
    case "NOT_FOUND":
      return v1Error("NOT_FOUND", 404, message);
    case "FORBIDDEN":
      return v1Error("FORBIDDEN", 403, message);
    case "ALREADY_EXISTS":
      return v1Error("ALREADY_EXISTS", 409, message);
    default:
      return v1Error(fallbackCode, 500, message);
  }
}

export function serializeProjectForV1(project: ProjectServiceModel): ProjectV1Response {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    users: project.users,
    created_at: project.created_at,
    default_project: project.default_project,
  };
}
