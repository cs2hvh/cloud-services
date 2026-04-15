import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSection } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Understand how AhuraSense Cloud collects, uses, secures, and processes personal data across its infrastructure platform.",
  alternates: {
    canonical: `${siteConfig.url}/privacy`,
  },
  openGraph: {
    title: "Privacy Policy | AhuraSense Cloud",
    description: "Read how personal data is handled across AhuraSense Cloud services.",
    url: `${siteConfig.url}/privacy`,
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    content: (
      <>
        <p>
          This Privacy Policy explains how AhuraSense Cloud collects, uses, stores, and protects
          personal information when you use our website, platform, APIs, and customer support
          channels.
        </p>
        <p>
          We process personal data in accordance with applicable privacy laws and our contractual
          commitments to customers.
        </p>
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "Data We Collect",
    content: (
      <>
        <p>We collect data directly from you, from service usage, and from trusted partners:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Account details such as name, email, organization, and billing address.</li>
          <li>Payment and transaction records through approved payment processors.</li>
          <li>
            Operational telemetry such as IP addresses, logs, device/browser data, and audit events.
          </li>
          <li>Support and communication records, including ticket metadata and attachments.</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-data",
    title: "How We Use Data",
    content: (
      <>
        <p>We use personal data to operate and improve the platform, including to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Provision and secure services.</li>
          <li>Authenticate users and prevent abuse.</li>
          <li>Process billing, invoicing, and payment reconciliation.</li>
          <li>Respond to support requests and communicate service updates.</li>
          <li>Meet legal, regulatory, and contractual obligations.</li>
        </ul>
      </>
    ),
  },
  {
    id: "legal-bases",
    title: "Legal Bases for Processing",
    content: (
      <>
        <p>Depending on context, we process personal data under one or more legal bases:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Performance of a contract with you or your organization.</li>
          <li>Legitimate interests such as platform security, fraud prevention, and analytics.</li>
          <li>Compliance with legal obligations.</li>
          <li>Consent where required by applicable law.</li>
        </ul>
      </>
    ),
  },
  {
    id: "sharing-and-disclosure",
    title: "Sharing and Disclosure",
    content: (
      <>
        <p>
          We do not sell personal data. We share personal information only where necessary to provide
          services, comply with law, or protect rights and safety.
        </p>
        <p>
          Recipients may include payment providers, infrastructure vendors, monitoring providers,
          customer support tools, and professional advisers under confidentiality obligations.
        </p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International Transfers",
    content: (
      <>
        <p>
          Data may be processed in countries other than where it was collected. Where required, we
          use recognized transfer safeguards such as Standard Contractual Clauses and contractual
          data protection measures.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Data Retention",
    content: (
      <>
        <p>
          We retain personal data only as long as needed for the purposes described in this policy,
          unless a longer retention period is required by law, contract, dispute resolution, or
          legitimate business needs.
        </p>
      </>
    ),
  },
  {
    id: "security-controls",
    title: "Security Controls",
    content: (
      <>
        <p>
          We maintain administrative, technical, and organizational safeguards designed to protect
          personal data, including access controls, encryption in transit, logging, monitoring, and
          incident response procedures.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your Privacy Rights",
    content: (
      <>
        <p>
          Subject to local law, you may have rights to access, correct, delete, restrict, object to,
          or export personal data. You may also withdraw consent where processing is based on consent.
        </p>
        <p>
          To submit a request, email{" "}
          <a
            href="mailto:privacy@ahuracloud.com"
            className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
          >
            privacy@ahuracloud.com
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "cookies-and-tracking",
    title: "Cookies and Tracking",
    content: (
      <>
        <p>
          We use cookies and similar technologies to maintain sessions, improve performance, and
          understand product usage. For more details, see our{" "}
          <a href="/cookies" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
            Cookies Policy
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "policy-updates",
    title: "Policy Updates",
    content: (
      <>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be posted on
          this page with an updated revision date.
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      currentPath="/privacy"
      title="Privacy Policy"
      description="This policy outlines how AhuraSense Cloud handles personal data for customer accounts, platform usage, security operations, and support."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      sections={SECTIONS}
    />
  );
}

