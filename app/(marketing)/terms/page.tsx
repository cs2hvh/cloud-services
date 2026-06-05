import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSection } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Review the AhuraSense Cloud Terms of Service governing account use, billing, acceptable use, and platform obligations.",
  alternates: {
    canonical: `${siteConfig.url}/terms`,
  },
  openGraph: {
    title: "Terms of Service | AhuraSense Cloud",
    description:
      "Read the legal terms for using AhuraSense Cloud infrastructure services.",
    url: `${siteConfig.url}/terms`,
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement-and-scope",
    title: "Agreement and Scope",
    content: (
      <>
        <p>
          These Terms of Service govern your access to and use of AhuraSense Cloud services,
          including compute, storage, networking, managed platform features, support tools, and
          related websites.
        </p>
        <p>
          By creating an account, deploying a workload, or otherwise using the services, you agree
          to these Terms and all referenced policies. If you use the services on behalf of an
          organization, you represent that you have authority to bind that organization.
        </p>
      </>
    ),
  },
  {
    id: "account-responsibilities",
    title: "Account Responsibilities",
    content: (
      <>
        <p>
          You are responsible for maintaining accurate account details and safeguarding credentials,
          API keys, and access tokens associated with your account.
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Use strong authentication controls and rotate credentials regularly.</li>
          <li>Promptly notify us of unauthorized use or suspected security incidents.</li>
          <li>
            Ensure users under your account comply with these Terms, applicable laws, and internal
            company policies.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "service-usage",
    title: "Service Usage and Availability",
    content: (
      <>
        <p>
          We provide the platform on a commercially reasonable basis and continuously improve
          performance, security, and reliability. Features may evolve, and some capabilities may be
          region-specific.
        </p>
        <p>
          Planned maintenance and emergency updates may temporarily affect availability. We will use
          reasonable efforts to communicate significant service-impacting maintenance in advance.
        </p>
      </>
    ),
  },
  {
    id: "billing-and-payment",
    title: "Billing and Payment",
    content: (
      <>
        <p>
          Charges are based on your selected plans and actual service consumption. You authorize us
          to charge valid payment methods associated with your account for recurring and usage-based
          fees.
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Usage fees accrue according to published rates and billing intervals.</li>
          <li>Taxes, duties, and government fees are your responsibility unless stated otherwise.</li>
          <li>
            Unpaid balances may result in account restrictions, service suspension, or termination.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    content: (
      <>
        <p>
          You must not use the services for unlawful, fraudulent, or harmful activities, including
          unauthorized access attempts, malware distribution, abusive traffic, or infringement of
          third-party rights.
        </p>
        <p>
          We may investigate activity that threatens platform security, customer safety, or legal
          compliance, and we may take immediate action to mitigate risk.
        </p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    content: (
      <>
        <p>
          You retain ownership of your applications, data, and content. We retain ownership of the
          AhuraSense platform, software, trademarks, documentation, and related intellectual
          property rights.
        </p>
        <p>
          You grant us a limited right to process and transmit your data only as needed to provide,
          secure, maintain, and improve the services.
        </p>
      </>
    ),
  },
  {
    id: "suspension-and-termination",
    title: "Suspension and Termination",
    content: (
      <>
        <p>
          You may stop using the services at any time. We may suspend or terminate access for
          material violations of these Terms, payment delinquency, security risk, or legal
          requirement.
        </p>
        <p>
          Upon termination, your right to use the services ends. You remain responsible for charges
          incurred before termination. Data retention and deletion are handled under our Privacy
          Policy and applicable agreements.
        </p>
      </>
    ),
  },
  {
    id: "warranties-and-disclaimers",
    title: "Warranties and Disclaimers",
    content: (
      <>
        <p>
          Except as expressly stated in a written service commitment, the services are provided on
          an &quot;as is&quot; and &quot;as available&quot; basis. We disclaim implied warranties,
          including merchantability, fitness for a particular purpose, and non-infringement.
        </p>
        <p>
          You are responsible for configuring backups, failover, encryption, and access controls
          suitable for your use case and compliance obligations.
        </p>
      </>
    ),
  },
  {
    id: "liability-limits",
    title: "Limitation of Liability",
    content: (
      <>
        <p>
          To the maximum extent permitted by law, AhuraSense is not liable for indirect, incidental,
          consequential, special, or punitive damages, including lost profits, revenue, data, or
          goodwill.
        </p>
        <p>
          Our aggregate liability for claims arising from these Terms will not exceed the total fees
          you paid for the affected services during the twelve months preceding the event giving rise
          to the claim.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing Law and Disputes",
    content: (
      <>
        <p>
          These Terms are governed by applicable laws in the jurisdiction specified in your order
          form or primary billing country. Any disputes will be resolved in the competent courts of
          that jurisdiction unless otherwise agreed in writing.
        </p>
      </>
    ),
  },
  {
    id: "changes-and-contact",
    title: "Changes to Terms and Contact",
    content: (
      <>
        <p>
          We may update these Terms to reflect legal, technical, or operational changes. Material
          updates will be posted on this page with a revised &quot;Last updated&quot; date.
        </p>
        <p>
          For legal inquiries, contact{" "}
          <a
            href="mailto:legal@ahurasense.com"
            className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
          >
            legal@ahurasense.com
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPageShell
      currentPath="/terms"
      title="Terms of Service"
      description="These Terms describe the rights, responsibilities, and operating standards for customers using AhuraSense Cloud infrastructure services."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      sections={SECTIONS}
    />
  );
}

