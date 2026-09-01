/**
 * Lifecycle emails for v2 apps.
 *
 * Every other service on the platform tells its owner when something happens to
 * their resource — databases, Kubernetes clusters, object storage and spectrum
 * all call sendServiceAlertEmail. Apps did not, so a customer whose build
 * failed at 2am found out by opening the dashboard.
 *
 * THIS MODULE IS NEXT-ONLY. It reaches the email service through `@/` aliases
 * and React templates, neither of which exists in the build worker's runtime
 * (`node --experimental-strip-types` resolves no path aliases and does not
 * transform JSX). The worker reaches these events through the internal route in
 * app/api/v2/internal/notify, which calls straight into here — one copy of the
 * wording, two ways in.
 */
import { sendServiceAlertEmail, resolveUserEmail } from "@/lib/services/shared/service-alert-email";
import { createServiceClient } from "@/lib/supabase/server";

export type AppLifecycleEvent = "created" | "deployed" | "failed" | "deleted";

export interface AppNotification {
  /** Project ref — `prj-…`. The email says the app's name, not this. */
  projectRef: string;
  event: AppLifecycleEvent;
  /** Where it is serving, when there is somewhere. */
  hostname?: string | null;
  /** The customer-facing failure text, already scrubbed by errors.ts. */
  reason?: string | null;
  /** Short commit sha, when the event came from a build. */
  commit?: string | null;
}

/**
 * The owner of the team that holds this project.
 *
 * paas.teams.created_by is the account that pays for the app, which is who a
 * bill or an outage concerns. Team membership is not modelled as multiple
 * recipients yet; when it is, this is the single place that has to learn about
 * it.
 */
async function ownerOf(projectRef: string): Promise<{
  email?: string;
  appName: string;
} | null> {
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .schema("paas")
    .from("projects")
    .select("name, slug, team:teams!inner(created_by)")
    .eq("ref", projectRef)
    .maybeSingle();

  if (error || !data) return null;

  // Supabase types an embedded row as an array in some shapes and an object in
  // others depending on the relationship it infers. Reading it defensively is
  // cheaper than being wrong at runtime in a notification path.
  const team = data.team as unknown;
  const createdBy = Array.isArray(team)
    ? (team[0] as { created_by?: string } | undefined)?.created_by
    : (team as { created_by?: string } | null)?.created_by;

  return {
    email: await resolveUserEmail(createdBy),
    appName: (data.name as string) || (data.slug as string) || projectRef,
  };
}

/** Subject line and body, per event. Written for the person, not the system. */
function copyFor(
  event: AppLifecycleEvent,
  appName: string,
  n: AppNotification,
): { title: string; summary: string; severity: "info" | "warning" | "critical" } {
  switch (event) {
    case "created":
      return {
        title: `App created — ${appName}`,
        summary:
          `Your app "${appName}" has been created and its first deployment has started. ` +
          `We'll email you again when it is live, or if the build does not succeed.`,
        severity: "info",
      };
    case "deployed":
      return {
        title: `App deployed — ${appName}`,
        summary: n.hostname
          ? `Your app "${appName}" is live at https://${n.hostname}.`
          : `Your app "${appName}" has been deployed and is running.`,
        severity: "info",
      };
    case "failed":
      return {
        title: `Deployment failed — ${appName}`,
        // The reason is already customer-facing: errors.ts converts anything
        // that is not an explicit CustomerError into a generic line with a
        // reference. Passing it through is safe; composing our own here would
        // route around that boundary.
        summary:
          `The latest deployment of "${appName}" did not complete.` +
          (n.reason ? ` ${n.reason}` : "") +
          ` The previous version, if there was one, is still serving.`,
        severity: "warning",
      };
    case "deleted":
      return {
        title: `App deleted — ${appName}`,
        summary:
          `Your app "${appName}" has been deleted and is no longer serving. ` +
          `Billing has stopped. Its deployment history is retained for your records.`,
        severity: "info",
      };
  }
}

/**
 * Send one lifecycle email. Never throws.
 *
 * A notification that fails must not fail the thing it is describing — a deploy
 * that worked has to stay worked even when Resend is down. sendServiceAlertEmail
 * throws on a rejected send despite its own comment saying otherwise, so the
 * catch here is load-bearing rather than defensive.
 */
export async function notifyAppEvent(n: AppNotification): Promise<void> {
  try {
    const owner = await ownerOf(n.projectRef);
    if (!owner?.email) return; // nobody to tell is not an error

    const { title, summary, severity } = copyFor(n.event, owner.appName, n);

    await sendServiceAlertEmail({
      serviceType: "app",
      userEmail: owner.email,
      serviceName: owner.appName,
      alertTitle: title,
      summary,
      severity,
      actionPath: `/dashboard/services/apps/${n.projectRef}`,
      actionLabel: "Open app",
      metadata: {
        App: owner.appName,
        ...(n.hostname ? { Address: n.hostname } : {}),
        ...(n.commit ? { Commit: n.commit } : {}),
      },
    });
  } catch (err) {
    // Logged, not raised. The caller is a deploy or a delete that has already
    // succeeded by the time this runs.
    console.error(`[paas/notify] ${n.event} email for ${n.projectRef} failed:`, err);
  }
}
