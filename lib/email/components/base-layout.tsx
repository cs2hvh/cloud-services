import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { getEmailConfig } from "@/lib/email/config";
import type { ReactNode } from "react";

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

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Img
            alt="AhuraSense"
            height="48"
            src={emailConfig.logoUrl}
            style={styles.logo}
            width="48"
          />
          <Heading style={styles.heading}>{title}</Heading>
          {greeting ? <Text style={styles.paragraph}>{greeting}</Text> : null}
          <Section style={styles.content}>{children}</Section>
          {actionUrl && actionLabel ? (
            <Button href={actionUrl} style={styles.button}>
              {actionLabel}
            </Button>
          ) : null}
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            {footerText || "Need help? Reach out to our support team."}{" "}
            <Link href={emailConfig.supportUrl} style={styles.link}>
              Contact support
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailCard({
  children,
  accent = "#111827",
}: {
  children: ReactNode;
  accent?: string;
}) {
  return (
    <Section
      style={{
        ...styles.card,
        borderLeft: `4px solid ${accent}`,
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
      <strong>{label}:</strong> {value}
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
    backgroundColor: "#f3f4f6",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  },
  container: {
    margin: "0 auto",
    maxWidth: "600px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "32px",
    border: "1px solid #e5e7eb",
  },
  logo: {
    borderRadius: "12px",
    marginBottom: "20px",
  },
  heading: {
    fontSize: "28px",
    lineHeight: "34px",
    color: "#111827",
    margin: "0 0 16px",
  },
  content: {
    marginTop: "8px",
  },
  paragraph: {
    fontSize: "15px",
    lineHeight: "24px",
    color: "#374151",
    margin: "0 0 16px",
  },
  card: {
    backgroundColor: "#f9fafb",
    borderRadius: "12px",
    padding: "16px 18px",
    margin: "16px 0",
  },
  button: {
    backgroundColor: "#111827",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "12px 18px",
    textDecoration: "none",
    display: "inline-block",
    marginTop: "12px",
    fontWeight: "600",
  },
  hr: {
    borderColor: "#e5e7eb",
    margin: "28px 0 16px",
  },
  footer: {
    fontSize: "13px",
    lineHeight: "20px",
    color: "#6b7280",
    margin: 0,
  },
  link: {
    color: "#111827",
    textDecoration: "underline",
  },
  metaLine: {
    fontSize: "14px",
    lineHeight: "22px",
    color: "#374151",
    margin: "0 0 6px",
  },
};
