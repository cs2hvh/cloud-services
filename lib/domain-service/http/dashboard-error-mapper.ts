import { NextResponse } from "next/server";
import { mapDomainErrorToHttp, toDomainServiceError } from "@/lib/domain-service/core/errors";

export function toDashboardDomainErrorResponse(error: unknown) {
  const mapped = mapDomainErrorToHttp(toDomainServiceError(error));
  return NextResponse.json(
    {
      error: mapped.code,
      message: mapped.message,
      details: mapped.details,
    },
    { status: mapped.status }
  );
}

export function dashboardValidationError(message: string, details?: unknown) {
  return NextResponse.json(
    {
      error: "VALIDATION_ERROR",
      message,
      details,
    },
    { status: 400 }
  );
}
