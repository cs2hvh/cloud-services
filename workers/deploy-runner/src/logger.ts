/**
 * The deploy-runner's named logger instance, built from runner-core's factory.
 * Re-exported so the rest of the codebase keeps importing `{ logger }` from
 * "./logger.js" unchanged.
 */
import { makeLogger, type Logger } from "@ahura/runner-core";

export const logger = makeLogger("ahura-deploy-runner");
export type { Logger };
