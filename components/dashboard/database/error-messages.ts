import { AxiosError } from "axios";

type DatabaseErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
  hint?: string;
};

const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: "Some inputs are invalid. Please review the form and try again.",
  401: "Your session has expired. Please sign in again.",
  402: "You do not have enough credits to complete this action.",
  403: "You do not have permission to perform this action.",
  404: "The requested database resource was not found.",
  409: "This action conflicts with the current database state.",
  422: "This action is not supported for the selected configuration.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again shortly.",
  503: "Service is temporarily busy. Please try again shortly.",
};

/**
 * Read-time brand scrub — last line of defence so a provider name from an
 * upstream/legacy error string can never reach the customer, even if a source
 * message was missed. Mirrors the inference customerSafeErrorMessage approach.
 */
function scrubProvider(message: string): string {
  return message
    .replace(/\bdigital ?ocean\b/gi, "the database provider")
    .replace(/\bdroplets?\b/gi, "nodes")
    .replace(/\bdoadmin\b/gi, "the admin user")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isTechnicalMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid_enum_value") ||
    normalized.includes("invalid_type") ||
    normalized.includes("zod") ||
    normalized.includes("stack") ||
    normalized.includes("unknown error occurred") ||
    normalized.includes("request failed with status code")
  );
}

function mapKnownError(rawMessage: string): string | null {
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("invalid_enum_value") ||
    normalized.includes("maintenance") ||
    normalized.includes("day must be one of")
  ) {
    return "Maintenance window values are invalid. Choose a valid day and time.";
  }

  if (
    normalized.includes("insufficient credits") ||
    normalized.includes("insufficient balance")
  ) {
    return "You do not have enough credits to complete this action.";
  }

  if (
    normalized.includes("too many requests") ||
    normalized.includes("rate limit")
  ) {
    return "Too many requests right now. Please try again in a few seconds.";
  }

  if (
    normalized.includes("database_has_active_links") ||
    normalized.includes("active integrations")
  ) {
    return "This database is linked to active apps. Unlink them first or use force delete.";
  }

  if (
    normalized.includes("unsupported") ||
    normalized.includes("not supported for mongodb")
  ) {
    return "This action is currently unavailable for MongoDB clusters.";
  }

  if (
    normalized.includes("cannot delete admin user") ||
    (normalized.includes("doadmin") &&
      (normalized.includes("delete") || normalized.includes("remove")))
  ) {
    return "Cannot delete admin user.";
  }

  return null;
}

export function getDatabaseErrorMessage(
  error: unknown,
  defaultMessage: string
): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const payload = (error.response?.data || {}) as DatabaseErrorPayload;

    const rawMessage = `${payload.message || ""} ${payload.error || ""} ${payload.code || ""}`.trim();
    const mappedKnown = rawMessage ? mapKnownError(rawMessage) : null;
    if (mappedKnown) return mappedKnown;

    if (status && STATUS_FALLBACK_MESSAGES[status]) {
      return STATUS_FALLBACK_MESSAGES[status];
    }

    if (payload.message && !isTechnicalMessage(payload.message)) {
      return scrubProvider(payload.message);
    }

    if (payload.error && !isTechnicalMessage(payload.error)) {
      return scrubProvider(payload.error);
    }

    return defaultMessage;
  }

  if (error instanceof Error && !isTechnicalMessage(error.message)) {
    return scrubProvider(error.message);
  }

  return defaultMessage;
}
