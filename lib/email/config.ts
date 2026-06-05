import { siteConfig } from "@/config/site";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export interface EmailConfig {
  from: string;
  replyTo?: string;
  supportUrl: string;
  appUrl: string;
  logoUrl: string;
}

// Default sending domain for transactional email. Override per-environment with
// RESEND_DOMAIN (e.g. a staging/test domain) or pin a full address via
// RESEND_FROM_EMAIL / RESEND_REPLY_TO.
const DEFAULT_EMAIL_DOMAIN = "ahurasense.com";

export function getEmailConfig(): EmailConfig {
  const appUrl = trimTrailingSlash(
    process.env.DOMAIN || siteConfig.domain,
  );

  const domain = process.env.RESEND_DOMAIN || DEFAULT_EMAIL_DOMAIN;

  // Transactional mail is sent from a no-reply identity with a friendly display
  // name; replies route to support. Both can be overridden via env.
  const from =
    process.env.RESEND_FROM_EMAIL || `${siteConfig.name} <noreply@${domain}>`;

  const replyTo = process.env.RESEND_REPLY_TO || `support@${domain}`;

  return {
    from,
    replyTo,
    appUrl,
    supportUrl: `${appUrl}/support`,
    logoUrl: siteConfig.images.logo,
  };
}
