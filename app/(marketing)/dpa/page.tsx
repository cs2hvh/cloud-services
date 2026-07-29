import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description:
    "Review the AhuraSense Technologies Private Limited Data Processing Agreement covering processor obligations, security measures, subprocessors, international transfer safeguards, and customer responsibilities.",
  alternates: {
    canonical: `${siteConfig.url}/dpa`,
  },
  openGraph: {
    title: "Data Processing Agreement | AhuraSense",
    description: "Data processing commitments and safeguards for AhuraSense customers.",
    url: `${siteConfig.url}/dpa`,
  },
};

const GROUPS: LegalSectionGroup[] = [
  {
    label: "Agreement",
    sections: [
      {
        id: "purpose-and-scope",
        title: "Purpose and Scope",
        content: (
          <>
            <p>
              This Data Processing Agreement (&quot;DPA&quot;) governs the processing of Personal Data
              by AhuraSense Technologies Private Limited on behalf of Customer in connection with AhuraSense&apos;s cloud
              infrastructure, AI inference, AI training, compute, GPU pod, Kubernetes, database, object
              storage, security, domain, application deployment, support, and related services.
            </p>
            <p>
              This DPA applies where AhuraSense processes Personal Data as a processor, service
              provider, or equivalent role on behalf of Customer.
            </p>
            <p>
              This DPA does not apply where AhuraSense processes personal data as an independent data
              fiduciary/controller — such as for account registration, billing, fraud prevention, legal
              compliance, security monitoring, or business administration. Such processing is governed
              by the{" "}
              <a href="/privacy" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                Privacy Policy
              </a>
              .
            </p>
          </>
        ),
      },
      {
        id: "definitions",
        title: "Definitions",
        content: (
          <>
            <ul className="space-y-3">
              {[
                { term: "Agreement", def: 'The Terms of Service, Order Form, Master Services Agreement, statement of work, or other written agreement between the parties.' },
                { term: "Customer", def: 'The entity or individual that has entered into the Agreement with AhuraSense.' },
                { term: "Customer Personal Data", def: 'Personal Data processed by AhuraSense on behalf of Customer through the services.' },
                { term: "Data Protection Laws", def: 'Applicable privacy, data protection, cybersecurity, and data security laws, including where applicable the Digital Personal Data Protection Act 2023, GDPR, UK GDPR, and other relevant laws.' },
                { term: "Data Subject", def: 'An identified or identifiable individual to whom Personal Data relates, including a Data Principal as defined under the Digital Personal Data Protection Act 2023.' },
                { term: "Personal Data", def: 'Information relating to an identified or identifiable individual, or equivalent definition under applicable Data Protection Laws.' },
                { term: "Processing", def: 'Any operation performed on Personal Data, including collection, storage, use, transmission, disclosure, deletion, organization, retrieval, or other handling.' },
                { term: "Processor", def: 'AhuraSense where it processes Customer Personal Data on behalf of Customer.' },
                { term: "Controller", def: 'Customer where it determines the purposes and means of processing Customer Personal Data.' },
                { term: "Subprocessor", def: 'A third party engaged by AhuraSense to process Customer Personal Data on behalf of Customer.' },
                { term: "Security Incident", def: 'A confirmed breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to Customer Personal Data processed by AhuraSense.' },
                { term: "Standard Contractual Clauses", def: 'The standard contractual clauses adopted by the European Commission for transfers of personal data to third countries, and, for UK transfers, the UK International Data Transfer Agreement or the UK Addendum to the EU clauses.' },
              ].map(({ term, def }) => (
                <li key={term}>
                  <span className="font-semibold text-white/90">&quot;{term}&quot;</span>{' '}
                  <span className="text-white/65">means {def}</span>
                </li>
              ))}
            </ul>
          </>
        ),
      },
      {
        id: "roles-of-the-parties",
        title: "Roles of the Parties",
        content: (
          <>
            <p>Customer is the controller, data fiduciary, business, or equivalent entity responsible for determining the purposes and means of processing Customer Personal Data.</p>
            <p>AhuraSense is the processor, data processor, service provider, or equivalent entity processing Customer Personal Data on behalf of Customer.</p>
            <p>Customer is responsible for ensuring that:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>It has a lawful basis for processing Customer Personal Data.</li>
              <li>It has provided required notices and obtained required consents.</li>
              <li>Its instructions to AhuraSense are lawful.</li>
              <li>Customer Personal Data may be processed through the services.</li>
              <li>It has selected suitable services, regions, safeguards, and configurations.</li>
              <li>It complies with Data Protection Laws.</li>
            </ul>
            <p>AhuraSense will process Customer Personal Data only as described in this DPA, the Agreement, Customer&apos;s documented instructions, or as required by law.</p>
          </>
        ),
      },
      {
        id: "customer-instructions",
        title: "Customer Instructions",
        content: (
          <>
            <p>Customer instructs AhuraSense to process Customer Personal Data as necessary to provide the services — including hosting workloads, storing Customer Data, processing API requests, providing compute and GPU resources, running AI inference and training workloads, operating Kubernetes, databases, object storage, domains, and application deployment features, providing technical support, securing the services, and preventing abuse.</p>
            <p>Customer may provide additional instructions through account settings, dashboard configurations, API calls, support requests, written instructions, and Order Forms.</p>
            <p>AhuraSense may decline or suspend instructions that it reasonably believes violate law, the Agreement, supplier requirements, security requirements, or acceptable use rules. Where AhuraSense considers that an instruction infringes Data Protection Laws, it will inform Customer without undue delay.</p>
          </>
        ),
      },
      {
        id: "details-of-processing",
        title: "Details of Processing",
        content: (
          <>
            <h3 className="text-base font-semibold text-white/90">Subject Matter</h3>
            <p>The provision of cloud infrastructure and related technical services by AhuraSense to Customer.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Duration</h3>
            <p>Processing continues for the term of the Agreement and any period required for deletion, return, backup retention, legal compliance, billing, security, or dispute resolution.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Nature and Purpose</h3>
            <p>Processing may include hosting, storage, transmission, retrieval, compute processing, AI inference, AI training, fine-tuning, embedding generation, database processing, Kubernetes orchestration, application deployment, security monitoring, backup and recovery, technical support, billing support, abuse prevention, and incident response.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Categories of Data Subjects</h3>
            <p>Customer Personal Data may relate to customer employees, contractors, administrators, developers, end users, business contacts, support users, and individuals included in datasets, files, logs, databases, prompts, outputs, or workloads uploaded by Customer.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Categories of Personal Data</h3>
            <p>Customer Personal Data may include names, email addresses, user IDs, IP addresses, device identifiers, account identifiers, application data, log data, support data, prompt and output data, dataset records, database records, files and documents, images, audio, or text submitted by Customer, and metadata.</p>

            <h3 className="mt-5 text-base font-semibold text-white/90">Sensitive Data</h3>
            <p>Customer must not submit sensitive, regulated, children&apos;s, biometric, health, financial, payment card, government secret, or special-category data unless the applicable Agreement expressly permits such processing and Customer has implemented appropriate safeguards.</p>

            <p className="mt-5">A consolidated summary of these details is set out in Schedule 1.</p>
          </>
        ),
      },
    ],
  },
  {
    label: "Data Protection",
    sections: [
      {
        id: "confidentiality",
        title: "Confidentiality",
        content: (
          <>
            <p>AhuraSense will ensure that personnel authorized to process Customer Personal Data are subject to confidentiality obligations or are under an appropriate statutory obligation of confidentiality.</p>
            <p>AhuraSense will limit access to Customer Personal Data to personnel who need access to provide, secure, support, or maintain the services.</p>
          </>
        ),
      },
      {
        id: "security-measures",
        title: "Security Measures",
        content: (
          <>
            <p>AhuraSense will implement and maintain appropriate technical and organizational measures designed to protect Customer Personal Data. These may include:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Role-based access controls, authentication controls, and least-privilege practices.</li>
              <li>Encryption in transit and at rest where supported.</li>
              <li>Logging, monitoring, network security controls, and abuse detection.</li>
              <li>Vulnerability management, incident response procedures, and security testing.</li>
              <li>Segregation of customer environments, backup and recovery measures, and supplier security review.</li>
            </ul>
            <p>The measures in place as at the effective date of this DPA are described in Schedule 2. AhuraSense may update those measures provided the overall level of protection is not materially reduced.</p>
            <p>Customer remains responsible for securing accounts, API keys, SSH keys, passwords, secrets, containers, applications, databases, Kubernetes roles, firewalls, network policies, domain settings, AI models, training datasets, and end-user access.</p>
          </>
        ),
      },
      {
        id: "subprocessors",
        title: "Subprocessors",
        content: (
          <>
            <p>
              AhuraSense is generally authorised to engage Subprocessors as necessary to provide the
              Services. AhuraSense will maintain a public or Customer-accessible current Subprocessor
              List identifying Subprocessors that may process Customer Personal Data in connection with
              the Services. The Subprocessor List will identify, as applicable, the Subprocessor,
              purpose or service category and principal processing location.
            </p>
            <p>
              Before allowing a Subprocessor to process Customer Personal Data, AhuraSense will impose
              written confidentiality, security, data-protection, deletion and assistance obligations
              appropriate to the processing.
            </p>
            <p>
              Where required by Applicable Data Protection Law or a Customer&apos;s executed DPA,
              AhuraSense will provide advance notice before a new Subprocessor begins processing
              Customer Personal Data. Unless the executed DPA states another period, Customer may object
              within thirty days on reasonable data-protection grounds. The parties will attempt in good
              faith to resolve the objection through a reasonable alternative where commercially and
              technically feasible.
            </p>
            <p>
              AhuraSense remains responsible for the performance of its Subprocessors to the extent
              required by Applicable Data Protection Law and this DPA.
            </p>
            <p>
              The current Subprocessor List is published at{" "}
              <Link
                href="/subprocessors"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                /subprocessors
              </Link>
              , and Customer may also request a copy by contacting{" "}
              <a href="mailto:legal@ahurasense.com" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                legal@ahurasense.com
              </a>
              .
            </p>
          </>
        ),
      },
      {
        id: "us-state-privacy-terms",
        title: "US State Privacy Terms",
        content: (
          <>
            <p>
              To the extent Customer Personal Data is subject to a United States state privacy law that
              recognises a processor, service provider, contractor or equivalent restricted processing
              role, AhuraSense will act in that role to the extent required by the applicable law.
            </p>
            <p>
              AhuraSense will not sell Customer Personal Data or share Customer Personal Data for
              cross-context behavioural advertising. AhuraSense will not retain, use or disclose
              Customer Personal Data outside the direct business relationship with Customer except as
              necessary to provide the Services, secure the Services, comply with Customer instructions,
              comply with law, prevent fraud or abuse, or as otherwise permitted for a processor or
              service provider under Applicable Data Protection Law.
            </p>
            <p>
              AhuraSense will not combine Customer Personal Data received from or on behalf of one
              Customer with personal data received from another person or collected from
              AhuraSense&apos;s independent interaction with an individual except where necessary to
              provide the Services or otherwise permitted by Applicable Data Protection Law.
            </p>
            <p>
              AhuraSense will provide the same level of privacy protection required of processors or
              service providers under Applicable Data Protection Law and will notify Customer if
              AhuraSense determines it can no longer meet a material applicable processing obligation.
              Customer may take reasonable and appropriate steps to help ensure that AhuraSense uses
              Customer Personal Data consistently with Customer&apos;s obligations and this DPA, subject
              to the audit limitations stated elsewhere in the DPA.
            </p>
          </>
        ),
      },
      {
        id: "international-transfers",
        title: "International Transfers",
        content: (
          <>
            <p>Customer acknowledges that AhuraSense and its Subprocessors may process Customer Personal Data in India, the United Kingdom, and other jurisdictions where services, infrastructure, support, or suppliers operate.</p>
            <p>Where Customer Personal Data is subject to transfer restrictions, the parties will use appropriate safeguards including Standard Contractual Clauses, transfer impact assessments, data processing terms, customer-approved regions, contractual safeguards, and other lawful transfer mechanisms.</p>
            <p>For transfers of EU/EEA personal data to a third country without an adequacy decision, the parties incorporate the European Commission&apos;s Standard Contractual Clauses, Module Two (controller to processor) or Module Three (processor to processor) as applicable, with Customer as data exporter and AhuraSense as data importer. For UK personal data, the UK International Data Transfer Agreement or the UK Addendum to the EU clauses applies. Schedules 1 and 2 serve as the corresponding annexes describing the transfer and the technical and organisational measures.</p>
            <p>Transfers of digital personal data outside India are made in accordance with the Digital Personal Data Protection Act 2023 and any territorial restrictions notified by the Central Government.</p>
          </>
        ),
      },
    ],
  },
  {
    label: "Assistance & Incidents",
    sections: [
      {
        id: "data-subject-requests",
        title: "Data Subject Requests",
        content: (
          <>
            <p>Taking into account the nature of processing and information available to AhuraSense, AhuraSense will provide reasonable assistance to Customer in responding to Data Subject requests, including requests to access, correct, delete, export, restrict, or object to processing, or to withdraw consent.</p>
            <p>Customer is responsible for responding to Data Subject requests. If AhuraSense receives a request directly relating to Customer Personal Data, AhuraSense may direct the requester to Customer unless legally required to respond.</p>
          </>
        ),
      },
      {
        id: "compliance-assistance",
        title: "Compliance Assistance",
        content: (
          <>
            <p>AhuraSense will provide reasonable assistance to Customer for security obligations, data protection impact assessments, prior consultations with regulators where applicable, breach response, data deletion or export, audit requests, transfer safeguards, and compliance documentation.</p>
            <p>AhuraSense may charge reasonable fees for assistance that is outside standard support or requires significant engineering, legal, compliance, or operational effort.</p>
          </>
        ),
      },
      {
        id: "security-incident-notification",
        title: "Security Incident Notification",
        content: (
          <>
            <p>AhuraSense will notify Customer without undue delay after becoming aware of a confirmed Security Incident affecting Customer Personal Data. The notice may include, where available:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Nature of the incident and affected services.</li>
              <li>Categories of affected data and approximate number of affected records, where known.</li>
              <li>Likely consequences and measures taken or proposed.</li>
              <li>Recommended customer actions and contact point for follow-up.</li>
            </ul>
            <p>Customer acknowledges that initial notices may be based on incomplete information and may be updated as investigation progresses. Customer is responsible for determining whether it must notify regulators, Data Subjects, customers, or other parties, including under GDPR Articles 33 and 34, the UK GDPR, and the breach notification requirements of the Digital Personal Data Protection Act 2023.</p>
          </>
        ),
      },
      {
        id: "government-and-legal-requests",
        title: "Government and Legal Requests",
        content: (
          <>
            <p>If AhuraSense receives a legal request for Customer Personal Data, AhuraSense will, where legally permitted and practical: notify Customer, direct the requester to Customer, challenge or narrow unlawful or excessive requests where appropriate, and disclose only the information legally required.</p>
            <p>AhuraSense may disclose Customer Personal Data where required by law, court order, regulator, law enforcement, registry requirement, sanctions authority, or other valid legal process.</p>
          </>
        ),
      },
    ],
  },
  {
    label: "Customer Responsibilities",
    sections: [
      {
        id: "customer-security-responsibilities",
        title: "Customer Security Responsibilities",
        content: (
          <>
            <p>Customer must secure account credentials, use strong passwords and MFA where available, rotate keys and secrets, restrict administrative access, configure IAM and RBAC properly, avoid public exposure of private data, encrypt sensitive data where appropriate, maintain backups, test disaster recovery, monitor workloads, patch customer-managed software, review logs, remove inactive users, and report suspected incidents promptly. Schedule 4 sets out these configuration responsibilities by service area.</p>
            <p>AhuraSense is not responsible for Security Incidents caused by Customer misconfiguration, exposed credentials, insecure code, vulnerable containers, public buckets, excessive permissions, unsupported software, or Customer failure to use available safeguards.</p>
          </>
        ),
      },
      {
        id: "ai-specific-processing-terms",
        title: "AI-Specific Processing Terms",
        content: (
          <>
            <p>Where Customer uses AhuraSense services for AI workloads, prompts, inputs, outputs, training and evaluation datasets, embeddings, checkpoints, adapters, and model weights submitted to or generated on the services are Customer Personal Data or Customer Data as applicable, and are processed by AhuraSense solely as a processor on Customer&apos;s documented instructions.</p>
            <p>Unless separately agreed in writing, AhuraSense will not use Customer Personal Data or Customer Data to train, fine-tune, or evaluate foundation models for AhuraSense or third parties, and will not disclose it to other customers.</p>
            <p>For hosted inference and training services, AhuraSense records operational metadata — including timestamps, model and endpoint identifiers, request and token counts, latency, error codes, and account identifiers — for billing, capacity management, abuse prevention, and troubleshooting. Prompt and output content is not retained in AhuraSense operational logs by default. Where Customer enables a logging, tracing, evaluation, or debugging feature that persists request content, that content is stored within Customer-controlled resources under the retention settings Customer selects, and Customer is responsible for those settings.</p>
            <p>Customer is responsible for lawful collection and use of training data, dataset rights, consent and notice, personal data minimization, sensitive data safeguards, bias and safety testing, output validation, model license compliance, human review where required, end-user disclosures, and regulatory compliance, including any obligations arising under applicable AI-specific legislation.</p>
            <p>AhuraSense may process operational telemetry, logs, usage metrics, and de-identified or aggregated data to provide, secure, improve, and measure the services, provided such processing does not identify Customer or disclose Customer Data.</p>
          </>
        ),
      },
    ],
  },
  {
    label: "Data Lifecycle",
    sections: [
      {
        id: "deletion-and-return",
        title: "Deletion and Return",
        content: (
          <>
            <p>Upon termination or expiry of the Agreement, AhuraSense will delete or return Customer Personal Data in accordance with the Agreement, service functionality, and Customer instructions. Unless otherwise agreed:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Customer should export Customer Data before termination.</li>
              <li>AhuraSense may delete or disable access to Customer Data after the applicable post-termination period.</li>
              <li>Backups may be retained until overwritten or expired according to backup cycles.</li>
              <li>Logs, billing records, security records, and legal records may be retained as required for compliance, security, fraud prevention, dispute resolution, and legitimate business purposes.</li>
            </ul>
          </>
        ),
      },
      {
        id: "audits-and-information-rights",
        title: "Audits and Information Rights",
        content: (
          <>
            <p>AhuraSense will make available information reasonably necessary to demonstrate compliance with this DPA, subject to confidentiality, security, and commercial sensitivity restrictions. Customer may request audit information no more than once annually unless a Security Incident or legal requirement justifies additional review.</p>
            <p>Audit requests must be reasonable in scope, subject to confidentiality, non-disruptive to AhuraSense operations, and limited to controls relevant to Customer Personal Data. AhuraSense may satisfy audit obligations through security documentation, certifications, summaries, questionnaires, third-party audit reports, or written responses.</p>
          </>
        ),
      },
    ],
  },
  {
    label: "Legal",
    sections: [
      {
        id: "liability",
        title: "Liability",
        content: (
          <>
            <p>Each party&apos;s liability under this DPA is subject to the limitations and exclusions of liability in the Agreement, unless prohibited by applicable law. Nothing in this DPA limits liability that cannot legally be limited.</p>
          </>
        ),
      },
      {
        id: "conflict",
        title: "Conflict",
        content: (
          <>
            <p>If there is a conflict between this DPA and the Agreement, this DPA controls only with respect to processing of Customer Personal Data. If there is a conflict between this DPA and the Standard Contractual Clauses, the Standard Contractual Clauses control. If there is a conflict between this DPA and mandatory Data Protection Laws, the mandatory Data Protection Laws control.</p>
          </>
        ),
      },
      {
        id: "term",
        title: "Term",
        content: (
          <>
            <p>This DPA remains in effect for as long as AhuraSense processes Customer Personal Data on behalf of Customer. Sections that by their nature should survive termination will continue to apply, including confidentiality, deletion, audit, liability, and legal compliance provisions.</p>
          </>
        ),
      },
    ],
  },
  {
    label: "Schedules",
    sections: [
      {
        id: "schedule-1-processing-details",
        title: "Schedule 1 — Processing Details",
        content: (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/[0.10]">
                    <th className="py-3 pr-6 text-left text-xs uppercase tracking-[0.12em] text-white/50 font-semibold w-1/3">Item</th>
                    <th className="py-3 text-left text-xs uppercase tracking-[0.12em] text-white/50 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {[
                    { item: "Processor", detail: "AhuraSense Technologies Private Limited" },
                    { item: "Controller", detail: "Customer" },
                    { item: "Services", detail: "AI inference, AI training, compute, GPU pods, Kubernetes, databases, object storage, security, domains, application deployment, support, APIs, dashboards" },
                    { item: "Subject Matter", detail: "Provision of cloud infrastructure and related technical services by AhuraSense to Customer under the Agreement" },
                    { item: "Nature of Processing", detail: "Hosting, storage, transmission, retrieval, compute processing, inference, training, fine-tuning, embedding generation, database processing, orchestration, backup and recovery, support, monitoring, security" },
                    { item: "Purpose", detail: "Provision, operation, security, billing, support, and improvement of services on Customer's documented instructions" },
                    { item: "Duration", detail: "Term of Agreement plus deletion, backup, legal, security, and compliance retention periods" },
                    { item: "Frequency", detail: "Continuous for the duration of the Agreement, determined by Customer's use of the services" },
                    { item: "Data Subjects", detail: "Customer users, admins, developers, employees, contractors, end users, dataset subjects, application users, business and support contacts" },
                    { item: "Personal Data", detail: "Account data, application data, logs, prompts, outputs, datasets, files, database content, images, audio, text, identifiers, metadata, support data" },
                    { item: "Sensitive Data", detail: "Not permitted unless expressly allowed by the Agreement and protected by appropriate safeguards" },
                    { item: "Transfer Mechanism", detail: "Standard Contractual Clauses, UK IDTA or Addendum, or other lawful mechanism where transfer restrictions apply" },
                  ].map((row) => (
                    <tr key={row.item}>
                      <td className="py-3 pr-6 text-white/85 font-medium">{row.item}</td>
                      <td className="py-3 text-white/65">{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        id: "schedule-2-technical-organisational-measures",
        title: "Schedule 2 — Technical & Organisational Measures",
        content: (
          <>
            <p>
              The following measures are in place as at the effective date of this DPA. AhuraSense&apos;s
              security programme is designed to align with recognised industry frameworks for
              information security management, including ISO/IEC 27001 and the CIS Critical Security
              Controls. AhuraSense may update these measures provided the overall level of protection is
              not materially reduced.
            </p>
            {[
              {
                title: "Encryption",
                items: [
                  "Encryption in transit using TLS 1.2 or higher for public endpoints, dashboards, and APIs, with weak ciphers and protocol versions disabled.",
                  "Encryption at rest using AES-256 for managed storage, managed databases, block volumes, and backups where the service supports it.",
                  "Key management with restricted access to key material, periodic rotation, and customer-managed encryption options where available.",
                ],
              },
              {
                title: "Access Control and Least Privilege",
                items: [
                  "Role-based access control for production systems, provisioned on a documented need-to-know basis.",
                  "Least-privilege defaults, with administrative and privileged access restricted to a limited set of named personnel.",
                  "Periodic access reviews and prompt revocation of access on role change or termination.",
                  "Unique named accounts; shared credentials are not used for production access.",
                ],
              },
              {
                title: "Authentication",
                items: [
                  "Multi-factor authentication required for AhuraSense personnel accessing production and administrative systems.",
                  "MFA available to Customer for account and dashboard access.",
                  "Secrets and API credentials stored in a managed secret store rather than in source code or configuration files.",
                ],
              },
              {
                title: "Network Security and Segmentation",
                items: [
                  "Segmentation between production, staging, corporate, and management networks.",
                  "Firewall and security-group controls with default-deny ingress on production boundaries.",
                  "Tenant isolation and logical separation between customer environments.",
                  "DDoS and abuse mitigation at the network edge where available.",
                ],
              },
              {
                title: "Logging and Monitoring",
                items: [
                  "Centralised collection of platform, access, and security event logs with restricted, tamper-resistant storage.",
                  "Monitoring and alerting for anomalous authentication, privilege escalation, and abuse patterns.",
                  "Audit logging of administrative actions on production infrastructure.",
                ],
              },
              {
                title: "Vulnerability and Patch Management",
                items: [
                  "Regular vulnerability scanning of infrastructure and container images.",
                  "Risk-based remediation timelines, with expedited handling of critical vulnerabilities.",
                  "Patching of AhuraSense-managed operating systems, hypervisors, and platform components.",
                  "Change management and code review for production changes.",
                ],
              },
              {
                title: "Backup and Resilience",
                items: [
                  "Backup of platform and control-plane systems, with encryption applied to backup data.",
                  "Backup and snapshot features for customer workloads where purchased or included in the service.",
                  "Documented recovery procedures, periodically tested for AhuraSense-managed components.",
                ],
              },
              {
                title: "Personnel Security and Training",
                items: [
                  "Written confidentiality obligations for all personnel with access to Customer Personal Data.",
                  "Security and data protection awareness training at onboarding and periodically thereafter.",
                  "Background screening for personnel in sensitive roles where lawful and applicable.",
                  "Documented joiner, mover, and leaver processes.",
                ],
              },
              {
                title: "Secure Disposal",
                items: [
                  "Logical deletion of Customer Data following the retention periods in the Agreement.",
                  "Cryptographic erasure or secure wiping of storage media before reuse.",
                  "Secure destruction or certified disposal of decommissioned media containing Customer Personal Data.",
                ],
              },
              {
                title: "Incident Response",
                items: [
                  "Documented incident response plan covering detection, triage, containment, eradication, and recovery.",
                  "Defined severity levels and escalation paths, with a designated security contact.",
                  "Customer notification process for confirmed Security Incidents, as described in this DPA.",
                  "Post-incident review and remediation tracking.",
                ],
              },
              {
                title: "Supplier and Subprocessor Management",
                items: [
                  "Security and data protection review before engaging a Subprocessor that will process Customer Personal Data.",
                  "Written data protection obligations imposed on Subprocessors.",
                  "Restriction and monitoring of Subprocessor access to production systems.",
                ],
              },
            ].map((section) => (
              <div key={section.title} className="mt-5 first:mt-0">
                <h3 className="text-base font-semibold text-white/90">{section.title}</h3>
                <ul className="mt-2 list-disc pl-6 space-y-1">
                  {section.items.map((item) => (
                    <li key={item} className="text-white/65">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        ),
      },
      {
        id: "schedule-3-subprocessor-terms",
        title: "Schedule 3 — Subprocessor Terms",
        content: (
          <>
            <p>AhuraSense may use Subprocessors to provide infrastructure, support, security, billing, analytics, communications, and operational services. Customer grants a general authorisation for such engagement, subject to the terms of this Schedule.</p>
            <p>Before allowing a Subprocessor to process Customer Personal Data, AhuraSense will:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Carry out a proportionate assessment of the Subprocessor&apos;s security and data protection practices.</li>
              <li>Impose written obligations that are no less protective in substance than those in this DPA, including confidentiality, security, assistance, and deletion obligations.</li>
              <li>Put in place an appropriate transfer mechanism where the engagement involves a restricted international transfer.</li>
              <li>Limit the Subprocessor&apos;s access to what is necessary to perform its function.</li>
            </ul>
            <p>AhuraSense remains fully liable to Customer for the performance of a Subprocessor&apos;s data protection obligations where the Subprocessor fails to fulfil them.</p>
            <p>Unless the executed DPA or applicable Order Form states another period, AhuraSense will give Customer at least thirty (30) days&apos; notice before a new Subprocessor begins processing Customer Personal Data, by email to the account&apos;s notification address or through the AhuraSense website. Customer may object in writing within that notice period on reasonable data protection grounds, stating the grounds relied upon. The parties will work in good faith to resolve the objection — for example by offering an alternative region, configuration, or service. If no resolution is reached, Customer may stop using the affected service or terminate the affected Order as permitted by the Agreement, without penalty for the terminated portion. This does not limit any remedy that Applicable Data Protection Law requires to be available to Customer.</p>
            <p>
              Customer may request a list of current Subprocessors by contacting{" "}
              <a href="mailto:legal@ahurasense.com" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                legal@ahurasense.com
              </a>
              .
            </p>
          </>
        ),
      },
      {
        id: "schedule-4-customer-configuration-responsibilities",
        title: "Schedule 4 — Customer Configuration Responsibilities",
        content: (
          <>
            <p>
              AhuraSense secures the underlying platform. Customer is responsible for configuring and
              securing what it builds on top of it, including the areas below. Failure to apply these
              controls is a common cause of data exposure and is outside AhuraSense&apos;s
              responsibility.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/[0.10]">
                    <th className="py-3 pr-6 text-left text-xs uppercase tracking-[0.12em] text-white/50 font-semibold w-1/4">Area</th>
                    <th className="py-3 text-left text-xs uppercase tracking-[0.12em] text-white/50 font-semibold">Customer Responsibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {[
                    { area: "Identity and Access", resp: "IAM users, roles and groups, least-privilege policies, MFA enforcement, password policies, removal of inactive users, periodic access reviews" },
                    { area: "API Access", resp: "API keys, tokens, scope restriction, rotation schedules, revocation of leaked credentials" },
                    { area: "Compute", resp: "Guest OS patching and hardening, workload configuration, container image provenance and updates, host-level firewall settings" },
                    { area: "Network", resp: "Firewall and security group rules, ingress and egress restrictions, private networking, VPN or peering configuration, avoiding unnecessary public exposure" },
                    { area: "GPU Pods", resp: "Drivers and runtime versions, container security, data movement into and out of pods, job isolation and cleanup" },
                    { area: "Kubernetes", resp: "RBAC bindings, secrets management, namespace isolation, ingress configuration, network policies, admission controls" },
                    { area: "Databases", resp: "Credentials, schema and grants, encryption options, backup and point-in-time recovery settings, restricting public access" },
                    { area: "Object Storage", resp: "Bucket and object permissions, blocking public access, lifecycle rules, versioning, retention and object lock settings" },
                    { area: "Encryption Options", resp: "Enabling available encryption features, selecting customer-managed keys where offered, key rotation and custody" },
                    { area: "Backup and Recovery", resp: "Backup scope and frequency, retention periods, off-region copies, restore testing" },
                    { area: "Data Classification", resp: "Classifying data before upload, applying handling rules by class, keeping restricted and regulated data out of services not approved for it, data minimisation" },
                    { area: "Domains", resp: "Registrant data accuracy, DNS settings, DNSSEC where available, renewal, lawful use" },
                    { area: "AI Workloads", resp: "Dataset rights and lawful basis, privacy compliance, prompt and output logging settings, output review, model licence compliance" },
                    { area: "Applications", resp: "Application code security, dependency management, secret handling, end-user consent and disclosures, logging hygiene" },
                    { area: "Monitoring", resp: "Reviewing available logs and alerts, retaining audit records as required, reporting suspected incidents promptly" },
                  ].map((row) => (
                    <tr key={row.area}>
                      <td className="py-3 pr-6 text-white/85 font-medium">{row.area}</td>
                      <td className="py-3 text-white/65">{row.resp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        id: "schedule-5-contact-details",
        title: "Schedule 5 — Contact Details",
        content: (
          <>
            <div className="space-y-1.5 rounded border border-white/[0.08] bg-white/[0.02] p-5 text-sm">
              <p className="font-semibold text-white/90">AhuraSense Technologies Private Limited</p>
              <p className="text-white/60">CIN: <span className="text-white/45">[To be updated]</span></p>
              <p className="text-white/60">Registered Address: <span className="text-white/45">[To be updated]</span></p>
              <p className="text-white/60">
                Privacy Contact:{" "}
                <a href="mailto:legal@ahurasense.com" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                  legal@ahurasense.com
                </a>
              </p>
              <p className="text-white/60">
                Security Contact:{" "}
                <a href="mailto:abuse@ahurasense.com" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                  abuse@ahurasense.com
                </a>
              </p>
              <p className="text-white/60">
                Legal Contact:{" "}
                <a href="mailto:legal@ahurasense.com" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                  legal@ahurasense.com
                </a>
              </p>
              <p className="text-white/60">Grievance Officer (India, DPDP Act 2023): <span className="text-white/45">[To be updated]</span></p>
              <p className="text-white/60">Phone: <span className="text-white/45">[To be updated]</span></p>
            </div>
            <p>
              Notices under this DPA, including Subprocessor objections and Data Subject request
              assistance, should be sent to the privacy contact above. Security Incident reports and
              vulnerability disclosures should be sent to the security contact. Contractual notices,
              including requests for Standard Contractual Clauses, should be sent to the legal contact.
            </p>
            <p>
              Data Principals in India may raise grievances with the Grievance Officer identified above,
              as required by the Digital Personal Data Protection Act 2023. Where AhuraSense acts as a
              processor, such grievances will ordinarily be routed to the relevant Customer as data
              fiduciary.
            </p>
          </>
        ),
      },
    ],
  },
];

export default function DpaPage() {
  return (
    <LegalPageShell
      currentPath="/dpa"
      title="Data Processing Agreement"
      description="This DPA defines how AhuraSense Technologies Private Limited processes personal data on behalf of customers, the safeguards applied, subprocessor controls, international transfer mechanisms, and customer configuration responsibilities."
      effectiveDate="May 30, 2026"
      lastUpdated="May 30, 2026"
      groups={GROUPS}
      showPrivacyDocSelector
    />
  );
}
