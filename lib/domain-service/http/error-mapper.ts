import { mapDomainErrorToHttp, toDomainServiceError } from "@/lib/domain-service/core/errors";
import { v1Error } from "@/lib/api/v1-middleware";

export function toV1DomainErrorResponse(error: unknown) {
  const normalized = toDomainServiceError(error);
  const mapped = mapDomainErrorToHttp(normalized);
  return v1Error(mapped.code, mapped.status, mapped.message, mapped.details);
}
