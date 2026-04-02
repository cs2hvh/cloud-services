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

export function getEmailConfig(): EmailConfig {
  const appUrl = trimTrailingSlash(
    process.env.DOMAIN || siteConfig.domain,
  );

  const from =
    process.env.RESEND_FROM_EMAIL ||
    (process.env.RESEND_DOMAIN
      ? `support@${process.env.RESEND_DOMAIN}`
      : "support@example.com");

  const replyTo = process.env.RESEND_REPLY_TO || from;

  return {
    from,
    replyTo,
    appUrl,
    supportUrl: `${appUrl}/support`,
    logoUrl: siteConfig.images.logo,
  };
}
