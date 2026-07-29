import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Billing, Refunds & Cancellation",
  description:
    "How AhuraSense measures usage, issues invoices, applies credits, handles payment failures, and processes cancellations and refunds.",
  alternates: {
    canonical: `${siteConfig.url}/billing-policy`,
  },
  openGraph: {
    title: "Billing, Refunds & Cancellation | AhuraSense Cloud",
    description:
      "Usage metering, invoicing, prepaid balances, promotional credits, cancellation and refund terms for AhuraSense Cloud.",
    url: `${siteConfig.url}/billing-policy`,
  },
};

const RELATED = [
  { href: "/terms", label: "Terms & Services" },
  { href: "/service-specific-terms", label: "Service-Specific Terms" },
  { href: "/support-policy", label: "Support Policy" },
];

const GROUPS: LegalSectionGroup[] = [
  {
    label: "Overview",
    sections: [
      {
        id: "scope",
        title: "Scope",
        content: (
          <>
            <p>
              This Billing, Refund and Cancellation Policy describes how AhuraSense measures usage,
              issues invoices, applies credits, handles payment failures, and processes cancellations
              and refunds.
            </p>
            <p>It supplements the Terms &amp; Services.</p>
          </>
        ),
      },
    ],
  },
  {
    label: "Usage & Metering",
    sections: [
      {
        id: "usage-based-billing",
        title: "Usage-Based Billing",
        content: (
          <>
            <p>
              Usage-based Services are billed according to AhuraSense metering records. Depending on
              the Service, billing units may include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>GPU time, compute time, allocated memory and vCPU capacity.</li>
              <li>Storage capacity, stored objects and database capacity.</li>
              <li>Requests, tokens and inference time.</li>
              <li>Network egress, IP addresses and backup capacity.</li>
              <li>Other published metrics.</li>
            </ul>
            <p>
              A resource may continue to incur charges while allocated even if it is idle. Shutting
              down an operating system does not necessarily release the resource.
            </p>
            <p>
              Persistent volumes, snapshots, object storage, IP addresses, reserved resources and
              other separately allocated Services may continue to incur charges after associated
              compute has stopped.
            </p>
          </>
        ),
      },
      {
        id: "metering",
        title: "Metering",
        content: (
          <>
            <p>
              AhuraSense platform metering systems are the primary record used to calculate usage.
            </p>
            <p>
              Where a Customer believes metering is materially incorrect, the Customer may submit
              supporting logs or evidence and AhuraSense will investigate in good faith.
            </p>
            <p>
              Minor differences caused by rounding, time aggregation, billing-unit conversion or
              delayed telemetry do not constitute billing errors where the invoiced amount is
              calculated consistently with the published billing methodology.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Balances & Credits",
    sections: [
      {
        id: "prepaid-balances",
        title: "Prepaid Balances",
        content: (
          <>
            <p>
              AhuraSense may require customers to maintain prepaid balances before consuming certain
              Services. Prepaid balances are applied against eligible charges as they accrue.
            </p>
            <p>
              Unless expressly stated otherwise, deposited prepaid funds are not promotional credits.
            </p>
            <p>Withdrawal or refund of unused prepaid funds is subject to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Verification and outstanding charges.</li>
              <li>Applicable payment-provider restrictions.</li>
              <li>Fraud screening.</li>
              <li>Any non-refundable commitment attached to the funds.</li>
            </ul>
          </>
        ),
      },
      {
        id: "promotional-credits",
        title: "Promotional Credits",
        content: (
          <>
            <p>
              Promotional credits have no cash value, cannot be sold or transferred, and expire
              according to their stated terms. Credits may be restricted to particular products or
              Customer categories.
            </p>
            <p>
              AhuraSense may revoke credits obtained through fraud, duplicate accounts, false
              information, unauthorised automation or other abuse.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Invoicing & Tax",
    sections: [
      {
        id: "invoices-and-payment",
        title: "Invoices and Payment",
        content: (
          <>
            <p>
              Invoices identify the applicable billing period, Services, taxes, adjustments and amount
              due.
            </p>
            <p>
              Customers must maintain a valid payment method or approved invoicing arrangement.
              Enterprise customers may receive agreed payment terms through an Order Form.
            </p>
            <p>
              Failure to pay undisputed charges when due may result in credit limitations, suspension
              or termination.
            </p>
          </>
        ),
      },
      {
        id: "taxes",
        title: "Taxes",
        content: (
          <>
            <p>
              Taxes are charged according to Applicable Law and Customer billing information.
              Customers are responsible for providing accurate GST, VAT, tax-identification and
              exemption information.
            </p>
            <p>
              Tax treatment may change where billing location, contracting entity, service location or
              applicable legislation changes.
            </p>
          </>
        ),
      },
      {
        id: "billing-disputes",
        title: "Billing Disputes",
        content: (
          <>
            <p>
              Billing disputes must be submitted within thirty days after the relevant invoice unless
              Applicable Law requires a longer period.
            </p>
            <p>A dispute should identify:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>The invoice concerned.</li>
              <li>The resource and the disputed amount.</li>
              <li>The relevant period.</li>
              <li>Supporting information.</li>
            </ul>
            <p>
              Undisputed amounts remain payable. Billing disputes should be directed to{" "}
              <a
                href="mailto:support@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                support@ahurasense.com
              </a>
              .
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Cancellation & Refunds",
    sections: [
      {
        id: "cancellation",
        title: "Cancellation",
        content: (
          <>
            <p>
              On-demand Services may generally be cancelled by deleting or releasing the relevant
              resource.
            </p>
            <p>
              Cancellation takes effect when the applicable resource has been successfully released
              from the Account, not merely when a deletion request is first submitted.
            </p>
            <p>
              Customers are responsible for exporting Customer Data before cancellation where
              required.
            </p>
          </>
        ),
      },
      {
        id: "committed-services",
        title: "Committed Services",
        content: (
          <>
            <p>
              Reserved GPU capacity, dedicated infrastructure, enterprise commitments, discounted
              committed-use plans and other Committed Services may not be cancelled during the
              applicable term unless the Order Form expressly permits it.
            </p>
            <p>Unused committed capacity does not create a refund entitlement.</p>
          </>
        ),
      },
      {
        id: "refunds",
        title: "Refunds",
        content: (
          <>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Usage already consumed is non-refundable except where an invoice is materially
                incorrect or Applicable Law requires otherwise.
              </li>
              <li>Promotional credits are non-refundable.</li>
              <li>
                Committed charges are non-refundable except where the applicable Order Form expressly
                provides otherwise.
              </li>
              <li>Duplicate charges and confirmed billing errors will be corrected.</li>
              <li>
                Prepaid but unused non-promotional balances may be refundable where the relevant
                commercial terms permit, subject to outstanding charges, fraud review and
                payment-provider limitations.
              </li>
            </ul>
            <p>
              Availability failures are handled through the Service Level Agreement rather than
              through a general refund entitlement.
            </p>
          </>
        ),
      },
      {
        id: "chargebacks",
        title: "Chargebacks",
        content: (
          <>
            <p>
              Customers should contact AhuraSense before initiating a payment chargeback where a
              billing dispute can reasonably be investigated.
            </p>
            <p>Fraudulent or abusive chargebacks may result in suspension.</p>
            <p>
              A legitimate chargeback right available under Applicable Law is not restricted by this
              Policy.
            </p>
          </>
        ),
      },
    ],
  },
];

export default function BillingPolicyPage() {
  return (
    <LegalPageShell
      currentPath="/billing-policy"
      title="Billing, Refunds & Cancellation"
      description="How AhuraSense measures usage, issues invoices, applies credits, handles payment failures, and processes cancellations and refunds."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      groups={GROUPS}
      relatedLinks={RELATED}
    />
  );
}
