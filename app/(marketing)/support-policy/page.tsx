import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Support Policy",
  description:
    "Support scope, severity classification, response targets, and customer cooperation requirements for AhuraSense Services.",
  alternates: {
    canonical: `${siteConfig.url}/support-policy`,
  },
  openGraph: {
    title: "Support Policy | AhuraSense Cloud",
    description:
      "What AhuraSense Cloud support covers, how severity is classified, response targets, and how to escalate security, abuse and SLA matters.",
    url: `${siteConfig.url}/support-policy`,
  },
};

const RELATED = [
  { href: "/terms", label: "Terms & Services" },
  { href: "/service-specific-terms", label: "Service-Specific Terms" },
  { href: "/billing-policy", label: "Billing, Refunds & Cancellation" },
];

const GROUPS: LegalSectionGroup[] = [
  {
    label: "Support Scope",
    sections: [
      {
        id: "support-scope",
        title: "Support Scope",
        content: (
          <>
            <p>
              AhuraSense provides technical support for platform services, provisioning, billing,
              infrastructure faults and supported managed-service components.
            </p>
            <p>Support does not ordinarily include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Administration of Customer applications.</li>
              <li>Debugging Customer source code.</li>
              <li>Managing Customer operating systems.</li>
              <li>Developing software.</li>
              <li>Configuring unsupported third-party software.</li>
              <li>Performing services outside the purchased support plan.</li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    label: "Severity & Response",
    sections: [
      {
        id: "severity-classification",
        title: "Severity Classification",
        content: (
          <>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white/90">Severity 1 — Critical:</span> a production Service is
                unavailable or a material platform-side incident is causing widespread or critical
                operational impact and no reasonable workaround exists.
              </li>
              <li>
                <span className="text-white/90">Severity 2 — High:</span> material degradation of a
                production workload or an important Service feature with substantial business impact,
                but the Service remains partially operational or a workaround exists.
              </li>
              <li>
                <span className="text-white/90">Severity 3 — Normal:</span> non-critical impairment,
                configuration issue, technical question or product behaviour requiring investigation.
              </li>
              <li>
                <span className="text-white/90">Severity 4 — General:</span> documentation questions,
                feature requests, account enquiries and general assistance.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "response-targets",
        title: "Response Targets",
        content: (
          <>
            <p>
              Response times are targets for initial acknowledgement and investigation, not guaranteed
              resolution times unless a separate support agreement expressly states otherwise.
            </p>
            <p>
              Support-plan response targets displayed during ordering or in an applicable Order Form
              govern the Customer&apos;s Account.
            </p>
            <p>
              Resolution time depends on the nature of the issue, third-party dependencies, Customer
              cooperation, hardware replacement, software defects and other circumstances.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Customer Obligations",
    sections: [
      {
        id: "customer-cooperation",
        title: "Customer Cooperation",
        content: (
          <>
            <p>
              Customers must provide information reasonably necessary to investigate a support case,
              including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Resource identifiers and timestamps.</li>
              <li>Logs and error messages.</li>
              <li>Reproduction steps.</li>
              <li>Relevant configuration information.</li>
            </ul>
            <p>
              AhuraSense may be unable to investigate an issue where necessary diagnostic information
              is unavailable.
            </p>
            <p>
              Customers should not provide passwords, private keys or unnecessary sensitive data
              through ordinary support channels.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Escalation",
    sections: [
      {
        id: "emergency-cases",
        title: "Emergency Cases",
        content: (
          <>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Security incidents and vulnerability reports should be reported to{" "}
                <a
                  href="mailto:abuse@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  abuse@ahurasense.com
                </a>
                .
              </li>
              <li>
                Abuse reports should be directed to{" "}
                <a
                  href="mailto:abuse@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  abuse@ahurasense.com
                </a>
                .
              </li>
              <li>
                SLA claims must follow the SLA claim process set out in the Service Level Agreement.
              </li>
              <li>
                Legal, regulatory and privacy requests must be sent to{" "}
                <a
                  href="mailto:legal@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  legal@ahurasense.com
                </a>
                .
              </li>
              <li>
                General support goes to{" "}
                <a
                  href="mailto:support@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  support@ahurasense.com
                </a>
                .
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
];

export default function SupportPolicyPage() {
  return (
    <LegalPageShell
      currentPath="/support-policy"
      title="Support Policy"
      description="Support scope, severity classification, response targets, and customer cooperation requirements for AhuraSense Services."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      groups={GROUPS}
      relatedLinks={RELATED}
    />
  );
}
