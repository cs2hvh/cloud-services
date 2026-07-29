import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Subprocessors",
  description:
    "Third parties engaged by AhuraSense to support infrastructure, networking, payments, identity verification, communications, security and other operational functions.",
  alternates: {
    canonical: `${siteConfig.url}/subprocessors`,
  },
  openGraph: {
    title: "Subprocessors | AhuraSense",
    description:
      "The current list of subprocessors engaged by AhuraSense in connection with its cloud infrastructure and AI compute services.",
    url: `${siteConfig.url}/subprocessors`,
  },
};

const SUBPROCESSOR_ROWS: {
  subprocessor: string;
  purpose: string;
  data: string;
  location: string;
}[] = [
  {
    subprocessor: "[Actual provider]",
    purpose: "Data centre / infrastructure",
    data: "Customer workload infrastructure",
    location: "[Country]",
  },
  {
    subprocessor: "[Actual provider]",
    purpose: "Network / DDoS / connectivity",
    data: "Network metadata",
    location: "[Country/Global]",
  },
  {
    subprocessor: "[Actual provider]",
    purpose: "Payments",
    data: "Billing and transaction information",
    location: "[Country]",
  },
  {
    subprocessor: "[Actual provider]",
    purpose: "Email communications",
    data: "Contact and notification data",
    location: "[Country]",
  },
  {
    subprocessor: "[Actual provider]",
    purpose: "Identity/KYB verification",
    data: "Verification information",
    location: "[Country]",
  },
  {
    subprocessor: "[Actual provider]",
    purpose: "Customer support",
    data: "Support communications",
    location: "[Country]",
  },
  {
    subprocessor: "[Actual provider]",
    purpose: "Analytics",
    data: "Website/product usage",
    location: "[Country]",
  },
];

const GROUPS: LegalSectionGroup[] = [
  {
    label: "Subprocessor List",
    sections: [
      {
        id: "about-this-list",
        title: "About This List",
        content: (
          <>
            <p>
              AhuraSense engages third parties to support infrastructure, networking, payments,
              identity verification, communications, security and other operational functions.
            </p>
            <p>
              The providers listed below may process personal data on behalf of AhuraSense or Customers
              depending on the Service used. AhuraSense may update this list as its infrastructure and
              suppliers change.
            </p>
            <p>
              Customers entitled to advance Subprocessor notice under an executed{" "}
              <a href="/dpa" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                Data Processing Agreement
              </a>{" "}
              will receive notice in accordance with that DPA.
            </p>
          </>
        ),
      },
      {
        id: "current-subprocessors",
        title: "Current Subprocessors",
        content: (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead>
                  <tr>
                    <th className="border-b border-white/[0.12] pb-2 pr-4 text-[11px] uppercase tracking-[0.14em] text-white/50">
                      Subprocessor
                    </th>
                    <th className="border-b border-white/[0.12] pb-2 pr-4 text-[11px] uppercase tracking-[0.14em] text-white/50">
                      Purpose
                    </th>
                    <th className="border-b border-white/[0.12] pb-2 pr-4 text-[11px] uppercase tracking-[0.14em] text-white/50">
                      Data/Service
                    </th>
                    <th className="border-b border-white/[0.12] pb-2 pr-4 text-[11px] uppercase tracking-[0.14em] text-white/50">
                      Processing Location
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SUBPROCESSOR_ROWS.map((row) => (
                    <tr key={`${row.purpose}-${row.data}`}>
                      <td className="border-b border-white/[0.06] py-2.5 pr-4 align-top text-white/70">
                        {row.subprocessor}
                      </td>
                      <td className="border-b border-white/[0.06] py-2.5 pr-4 align-top text-white/70">
                        {row.purpose}
                      </td>
                      <td className="border-b border-white/[0.06] py-2.5 pr-4 align-top text-white/70">
                        {row.data}
                      </td>
                      <td className="border-b border-white/[0.06] py-2.5 pr-4 align-top text-white/70">
                        {row.location}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-white/50">
              This list will be completed with actual supplier details before publication.
            </p>
          </>
        ),
      },
      {
        id: "notice-and-objection",
        title: "Notice and Objection",
        content: (
          <>
            <p>
              Where required by Applicable Data Protection Law or a Customer&apos;s executed DPA,
              AhuraSense will provide advance notice before a new Subprocessor begins processing
              Customer Personal Data.
            </p>
            <p>
              Unless the executed DPA states another period, Customer may object within thirty days on
              reasonable data-protection grounds, and the parties will attempt in good faith to resolve
              the objection through a reasonable alternative where commercially and technically
              feasible.
            </p>
            <p>
              Enquiries about this list may be sent to{" "}
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
    ],
  },
];

export default function SubprocessorsPage() {
  return (
    <LegalPageShell
      currentPath="/dpa"
      title="AhuraSense Subprocessors"
      description="Third parties engaged by AhuraSense to support infrastructure, networking, payments, identity verification, communications, security and other operational functions."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      groups={GROUPS}
    />
  );
}
