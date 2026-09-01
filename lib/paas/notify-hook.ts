/**
 * Ask the control plane to send an app lifecycle email.
 *
 * THE IMPORT LIST IS THE POINT. This module has no imports at all, and must
 * keep none that reach `@/…` or a `.tsx` file. It is loaded by deploy.ts, which
 * is loaded by the build worker — plain `node --experimental-strip-types`, a
 * runtime with no path aliases and no JSX transform. lib/paas/notifications.ts
 * has both and would take the worker down on startup, which is exactly the
 * class of failure that left builds dead earlier today.
 *
 * So the worker posts, and the Next app sends.
 */

/** Once per process, so a misconfigured server says so without a build spamming it. */
let warnedMissingConfig = false;

/** Matches the schema in app/api/v2/internal/notify/route.ts. */
export interface AppEventHook {
  projectRef: string;
  event: "created" | "deployed" | "failed" | "deleted";
  hostname?: string | null;
  reason?: string | null;
  commit?: string | null;
}

/**
 * Fire and forget. Never throws, never retries.
 *
 * A deployment that succeeded must not be reported as failed because an email
 * did not send, and a build must not be held open waiting on SMTP. Retrying
 * would risk delivering the same "your app is live" twice, which is worse than
 * not sending it once — there is no idempotency key on the far side.
 */
export async function notifyAppEventRemote(hook: AppEventHook): Promise<void> {
  const token = process.env.BATCH_PROCESSOR_TOKEN || process.env.INTERNAL_CRON_TOKEN;
  const base = (process.env.V2_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

  /*
    Absent configuration is a no-op, but NOT a silent one.

    A developer running the worker locally should not have every build complain
    about a secret they have no reason to hold — so this says its piece once per
    process and then stops. On the server that one line is the difference between
    "emails are configured and quiet" and "emails have never once been sent",
    which otherwise look identical from the outside.

    Absent config silently turning a step into a no-op is the failure this
    codebase keeps rediscovering: it is how DNS records went uncreated, how the
    kubeconfig fell through to a Windows path, and how a sweep reported success
    while every write was refused.
  */
  if (!token || !base) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      const missing = [!base && "V2_PUBLIC_APP_URL", !token && "BATCH_PROCESSOR_TOKEN"]
        .filter(Boolean)
        .join(" and ");
      console.log(`[paas/notify] NOT SENDING lifecycle emails — ${missing} is not set.`);
    }
    return;
  }

  try {
    const res = await fetch(`${base}/api/v2/internal/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ahura-Internal-Token": token },
      body: JSON.stringify(hook),
      // A notification is not worth holding a build machine open for.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.log(`[paas/notify] ${hook.event} for ${hook.projectRef} -> ${res.status}`);
    }
  } catch (err) {
    console.log(
      `[paas/notify] ${hook.event} for ${hook.projectRef} could not be sent: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
