import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSection } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Understand how AhuraSense AI Pvt Ltd collects, uses, stores, shares, and protects personal data across its cloud infrastructure and AI compute platform.",
  alternates: {
    canonical: `${siteConfig.url}/privacy`,
  },
  openGraph: {
    title: "Privacy Policy | AhuraSense",
    description: "Read how personal data is handled across AhuraSense cloud infrastructure and AI services.",
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
          This Privacy Policy explains how AhuraSense AI Pvt Ltd (&quot;AhuraSense&quot;,
          &quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses,
          stores, shares, protects, and otherwise processes personal data when you access or use our
          websites, portals, dashboards, APIs, cloud infrastructure services, AI inference services,
          AI training services, compute services, GPU pods, Kubernetes services, database services,
          object storage services, security services, domain services, application deployment
          services, support services, documentation, billing systems, and related offerings.
        </p>
        <p>This Privacy Policy applies to:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Visitors to our websites.</li>
          <li>Customers and prospective customers.</li>
          <li>Account administrators, developers, and technical users.</li>
          <li>Billing and support contacts.</li>
          <li>Business contacts and users of our dashboards, APIs, and portals.</li>
          <li>Individuals whose personal data may be processed through customer use of our services.</li>
        </ul>
        <p>
          This Privacy Policy should be read together with our{" "}
          <a href="/terms" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
            Terms of Service
          </a>
          ,{" "}
          <a href="/cookies" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
            Cookie Policy
          </a>
          , and, where applicable, our{" "}
          <a href="/dpa" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
            Data Processing Agreement
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "our-role",
    title: "Our Role",
    content: (
      <>
        <p>
          Depending on the context, AhuraSense may act as a data fiduciary/controller or as a data
          processor/service provider.
        </p>
        <h3 className="mt-5 text-base font-semibold text-white/90">
          2.1 When AhuraSense Acts as Data Fiduciary or Controller
        </h3>
        <p>
          We act as a data fiduciary/controller when we decide why and how personal data is
          processed. This includes processing for account registration, billing and payments,
          customer onboarding, identity verification, security monitoring, fraud prevention, product
          analytics, marketing, customer support, legal compliance, and business administration.
        </p>
        <h3 className="mt-5 text-base font-semibold text-white/90">
          2.2 When AhuraSense Acts as Processor
        </h3>
        <p>
          We act as a processor when we process Customer Data on behalf of a customer according to
          the customer&apos;s instructions. Customers may upload, host, process, train, infer,
          store, or transmit data using our infrastructure services. In such cases, the customer is
          generally responsible for determining the purpose and means of processing.
        </p>
        <p>
          Where legally required, our{" "}
          <a href="/dpa" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
            Data Processing Agreement
          </a>{" "}
          governs this processing.
        </p>
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "Personal Data We Collect",
    content: (
      <>
        <h3 className="text-base font-semibold text-white/90">3.1 Account Information</h3>
        <p>When you create or manage an account, we may collect name, business name, email address, phone number, job title, username, password or authentication credentials, organization name, account role, team members, billing profile, business verification details, tax information, and communications preferences.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">3.2 Identity and Verification Information</h3>
        <p>For certain services — especially high-value infrastructure, GPU resources, domain services, or compliance-sensitive products — we may collect business registration details, government-issued business identifiers, authorized representative details, billing verification information, use-case information, compliance certifications, sanctions screening information, and fraud risk signals.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">3.3 Billing and Payment Information</h3>
        <p>We may collect billing name, billing address, tax registration details, purchase orders, invoices, payment status, payment method metadata, transaction history, usage records, and credit, deposit, prepaid balance, or commitment details. Payment card or bank details may be processed by third-party payment processors. We generally do not store full payment card numbers unless expressly stated.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">3.4 Technical and Usage Data</h3>
        <p>When you use our services, we may collect IP address, device information, browser type, operating system, login events, API request metadata, dashboard activity, resource usage (compute, GPU, storage, bandwidth), region and product selections, error logs, security events, system telemetry, performance metrics, quota usage, rate-limit events, and audit logs.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">3.5 Customer Data</h3>
        <p>Customer Data may include files, datasets, prompts, inputs, outputs, model weights, checkpoints, embeddings, containers, images, code, secrets, configuration data, databases, object storage contents, logs submitted by customers, application data, and end-user data processed through customer workloads.</p>
        <p>Customers remain responsible for their workloads, data, software, identities, configurations, end users, compliance, and business decisions.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">3.6 Support and Communications Data</h3>
        <p>When you contact us, we may collect support ticket content, chat messages, emails, call notes, troubleshooting information, screenshots or logs you provide, feedback, survey responses, commercial discussions, and contract and order communications.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">3.7 Cookies and Similar Technologies</h3>
        <p>
          We collect information through cookies and similar technologies as described in our{" "}
          <a href="/cookies" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
            Cookie Policy
          </a>
          , including session identifiers, consent preferences, analytics events, referral sources, device information, security tokens, and dashboard preferences.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-data",
    title: "How We Use Personal Data",
    content: (
      <>
        <h3 className="text-base font-semibold text-white/90">4.1 To Provide the Services</h3>
        <p>We process personal data to create and manage accounts, authenticate users, provision cloud resources, provide dashboards and APIs, enable compute, GPU, database, Kubernetes, storage, domain, security, and deployment services, process AI inference and training workloads, provide support, and maintain service availability.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">4.2 To Secure the Services</h3>
        <p>We use personal data and technical data to detect unauthorized access, prevent fraud, investigate abuse, protect infrastructure, monitor suspicious activity, enforce access controls, manage vulnerabilities, respond to security incidents, and protect customers and third parties.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">4.3 To Bill and Manage Commercial Relationships</h3>
        <p>We use personal data to generate invoices, calculate usage-based charges, process payments, manage prepaid balances, apply taxes, resolve billing disputes, manage subscriptions and commitments, enforce payment obligations, and provide account notices.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">4.4 To Improve and Develop Services</h3>
        <p>We may use personal data, usage data, aggregated data, and de-identified data to improve product functionality, develop new features, improve documentation, measure service performance, analyze product adoption, improve onboarding and customer support, plan capacity, and enhance reliability and security.</p>
        <p>Unless separately agreed in writing, we do not use Customer Data to train foundation models for AhuraSense or third parties.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">4.5 To Communicate With You</h3>
        <p>We may use contact information to send account notices, security alerts, billing notices, product updates, maintenance notices, support responses, contract notices, policy updates, service announcements, and marketing communications where permitted. You may opt out of non-essential marketing communications while still receiving transactional, security, legal, and service-related communications.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">4.6 To Comply With Law</h3>
        <p>We may process personal data to comply with tax laws, accounting requirements, court orders, government and law-enforcement requests, export control obligations, sanctions screening, domain registry rules, data protection laws, security and incident reporting requirements, and legal claims and dispute resolution.</p>
      </>
    ),
  },
  {
    id: "legal-bases",
    title: "Legal Bases for Processing",
    content: (
      <>
        <p>Where a legal basis is required, we may process personal data based on:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Performance of a contract.</li>
          <li>Consent.</li>
          <li>Legitimate business interests.</li>
          <li>Compliance with legal obligations.</li>
          <li>Protection against fraud, abuse, and security threats.</li>
          <li>Customer instructions where we act as processor.</li>
          <li>Other lawful grounds permitted under applicable law.</li>
        </ul>
        <p>
          Under India&apos;s DPDP Act, processing of digital personal data must be for lawful
          purposes and in accordance with applicable notice, consent, legitimate use, and data
          fiduciary obligations.
        </p>
      </>
    ),
  },
  {
    id: "customer-responsibilities",
    title: "Customer Responsibilities",
    content: (
      <>
        <p>Customers are responsible for:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Ensuring they have the right to upload and process Customer Data.</li>
          <li>Providing required notices to their users and obtaining required consents.</li>
          <li>Selecting appropriate regions, services, access controls, and encryption choices.</li>
          <li>Managing retention, deletion settings, and data subject requests concerning Customer Data.</li>
          <li>Ensuring compliance with applicable laws.</li>
        </ul>
        <p>
          Customers must not upload personal data, regulated data, health data, payment card data,
          government secrets, biometric data, children&apos;s data, or other sensitive data unless
          the applicable service, order, and data protection terms permit it and appropriate
          safeguards are implemented.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Sharing of Personal Data",
    content: (
      <>
        <h3 className="text-base font-semibold text-white/90">7.1 Service Providers</h3>
        <p>We may share data with service providers for cloud infrastructure, data centers, network connectivity, payment processing, email delivery, analytics, security monitoring, customer support, error tracking, identity verification, CRM systems, and accounting and invoicing.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">7.2 Infrastructure and Technology Partners</h3>
        <p>We may rely on third-party facilities, hardware vendors, connectivity providers, domain registries, DNS providers, cloud suppliers, and software providers. These parties may process data where required to provide the services.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">7.3 Legal, Security, and Compliance Recipients</h3>
        <p>We may disclose data where necessary to comply with law, respond to valid legal requests, enforce our Terms, investigate abuse, protect security, prevent fraud, protect rights, property, and safety, or address sanctions and export-control concerns.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">7.4 Business Transfers</h3>
        <p>If we are involved in a merger, acquisition, financing, restructuring, sale of assets, or similar transaction, personal data may be transferred as part of that transaction, subject to appropriate confidentiality and legal protections.</p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International Transfers",
    content: (
      <>
        <p>
          We may process and store data in India and other countries where we, our service
          providers, infrastructure partners, or customers operate.
        </p>
        <p>
          Where applicable law requires safeguards for cross-border transfers, we will use
          appropriate mechanisms such as contractual safeguards, standard contractual clauses,
          transfer impact assessments, customer instructions, or other lawful transfer tools.
        </p>
        <p>
          For EU/EEA personal data, GDPR Article 28 requires specific controller-processor terms,
          including documented instructions, confidentiality, security, subprocessor controls,
          assistance with data subject rights, deletion or return, and audit support.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <>
        <p>We maintain administrative, technical, and organizational measures designed to protect personal data and the services, including:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Access controls and authentication.</li>
          <li>Logging, monitoring, and network security.</li>
          <li>Encryption where appropriate.</li>
          <li>Vulnerability management and incident response processes.</li>
          <li>Supplier review, backup, and recovery controls.</li>
          <li>Segregation of environments and security reviews.</li>
        </ul>
        <p>
          No security system is perfect. Customers must also secure their workloads, credentials,
          applications, containers, databases, APIs, models, secrets, storage buckets, and access
          policies.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Data Retention",
    content: (
      <>
        <p>We retain personal data for as long as reasonably necessary for the purposes described in this Privacy Policy, including providing services, maintaining accounts, billing and tax compliance, security monitoring, fraud prevention, legal compliance, dispute resolution, contract enforcement, and audit purposes.</p>
        <p>Customer Data retention depends on the applicable service, order, configuration, and customer instructions. After termination or expiry, Customer Data may be deleted or disabled after the period stated in the Terms of Service or applicable agreement.</p>
        <p>We may retain logs, billing records, security records, legal records, and backup copies for legitimate business, compliance, security, or dispute purposes.</p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Data Subject Rights",
    content: (
      <>
        <p>Depending on applicable law, individuals may have rights to:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Access, correct, or delete personal data.</li>
          <li>Withdraw consent and object to or restrict certain processing.</li>
          <li>Receive a copy of personal data and file a complaint.</li>
          <li>Nominate another person to exercise rights where applicable.</li>
          <li>Request information about processing.</li>
        </ul>
        <p>
          Where AhuraSense acts as a processor for Customer Data, we may direct requests to the
          relevant customer unless legally required to respond directly. To submit a request, email{" "}
          <a
            href="mailto:privacy@ahurasense.ai"
            className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
          >
            privacy@ahurasense.ai
          </a>
          . We may need to verify your identity before responding.
        </p>
      </>
    ),
  },
  {
    id: "childrens-data",
    title: "Children's Data",
    content: (
      <>
        <p>
          Our services are intended for business and developer use. They are not intended for
          children.
        </p>
        <p>
          Customers must not use the services to collect or process children&apos;s personal data
          unless they have a lawful basis, required consents, appropriate safeguards, and written
          agreement from AhuraSense where required.
        </p>
      </>
    ),
  },
  {
    id: "ai-workloads",
    title: "AI Workloads and Privacy",
    content: (
      <>
        <p>Customers may use AhuraSense services for AI inference, fine-tuning, training, embedding generation, evaluation, model hosting, and related workloads. Customers are responsible for:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Dataset rights, privacy notices, lawful bases, and consent.</li>
          <li>Sensitive data safeguards, bias and safety testing, and model license compliance.</li>
          <li>Output review, downstream use, end-user disclosures, retention and deletion, and regulatory compliance.</li>
        </ul>
        <p>Unless separately agreed in writing, AhuraSense does not use Customer Data to train foundation models for AhuraSense or third parties.</p>
      </>
    ),
  },
  {
    id: "sensitive-data",
    title: "Sensitive and Regulated Data",
    content: (
      <>
        <p>Customers must not upload or process highly sensitive or regulated data unless the applicable service and agreement permit it. This may include:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Health data, biometric data, and children&apos;s data.</li>
          <li>Payment card data and financial account data.</li>
          <li>Government secrets and authentication secrets.</li>
          <li>Special-category personal data and data subject to sector-specific regulation.</li>
        </ul>
        <p>If such processing is permitted, customers must implement appropriate safeguards, including encryption, access control, logging, retention controls, and legal compliance processes.</p>
      </>
    ),
  },
  {
    id: "marketing",
    title: "Marketing Communications",
    content: (
      <>
        <p>
          We may send marketing communications about our products, services, events, updates, and
          offers where permitted by law.
        </p>
        <p>
          You may opt out of marketing emails by using the unsubscribe link or contacting us.
          Opting out of marketing does not affect transactional, legal, billing, security, or
          service-related communications.
        </p>
      </>
    ),
  },
  {
    id: "third-party-links",
    title: "Third-Party Links and Services",
    content: (
      <>
        <p>
          Our websites and services may link to third-party websites, registries, payment
          processors, model providers, software repositories, documentation, marketplaces, or
          integrations.
        </p>
        <p>
          We are not responsible for the privacy practices of third parties. You should review
          their privacy policies before using them.
        </p>
      </>
    ),
  },
  {
    id: "policy-updates",
    title: "Changes to This Privacy Policy",
    content: (
      <>
        <p>
          We may update this Privacy Policy from time to time to reflect changes in law, services,
          security practices, or business operations.
        </p>
        <p>
          We will post the updated policy on our website or otherwise notify you where required.
          Continued use of the services after the effective date means you accept the updated
          policy, where permitted by law.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact and Grievance Details",
    content: (
      <>
        <p>For privacy questions, requests, or complaints, contact:</p>
        <div className="mt-4 space-y-1.5 rounded border border-white/[0.08] bg-white/[0.02] p-5 text-sm">
          <p className="font-semibold text-white/90">AhuraSense AI Pvt Ltd</p>
          <p className="text-white/60">CIN: <span className="text-white/45">[To be updated]</span></p>
          <p className="text-white/60">Registered Address: <span className="text-white/45">[To be updated]</span></p>
          <p className="text-white/60">
            Privacy Email:{" "}
            <a href="mailto:privacy@ahurasense.ai" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
              privacy@ahurasense.ai
            </a>
          </p>
          <p className="text-white/60">Grievance / Data Protection Contact: <span className="text-white/45">[To be updated]</span></p>
          <p className="text-white/60">Phone: <span className="text-white/45">[To be updated]</span></p>
        </div>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      currentPath="/privacy"
      title="Privacy Policy"
      description="This policy outlines how AhuraSense AI Pvt Ltd collects, uses, stores, and protects personal data for customer accounts, platform usage, security operations, AI workloads, and support."
      effectiveDate="May 30, 2026"
      lastUpdated="May 30, 2026"
      sections={SECTIONS}
    />
  );
}
