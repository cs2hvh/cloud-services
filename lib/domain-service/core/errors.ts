export const DOMAIN_ERROR_CODES = {
  DOMAIN_NOT_FOUND: "DOMAIN_NOT_FOUND",
  DOMAIN_ALREADY_IN_USE: "DOMAIN_ALREADY_IN_USE",
  DOMAIN_NOT_VERIFIED: "DOMAIN_NOT_VERIFIED",
  DOMAIN_NOT_ACTIVE: "DOMAIN_NOT_ACTIVE",
  DOMAIN_NOT_AVAILABLE: "DOMAIN_NOT_AVAILABLE",
  DOMAIN_INVALID: "DOMAIN_INVALID",
  APP_NOT_FOUND: "APP_NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  OPERATION_NOT_FOUND: "OPERATION_NOT_FOUND",
  PURCHASE_REQUEST_NOT_FOUND: "PURCHASE_REQUEST_NOT_FOUND",
  OPERATION_IN_PROGRESS: "OPERATION_IN_PROGRESS",
  PROVIDER_UNAUTHORIZED: "PROVIDER_UNAUTHORIZED",
  PROVIDER_PAYMENT_REQUIRED: "PROVIDER_PAYMENT_REQUIRED",
  PROVIDER_VALIDATION_FAILED: "PROVIDER_VALIDATION_FAILED",
  PROVIDER_RATE_LIMITED: "PROVIDER_RATE_LIMITED",
  INGRESS_APPLY_FAILED: "INGRESS_APPLY_FAILED",
  INTEGRATION_CONFIG_ERROR: "INTEGRATION_CONFIG_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type DomainErrorCode = typeof DOMAIN_ERROR_CODES[keyof typeof DOMAIN_ERROR_CODES];

export class DomainServiceError extends Error {
  code: DomainErrorCode;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(params: {
    code: DomainErrorCode;
    message: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = "DomainServiceError";
    this.code = params.code;
    this.retryable = params.retryable ?? false;
    this.details = params.details;
  }
}

export function toDomainServiceError(error: unknown): DomainServiceError {
  if (error instanceof DomainServiceError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unknown domain service error";
  return new DomainServiceError({
    code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
    message,
  });
}

export function mapDomainErrorToHttp(error: DomainServiceError): {
  status: number;
  code: DomainErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  switch (error.code) {
    case DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND:
    case DOMAIN_ERROR_CODES.OPERATION_NOT_FOUND:
    case DOMAIN_ERROR_CODES.PURCHASE_REQUEST_NOT_FOUND:
    case DOMAIN_ERROR_CODES.APP_NOT_FOUND:
      return { status: 404, code: error.code, message: error.message, details: error.details };
    case DOMAIN_ERROR_CODES.FORBIDDEN:
      return { status: 403, code: error.code, message: error.message, details: error.details };
    case DOMAIN_ERROR_CODES.DOMAIN_INVALID:
    case DOMAIN_ERROR_CODES.DOMAIN_NOT_VERIFIED:
    case DOMAIN_ERROR_CODES.DOMAIN_NOT_ACTIVE:
    case DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED:
      return { status: 400, code: error.code, message: error.message, details: error.details };
    case DOMAIN_ERROR_CODES.DOMAIN_ALREADY_IN_USE:
    case DOMAIN_ERROR_CODES.DOMAIN_NOT_AVAILABLE:
    case DOMAIN_ERROR_CODES.OPERATION_IN_PROGRESS:
      return { status: 409, code: error.code, message: error.message, details: error.details };
    case DOMAIN_ERROR_CODES.PROVIDER_UNAUTHORIZED:
      return { status: 502, code: error.code, message: error.message, details: error.details };
    case DOMAIN_ERROR_CODES.PROVIDER_PAYMENT_REQUIRED:
      return { status: 402, code: error.code, message: error.message, details: error.details };
    case DOMAIN_ERROR_CODES.PROVIDER_RATE_LIMITED:
      return { status: 429, code: error.code, message: error.message, details: error.details };
    case DOMAIN_ERROR_CODES.INGRESS_APPLY_FAILED:
      return { status: 502, code: error.code, message: error.message, details: error.details };
    case DOMAIN_ERROR_CODES.INTEGRATION_CONFIG_ERROR:
    case DOMAIN_ERROR_CODES.INTERNAL_ERROR:
    default:
      return { status: 500, code: error.code, message: error.message, details: error.details };
  }
}
