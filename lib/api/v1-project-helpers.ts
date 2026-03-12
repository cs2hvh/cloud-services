import { v1Error } from "@/lib/api/v1-middleware";
import type { NextResponse } from "next/server";

type ProjectServiceFailure = {
  error: string;
  errorCode: string;
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
