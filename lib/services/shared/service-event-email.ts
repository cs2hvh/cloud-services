import { emailService } from "@/lib/email";
import { getEmailConfig } from "@/lib/email/config";
import type { ServiceEventKind } from "@/lib/email/types";
import { resolveUserEmail } from "@/lib/services/shared/service-alert-email";

function recipientName(email: string): string {
  const local = email.split("@")[0] || "there";
  return local.replace(/[._-]+/g, " ").trim() || "there";
}

export type SendServiceEventParams = {
  /** Provide a recipient email directly, or a userId to resolve it. One required. */
  userEmail?: string | null;
  userId?: string | null;
  /** Human service label, e.g. "Virtual Server", "Managed Database", "Domain". */
  serviceType: string;
  /** The resource's name / identifier. */
  serviceName: string;
  /** Lifecycle event. */
  event: ServiceEventKind;
  /** Detail rows for the card (region, plan, IP, cost, expiry, …). */
  items?: Array<{ label: string; value: string }>;
  /** One-line summary override (otherwise derived from the event). */
  summary?: string;
  /** Error detail for `failed` events. */
  errorMessage?: string;
  /** Relative dashboard path for the CTA (joined to the app URL). */
  actionPath?: string;
  actionLabel?: string;
};

/**
 * Fire-and-forget service lifecycle email (created / ready / deleted / purchased / …).
 *
 * Resolves the recipient (direct email or via userId), renders the shared
 * `serviceEvent` template, and NEVER throws — provisioning, billing, and CRUD
 * paths call it without having to guard their own flow. No-ops when there is no
 * recipient or email delivery isn't configured.
 */
export async function sendServiceEventEmail(
  params: SendServiceEventParams,
): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return;

    const to = params.userEmail || (await resolveUserEmail(params.userId));
    if (!to) return;

    const { appUrl } = getEmailConfig();
    const actionUrl = params.actionPath
      ? `${appUrl}${params.actionPath.startsWith("/") ? "" : "/"}${params.actionPath}`
      : undefined;

    await emailService.sendTemplate({
      template: "serviceEvent",
      to,
      data: {
        recipientName: recipientName(to),
        serviceType: params.serviceType,
        serviceName: params.serviceName,
        event: params.event,
        items: params.items,
        summary: params.summary,
        errorMessage: params.errorMessage,
        actionUrl,
        actionLabel: params.actionLabel,
      },
    });
  } catch (err) {
    console.error("[service-event-email] send failed", err);
  }
}
