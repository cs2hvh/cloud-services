/**
 * Structured JSON logger. k8s log shippers (Loki, Datadog) parse the single-
 * line JSON pino emits — no pretty-printing in production. Each runner names
 * itself via `service`.
 */
import { pino } from "pino";

export function makeLogger(service: string, version?: string) {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: {
      service,
      version: version ?? process.env.APP_VERSION ?? "0.1.0",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof makeLogger>;
