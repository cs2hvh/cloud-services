/**
 * Verify the platform's HuggingFace account can actually download a (gated)
 * base model BEFORE we provision a GPU for it.
 *
 * Without this, a gated base 403s deep inside the training pod ~8 min in —
 * after we've already paid for boot + the multi-GB image pull, and the
 * customer sees a cryptic failure. This is a cheap authenticated HEAD that
 * fails fast at submit time so no GPU ever spins up for a model we can't read.
 */

const HF_BASE = "https://huggingface.co";

function hfToken(): string | null {
  return (
    process.env.HUGGINGFACE_HUB_TOKEN?.trim() ||
    process.env.HF_TOKEN?.trim() ||
    null
  );
}

export type HfAccess = "ok" | "denied" | "no-token" | "unknown";

/**
 * Probe read access to a model's config.json with the platform token.
 *  - "ok":       token can read the repo
 *  - "denied":   repo is gated and the token isn't approved (403) or invalid (401)
 *  - "no-token": no HF token configured — gated models can't be downloaded at all
 *  - "unknown":  HF unreachable / timed out / unexpected status — callers should
 *                NOT hard-block on this (the training pod is the final gate)
 */
export async function checkHuggingFaceAccess(hfId: string): Promise<HfAccess> {
  const token = hfToken();
  if (!token) return "no-token";

  const url = `${HF_BASE}/${encodeURI(hfId)}/resolve/main/config.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "follow",
      signal: controller.signal,
    });
    if (resp.status === 200) return "ok";
    if (resp.status === 401 || resp.status === 403) return "denied";
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}
