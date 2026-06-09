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
const DEFAULT_APP_URL = "https://ahurasense.com";

// Email links must never point at localhost or an unset host. Prefer DOMAIN /
// NEXT_PUBLIC_SITE_URL, but fall back to the production domain when those are
// missing or a dev host — a customer email should always resolve.
function resolveAppUrl(): string {
  const raw = trimTrailingSlash(
    process.env.DOMAIN || process.env.NEXT_PUBLIC_SITE_URL || "",
  );
  if (!raw || raw.includes("localhost") || raw.includes("127.0.0.1")) {
    return DEFAULT_APP_URL;
  }
  return raw;
}

export function getEmailConfig(): EmailConfig {
  const appUrl = resolveAppUrl();

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
    supportUrl: `${appUrl}/contact`,
    logoUrl: siteConfig.images.logo,
  };
}
