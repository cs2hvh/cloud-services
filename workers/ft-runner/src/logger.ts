/**
 * The ft-runner's named logger instance, built from runner-core's factory.
 * Re-exported here so the rest of the codebase keeps importing `{ logger }`
 * from "./logger.js" unchanged.
 */
import { makeLogger, type Logger } from "@ahura/runner-core";

export const logger = makeLogger("ahura-ft-runner");
export type { Logger };
