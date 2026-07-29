import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Understand how AhuraSense Technologies Private Limited collects, uses, stores, shares, and protects personal data across its cloud infrastructure and AI compute platform.",
  alternates: {
    canonical: `${siteConfig.url}/privacy`,
  },
  openGraph: {
    title: "Privacy Policy | AhuraSense",
    description: "Read how personal data is handled across AhuraSense cloud infrastructure and AI services.",
    url: `${siteConfig.url}/privacy`,
  },
};

const GROUPS: LegalSectionGroup[] = [
  {
    label: "Privacy Fundamentals",
    sections: [
      {
        id: "overview",
        title: "Overview",
        content: (
          <>
            <p>
              This Privacy Policy explains how AhuraSense Technologies Private Limited (&quot;AhuraSense&quot;,
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
              When AhuraSense Acts as Data Fiduciary or Controller
            </h3>
            <p>
              We act as a data fiduciary/controller when we decide why and how personal data is
              processed. This includes processing for account registration, billing and payments,
              customer onboarding, identity verification, security monitoring, fraud prevention, product
              analytics, marketing, customer support, legal compliance, and business administration.
            </p>
            <h3 className="mt-5 text-base font-semibold text-white/90">
              When AhuraSense Acts as Processor
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
        id: "personal-data-we-collect",
        title: "Personal Data We Collect",
        content: (
          <>
            <h3 className="text-base font-semibold text-white/90">Account Information</h3>
            <p>When you create or manage an account, we may collect name, business name, email address, phone number, job title, username, password or authentication credentials, organization name, account role, team members, billing profile, business verification details, tax information, and communications preferences.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Identity and Verification Information</h3>
            <p>For certain services — especially high-value infrastructure, GPU resources, domain services, or compliance-sensitive products — we may collect business registration details, government-issued business identifiers, authorized representative details, billing verification information, use-case information, compliance certifications, sanctions screening information, and fraud risk signals.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Billing and Payment Information</h3>
            <p>We may collect billing name, billing address, tax registration details, purchase orders, invoices, payment status, payment method metadata, transaction history, usage records, and credit, deposit, prepaid balance, or commitment details. Payment card or bank details may be processed by third-party payment processors. We generally do not store full payment card numbers unless expressly stated.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Technical and Usage Data</h3>
            <p>When you use our services, we may collect IP address, device information, browser type, operating system, login events, API request metadata, dashboard activity, resource usage (compute, GPU, storage, bandwidth), region and product selections, error logs, security events, system telemetry, performance metrics, quota usage, rate-limit events, and audit logs.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Customer Data</h3>
            <p>Customer Data may include files, datasets, prompts, inputs, outputs, model weights, checkpoints, embeddings, containers, images, code, secrets, configuration data, databases, object storage contents, logs submitted by customers, application data, and end-user data processed through customer workloads.</p>
            <p>Customers remain responsible for their workloads, data, software, identities, configurations, end users, compliance, and business decisions.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Support and Communications Data</h3>
            <p>When you contact us, we may collect support ticket content, chat messages, emails, call notes, troubleshooting information, screenshots or logs you provide, feedback, survey responses, commercial discussions, and contract and order communications.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Cookies and Similar Technologies</h3>
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
        id: "how-we-use-personal-data",
        title: "How We Use Personal Data",
        content: (
          <>
            <h3 className="text-base font-semibold text-white/90">To Provide the Services</h3>
            <p>We process personal data to create and manage accounts, authenticate users, provision cloud resources, provide dashboards and APIs, enable compute, GPU, database, Kubernetes, storage, domain, security, and deployment services, process AI inference and training workloads, provide support, and maintain service availability.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">To Secure the Services</h3>
            <p>We use personal data and technical data to detect unauthorized access, prevent fraud, investigate abuse, protect infrastructure, monitor suspicious activity, enforce access controls, manage vulnerabilities, respond to security incidents, and protect customers and third parties.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">To Bill and Manage Commercial Relationships</h3>
            <p>We use personal data to generate invoices, calculate usage-based charges, process payments, manage prepaid balances, apply taxes, resolve billing disputes, manage subscriptions and commitments, enforce payment obligations, and provide account notices.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">To Improve and Develop Services</h3>
            <p>We may use personal data, usage data, aggregated data, and de-identified data to improve product functionality, develop new features, improve documentation, measure service performance, analyze product adoption, improve onboarding and customer support, plan capacity, and enhance reliability and security.</p>
            <p>Unless separately agreed in writing, we do not use Customer Data to train foundation models for AhuraSense or third parties.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">To Communicate With You</h3>
            <p>We may use contact information to send account notices, security alerts, billing notices, product updates, maintenance notices, support responses, contract notices, policy updates, service announcements, and marketing communications where permitted. You may opt out of non-essential marketing communications while still receiving transactional, security, legal, and service-related communications.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">To Comply With Law</h3>
            <p>We may process personal data to comply with tax laws, accounting requirements, court orders, government and law-enforcement requests, export control obligations, sanctions screening, domain registry rules, data protection laws, security and incident reporting requirements, and legal claims and dispute resolution.</p>
          </>
        ),
      },
      {
        id: "legal-bases-for-processing",
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
              For personal data subject to the EU General Data Protection Regulation or the UK GDPR,
              the relevant lawful basis is identified under Article 6, and any processing of
              special-category data additionally relies on a condition under Article 9.
            </p>
            <p>
              Under India&apos;s Digital Personal Data Protection Act 2023, processing of digital
              personal data must be for a lawful purpose and based either on the consent of the Data
              Principal or on a legitimate use recognised by the Act, and in accordance with applicable
              notice, consent, and data fiduciary obligations.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Data Handling",
    sections: [
      {
        id: "sharing-of-personal-data",
        title: "Sharing of Personal Data",
        content: (
          <>
            <h3 className="text-base font-semibold text-white/90">Service Providers</h3>
            <p>We may share data with service providers for cloud infrastructure, data centers, network connectivity, payment processing, email delivery, analytics, security monitoring, customer support, error tracking, identity verification, CRM systems, and accounting and invoicing.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Infrastructure and Technology Partners</h3>
            <p>We may rely on third-party facilities, hardware vendors, connectivity providers, domain registries, DNS providers, cloud suppliers, and software providers. These parties may process data where required to provide the services.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Legal, Security, and Compliance Recipients</h3>
            <p>We may disclose data where necessary to comply with law, respond to valid legal requests, enforce our Terms, investigate abuse, protect security, prevent fraud, protect rights, property, and safety, or address sanctions and export-control concerns.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Business Transfers</h3>
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
              We may process and store data in India, the United Kingdom, and other countries where we,
              our service providers, infrastructure partners, or customers operate.
            </p>
            <p>
              Where applicable law requires safeguards for cross-border transfers, we will use
              appropriate mechanisms such as the European Commission&apos;s Standard Contractual
              Clauses, the UK International Data Transfer Agreement or UK Addendum, adequacy decisions,
              transfer impact assessments, documented customer instructions, or other lawful transfer
              tools.
            </p>
            <p>
              For EU/EEA and UK personal data, GDPR Article 28 requires specific controller-processor
              terms, including documented instructions, confidentiality, security, subprocessor
              controls, assistance with data subject rights, deletion or return, and audit support.
              Those terms are set out in our{" "}
              <a href="/dpa" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                Data Processing Agreement
              </a>
              .
            </p>
            <p>
              Transfers of digital personal data outside India are made in accordance with the Digital
              Personal Data Protection Act 2023 and any restrictions notified by the Central Government
              in respect of particular territories.
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
              Our security programme is designed to align with recognised industry frameworks for
              information security management. Detailed technical and organisational measures are
              described in Schedule 2 of our{" "}
              <a href="/dpa" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                Data Processing Agreement
              </a>
              .
            </p>
            <p>
              No security system is perfect. Customers must also secure their workloads, credentials,
              applications, containers, databases, APIs, models, secrets, storage buckets, and access
              policies.
            </p>
          </>
        ),
      },
      {
        id: "data-retention",
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
        id: "sale-and-sharing-of-personal-data",
        title: "Sale and Sharing of Personal Data",
        content: (
          <>
            <p>
              AhuraSense does not sell Customer Data. AhuraSense does not sell personal data for
              monetary consideration as part of its ordinary business model.
            </p>
            <p>
              Where privacy laws define &quot;sale&quot;, &quot;sharing&quot; or targeted advertising
              more broadly than a conventional monetary sale, certain advertising or analytics
              technologies may be treated as sharing under those laws. Where applicable, AhuraSense
              will provide legally required consent or opt-out mechanisms.
            </p>
            <p>
              Customer workload content is not provided to advertising providers for targeted
              advertising.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Your Rights",
    sections: [
      {
        id: "privacy-rights-and-choices",
        title: "Privacy Rights and Choices",
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
              Individuals in the EU/EEA and the UK may exercise the rights provided under Articles 15
              to 22 of the GDPR and UK GDPR, and may lodge a complaint with their supervisory
              authority. Data Principals in India may exercise the rights of access, correction,
              erasure, grievance redressal, and nomination provided under the Digital Personal Data
              Protection Act 2023, and may escalate an unresolved grievance to the Data Protection
              Board of India.
            </p>
            <p>
              Where AhuraSense acts as a processor for Customer Data, we may direct requests to the
              relevant customer unless legally required to respond directly. To submit a request, email{" "}
              <a
                href="mailto:legal@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                legal@ahurasense.com
              </a>
              . We may need to verify your identity before responding, and we will respond within the
              period required by applicable law.
            </p>
          </>
        ),
      },
      {
        id: "childrens-data",
        title: "Children’s Data",
        content: (
          <>
            <p>
              Our services are intended for business and developer use. They are not intended for
              children, and we do not knowingly collect personal data directly from children.
            </p>
            <p>
              Customers must not use the services to collect or process children&apos;s personal data
              unless they have a lawful basis, required consents, appropriate safeguards, and written
              agreement from AhuraSense where required. Under India&apos;s Digital Personal Data
              Protection Act 2023, processing the personal data of a child generally requires verifiable
              consent from a parent or lawful guardian, and tracking, behavioural monitoring, and
              targeted advertising directed at children are prohibited.
            </p>
            <p>
              If we become aware that we have collected personal data from a child without an
              appropriate legal basis, we will take reasonable steps to delete it.
            </p>
          </>
        ),
      },
      {
        id: "marketing-communications",
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
        id: "automated-decision-making",
        title: "Automated Decision-Making, Fraud Detection and Profiling",
        content: (
          <>
            <p>
              AhuraSense may use automated tools to help detect fraud, account takeover, payment risk,
              abuse, malware, suspicious network activity, unusual resource consumption, sanctions risk
              and attempts to circumvent platform controls.
            </p>
            <p>
              These systems may analyse technical and account information including IP addresses,
              authentication events, payment indicators, account history, resource usage, network
              behaviour, device characteristics, geographic signals and other relevant risk indicators.
              Automated tools may flag an account or transaction for further review, temporarily
              restrict particular actions, request additional verification, or prioritise an
              investigation.
            </p>
            <p>
              Where Applicable Law provides a right concerning decisions based solely on automated
              processing that produce legal or similarly significant effects, AhuraSense will provide
              the rights required by that law. Where practicable and appropriate, material account
              restrictions based on risk signals are subject to human review before permanent adverse
              action is taken, except where immediate action is reasonably necessary to prevent fraud,
              active security threats, prohibited content, sanctions violations or imminent harm.
            </p>
            <p>
              Customers may contact{" "}
              <a
                href="mailto:legal@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                legal@ahurasense.com
              </a>{" "}
              or{" "}
              <a
                href="mailto:support@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                support@ahurasense.com
              </a>{" "}
              to request review of an account decision where a review mechanism is legally required or
              otherwise available.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Cloud & AI",
    sections: [
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
        id: "ai-workloads-and-privacy",
        title: "AI Workloads and Privacy",
        content: (
          <>
            <p>
              Customers may use AhuraSense services for AI inference, fine-tuning, training, embedding
              generation, evaluation, model hosting, and related workloads. Prompts, inputs, outputs,
              training and evaluation datasets, embeddings, checkpoints, adapters, and model weights
              that a customer submits to or generates on our infrastructure are Customer Data. We
              process them as a processor, on the customer&apos;s documented instructions, solely to
              provide, secure, and support the services.
            </p>
            <p>
              Unless separately agreed in writing, AhuraSense does not use Customer Data — including
              prompts, outputs, datasets, or model weights — to train, fine-tune, or evaluate
              foundation models for AhuraSense or for any third party, and does not sell Customer Data
              or make it available to other customers.
            </p>
            <p>
              Operating an inference or training platform necessarily produces logs. For hosted
              inference endpoints we record operational metadata such as timestamps, model identifier,
              endpoint, token and request counts, latency, error codes, and account identifiers, which
              we use for billing, capacity planning, abuse prevention, and troubleshooting. Prompt and
              output content is not retained in our operational logs by default; where a customer
              enables a logging, tracing, evaluation, or debugging feature that persists request
              content, that content is stored within the customer&apos;s own resources under the
              retention settings the customer selects. Content may be retained for a short period
              beyond a request only where necessary to deliver the service, investigate a specific
              incident the customer has reported, or comply with a legal obligation.
            </p>
            <p>Customers using AI workloads remain responsible for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Dataset rights, privacy notices, lawful bases, and consent for training and inference data.</li>
              <li>Data minimisation, sensitive data safeguards, and de-identification where appropriate.</li>
              <li>Bias, safety, and robustness testing, and model licence compliance.</li>
              <li>Output review, human oversight where required, and downstream use of generated content.</li>
              <li>End-user disclosures, retention and deletion settings, and applicable AI and sectoral regulation.</li>
            </ul>
          </>
        ),
      },
      {
        id: "sensitive-and-regulated-data",
        title: "Sensitive and Regulated Data",
        content: (
          <>
            <p>
              Our standard services are not offered as a compliance-qualified environment for every
              category of regulated data. Customers must not upload or process highly sensitive or
              regulated data unless the applicable service description, Order Form, and data protection
              terms expressly permit it. Restricted categories include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Health, medical, and genetic data, including data subject to sector-specific health privacy laws.</li>
              <li>Biometric identifiers and biometric templates.</li>
              <li>Children&apos;s personal data.</li>
              <li>Payment card data within the scope of PCI DSS, and financial account credentials.</li>
              <li>Government, defence, or classified information and authentication secrets belonging to third parties.</li>
              <li>Special-category data under GDPR Article 9, criminal offence data under Article 10, and equivalent categories under other applicable laws.</li>
            </ul>
            <p>
              Where such processing is expressly permitted, the customer must implement safeguards
              proportionate to the risk — including encryption in transit and at rest, strict access
              control and least privilege, comprehensive audit logging, defined retention and deletion
              schedules, a completed data protection impact assessment where required, and any
              sector-specific controls mandated by law or by the customer&apos;s own regulator.
            </p>
            <p>
              AhuraSense may suspend or restrict processing where it reasonably believes that sensitive
              or regulated data is being processed outside the scope of the applicable agreement, or
              where continued processing would expose either party to material legal or security risk.
              Customers must notify us before introducing a new category of regulated data into an
              existing workload.
            </p>
          </>
        ),
      },
      {
        id: "third-party-services",
        title: "Third-Party Services",
        content: (
          <>
            <p>
              Our websites and services may link to or integrate with third-party websites, registries,
              payment processors, model providers, software repositories, documentation, marketplaces,
              or integrations.
            </p>
            <p>
              Where you choose to enable a third-party integration, that provider processes data under
              its own terms and privacy policy, and as an independent controller in respect of the data
              it receives. We are not responsible for the privacy practices of third parties. You should
              review their privacy policies before using them.
            </p>
          </>
        ),
      },
      {
        id: "recruitment-and-applicant-data",
        title: "Recruitment and Applicant Data",
        content: (
          <>
            <p>
              Where you apply for employment, internship, consulting work or another role with
              AhuraSense, we may process information contained in your application, CV or résumé,
              portfolio, professional profiles, communications, interview notes, technical assessments,
              employment history, education, compensation expectations, references and information you
              voluntarily provide during recruitment.
            </p>
            <p>
              We process applicant information to evaluate suitability, communicate with applicants,
              arrange interviews, verify qualifications where appropriate, maintain recruitment records,
              comply with employment and legal obligations, protect our legitimate interests and, where
              permitted, consider candidates for future opportunities.
            </p>
            <p>
              Access to applicant information is limited to personnel and service providers involved in
              recruitment, legal, compliance, human resources and hiring decisions. Applicant
              information is retained only for as long as reasonably required for the recruitment
              process, legal obligations, dispute management and future consideration where permitted.
            </p>
            <p>
              Where Applicable Law gives an applicant access, correction, deletion or other privacy
              rights, those rights may be exercised through{" "}
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
  {
    label: "Legal",
    sections: [
      {
        id: "changes-to-privacy-policy",
        title: "Changes to Privacy Policy",
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
        id: "contact-and-grievance-details",
        title: "Contact and Grievance Details",
        content: (
          <>
            <p>
              For privacy enquiries, Data Principal requests, Data Subject requests, complaints and
              data-protection matters, contact:
            </p>
            <div className="mt-4 rounded border border-white/[0.08] bg-white/[0.02] p-5 text-sm">
              <p className="mb-3 font-semibold text-white/90">
                AhuraSense Technologies Private Limited
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li className="text-white/60">
                  CIN: <span className="text-white/45">[INSERT MCA-REGISTERED CIN]</span>
                </li>
                <li className="text-white/60">
                  Registered Office: 2/26 Umiya Nagar, Nirnay Nagar, Ahmedabad, Gujarat 382481, India
                </li>
                <li className="text-white/60">
                  Privacy and Data Protection:{" "}
                  <a
                    href="mailto:legal@ahurasense.com"
                    className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                  >
                    legal@ahurasense.com
                  </a>
                </li>
                <li className="text-white/60">
                  Legal:{" "}
                  <a
                    href="mailto:legal@ahurasense.com"
                    className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                  >
                    legal@ahurasense.com
                  </a>
                </li>
                <li className="text-white/60">
                  Grievance Contact / Officer:{" "}
                  <span className="text-white/45">
                    [INSERT NAME OR DESIGNATION REQUIRED BY APPLICABLE LAW]
                  </span>
                </li>
                <li className="text-white/60">
                  Telephone:{" "}
                  <span className="text-white/45">[INSERT BUSINESS CONTACT NUMBER]</span>
                </li>
              </ul>
            </div>
            <p>
              AhuraSense will maintain a grievance mechanism and respond within the period required by
              applicable law. Where AhuraSense acts solely as a processor on behalf of a Customer,
              requests concerning Customer Personal Data may be referred to the Customer that determines
              the purpose and means of the processing.
            </p>
            <p>
              Data Principals in India may exercise rights available under the Digital Personal Data
              Protection Act 2023 and applicable rules as those provisions come into force. Individuals
              in the EEA, UK and other jurisdictions may exercise rights available under the
              data-protection law applicable to them.
            </p>
            <p>
              For UK and EEA enquiries, you may also contact our UK entity, AhuraSense Ltd, 20 Wenlock
              Road, London, England N1 7GU, United Kingdom, at{" "}
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

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      currentPath="/privacy"
      title="Privacy Policy"
      description="This policy outlines how AhuraSense Technologies Private Limited collects, uses, stores, and protects personal data for customer accounts, platform usage, security operations, AI workloads, and support."
      effectiveDate="May 30, 2026"
      lastUpdated="May 30, 2026"
      groups={GROUPS}
      showPrivacyDocSelector
    />
  );
}
