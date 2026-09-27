import { z } from "zod";

/**
 * What a model id may look like on the way in.
 *
 * Every catalog id and alias, and every id seen in usage over the last 30
 * days, fits this (checked 2026-09-27: at most 38 characters, no character
 * outside the set). The bound matters beyond tidiness: the usage consumer
 * looks up pricing for a whole queue batch in one PostgREST `in` filter, so
 * one id that broke that query (too long for the URL, or full of the filter's
 * own punctuation) failed the lookup for everyone batched with it and sent
 * every tenant's usage to the dead-letter queue (2026-09-27 security scan,
 * F14).
 */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/@+-]{1,128}$/;

export function isSafeModelId(id: unknown): id is string {
  return typeof id === "string" && MODEL_ID_PATTERN.test(id);
}

export const modelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(MODEL_ID_PATTERN, "model must be a catalog id: letters, digits and . _ : / @ + - only");
