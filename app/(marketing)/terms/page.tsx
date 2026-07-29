import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Terms & Services",
  description:
    "Review the AhuraSense Cloud Terms & Services governing accounts, provisioning, commercial terms, cloud and AI services, data, and legal obligations.",
  alternates: {
    canonical: `${siteConfig.url}/terms`,
  },
  openGraph: {
    title: "Terms & Services | AhuraSense Cloud",
    description:
      "Read the legal terms for using AhuraSense Cloud infrastructure, GPU, and AI services.",
    url: `${siteConfig.url}/terms`,
  },
};

/** Documents that sit beneath Terms & Services rather than as top-level tabs. */
const RELATED = [
  { href: "/service-specific-terms", label: "Service-Specific Terms" },
  { href: "/billing-policy", label: "Billing, Refunds & Cancellation" },
  { href: "/support-policy", label: "Support Policy" },
];

const MailLink = ({ address }: { address: string }) => (
  <a
    href={`mailto:${address}`}
    className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
  >
    {address}
  </a>
);

const GROUPS: LegalSectionGroup[] = [
  {
    label: "General Terms",
    sections: [
      {
        id: "agreement-and-scope",
        title: "Agreement and Scope",
        content: (
          <>
            <p>
              These Terms &amp; Services (the &quot;Terms&quot;) govern your access to and use of
              AhuraSense Cloud services, including compute, GPU capacity, storage, networking,
              managed platform features, AI services, domains, support tooling, and related
              websites and APIs.
            </p>
            <p>
              By creating an account, deploying a workload, or otherwise using the services, you
              agree to these Terms and all referenced policies, including the Acceptable Use Policy,
              Service Level Agreement, Privacy Policy, and Data Processing Agreement. Together these
              form the agreement between you and AhuraSense.
            </p>
            <p>
              Where you have signed a separate order form, master services agreement, or enterprise
              contract with us, that document governs to the extent it conflicts with these Terms.
            </p>
          </>
        ),
      },
      {
        id: "contracting-entity",
        title: "Contracting Entity",
        content: (
          <>
            <p>
              For customers contracting in India, the Services are provided by AhuraSense
              Technologies Private Limited (&quot;AhuraSense&quot;, &quot;we&quot;, &quot;us&quot;,
              or &quot;our&quot;), unless an Order Form, Master Services Agreement, invoice, or other
              written agreement expressly identifies another AhuraSense entity as the contracting
              party.
            </p>
            <p>
              Where a separate written agreement identifies an AhuraSense Affiliate or other entity as
              the contracting party, references to &quot;AhuraSense&quot;, &quot;we&quot;,
              &quot;us&quot;, or &quot;our&quot; in these Terms mean that identified contracting
              entity solely with respect to the Services governed by that agreement.
            </p>
            <p>
              The identity of the contracting entity may depend on the Customer&apos;s billing
              location, the region from which Services are supplied, regulatory requirements, the
              Services purchased, and any applicable enterprise contracting arrangement. The
              applicable contracting entity will be identified in the Customer&apos;s Order Form,
              invoice, Account, or other contractual documentation.
            </p>
            <p>
              Nothing in these Terms creates contractual rights against an AhuraSense Affiliate that
              is not identified as a contracting party.
            </p>
            <p>
              Where no separate written contracting entity is specified, the default contracting
              entity is AhuraSense Technologies Private Limited.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white/90">AhuraSense Technologies Private Limited</span> — 2/26
                Umiya Nagar, Nirnay Nagar, Ahmedabad, Gujarat 382481, India.
              </li>
              <li>
                <span className="text-white/90">AhuraSense Ltd</span> — 20 Wenlock Road, London,
                England N1 7GU, United Kingdom.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "definitions",
        title: "Definitions",
        content: (
          <>
            <p>The following terms carry specific meaning throughout this agreement:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white/90">&quot;Affiliate&quot;</span> means an entity that
                directly or indirectly controls, is controlled by, or is under common control with a
                party.
              </li>
              <li>
                <span className="text-white/90">&quot;Applicable Law&quot;</span> means any law,
                regulation, rule, order, regulatory requirement, court order, sanctions requirement,
                export-control requirement, or legally binding governmental direction applicable to
                the relevant party or use of the Services.
              </li>
              <li>
                <span className="text-white/90">&quot;Committed Services&quot;</span> means Services
                purchased for a fixed minimum term, minimum spend, reserved capacity commitment,
                dedicated resource commitment, or other contractual commitment.
              </li>
              <li>
                <span className="text-white/90">&quot;Order Form&quot;</span> means an ordering
                document, quotation, statement of work, enterprise order, online purchase
                confirmation, or other document describing particular Services, quantities, prices,
                commitments, or commercial terms.
              </li>
              <li>
                <span className="text-white/90">&quot;Service-Specific Terms&quot;</span> means
                additional terms governing particular AhuraSense products or service categories.
              </li>
              <li>
                <span className="text-white/90">&quot;Usage Data&quot;</span> means metadata and
                operational information relating to use and administration of the Services, including
                resource identifiers, service configuration, metering information, API metadata,
                performance information, billing metrics, security events, and platform telemetry.
                Usage Data does not include the substantive contents of Customer Data.
              </li>
              <li>
                <span className="text-white/90">&quot;Services&quot;</span> means the cloud
                infrastructure, GPU compute, AI services, storage, networking, and platform features
                we make available to you.
              </li>
              <li>
                <span className="text-white/90">&quot;Customer Data&quot;</span> means the data,
                code, models, datasets, prompts, and content you or your users upload to, generate
                within, or process using the Services.
              </li>
              <li>
                <span className="text-white/90">&quot;Account&quot;</span> means the organisation
                record under which resources are provisioned and billed.
              </li>
              <li>
                <span className="text-white/90">&quot;Users&quot;</span> means individuals you
                authorise to access the Services under your Account, including team members and
                service identities.
              </li>
              <li>
                <span className="text-white/90">&quot;Documentation&quot;</span> means our published
                technical guides, API references, and service descriptions as updated from time to
                time.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "eligibility-and-authority",
        title: "Eligibility and Authority",
        content: (
          <>
            <p>
              You must be at least 18 years old and legally capable of entering into a binding
              contract to use the Services. The Services are intended for business and professional
              use and are not directed at consumers or children.
            </p>
            <p>
              If you use the Services on behalf of an organisation, you represent that you have
              authority to bind that organisation to these Terms, and references to &quot;you&quot;
              include that organisation.
            </p>
            <p>
              You may not use the Services if you are barred from doing so under applicable export
              control, sanctions, or trade laws, or if you are located in a restricted jurisdiction
              as described in our Trust &amp; Compliance policy.
            </p>
          </>
        ),
      },
      {
        id: "accounts-and-verification",
        title: "Accounts and Verification",
        content: (
          <>
            <p>
              You are responsible for maintaining accurate account details and for safeguarding
              credentials, API keys, and access tokens associated with your Account. Activity
              conducted through your credentials is treated as authorised by you.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use strong authentication controls and rotate credentials regularly.</li>
              <li>Promptly notify us of unauthorised use or suspected security incidents.</li>
              <li>
                Ensure Users under your Account comply with these Terms, applicable laws, and your
                own internal policies.
              </li>
              <li>Keep billing contacts and technical contacts current and monitored.</li>
            </ul>
            <p>
              We may require identity or business verification (KYC/KYB) before provisioning certain
              resources, particularly GPU capacity, high-egress workloads, or elevated quotas. We may
              decline, delay, or limit provisioning where verification is incomplete or where the
              request presents fraud, abuse, or export-control risk.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Services",
    sections: [
      {
        id: "services-and-provisioning",
        title: "Services and Provisioning",
        content: (
          <>
            <p>
              We provide the Services on a commercially reasonable basis and continuously improve
              performance, security, and reliability. Features may evolve, and some capabilities are
              region-specific or subject to available capacity.
            </p>
            <p>
              Provisioning of certain resources — particularly high-demand GPU SKUs, reserved
              capacity, and large-scale clusters — is subject to availability and may require
              approval, quota increases, or a commitment term. Requested capacity is not guaranteed
              until confirmed.
            </p>
            <p>
              Services marked as beta, preview, alpha, or early access are provided for evaluation
              only, may change or be withdrawn without notice, and are excluded from service level
              commitments.
            </p>
          </>
        ),
      },
      {
        id: "service-availability",
        title: "Service Availability",
        content: (
          <>
            <p>
              Availability commitments, measurement methodology, exclusions, and service credits are
              set out in our Service Level Agreement, which forms part of these Terms. Different
              services carry different commitments reflecting their architecture.
            </p>
            <p>
              Planned maintenance and emergency updates may temporarily affect availability. We use
              reasonable efforts to communicate significant service-impacting maintenance in advance
              through the status page and account notifications.
            </p>
            <p>
              Service credits under the Service Level Agreement are your sole and exclusive remedy
              for availability shortfalls.
            </p>
          </>
        ),
      },
      {
        id: "customer-responsibilities",
        title: "Customer Responsibilities",
        content: (
          <>
            <p>
              You are responsible for your workloads and for the configuration choices you make
              within the Services. Under the shared responsibility model, we secure the underlying
              platform while you secure what you build and run on it.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Guest operating systems, runtimes, containers, and application code.</li>
              <li>Patching and vulnerability management above the hypervisor layer.</li>
              <li>Identity and access management, key rotation, and least-privilege design.</li>
              <li>Firewall rules, network exposure, and public endpoint hardening.</li>
              <li>Backup, replication, and disaster recovery configuration appropriate to your risk.</li>
              <li>Lawful basis for the data you process and any sector-specific compliance duties.</li>
            </ul>
          </>
        ),
      },
      {
        id: "third-party-services",
        title: "Third-Party Services",
        content: (
          <>
            <p>
              The Services may interoperate with third-party software, marketplace images, open
              source components, model weights, or external APIs. Your use of those items is governed
              by the relevant third-party terms and licences, not by these Terms.
            </p>
            <p>
              We do not warrant third-party offerings and are not responsible for their availability,
              accuracy, security, or licensing compliance. You are responsible for reviewing licence
              conditions — including for open-weight AI models — before deploying them.
            </p>
          </>
        ),
      },
      {
        id: "resale-managed-service-providers-and-end-users",
        title: "Resale, Managed Service Providers and End Users",
        content: (
          <>
            <p>
              Unless expressly prohibited by the applicable Service-Specific Terms, customers may use
              AhuraSense infrastructure to provide their own applications and services to End Users.
              Resale of raw infrastructure capacity, GPU resources, dedicated hardware, promotional
              capacity, or Services represented as being directly supplied by AhuraSense requires
              prior written authorisation where the applicable product documentation or Order Form so
              requires.
            </p>
            <p>
              A Customer that provides Services to its own End Users remains fully responsible for
              activity conducted through resources allocated to its Account. The Customer must
              maintain contractual terms, technical controls, support procedures, and abuse-response
              processes appropriate to the services it provides, and must ensure that its End Users do
              not use AhuraSense infrastructure in a manner that would violate these Terms or the
              Acceptable Use Policy if performed by the Customer directly.
            </p>
            <p>
              AhuraSense has no contractual relationship with a Customer&apos;s End Users solely
              because those End Users access an application, website, API, hosted model, or other
              service running on AhuraSense infrastructure.
            </p>
            <p>
              The Customer is responsible for notices, consents, permissions, and contractual
              arrangements required between the Customer and its End Users.
            </p>
          </>
        ),
      },
      {
        id: "service-specific-terms",
        title: "Service-Specific Terms",
        content: (
          <>
            <p>
              Individual services may carry additional terms addressing their technical
              characteristics, quotas, or regulatory profile. Where published, those service-specific
              terms apply in addition to these Terms.
            </p>
            <p>
              If a service-specific term conflicts with these general Terms, the service-specific
              term governs for that service only. We will identify such terms in the Documentation or
              in your order form.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Commercial Terms",
    sections: [
      {
        id: "pricing-and-usage-metering",
        title: "Pricing and Usage Metering",
        content: (
          <>
            <p>
              Charges are based on your selected plans and actual service consumption, metered
              according to published rates. Usage is measured by our metering systems, which are the
              authoritative record for billing purposes.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Compute and GPU resources are typically metered per second or per hour of allocation.</li>
              <li>
                Allocated resources accrue charges while provisioned, including when idle or stopped
                but still reserved, unless the Documentation states otherwise.
              </li>
              <li>Storage is metered by provisioned or consumed capacity over time.</li>
              <li>Network egress and other metered dimensions are billed at published rates.</li>
            </ul>
            <p>
              We may change pricing on reasonable notice. Price changes do not apply retroactively and
              do not affect the rates fixed in an active committed term.
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
              You authorise us to charge valid payment methods associated with your Account for
              recurring and usage-based fees. Invoices are issued in the billing currency shown in
              your Account.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Usage fees accrue according to published rates and billing intervals.</li>
              <li>Invoiced amounts are due within the period stated on the invoice.</li>
              <li>
                Unpaid balances may result in account restrictions, service suspension, or
                termination, and may accrue late charges where permitted by law.
              </li>
              <li>
                Billing disputes must be raised in good faith within 30 days of the invoice date,
                with undisputed amounts remaining payable.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "taxes",
        title: "Taxes",
        content: (
          <>
            <p>
              Fees are exclusive of taxes. You are responsible for all applicable taxes, duties,
              levies, and government charges — including GST, VAT, and withholding taxes — other than
              taxes on our net income.
            </p>
            <p>
              Where we are required to collect tax, it will be added to your invoice. If you are
              exempt or eligible for a reduced rate, you must provide valid documentation in advance;
              exemptions are applied prospectively. If you are required to withhold tax, the amount
              payable to us will be grossed up so that we receive the full invoiced sum.
            </p>
          </>
        ),
      },
      {
        id: "credits-and-promotions",
        title: "Credits and Promotions",
        content: (
          <>
            <p>
              We may issue promotional credits, trial balances, or goodwill credits at our
              discretion. Credits apply only to eligible services, carry no cash value, are
              non-transferable, and are not refundable.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Credits expire on the stated date, or on account closure if earlier.</li>
              <li>Credits are consumed before charges are applied to your payment method.</li>
              <li>
                Promotional and free-tier resources may carry usage restrictions, including limits on
                cryptomining and other resource-intensive workloads.
              </li>
              <li>We may revoke credits obtained through abuse, fraud, or duplicate accounts.</li>
            </ul>
          </>
        ),
      },
      {
        id: "renewals-and-commitments",
        title: "Renewals and Commitments",
        content: (
          <>
            <p>
              Subscription plans, reserved capacity, and committed-use arrangements renew according
              to the term stated in your order form or plan selection. Unless you cancel before the
              renewal date, terms renew automatically for an equivalent period.
            </p>
            <p>
              Committed terms represent a binding minimum spend or capacity reservation for the term.
              Reducing or cancelling a commitment mid-term does not relieve you of the committed
              amount, and discounted rates are contingent on the commitment being honoured.
            </p>
          </>
        ),
      },
      {
        id: "cancellation-and-refunds",
        title: "Cancellation and Refunds",
        content: (
          <>
            <p>
              You may stop using the Services and close your Account at any time. Deleting resources
              stops further metering for those resources, but charges already incurred remain
              payable.
            </p>
            <p>
              Except where required by law or expressly stated in writing, fees are non-refundable.
              This includes prepaid balances, committed-term fees, and reserved capacity charges.
              Service credits under the Service Level Agreement are issued as credits against future
              charges rather than cash refunds.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Cloud & AI Services",
    sections: [
      {
        id: "compute-and-cloud-services",
        title: "Compute and Cloud Services",
        content: (
          <>
            <p>
              Virtual machines, bare metal servers, and container workloads are provisioned within
              the region you select. You control the guest layer and are responsible for its
              security, patching, and lawful operation.
            </p>
            <p>
              Resources are subject to quotas and fair-use expectations. Sustained activity that
              degrades the platform for other tenants — including on shared or burstable instance
              types — may be rate-limited or suspended under the Acceptable Use Policy.
            </p>
          </>
        ),
      },
      {
        id: "gpu-cloud-services",
        title: "GPU Cloud Services",
        content: (
          <>
            <p>
              GPU capacity is a constrained resource. On-demand GPU allocation is subject to
              availability at the time of request, and we cannot guarantee that a specific SKU,
              quantity, or region will be available on demand.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                GPU workloads may be subject to enhanced verification, including identity and
                use-case review, in connection with export control obligations.
              </li>
              <li>
                Hardware faults on accelerators can require node replacement; availability
                commitments for on-demand GPU differ from reserved capacity, as set out in the
                Service Level Agreement.
              </li>
              <li>
                You are responsible for checkpointing long-running training jobs so that work can be
                resumed following interruption.
              </li>
              <li>
                Resale, sublicensing, or providing third-party access to GPU capacity requires our
                prior written consent.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "reserved-capacity",
        title: "Reserved Capacity",
        content: (
          <>
            <p>
              Reserved capacity provides dedicated access to specified resources for a committed
              term at agreed rates. Reservations begin on the activation date stated in your order
              and are billed for the full term regardless of utilisation.
            </p>
            <p>
              Reserved capacity is generally non-cancellable and non-refundable. Where we permit a
              change, it may be subject to a modification fee or rate adjustment. Reservations do not
              automatically transfer between regions, SKUs, or accounts without our written consent.
            </p>
          </>
        ),
      },
      {
        id: "ai-services",
        title: "AI Services",
        content: (
          <>
            <p>
              AI services include inference endpoints, model hosting, fine-tuning, embeddings, and
              related tooling. Your prompts, datasets, fine-tuned adapters, and model outputs are
              treated as Customer Data.
            </p>
            <p>
              We do not use your prompts, datasets, or model outputs to train our own foundation
              models. We process them only to deliver the service you requested, to maintain
              security and integrity, and as described in our Privacy Policy and Data Processing
              Agreement.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                AI output can be inaccurate, incomplete, or unsuitable for a given purpose. You are
                responsible for evaluating fitness before relying on it.
              </li>
              <li>
                You must not deploy AI services in high-risk contexts without appropriate human
                oversight and safeguards, as detailed in the Acceptable Use Policy.
              </li>
              <li>
                You are responsible for holding the necessary rights and licences to any model
                weights, training data, or content you supply.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "storage-and-databases",
        title: "Storage and Databases",
        content: (
          <>
            <p>
              Object storage, block volumes, and managed database services are designed for
              durability through replication within the selected region. Durability is distinct from
              availability, and neither is a substitute for your own backup strategy.
            </p>
            <p>
              You are responsible for selecting appropriate redundancy, snapshot schedules, retention
              settings, and encryption options for your data. Deleting a volume, bucket, or database
              instance may irreversibly destroy the data it contains, including snapshots configured
              for cascade deletion.
            </p>
          </>
        ),
      },
      {
        id: "domains-and-other-services",
        title: "Domains and Other Services",
        content: (
          <>
            <p>
              Domain registration and related DNS services are subject to the policies of the
              relevant registry and ICANN, including dispute resolution procedures. Registration is
              not effective until confirmed by the registry.
            </p>
            <p>
              You are responsible for maintaining accurate registrant contact information, for timely
              renewal, and for any consequences of expiry or transfer. Additional services such as
              TLS certificates, load balancing, and marketplace offerings may carry their own terms
              and third-party dependencies.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Data, Security & Intellectual Property",
    sections: [
      {
        id: "customer-data-and-content",
        title: "Customer Data and Content",
        content: (
          <>
            <p>
              You retain all rights in Customer Data. You grant us a limited, non-exclusive right to
              host, process, transmit, and display Customer Data solely to provide, secure, and
              support the Services, and as otherwise instructed by you.
            </p>
            <p>
              You represent that you have the necessary rights and lawful basis for Customer Data,
              and that its processing through the Services does not infringe third-party rights or
              violate applicable law. Where we process personal data on your behalf, the Data
              Processing Agreement applies.
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
              You retain ownership of your applications, data, and content. We retain ownership of
              the AhuraSense platform, software, trademarks, documentation, and related intellectual
              property rights. No rights are granted except those expressly stated.
            </p>
            <p>
              You may not copy, reverse engineer, decompile, or create derivative works from the
              platform except to the extent such restriction is prohibited by law. Feedback you
              provide may be used freely by us to improve the Services without obligation to you.
            </p>
          </>
        ),
      },
      {
        id: "security-and-shared-responsibility",
        title: "Security and Shared Responsibility",
        content: (
          <>
            <p>
              We maintain administrative, technical, and physical safeguards designed to protect the
              platform, including encryption in transit and at rest, network segmentation, access
              controls, logging, and vulnerability management. Details are published in our Trust
              &amp; Compliance policy.
            </p>
            <p>
              Security is shared. We are responsible for the physical infrastructure, host layer,
              hypervisor, network fabric, and control plane. You are responsible for everything you
              deploy above that boundary, including credentials, guest OS hardening, and application
              security.
            </p>
            <p>
              You must notify us promptly at{" "}
              <MailLink address="abuse@ahurasense.com" /> if you become aware of a vulnerability
              or security incident affecting the Services.
            </p>
          </>
        ),
      },
      {
        id: "confidentiality",
        title: "Confidentiality",
        content: (
          <>
            <p>
              Each party may receive non-public information from the other party that is identified as
              confidential or that a reasonable person would understand to be confidential given its
              nature and the circumstances of disclosure (&quot;Confidential Information&quot;).
            </p>
            <p>
              Customer Confidential Information may include Customer Data, non-public application
              architecture, model information, datasets, source code, credentials, network designs,
              security information, commercial plans, and business information. AhuraSense
              Confidential Information may include non-public infrastructure information, security
              architecture, pricing arrangements, technical documentation, source code, product
              roadmaps, penetration-test information, vulnerability information, supplier
              arrangements, and non-public operating procedures.
            </p>
            <p>
              The receiving party will use the disclosing party&apos;s Confidential Information only
              as necessary to perform or exercise rights under the Agreement and will protect it using
              at least reasonable care and no less than the degree of care the receiving party uses to
              protect confidential information of similar sensitivity belonging to itself.
            </p>
            <p>
              The receiving party may disclose Confidential Information only to its employees,
              Affiliates, contractors, professional advisers, financing sources, and service providers
              who have a legitimate need to know it and who are subject to confidentiality obligations
              appropriate to the nature of the information.
            </p>
            <p>
              Confidential Information does not include information that the receiving party can
              demonstrate:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                was lawfully known to it without confidentiality restriction before disclosure;
              </li>
              <li>becomes publicly available without breach of the Agreement;</li>
              <li>
                is lawfully obtained from another person without confidentiality restriction; or
              </li>
              <li>
                is independently developed without use of or reference to the disclosing
                party&apos;s Confidential Information.
              </li>
            </ul>
            <p>
              Where disclosure is required by Applicable Law or valid legal process, the receiving
              party may disclose the minimum information legally required. Where legally permitted, it
              will give the disclosing party reasonable notice so that the disclosing party may seek
              protective treatment or challenge the disclosure.
            </p>
            <p>
              Upon termination and upon reasonable request, each party will return or securely destroy
              Confidential Information of the other party that it is not required to retain. This
              obligation does not require deletion of information retained in routine backups, legal
              archives, security logs, or records required by law, provided that such retained
              information remains protected and is not used for another purpose.
            </p>
            <p>
              The confidentiality obligations in this section survive termination for five years,
              except that obligations relating to trade secrets, security credentials, and information
              that remains legally protectable as a trade secret survive for so long as that
              information remains protected by applicable law.
            </p>
          </>
        ),
      },
      {
        id: "backups-and-data-protection",
        title: "Backups and Data Protection",
        content: (
          <>
            <p>
              Unless you have purchased a managed backup service with a defined recovery objective,
              you are responsible for configuring, testing, and verifying backups appropriate to your
              recovery requirements.
            </p>
            <p>
              Platform-level replication protects against hardware failure but does not protect
              against accidental deletion, ransomware, or application-level corruption originating in
              your environment. We recommend maintaining independent copies of critical data,
              including outside a single region where your risk profile requires it.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Suspension & Termination",
    sections: [
      {
        id: "suspension",
        title: "Suspension",
        content: (
          <>
            <p>
              We may suspend all or part of the Services where necessary to protect the platform,
              other customers, or third parties, or to comply with law. Wherever practicable we will
              give notice and an opportunity to remedy before suspending.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Non-payment of undisputed amounts past due.</li>
              <li>Material breach of these Terms or the Acceptable Use Policy.</li>
              <li>Active security threats, compromised credentials, or ongoing abuse.</li>
              <li>Legal, regulatory, sanctions, or export-control requirements.</li>
            </ul>
            <p>
              We may suspend immediately and without prior notice where the activity presents severe
              or imminent harm, including child sexual abuse material, active attacks originating
              from your resources, or unlawful content. Charges continue to accrue for resources that
              remain provisioned during suspension.
            </p>
          </>
        ),
      },
      {
        id: "termination",
        title: "Termination",
        content: (
          <>
            <p>
              You may terminate at any time by closing your Account. We may terminate for material
              breach that remains uncured after notice, for repeated violations, for prolonged
              non-payment, or where required by law.
            </p>
            <p>
              We may also terminate for convenience on reasonable prior notice, in which case we will
              refund any prepaid, unused fees for the terminated services on a pro-rata basis. Upon
              termination your right to use the Services ends, and you remain responsible for charges
              incurred before termination.
            </p>
          </>
        ),
      },
      {
        id: "data-retrieval-and-deletion",
        title: "Data Retrieval and Deletion",
        content: (
          <>
            <p>
              Following termination, we provide a limited retrieval window — ordinarily 30 days
              unless stated otherwise or prohibited by law — during which you may export Customer
              Data. Retrieval may require settling outstanding balances.
            </p>
            <p>
              After the retrieval window, Customer Data is deleted from active systems, with residual
              copies in backups removed on our standard backup expiry cycle. Where we are legally
              required to retain certain records, we retain only what is necessary for that purpose.
              Termination for severe abuse may result in immediate deletion without a retrieval
              window.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Legal Terms",
    sections: [
      {
        id: "warranties-and-disclaimers",
        title: "Warranties and Disclaimers",
        content: (
          <>
            <p>
              Except as expressly stated in a written service commitment, the Services are provided on
              an &quot;as is&quot; and &quot;as available&quot; basis. We disclaim implied warranties,
              including merchantability, fitness for a particular purpose, and non-infringement.
            </p>
            <p>
              We do not warrant that the Services will be uninterrupted or error-free, that defects
              will be corrected, or that AI outputs will be accurate or suitable for your purpose. You
              are responsible for configuring backups, failover, encryption, and access controls
              suitable for your use case and compliance obligations.
            </p>
            <p>
              Nothing in these Terms excludes liability that cannot lawfully be excluded, including
              for death or personal injury caused by negligence, or for fraud.
            </p>
          </>
        ),
      },
      {
        id: "indemnification",
        title: "Indemnification",
        content: (
          <>
            <p>
              You will defend and indemnify AhuraSense against third-party claims arising from
              Customer Data, your use of the Services in breach of these Terms or the Acceptable Use
              Policy, your infringement of third-party rights, or your violation of applicable law.
            </p>
            <p>
              We will defend and indemnify you against third-party claims alleging that the Services,
              as provided by us and used in accordance with these Terms, infringe that party&apos;s
              intellectual property rights. This does not apply to claims arising from Customer Data,
              third-party components, or modifications made by you.
            </p>
            <p>
              The indemnified party must promptly notify the other, allow it to control the defence,
              and provide reasonable cooperation. Settlements imposing obligations on the indemnified
              party require its consent.
            </p>
          </>
        ),
      },
      {
        id: "limitation-of-liability",
        title: "Limitation of Liability",
        content: (
          <>
            <p>
              To the maximum extent permitted by law, AhuraSense is not liable for indirect,
              incidental, consequential, special, or punitive damages, including lost profits,
              revenue, data, or goodwill, even if advised of the possibility.
            </p>
            <p>
              Our aggregate liability for all claims arising from these Terms will not exceed the
              total fees you paid for the affected services during the twelve months preceding the
              event giving rise to the claim.
            </p>
            <p>
              These limitations apply regardless of the theory of liability and survive termination.
              Service credits under the Service Level Agreement are your sole remedy for availability
              shortfalls.
            </p>
          </>
        ),
      },
      {
        id: "force-majeure",
        title: "Force Majeure",
        content: (
          <>
            <p>
              Neither party is liable for failure or delay in performance caused by events beyond its
              reasonable control, including natural disasters, war, terrorism, civil unrest, labour
              disputes, epidemics, government action, utility or power failures, large-scale internet
              or upstream network disruption, and supply chain failures affecting hardware.
            </p>
            <p>
              The affected party will use reasonable efforts to mitigate and resume performance.
              Payment obligations for services already delivered are not excused.
            </p>
          </>
        ),
      },
      {
        id: "export-controls-and-sanctions",
        title: "Export Controls and Sanctions",
        content: (
          <>
            <p>
              The Services, particularly advanced GPU compute and AI capabilities, may be subject to
              export control and sanctions regimes. You must comply with all applicable export
              control, sanctions, and trade laws in your use of the Services.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                You may not access or use the Services from, or provide access to persons in,
                embargoed or restricted jurisdictions.
              </li>
              <li>
                You may not permit use by parties on applicable restricted or denied-party lists.
              </li>
              <li>
                You may not re-export, transfer, or provide onward access to controlled capacity in
                violation of applicable law.
              </li>
              <li>
                You may not use the Services for prohibited end uses, including weapons of mass
                destruction or unlawful military applications.
              </li>
            </ul>
            <p>
              We screen accounts against sanctions lists and may suspend or terminate access, and
              decline capacity requests, to comply with these obligations.
            </p>
          </>
        ),
      },
      {
        id: "governing-law-and-disputes",
        title: "Governing Law and Dispute Resolution",
        content: (
          <>
            <p>
              Except where an Order Form, Master Services Agreement, or other written agreement
              expressly specifies otherwise, these Terms and any dispute arising from or relating to
              them are governed by the laws of India, without regard to conflict-of-law principles.
            </p>
            <p>
              Where AhuraSense Technologies Private Limited is the contracting entity, the competent
              courts in Ahmedabad, Gujarat will have jurisdiction over disputes arising out of or
              relating to the Agreement, subject to any arbitration agreement or other
              dispute-resolution process expressly agreed between the parties in writing.
            </p>
            <p>
              Before commencing formal proceedings, each party will make reasonable efforts to resolve
              the dispute through good-faith commercial escalation. Either party may give written
              notice describing the dispute, following which representatives authorised to resolve the
              matter will attempt in good faith to reach a resolution.
            </p>
            <p>
              Nothing in this section prevents either party from seeking urgent interim, protective,
              or injunctive relief where reasonably necessary to protect intellectual property,
              Confidential Information, security, Customer Data, infrastructure, or other rights for
              which monetary damages would not provide an adequate remedy.
            </p>
            <p>
              Where an Order Form identifies another AhuraSense entity as the contracting party, the
              governing law and jurisdiction stated in that Order Form or applicable enterprise
              agreement will apply.
            </p>
          </>
        ),
      },
      {
        id: "general-provisions",
        title: "General Provisions and Order of Precedence",
        content: (
          <>
            <p>
              The Agreement consists of these Terms, the applicable Order Form, any Service-Specific
              Terms, the Acceptable Use Policy, Service Level Agreement, Data Processing Agreement
              where applicable, and any other document expressly incorporated by reference.
            </p>
            <p>
              Where documents conflict, the more specific document controls only in relation to the
              subject matter it specifically governs. Unless a separately signed agreement expressly
              provides another hierarchy, the following order applies:
            </p>
            <ul className="list-decimal pl-6 space-y-2">
              <li>a negotiated Master Services Agreement or enterprise agreement;</li>
              <li>the applicable Order Form or negotiated addendum;</li>
              <li>
                the Data Processing Agreement, solely for processing of Customer Personal Data;
              </li>
              <li>applicable Service-Specific Terms;</li>
              <li>
                the Service Level Agreement, solely with respect to availability commitments and
                service credits;
              </li>
              <li>these Terms &amp; Services;</li>
              <li>
                the Acceptable Use Policy and other incorporated operational policies.
              </li>
            </ul>
            <p>
              Mandatory Applicable Law prevails over contractual provisions to the extent required.
            </p>
            <p>
              The Agreement constitutes the entire agreement between the parties concerning its
              subject matter and supersedes prior proposals, discussions, representations, and
              understandings concerning that subject matter.
            </p>
            <p>
              Neither purchase orders nor Customer procurement forms amend the Agreement merely
              because they are accepted, acknowledged, processed, or referenced for administrative
              purposes. Any additional or inconsistent terms appearing in a Customer purchase order
              are rejected unless expressly agreed by AhuraSense in writing.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                If a provision is found invalid or unenforceable, it will be modified to the minimum
                extent necessary to make it enforceable where permitted, and the remaining provisions
                will continue in force.
              </li>
              <li>Failure or delay in enforcing a right does not constitute a waiver.</li>
              <li>
                Neither party may assign the Agreement without the other party&apos;s consent, except
                that AhuraSense may assign it to an Affiliate or in connection with a merger,
                corporate reorganisation, financing, acquisition, or sale of substantially all
                relevant assets. A Customer may assign the Agreement in connection with a bona fide
                merger or sale of substantially all of its business, provided the assignee is not a
                competitor of AhuraSense, a sanctioned party, or otherwise prohibited from receiving
                the Services.
              </li>
              <li>
                The parties are independent contractors. Nothing creates a partnership, employment
                relationship, fiduciary relationship, agency, or joint venture.
              </li>
              <li>
                There are no third-party beneficiaries except where expressly required by the Data
                Processing Agreement or applicable Standard Contractual Clauses.
              </li>
              <li>
                Provisions concerning fees, intellectual property, confidentiality, liability,
                indemnification, dispute resolution, retained data, and any provision that by its
                nature should survive termination will survive.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "changes-to-terms",
        title: "Changes to Terms",
        content: (
          <>
            <p>
              We may update these Terms to reflect legal, technical, or operational changes. Material
              updates will be posted on this page with a revised &quot;Last updated&quot; date, and
              where the change materially reduces your rights we will provide advance notice through
              the Account or by email.
            </p>
            <p>
              Continued use of the Services after the effective date of a change constitutes
              acceptance. If you do not accept a material change, you may terminate before it takes
              effect. Changes required by law or to address a security risk may take effect
              immediately.
            </p>
          </>
        ),
      },
      {
        id: "contact-and-notices",
        title: "Contact and Notices",
        content: (
          <>
            <p>
              Notices to us must be sent to <MailLink address="legal@ahurasense.com" />. Notices to
              you will be sent to the contact details in your Account or posted within the platform,
              and are deemed received when sent or posted.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Legal and contractual matters: <MailLink address="legal@ahurasense.com" />
              </li>
              <li>
                Security reports and vulnerabilities: <MailLink address="abuse@ahurasense.com" />
              </li>
              <li>
                Abuse and acceptable use reports: <MailLink address="abuse@ahurasense.com" />
              </li>
              <li>
                Privacy, data protection, and grievances:{" "}
                <MailLink address="legal@ahurasense.com" />
              </li>
              <li>
                Billing and technical support: <MailLink address="support@ahurasense.com" />
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPageShell
      currentPath="/terms"
      title="Terms & Services"
      description="These Terms describe the rights, responsibilities, and operating standards for customers using AhuraSense Cloud infrastructure, GPU, and AI services."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      groups={GROUPS}
      relatedLinks={RELATED}
    />
  );
}
