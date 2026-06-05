import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { getEmailConfig } from "@/lib/email/config";
import { siteConfig } from "@/config/site";
import type { ReactNode } from "react";

// Brand tokens — keep email-safe (solid colors, no gradients in critical paths).
const BRAND = "#0095FF";
const INK = "#0f172a";
const MUTED = "#64748b";

interface BaseEmailLayoutProps {
  preview: string;
  title: string;
  greeting?: string;
  children: ReactNode;
  footerText?: string;
  actionUrl?: string;
  actionLabel?: string;
}

export function BaseEmailLayout({
  preview,
  title,
  greeting,
  children,
  footerText,
  actionUrl,
  actionLabel,
}: BaseEmailLayoutProps) {
  const emailConfig = getEmailConfig();
  const year = new Date().getFullYear();

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.outer}>
          {/* Brand header */}
          <Section style={styles.header}>
            <Text style={styles.wordmark}>
              Ahura<span style={{ color: BRAND }}>Sense</span>{" "}
              <span style={styles.wordmarkSub}>CLOUD</span>
            </Text>
          </Section>

          {/* Card */}
          <Container style={styles.container}>
            <Heading style={styles.heading}>{title}</Heading>
            {greeting ? <Text style={styles.paragraph}>{greeting}</Text> : null}
            <Section style={styles.content}>{children}</Section>
            {actionUrl && actionLabel ? (
              <Section style={{ marginTop: "8px" }}>
                <Button href={actionUrl} style={styles.button}>
                  {actionLabel}
                </Button>
              </Section>
            ) : null}
            <Hr style={styles.hr} />
            <Text style={styles.footerHelp}>
              {footerText || "Need a hand? Our team is here to help."}{" "}
              <Link href={emailConfig.supportUrl} style={styles.link}>
                Contact support
              </Link>
            </Text>
          </Container>

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerLine}>
              {siteConfig.name} — AI &amp; cloud infrastructure, hosted in India.
            </Text>
            <Text style={styles.footerMuted}>
              This is an automated message regarding your {siteConfig.name}{" "}
              account. Please do not reply to this email.
            </Text>
            <Text style={styles.footerMuted}>
              © {year} {siteConfig.name}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailCard({
  children,
  accent = BRAND,
}: {
  children: ReactNode;
  accent?: string;
}) {
  return (
    <Section
      style={{
        ...styles.card,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {children}
    </Section>
  );
}

export function EmailLabelValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Text style={styles.metaLine}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value}</span>
    </Text>
  );
}

export function EmailList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <Section>
      {items.map((item) => (
        <EmailLabelValue key={`${item.label}-${item.value}`} {...item} />
      ))}
    </Section>
  );
}

export function EmailParagraph({ children }: { children: ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

const styles = {
  body: {
    margin: 0,
    padding: "24px 12px",
    backgroundColor: "#eef1f5",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  outer: {
    margin: "0 auto",
    maxWidth: "600px",
  },
  header: {
    padding: "4px 4px 16px",
  },
  wordmark: {
    margin: 0,
    fontSize: "20px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: INK,
  },
  wordmarkSub: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: MUTED,
    verticalAlign: "middle" as const,
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "14px",
    padding: "32px",
    border: "1px solid #e2e8f0",
    borderTop: `3px solid ${BRAND}`,
  },
  heading: {
    fontSize: "24px",
    lineHeight: "30px",
    fontWeight: 700,
    color: INK,
    margin: "0 0 14px",
    letterSpacing: "-0.01em",
  },
  content: {
    marginTop: "4px",
  },
  paragraph: {
    fontSize: "15px",
    lineHeight: "24px",
    color: "#334155",
    margin: "0 0 16px",
  },
  card: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "14px 16px",
    margin: "16px 0",
  },
  button: {
    backgroundColor: BRAND,
    color: "#ffffff",
    borderRadius: "8px",
    padding: "12px 22px",
    textDecoration: "none",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
  },
  hr: {
    borderColor: "#e2e8f0",
    margin: "26px 0 16px",
  },
  footerHelp: {
    fontSize: "13px",
    lineHeight: "20px",
    color: MUTED,
    margin: 0,
  },
  link: {
    color: BRAND,
    textDecoration: "underline",
  },
  footer: {
    padding: "20px 8px 4px",
  },
  footerLine: {
    fontSize: "12px",
    lineHeight: "18px",
    color: "#475569",
    fontWeight: 600,
    margin: "0 0 4px",
  },
  footerMuted: {
    fontSize: "11px",
    lineHeight: "16px",
    color: "#94a3b8",
    margin: "0 0 2px",
  },
  metaLine: {
    fontSize: "14px",
    lineHeight: "22px",
    color: "#334155",
    margin: "0 0 6px",
  },
  metaLabel: {
    display: "inline-block",
    minWidth: "120px",
    color: MUTED,
    fontWeight: 600,
  },
  metaValue: {
    color: INK,
  },
};
