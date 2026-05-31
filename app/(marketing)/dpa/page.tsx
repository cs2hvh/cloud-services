import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSection } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description:
    "Review the AhuraSense AI Pvt Ltd Data Processing Agreement covering processor obligations, security measures, subprocessors, international transfer safeguards, and customer responsibilities.",
  alternates: {
    canonical: `${siteConfig.url}/dpa`,
  },
  openGraph: {
    title: "Data Processing Agreement | AhuraSense",
    description: "Data processing commitments and safeguards for AhuraSense customers.",
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
          This Data Processing Agreement (&quot;DPA&quot;) governs the processing of Personal Data
          by AhuraSense AI Pvt Ltd on behalf of Customer in connection with AhuraSense&apos;s cloud
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
            { term: "Data Subject", def: 'An identified or identifiable individual to whom Personal Data relates.' },
            { term: "Personal Data", def: 'Information relating to an identified or identifiable individual, or equivalent definition under applicable Data Protection Laws.' },
            { term: "Processing", def: 'Any operation performed on Personal Data, including collection, storage, use, transmission, disclosure, deletion, organization, retrieval, or other handling.' },
            { term: "Processor", def: 'AhuraSense where it processes Customer Personal Data on behalf of Customer.' },
            { term: "Controller", def: 'Customer where it determines the purposes and means of processing Customer Personal Data.' },
            { term: "Subprocessor", def: 'A third party engaged by AhuraSense to process Customer Personal Data on behalf of Customer.' },
            { term: "Security Incident", def: 'A confirmed breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to Customer Personal Data processed by AhuraSense.' },
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
    id: "roles",
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
        <p>AhuraSense may decline or suspend instructions that it reasonably believes violate law, the Agreement, supplier requirements, security requirements, or acceptable use rules.</p>
      </>
    ),
  },
  {
    id: "details-of-processing",
    title: "Details of Processing",
    content: (
      <>
        <h3 className="text-base font-semibold text-white/90">5.1 Subject Matter</h3>
        <p>The provision of cloud infrastructure and related technical services by AhuraSense to Customer.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">5.2 Duration</h3>
        <p>Processing continues for the term of the Agreement and any period required for deletion, return, backup retention, legal compliance, billing, security, or dispute resolution.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">5.3 Nature and Purpose</h3>
        <p>Processing may include hosting, storage, transmission, retrieval, compute processing, AI inference, AI training, fine-tuning, embedding generation, database processing, Kubernetes orchestration, application deployment, security monitoring, backup and recovery, technical support, billing support, abuse prevention, and incident response.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">5.4 Categories of Data Subjects</h3>
        <p>Customer Personal Data may relate to customer employees, contractors, administrators, developers, end users, business contacts, support users, and individuals included in datasets, files, logs, databases, prompts, outputs, or workloads uploaded by Customer.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">5.5 Categories of Personal Data</h3>
        <p>Customer Personal Data may include names, email addresses, user IDs, IP addresses, device identifiers, account identifiers, application data, log data, support data, prompt and output data, dataset records, database records, files and documents, images, audio, or text submitted by Customer, and metadata.</p>

        <h3 className="mt-5 text-base font-semibold text-white/90">5.6 Sensitive Data</h3>
        <p>Customer must not submit sensitive, regulated, children&apos;s, biometric, health, financial, payment card, government secret, or special-category data unless the applicable Agreement expressly permits such processing and Customer has implemented appropriate safeguards.</p>
      </>
    ),
  },
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
        <p>Customer remains responsible for securing accounts, API keys, SSH keys, passwords, secrets, containers, applications, databases, Kubernetes roles, firewalls, network policies, domain settings, AI models, training datasets, and end-user access.</p>
      </>
    ),
  },
  {
    id: "subprocessors",
    title: "Subprocessors",
    content: (
      <>
        <p>Customer authorizes AhuraSense to engage Subprocessors to provide the services, including providers of data center services, cloud infrastructure, network connectivity, GPU hardware or managed capacity, storage, security monitoring, support systems, error monitoring, payment and billing systems, email delivery, identity verification, domain registration and DNS, and analytics and product operations.</p>
        <p>AhuraSense will ensure Subprocessors are bound by written obligations that provide appropriate protection for Customer Personal Data.</p>
        <p>Where required by applicable law, AhuraSense will provide notice of new Subprocessors and allow Customer to object on reasonable data protection grounds. If the parties cannot resolve the objection, Customer may stop using the affected service or terminate the affected Order as permitted by the Agreement.</p>
        <p>
          Customer may request a list of current Subprocessors by contacting{" "}
          <a href="mailto:privacy@ahurasense.ai" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
            privacy@ahurasense.ai
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International Transfers",
    content: (
      <>
        <p>Customer acknowledges that AhuraSense and its Subprocessors may process Customer Personal Data in India and other jurisdictions where services, infrastructure, support, or suppliers operate.</p>
        <p>Where Customer Personal Data is subject to transfer restrictions, the parties will use appropriate safeguards including standard contractual clauses, transfer impact assessments, data processing terms, customer-approved regions, contractual safeguards, and other lawful transfer mechanisms.</p>
        <p>For EU/EEA transfers, the parties may rely on applicable EU standard contractual clauses where required.</p>
      </>
    ),
  },
  {
    id: "data-subject-rights",
    title: "Assistance With Data Subject Requests",
    content: (
      <>
        <p>Taking into account the nature of processing and information available to AhuraSense, AhuraSense will provide reasonable assistance to Customer in responding to Data Subject requests, including requests to access, correct, delete, export, restrict, or object to processing, or to withdraw consent.</p>
        <p>Customer is responsible for responding to Data Subject requests. If AhuraSense receives a request directly relating to Customer Personal Data, AhuraSense may direct the requester to Customer unless legally required to respond.</p>
      </>
    ),
  },
  {
    id: "compliance-assistance",
    title: "Assistance With Compliance",
    content: (
      <>
        <p>AhuraSense will provide reasonable assistance to Customer for security obligations, data protection impact assessments, prior consultations with regulators where applicable, breach response, data deletion or export, audit requests, transfer safeguards, and compliance documentation.</p>
        <p>AhuraSense may charge reasonable fees for assistance that is outside standard support or requires significant engineering, legal, compliance, or operational effort.</p>
      </>
    ),
  },
  {
    id: "incident-notification",
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
        <p>Customer acknowledges that initial notices may be based on incomplete information and may be updated as investigation progresses. Customer is responsible for determining whether it must notify regulators, Data Subjects, customers, or other parties.</p>
      </>
    ),
  },
  {
    id: "customer-security-responsibilities",
    title: "Customer Security Responsibilities",
    content: (
      <>
        <p>Customer must secure account credentials, use strong passwords and MFA where available, rotate keys and secrets, restrict administrative access, configure IAM and RBAC properly, avoid public exposure of private data, encrypt sensitive data where appropriate, maintain backups, test disaster recovery, monitor workloads, patch customer-managed software, review logs, remove inactive users, and report suspected incidents promptly.</p>
        <p>AhuraSense is not responsible for Security Incidents caused by Customer misconfiguration, exposed credentials, insecure code, vulnerable containers, public buckets, excessive permissions, unsupported software, or Customer failure to use available safeguards.</p>
      </>
    ),
  },
  {
    id: "deletion-and-return",
    title: "Deletion and Return of Customer Personal Data",
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
    id: "audits",
    title: "Audits and Information Rights",
    content: (
      <>
        <p>AhuraSense will make available information reasonably necessary to demonstrate compliance with this DPA, subject to confidentiality, security, and commercial sensitivity restrictions. Customer may request audit information no more than once annually unless a Security Incident or legal requirement justifies additional review.</p>
        <p>Audit requests must be reasonable in scope, subject to confidentiality, non-disruptive to AhuraSense operations, and limited to controls relevant to Customer Personal Data. AhuraSense may satisfy audit obligations through security documentation, certifications, summaries, questionnaires, third-party audit reports, or written responses.</p>
      </>
    ),
  },
  {
    id: "government-requests",
    title: "Government and Legal Requests",
    content: (
      <>
        <p>If AhuraSense receives a legal request for Customer Personal Data, AhuraSense will, where legally permitted and practical: notify Customer, direct the requester to Customer, challenge or narrow unlawful or excessive requests where appropriate, and disclose only the information legally required.</p>
        <p>AhuraSense may disclose Customer Personal Data where required by law, court order, regulator, law enforcement, registry requirement, sanctions authority, or other valid legal process.</p>
      </>
    ),
  },
  {
    id: "ai-processing",
    title: "AI-Specific Processing Terms",
    content: (
      <>
        <p>Where Customer uses AhuraSense services for AI workloads, Customer is responsible for lawful collection and use of training data, dataset rights, consent and notice, personal data minimization, sensitive data safeguards, bias and safety testing, output validation, model license compliance, human review where required, end-user disclosures, and regulatory compliance.</p>
        <p>Unless separately agreed in writing, AhuraSense will not use Customer Personal Data or Customer Data to train foundation models for AhuraSense or third parties.</p>
        <p>AhuraSense may process operational telemetry, logs, usage metrics, and de-identified or aggregated data to provide, secure, improve, and measure the services, provided such processing does not identify Customer or disclose Customer Data.</p>
      </>
    ),
  },
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
        <p>If there is a conflict between this DPA and the Agreement, this DPA controls only with respect to processing of Customer Personal Data. If there is a conflict between this DPA and mandatory Data Protection Laws, the mandatory Data Protection Laws control.</p>
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
  {
    id: "schedule-1",
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
                { item: "Processor", detail: "AhuraSense AI Pvt Ltd" },
                { item: "Controller", detail: "Customer" },
                { item: "Services", detail: "AI inference, AI training, compute, GPU pods, Kubernetes, databases, object storage, security, domains, application deployment, support, APIs, dashboards" },
                { item: "Nature of Processing", detail: "Hosting, storage, transmission, compute processing, inference, training, database processing, support, monitoring, security" },
                { item: "Purpose", detail: "Provision, operation, security, billing, support, and improvement of services" },
                { item: "Duration", detail: "Term of Agreement plus deletion, backup, legal, security, and compliance retention periods" },
                { item: "Data Subjects", detail: "Customer users, admins, developers, employees, contractors, end users, dataset subjects, application users" },
                { item: "Personal Data", detail: "Account data, application data, logs, prompts, outputs, datasets, files, database content, metadata, support data" },
                { item: "Sensitive Data", detail: "Not permitted unless expressly allowed by the Agreement and protected by appropriate safeguards" },
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
    id: "schedule-2",
    title: "Schedule 2 — Technical and Organizational Measures",
    content: (
      <>
        {[
          {
            title: "Access Control",
            items: ["Role-based access.", "Administrative access restrictions.", "Authentication controls.", "Least-privilege practices."],
          },
          {
            title: "Encryption",
            items: ["Encryption in transit where supported.", "Encryption at rest where supported.", "Customer-managed encryption options where available."],
          },
          {
            title: "Logging and Monitoring",
            items: ["Platform logs.", "Security event logs and access logs.", "Abuse detection and operational monitoring."],
          },
          {
            title: "Infrastructure Security",
            items: ["Network segmentation.", "Firewall controls.", "Supplier and facility security.", "DDoS and abuse mitigation where available."],
          },
          {
            title: "Incident Response",
            items: ["Security incident triage.", "Investigation procedures.", "Customer notification process.", "Remediation tracking."],
          },
          {
            title: "Personnel Security",
            items: ["Confidentiality obligations.", "Access approval processes.", "Role-based access reviews."],
          },
          {
            title: "Backup and Recovery",
            items: ["Backup features where purchased or included.", "Recovery processes depending on service type.", "Customer-controlled backup configuration where applicable."],
          },
          {
            title: "Customer Isolation",
            items: ["Tenant isolation controls.", "Logical separation.", "Access control boundaries."],
          },
          {
            title: "Supplier Management",
            items: ["Subprocessor review.", "Contractual data protection obligations.", "Supplier access controls."],
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
    id: "schedule-3",
    title: "Schedule 3 — Subprocessor Terms",
    content: (
      <>
        <p>AhuraSense may use Subprocessors to provide infrastructure, support, security, billing, analytics, communications, and operational services.</p>
        <p>Before allowing a Subprocessor to process Customer Personal Data, AhuraSense will require the Subprocessor to enter into written obligations that provide appropriate protection for Customer Personal Data.</p>
        <p>
          Customer may request a list of current Subprocessors by contacting{" "}
          <a href="mailto:privacy@ahurasense.ai" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
            privacy@ahurasense.ai
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "schedule-4",
    title: "Schedule 4 — Customer Configuration Responsibilities",
    content: (
      <>
        <p>Customer is responsible for configuring and securing:</p>
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
                { area: "Accounts", resp: "Users, roles, MFA, password policies, inactive users" },
                { area: "API Access", resp: "API keys, tokens, rotation, scope restriction" },
                { area: "Compute", resp: "OS patching, workloads, containers, firewall settings" },
                { area: "GPU Pods", resp: "Drivers, containers, data movement, job security" },
                { area: "Kubernetes", resp: "RBAC, secrets, namespaces, ingress, network policies" },
                { area: "Databases", resp: "Credentials, schema, backups, encryption, public access" },
                { area: "Object Storage", resp: "Bucket permissions, lifecycle, versioning, retention" },
                { area: "Domains", resp: "Registrant data, DNS settings, renewal, lawful use" },
                { area: "AI Workloads", resp: "Dataset rights, privacy compliance, output review, model licenses" },
                { area: "Applications", resp: "Code security, dependencies, secrets, end-user compliance" },
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
    id: "schedule-5",
    title: "Schedule 5 — Contact Details",
    content: (
      <>
        <div className="space-y-1.5 rounded border border-white/[0.08] bg-white/[0.02] p-5 text-sm">
          <p className="font-semibold text-white/90">AhuraSense AI Pvt Ltd</p>
          <p className="text-white/60">CIN: <span className="text-white/45">[To be updated]</span></p>
          <p className="text-white/60">Registered Address: <span className="text-white/45">[To be updated]</span></p>
          <p className="text-white/60">
            Privacy Contact:{" "}
            <a href="mailto:privacy@ahurasense.ai" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
              privacy@ahurasense.ai
            </a>
          </p>
          <p className="text-white/60">
            Security Contact:{" "}
            <a href="mailto:security@ahurasense.ai" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
              security@ahurasense.ai
            </a>
          </p>
          <p className="text-white/60">
            Legal Contact:{" "}
            <a href="mailto:legal@ahurasense.ai" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
              legal@ahurasense.ai
            </a>
          </p>
          <p className="text-white/60">Phone: <span className="text-white/45">[To be updated]</span></p>
        </div>
      </>
    ),
  },
];

export default function DpaPage() {
  return (
    <LegalPageShell
      currentPath="/dpa"
      title="Data Processing Agreement"
      description="This DPA defines how AhuraSense AI Pvt Ltd processes personal data on behalf of customers, the safeguards applied, subprocessor controls, international transfer mechanisms, and customer configuration responsibilities."
      effectiveDate="May 30, 2026"
      lastUpdated="May 30, 2026"
      sections={SECTIONS}
    />
  );
}
