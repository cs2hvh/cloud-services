import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSection } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description:
    "Review the AhuraSense Cloud Data Processing Agreement covering processor obligations, security measures, subprocessors, and transfer safeguards.",
  alternates: {
    canonical: `${siteConfig.url}/dpa`,
  },
  openGraph: {
    title: "Data Processing Agreement | AhuraSense Cloud",
    description: "Data processing commitments and safeguards for AhuraSense Cloud customers.",
    url: `${siteConfig.url}/dpa`,
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "purpose-and-scope",
    title: "Purpose and Scope",
    content: (
      <>
        <p>
          This Data Processing Agreement (&quot;DPA&quot;) applies when AhuraSense Cloud processes
          personal data on behalf of a customer in connection with providing cloud infrastructure
          services.
        </p>
        <p>
          This DPA supplements the Terms of Service and applies to customer personal data processed
          in customer accounts, workloads, logs, support channels, and associated platform tooling.
        </p>
      </>
    ),
  },
  {
    id: "roles",
    title: "Roles of the Parties",
    content: (
      <>
        <p>
          The customer is the data controller (or processor acting for a controller) and AhuraSense
          acts as a processor. Each party will comply with obligations applicable to its role under
          relevant privacy laws.
        </p>
      </>
    ),
  },
  {
    id: "processing-instructions",
    title: "Processing Instructions",
    content: (
      <>
        <p>
          AhuraSense processes personal data only on documented customer instructions, including
          instructions contained in customer configuration choices, API requests, support requests,
          and written agreements.
        </p>
        <p>
          If AhuraSense is required by law to process data beyond customer instructions, we will
          notify the customer unless legally prohibited.
        </p>
      </>
    ),
  },
  {
    id: "security-measures",
    title: "Technical and Organizational Measures",
    content: (
      <>
        <p>AhuraSense maintains appropriate safeguards designed to protect personal data, including:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Logical access controls and least-privilege access management.</li>
          <li>Encryption in transit and secure service communication channels.</li>
          <li>Security monitoring, logging, vulnerability management, and alerting.</li>
          <li>Operational controls for incident detection, response, and service continuity.</li>
        </ul>
      </>
    ),
  },
  {
    id: "subprocessors",
    title: "Subprocessors",
    content: (
      <>
        <p>
          AhuraSense may use subprocessors to deliver infrastructure, payment, communications, and
          support capabilities. We require subprocessors to provide data protection obligations no
          less protective than those in this DPA.
        </p>
        <p>
          Customers may request current subprocessor information by contacting{" "}
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
    id: "data-subject-rights",
    title: "Data Subject Rights Assistance",
    content: (
      <>
        <p>
          Taking into account the nature of processing, AhuraSense provides reasonable assistance to
          help customers respond to lawful requests from data subjects, including access, correction,
          deletion, portability, and objection requests.
        </p>
      </>
    ),
  },
  {
    id: "incident-notification",
    title: "Security Incident Notification",
    content: (
      <>
        <p>
          AhuraSense will notify customers without undue delay after confirming a security incident
          involving customer personal data. Notifications will include known details about impact,
          mitigation actions, and recommended customer steps where relevant.
        </p>
      </>
    ),
  },
  {
    id: "cross-border-transfers",
    title: "Cross-Border Data Transfers",
    content: (
      <>
        <p>
          When personal data is transferred across borders, AhuraSense uses legally recognized
          transfer mechanisms, including Standard Contractual Clauses, and applies supplementary
          safeguards where appropriate.
        </p>
      </>
    ),
  },
  {
    id: "audits",
    title: "Audits and Compliance Information",
    content: (
      <>
        <p>
          Upon reasonable request, AhuraSense will provide information necessary to demonstrate
          compliance with this DPA and applicable processing obligations, including available
          summaries of security controls and independent assurance materials.
        </p>
      </>
    ),
  },
  {
    id: "deletion-and-return",
    title: "Deletion and Return of Data",
    content: (
      <>
        <p>
          Upon termination of services and subject to legal retention requirements, AhuraSense will
          delete or return customer personal data in accordance with documented customer
          instructions and service capabilities.
        </p>
      </>
    ),
  },
  {
    id: "term-and-updates",
    title: "Term and Updates",
    content: (
      <>
        <p>
          This DPA remains in effect for as long as AhuraSense processes customer personal data under
          the main service agreement. We may update this DPA to reflect legal or operational changes,
          with updates published on this page.
        </p>
      </>
    ),
  },
];

export default function DpaPage() {
  return (
    <LegalPageShell
      currentPath="/dpa"
      title="Data Processing Agreement"
      description="This DPA defines how AhuraSense Cloud processes personal data for customers and the safeguards applied to protect that data."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      sections={SECTIONS}
    />
  );
}

