/**
 * Structured JSON logger. k8s log shippers (Loki, Datadog) all parse the
 * single-line JSON the default pino formatter emits — no pretty-printing
 * in production.
 */
import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: "ahura-ft-runner",
    version: process.env.APP_VERSION ?? "0.1.0",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
