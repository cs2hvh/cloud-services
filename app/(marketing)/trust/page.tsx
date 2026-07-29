import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Trust & Compliance",
  description:
    "How AhuraSense Cloud secures GPU and AI infrastructure: security controls, shared responsibility, data residency, compliance screening, vulnerability disclosure, and legal request handling.",
  alternates: {
    canonical: `${siteConfig.url}/trust`,
  },
  openGraph: {
    title: "Trust & Compliance | AhuraSense Cloud",
    description:
      "Security architecture, shared responsibility, data residency, and compliance practices for AhuraSense Cloud.",
    url: `${siteConfig.url}/trust`,
  },
};

const mail = (address: string) => (
  <a
    href={`mailto:${address}`}
    className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
  >
    {address}
  </a>
);

const GROUPS: LegalSectionGroup[] = [
  {
    label: "Security",
    sections: [
      {
        id: "security-overview",
        title: "Security Overview",
        content: (
          <>
            <p>
              AhuraSense maintains administrative, technical and organisational controls designed to
              protect the confidentiality, integrity and availability of its platform. The controls
              applicable to a particular Service depend on the infrastructure architecture, region,
              service model and underlying facility or technology providers.
            </p>
            <p>
              Our security programme is designed with reference to recognised information-security
              practices and frameworks, including principles reflected in ISO/IEC 27001, CIS controls
              and commonly used cloud-security practices. Reference to a framework describes design
              alignment only and does not mean that AhuraSense holds a certification or independent
              attestation unless that certification or attestation is expressly identified as current
              and applicable to the relevant scope.
            </p>
            <p>
              AhuraSense does not represent that it holds ISO/IEC 27001, SOC 2, PCI DSS or another
              certification unless the certification has actually been obtained and its scope is
              published.
            </p>
          </>
        ),
      },
      {
        id: "infrastructure-security",
        title: "Infrastructure Security",
        content: (
          <>
            <p>
              AhuraSense infrastructure may be operated directly by AhuraSense or through contracted
              data-centre, colocation, hardware, connectivity and infrastructure providers. Physical
              security responsibilities are allocated according to the relevant operating model.
              Facilities used for production infrastructure are selected with regard to access
              control, environmental resilience, power, cooling, monitoring and other factors
              appropriate to the services deployed.
            </p>
            <p>
              Where AhuraSense controls the host or virtualisation layer, AhuraSense is responsible
              for hardening, maintenance and tenant-isolation controls at that layer. Where a
              component is operated by an infrastructure supplier, AhuraSense relies on contractual,
              technical and supplier-assurance controls appropriate to that relationship.
            </p>
            <p>
              Management interfaces are restricted from ordinary Customer access and should not be
              exposed publicly except where a specific product expressly provides Customer-controlled
              management access.
            </p>
          </>
        ),
      },
      {
        id: "network-security",
        title: "Network Security",
        content: (
          <>
            <p>
              The platform network is segmented so that the customer data plane, the AhuraSense
              control plane, the storage fabric, and the administrative management network are
              logically and, where practical, physically separated. Traffic between segments is
              permitted only through defined interfaces, and the default posture between segments
              is deny.
            </p>
            <p>
              Customer instances sit behind platform-level filtering and receive volumetric DDoS
              mitigation at the edge. Private networking, VLAN or VPC-style isolation, and internal
              addressing are available so that multi-node training clusters and inference back
              ends can communicate without traversing the public internet. High-speed
              interconnects used for distributed training are confined to the customer&apos;s own
              cluster boundary.
            </p>
            <p>
              We monitor for anomalous egress, scanning behaviour, and traffic patterns consistent
              with compromise or abuse. Where a customer instance is observed attacking third
              parties, we may rate-limit, null-route, or suspend the affected resource, and we will
              notify the account owner as described in our incident response process.
            </p>
          </>
        ),
      },
      {
        id: "access-control",
        title: "Access Control",
        content: (
          <>
            <p>
              AhuraSense restricts internal access to production systems according to job
              responsibilities and operational need. Privileged production access is subject to
              authentication, logging and access-control measures appropriate to the relevant
              environment. Multi-factor authentication is used for privileged administrative systems
              where supported and required by AhuraSense security procedures.
            </p>
            <p>
              Customer Data is not accessed by AhuraSense personnel in the ordinary course of
              unmanaged infrastructure operation. Access may occur where reasonably necessary to
              provide Customer-requested support, investigate a specific security or abuse matter,
              restore platform integrity, comply with law or administer a managed Service that
              necessarily requires such access.
            </p>
            <p>
              Where technically available, administrative access is logged and attributable to
              authorised personnel.
            </p>
          </>
        ),
      },
      {
        id: "encryption",
        title: "Encryption",
        content: (
          <>
            <p>
              AhuraSense uses encryption in transit for supported public platform endpoints through
              modern TLS configurations. Encryption at rest is provided for managed storage products
              where stated in the applicable service specification. The exact encryption method,
              key-management architecture and availability of Customer-managed keys may differ by
              Service.
            </p>
            <p>
              Where a Service advertises AES-256 encryption, Customer-managed keys,
              confidential-computing capabilities or another cryptographic feature, the
              representation applies only to the Service and configuration expressly identified.
              AhuraSense does not represent that data in active CPU or GPU memory is encrypted merely
              because persistent storage is encrypted.
            </p>
            <p>
              Customers with requirements concerning confidential computing, hardware-backed key
              custody or protection of data in use should confirm compatibility with the specific
              hardware and Service before deployment.
            </p>
          </>
        ),
      },
      {
        id: "logging-and-monitoring",
        title: "Logging and Monitoring",
        content: (
          <>
            <p>
              We maintain centralised logging across the control plane, authentication systems,
              network infrastructure, and hypervisor layer. Logs are shipped to storage with
              restricted access and retention appropriate to their purpose, and are protected
              against unauthorised modification. Administrative actions on production systems are
              attributable to a named operator.
            </p>
            <p>
              Platform telemetry is monitored for availability, capacity, and security-relevant
              signals such as authentication anomalies, privilege escalation attempts, unexpected
              configuration change, and unusual outbound traffic. Alerts route to an on-call
              rotation with defined escalation paths.
            </p>
            <p>
              Customer-side visibility includes account activity and API audit records available
              through the console. Logging inside your instances — operating system logs,
              application logs, and model-serving telemetry — is generated and retained by you, and
              we recommend forwarding those logs to a destination outside the instance so they
              survive termination of the workload.
            </p>
          </>
        ),
      },
      {
        id: "vulnerability-management",
        title: "Vulnerability Management",
        content: (
          <>
            <p>
              AhuraSense maintains processes for identifying and responding to security
              vulnerabilities affecting platform components under its operational control.
              Information may be obtained from vendor advisories, dependency analysis, vulnerability
              scanning, customer reports, researchers and infrastructure suppliers.
            </p>
            <p>
              Remediation priority is based on severity, exploitability, affected systems and risk to
              customers. AhuraSense may conduct internal or third-party security testing where
              appropriate. Where independent test reports exist, AhuraSense may make summaries
              available to eligible customers subject to confidentiality restrictions.
            </p>
          </>
        ),
      },
      {
        id: "incident-response",
        title: "Incident Response",
        content: (
          <>
            <p>
              We maintain a documented incident response process covering detection, triage,
              containment, eradication, recovery, and post-incident review. Incidents are assigned a
              severity that determines the response path, the communication cadence, and the level
              of leadership involvement. The process is exercised periodically so that it is
              familiar before it is needed.
            </p>
            <p>
              Where we determine that a security incident has affected the confidentiality,
              integrity, or availability of your data or resources, we will notify you without undue
              delay through your registered account contacts, and we will provide the information
              you reasonably need to meet your own regulatory notification duties. We will report to
              supervisory authorities, including CERT-In and applicable data protection regulators,
              within the timeframes the law requires.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Initial notification prioritises speed and accuracy over completeness; details are
                updated as the investigation progresses.
              </li>
              <li>
                Post-incident reviews identify root cause and corrective actions, and are shared
                with materially affected customers in summary form.
              </li>
              <li>
                Suspected compromise of your own workload or credentials should be reported to{" "}
                {mail("abuse@ahurasense.com")} so we can assist and, where relevant, contain
                platform-side impact.
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    label: "Shared Responsibility",
    sections: [
      {
        id: "ahurasense-responsibilities",
        title: "AhuraSense Responsibilities",
        content: (
          <>
            <p>
              Security of the platform is our responsibility. We own everything from the physical
              facility up to and including the virtualisation boundary, plus the systems that
              provision, bill, and manage your resources.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Physical security of racks and hardware, and oversight of the data centre operators
                who provide the facilities.
              </li>
              <li>
                Host systems, firmware, hypervisors, and the isolation boundary that separates one
                tenant from another.
              </li>
              <li>
                The network fabric, including segmentation, edge filtering, DDoS mitigation, and
                the private networking primitives you build on.
              </li>
              <li>
                Platform-managed storage durability and at-rest encryption, and the key management
                systems behind it.
              </li>
              <li>
                The control plane — console, APIs, authentication, authorisation, provisioning, and
                audit logging — including its own secure development lifecycle.
              </li>
              <li>
                Availability commitments as set out in the applicable service level agreement, and
                incident response for platform-side events.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "customer-responsibilities",
        title: "Customer Responsibilities",
        content: (
          <>
            <p>
              Security in the platform is your responsibility. Once an instance is provisioned,
              everything you run inside it and everything you configure around it is under your
              control, and we do not have visibility into it by design.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Guest operating system hardening, patching, and lifecycle management, including
                kernel, CUDA stack, and container runtime updates within your images.
              </li>
              <li>
                Application code, container images, model-serving frameworks, and third-party
                dependencies you deploy.
              </li>
              <li>
                Identity and access management for your organisation: user provisioning and
                deprovisioning, role assignment, MFA enrolment, SSH key hygiene, and API key
                rotation.
              </li>
              <li>
                Firewall and security group rules, exposed ports, and which services you choose to
                make reachable from the public internet.
              </li>
              <li>
                Data classification, lawful basis for processing, and any encryption you require
                above the platform default — including application-level encryption of sensitive
                fields.
              </li>
              <li>
                Backup and snapshot configuration, retention schedules, restore testing, and
                off-platform copies where your recovery objectives require them.
              </li>
              <li>
                Model and dataset governance: provenance and licensing of training data, rights to
                fine-tune the base models you use, evaluation and safety testing of model outputs,
                and compliance with the acceptable use terms of any third-party weights.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "managed-vs-unmanaged-services",
        title: "Managed vs Unmanaged Services",
        content: (
          <>
            <p>
              The boundary between our responsibility and yours shifts depending on the service
              model you select, and it is worth confirming which model applies before you plan your
              controls around it.
            </p>
            <p>
              For unmanaged instances — virtual machines, bare-metal servers, and GPU nodes where
              you receive root or administrator access — you own the entire guest layer. That
              includes the operating system and every package on it, security updates, running
              services, host-level firewall configuration, monitoring agents, backup execution, and
              recovery. We provide the hardware, the hypervisor, the network, and the console; we do
              not patch your instance, we do not monitor processes inside it, and we cannot restore
              data you have not arranged to back up.
            </p>
            <p>
              For managed services — including managed databases, managed Kubernetes control
              planes, and managed inference endpoints — we take on operation of the underlying
              software: provisioning, version and patch management of the managed component,
              configuration baselines, and platform-level backups where the service description
              says so. You remain responsible for the data you place in the service, the schema and
              queries or models you run, access credentials and network exposure, and any
              application layer sitting in front of it.
            </p>
            <p>
              Where a service is described as managed, the specific division of duties is set out
              in that service&apos;s documentation and in your order form. If those documents
              conflict with the general description on this page, the service documentation and
              order form govern.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Data Protection",
    sections: [
      {
        id: "data-residency",
        title: "Data Residency",
        content: (
          <>
            <p>
              Where a Service offers explicit regional data placement, AhuraSense stores the Customer
              content governed by that regional feature in the selected region according to the
              architecture described for that Service.
            </p>
            <p>
              Some data associated with operation of the Customer relationship may be processed
              separately from workload content, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Account information</li>
              <li>Billing information</li>
              <li>Security logs</li>
              <li>Support communications</li>
              <li>KYC/KYB information</li>
              <li>Service telemetry and other operational metadata</li>
            </ul>
            <p>
              Backup, disaster recovery, support-access and replication arrangements may differ
              between Services. Where a Customer requires strict localisation — including
              restrictions on backup location, remote administrative access or support access — that
              requirement must be confirmed in an Order Form or other written agreement unless the
              applicable product documentation expressly provides it as a standard Service feature.
            </p>
          </>
        ),
      },
      {
        id: "data-retention-and-deletion",
        title: "Data Retention and Deletion",
        content: (
          <>
            <p>
              We retain customer content for as long as your account is active and you continue to
              use the resources holding it. Retention is driven by your configuration: volumes,
              snapshots, and object storage persist until you delete them or until the account
              lifecycle causes them to be removed.
            </p>
            <p>
              When you delete a resource, the underlying storage is released and the allocated
              blocks are made unreadable to subsequent tenants before reuse. When an account is
              closed or terminated, we delete or irreversibly de-identify associated customer
              content following a defined grace period, which exists so that accidental closure or
              a billing dispute does not immediately destroy your data. Backups and snapshots
              expire on their own retention cycle, so complete removal from all replicas is not
              instantaneous.
            </p>
            <p>
              Some records are retained after account closure where the law requires it, including
              billing and tax records, KYC and verification records, sanctions screening evidence,
              and security logs needed for investigation of abuse or incidents. These are retained
              for the minimum period required and are subject to access restrictions. Deletion
              requests under applicable data protection law can be raised with our grievance
              contact and are handled as described in our Privacy Policy.
            </p>
          </>
        ),
      },
      {
        id: "subprocessors",
        title: "Subprocessors",
        content: (
          <>
            <p>
              We engage a limited set of third parties to help deliver the service. These include
              data centre and colocation operators, network transit and DDoS mitigation providers,
              payment processors, identity verification and sanctions screening vendors, email and
              notification delivery services, and business support tooling such as ticketing and
              monitoring.
            </p>
            <p>
              Each subprocessor is assessed before engagement for security posture, data protection
              commitments, and jurisdictional fit, and is bound by written terms requiring
              confidentiality, appropriate technical and organisational measures, and processing
              limited to our documented instructions. Subprocessors that would have access to
              customer workload content are avoided wherever the architecture permits; most of our
              subprocessors touch only account, billing, or operational metadata.
            </p>
            <p>
              A current list of subprocessors is maintained and provided to customers on request,
              and forms part of our Data Processing Agreement. Where you have an executed DPA, we
              will give advance notice of new subprocessors so that you have an opportunity to
              object in accordance with its terms.
            </p>
          </>
        ),
      },
      {
        id: "international-data-processing",
        title: "International Data Processing",
        content: (
          <>
            <p>
              AhuraSense operates from India with a United Kingdom entity, and customers contract
              with the entity appropriate to their location and requirements. This structure means
              some processing — principally account administration, support, and finance — may
              involve personnel or systems in more than one country even where your workload region
              is fixed.
            </p>
            <p>
              Transfers of personal data across borders are carried out under a valid transfer
              mechanism. For data subject to UK or EU GDPR this typically means standard
              contractual clauses, the UK International Data Transfer Addendum, or an adequacy
              finding where one applies, supported by a transfer risk assessment. For data subject
              to India&apos;s Digital Personal Data Protection Act, transfers are made consistent
              with the restrictions and government notifications in force.
            </p>
            <p>
              If your obligations require that no personal data leaves a specific jurisdiction,
              including for support access, tell us before onboarding. We can often scope support
              and administrative access to satisfy that constraint, and we will document the
              arrangement contractually rather than leave it to assumption.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Compliance",
    sections: [
      {
        id: "compliance-overview",
        title: "Compliance Overview",
        content: (
          <>
            <p>
              Our compliance programme covers information security governance, data protection,
              customer verification, and trade controls. Policies are owned by named individuals,
              reviewed at least annually, and updated when our infrastructure, regulatory
              environment, or threat landscape changes materially.
            </p>
            <p>
              To restate the position clearly: our control framework is designed to align with
              ISO/IEC 27001 and SOC 2 principles, and our data protection practices are designed
              for India&apos;s Digital Personal Data Protection Act, UK GDPR, and EU GDPR as
              applicable to the contracting entity. We do not currently represent that AhuraSense
              holds SOC 2, ISO/IEC 27001, or PCI DSS certification, and you should not rely on any
              such representation from any source. Certifications in progress, and the scope they
              cover, will be published here when complete.
            </p>
            <p>
              In the meantime we support customer due diligence directly. On request we will provide
              our current attestation status, security policy summaries, subprocessor lists, our Data
              Processing Agreement, and completed security questionnaires. Where independent security
              test reports exist, we may make summaries available to eligible customers under NDA.
              Requests should go to {mail("legal@ahurasense.com")} or your account contact.
            </p>
          </>
        ),
      },
      {
        id: "kyc-kyb-and-verification",
        title: "KYC/KYB and Verification",
        content: (
          <>
            <p>
              AhuraSense may require identity, business and end-use verification before providing
              certain Services, increasing quotas, accepting high-value transactions or allocating
              advanced accelerator capacity. Verification requirements depend on the Customer,
              requested capacity, payment profile, jurisdiction, applicable trade controls and risk
              indicators.
            </p>
            <p>Information requested may include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Company registration details</li>
              <li>Authorised representative information</li>
              <li>Beneficial ownership information where relevant</li>
              <li>Billing verification</li>
              <li>Intended use and end-user information</li>
              <li>
                Documentation reasonably required to assess compliance or fraud risk
              </li>
            </ul>
            <p>
              AhuraSense may conduct sanctions, restricted-party, fraud and compliance screening
              directly or through appropriate service providers. Failure to complete required
              verification may result in delayed provisioning, reduced limits or refusal of the
              affected Service. AhuraSense will process verification information in accordance with
              the Privacy Policy and Applicable Law.
            </p>
          </>
        ),
      },
      {
        id: "export-controls",
        title: "Export Controls",
        content: (
          <>
            <p>
              Advanced GPUs, the compute capacity they provide, and certain AI models and technical
              data may be subject to export control regimes, including United States Export
              Administration Regulations affecting advanced computing hardware, the export control
              laws of India and the United Kingdom, and the controls of other jurisdictions where
              we or our suppliers operate. Providing remote access to controlled compute can itself
              constitute a controlled activity.
            </p>
            <p>
              You must comply with all applicable export control and trade laws when using the
              services. In particular, you must not re-export, transfer, or provide access to
              AhuraSense compute, model weights, or associated technical data to any person,
              entity, or destination where doing so would breach those laws, and you must not use
              the services on behalf of an undisclosed third party in order to circumvent them.
            </p>
            <p>
              We may require written confirmation of end use and end user for large or sustained
              accelerator allocations, may restrict specific hardware generations by region or
              customer, and may report to and cooperate with the relevant authorities where an
              export control obligation applies. Where a licence is required for your intended use,
              obtaining it is your responsibility.
            </p>
          </>
        ),
      },
      {
        id: "economic-sanctions",
        title: "Economic Sanctions",
        content: (
          <>
            <p>
              We screen customers, beneficial owners, and payment counterparties against applicable
              sanctions and restricted party lists, including those maintained by the United States
              Office of Foreign Assets Control, the United Kingdom, the European Union, the United
              Nations, and Indian authorities. Screening is performed at onboarding and on an
              ongoing basis as lists are updated.
            </p>
            <p>
              You represent that neither you, nor any entity that controls you, nor any beneficial
              owner is a designated or blocked party, and that you will not use the services for
              the benefit of one. If a match is confirmed, we are required to restrict or terminate
              the relationship, and depending on the applicable regime we may be obliged to freeze
              assets and report to the relevant authority.
            </p>
            <p>
              Screening may occasionally produce a false positive that delays account activation.
              If your account is restricted and you believe it is in error, contact{" "}
              {mail("legal@ahurasense.com")} with supporting documentation and we will review
              promptly.
            </p>
          </>
        ),
      },
      {
        id: "restricted-jurisdictions",
        title: "Restricted Jurisdictions",
        content: (
          <>
            <p>
              We do not provide services to customers located in, ordinarily resident in, or
              organised under the laws of comprehensively embargoed or restricted jurisdictions, and
              we prohibit access to the platform from those jurisdictions. The list follows
              applicable sanctions programmes and changes as those programmes change; the current
              position is available from {mail("legal@ahurasense.com")}.
            </p>
            <p>
              You must not access the services from a restricted jurisdiction, and you must not use
              proxies, VPNs, intermediaries, or resellers to disguise the location of a user or the
              destination of compute capacity. Doing so is a material breach of our terms and will
              result in termination without refund.
            </p>
            <p>
              We may apply geolocation controls, monitor access patterns for indicators of
              circumvention, and require additional verification where activity is inconsistent
              with the customer&apos;s declared location or end use.
            </p>
          </>
        ),
      },
      {
        id: "regulatory-cooperation",
        title: "Regulatory Cooperation",
        content: (
          <>
            <p>
              We cooperate with regulators and supervisory authorities in the jurisdictions where we
              operate, including data protection authorities in India, the United Kingdom, and the
              European Union, sectoral regulators where a customer relationship brings us within
              scope, and national cyber security bodies such as CERT-In for incident reporting.
            </p>
            <p>
              Cooperation is conducted within the bounds of law. We provide information that is
              lawfully required and reasonably scoped, we maintain records of what was provided and
              on what authority, and we do not volunteer customer data beyond what an obligation
              requires. Where we may lawfully inform an affected customer of a regulatory enquiry
              concerning them, we will.
            </p>
            <p>
              If you are a regulated entity that must include cloud providers within your own
              supervisory arrangements — for example under financial sector outsourcing rules — we
              can accommodate audit, information, and access provisions contractually. Raise this
              during contracting rather than after an examination has been scheduled.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Security Researchers",
    sections: [
      {
        id: "vulnerability-disclosure",
        title: "Vulnerability Disclosure",
        content: (
          <>
            <p>
              AhuraSense welcomes good-faith vulnerability reports concerning AhuraSense-operated
              systems. Researchers should report vulnerabilities privately to{" "}
              {mail("abuse@ahurasense.com")} before public disclosure and allow reasonable time for
              investigation and remediation.
            </p>
            <p>
              AhuraSense will aim to acknowledge reports promptly and will communicate with the
              reporter where additional information is required. Public disclosure timing should be
              coordinated in good faith based on severity, affected systems, remediation complexity
              and risk to customers.
            </p>
            <p>
              Researchers must not access, copy, modify or retain another Customer&apos;s data and
              must not test other Customers&apos; workloads.
            </p>
          </>
        ),
      },
      {
        id: "responsible-disclosure",
        title: "Responsible Disclosure",
        content: (
          <>
            <p>
              Good-faith research conducted within the published scope, without unnecessary access to
              Customer Data, service disruption, extortion, privacy violations or unlawful conduct,
              will not ordinarily be treated by AhuraSense as malicious activity.
            </p>
            <p>
              AhuraSense does not require researchers to waive lawful rights as a condition of
              reporting.
            </p>
            <p>
              Researchers must not access, copy, modify or retain another Customer&apos;s data and
              must not test other Customers&apos; workloads. Public disclosure timing should be
              coordinated in good faith based on severity, affected systems, remediation complexity
              and risk to customers.
            </p>
          </>
        ),
      },
      {
        id: "security-contact",
        title: "Security Contact",
        content: (
          <>
            <p>
              Security reports and enquiries should be directed to {mail("abuse@ahurasense.com")}
              . This channel is monitored by our security team and is the fastest route for
              vulnerability reports, suspected compromise of a customer account, and questions
              about the controls described on this page.
            </p>
            <p>
              If your report contains sensitive material, say so in your first message and we will
              arrange an encrypted channel before you send details. Please do not post
              vulnerability details in public issue trackers, social media, or support tickets
              handled by general staff.
            </p>
            <p>
              For urgent incidents affecting a live production workload, contact security and, if
              you have a support agreement with an emergency escalation path, use that in parallel
              so the on-call rotation is engaged immediately.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Legal Requests & Abuse",
    sections: [
      {
        id: "government-requests",
        title: "Government Requests",
        content: (
          <>
            <p>
              We disclose customer data to government authorities only where we are compelled to do
              so by valid legal process properly served on the correct AhuraSense entity, or where
              there is a genuine emergency involving a risk of death or serious physical harm.
              Informal requests, requests lacking legal authority, and requests directed to the
              wrong entity are declined.
            </p>
            <p>
              Every request is reviewed for legal validity, jurisdictional authority, and scope. We
              require that a request be specific about the accounts and data sought and the legal
              basis relied upon. Where a request is overbroad, vague, or seeks more than the
              authority permits, we push back and require it to be narrowed or withdrawn, and we
              are prepared to challenge requests through the appropriate channels.
            </p>
            <p>
              It is our policy to notify affected customers of requests for their data before
              disclosure, so that they have an opportunity to seek protection, unless we are legally
              prohibited from doing so or there is a clear emergency. Where notice is prohibited by
              a non-disclosure order, we seek to notify once the prohibition lapses. We intend to
              publish periodic transparency reporting on the volume and type of government requests
              received and our responses to them.
            </p>
          </>
        ),
      },
      {
        id: "law-enforcement",
        title: "Law Enforcement",
        content: (
          <>
            <p>
              Law enforcement requests should be sent to {mail("legal@ahurasense.com")} on official
              letterhead from an official email domain, identifying the requesting officer and
              agency, the legal instrument relied upon, the specific account identifiers or
              resources at issue, and the precise data sought. Requests from outside India or the
              United Kingdom should proceed through mutual legal assistance channels or another
              recognised mechanism.
            </p>
            <p>
              We frequently hold less than requesters expect. For unmanaged instances we do not
              have access to the contents of guest operating systems, application data, model
              weights, or datasets, and we cannot produce material we do not possess. We will state
              plainly what exists rather than perform speculative searches.
            </p>
            <p>
              Requests are handled by our legal function, not by support staff, and are logged for
              transparency reporting. The same validity review, scope challenge, and customer
              notification policy described above applies to law enforcement requests.
            </p>
          </>
        ),
      },
      {
        id: "preservation-requests",
        title: "Preservation Requests",
        content: (
          <>
            <p>
              We will honour valid preservation requests from authorised authorities by taking
              reasonable steps to preserve a snapshot of the specified records available to us at
              the time the request is received. Preservation does not itself result in disclosure;
              production requires separate valid legal process.
            </p>
            <p>
              Preservation requests should identify the account or resources precisely, state the
              legal basis and the investigation to which they relate, and specify the period.
              Preservation is maintained for the period the applicable law provides, extendable on
              proper request, after which the preserved material is released to normal retention
              and deletion cycles.
            </p>
            <p>
              We can only preserve what exists when the request arrives. Data already deleted by
              the customer, and data inside instances that we cannot access, cannot be preserved
              retrospectively.
            </p>
          </>
        ),
      },
      {
        id: "copyright-ip-complaints",
        title: "Copyright/IP Complaints",
        content: (
          <>
            <p>
              We respect intellectual property rights and expect our customers to do the same. If
              you believe material hosted on AhuraSense infrastructure infringes your copyright or
              other intellectual property rights, send a notice to {mail("abuse@ahurasense.com")}{" "}
              with {mail("legal@ahurasense.com")} copied.
            </p>
            <p>A complete notice should include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Identification of the copyrighted work or other right claimed to be infringed, and
                the basis of your rights in it.
              </li>
              <li>
                Identification of the allegedly infringing material with enough specificity for us
                to locate it, including a URL or IP address.
              </li>
              <li>Your name, postal address, telephone number, and email address.</li>
              <li>
                A statement that you have a good-faith belief that the use is not authorised by the
                rights holder, its agent, or the law.
              </li>
              <li>
                A statement, made under penalty of perjury where applicable, that the information in
                the notice is accurate and that you are the rights holder or authorised to act on
                their behalf.
              </li>
              <li>Your physical or electronic signature.</li>
            </ul>
            <p>
              On receipt of a compliant notice we will forward it to the customer and require
              removal or disabling of the material, or act ourselves where the customer does not
              respond within the stated period. A customer who believes material was removed in
              error may submit a counter-notice identifying the material, stating under penalty of
              perjury a good-faith belief that removal resulted from mistake or misidentification,
              providing contact details, and consenting to the jurisdiction of an appropriate
              court. We will forward a valid counter-notice to the complainant and may restore the
              material unless we are informed that court proceedings have been commenced.
            </p>
            <p>
              We operate a repeat-infringer policy: accounts that are the subject of repeated
              substantiated infringement notices will be terminated. Notices that are materially
              false or submitted in bad faith may expose the sender to liability, and we may decline
              to act on notices that are plainly abusive.
            </p>
          </>
        ),
      },
      {
        id: "abuse-reporting",
        title: "Abuse Reporting",
        content: (
          <>
            <p>
              Report network abuse originating from AhuraSense address space to{" "}
              {mail("abuse@ahurasense.com")}. Useful reports include the source IP address,
              timestamps with time zone, the nature of the activity, and log excerpts or packet
              samples that let us identify the responsible resource. Reports without a timestamp and
              time zone are frequently impossible to action.
            </p>
            <p>
              We investigate reports of port scanning, brute-force attempts, malware command and
              control, phishing infrastructure, spam origination, denial-of-service participation,
              and unauthorised access attempts. We also act on reports of misuse of AI capacity,
              including generation of child sexual abuse material, mass automated fraud or
              impersonation, and non-consensual intimate imagery, which are treated as the highest
              severity and result in immediate suspension and, where required, referral to
              authorities.
            </p>
            <p>
              Depending on severity we may contact the customer for remediation, apply network
              filtering, suspend the resource, or terminate the account. We will keep a reporter
              informed of the outcome at a level of detail that does not disclose confidential
              customer information.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Contact",
    sections: [
      {
        id: "security-contact-details",
        title: "Security Contact",
        content: (
          <>
            <p>
              {mail("abuse@ahurasense.com")} — vulnerability reports, suspected compromise, security
              questionnaires, and questions about the controls described on this page. Where
              independent security test reports exist, summaries may be made available to eligible
              customers under NDA.
            </p>
            <p>
              AhuraSense aims to acknowledge vulnerability reports promptly. For customer security
              incidents affecting a live workload, use your support escalation path in parallel.
            </p>
          </>
        ),
      },
      {
        id: "abuse-contact",
        title: "Abuse Contact",
        content: (
          <>
            <p>
              {mail("abuse@ahurasense.com")} — network abuse, spam, phishing, malware, misuse of AI
              capacity, and intellectual property takedown notices.
            </p>
            <p>
              Include source IP address, timestamps with time zone, and supporting log evidence so
              we can identify the responsible resource quickly. High-severity reports involving
              imminent harm are prioritised on receipt.
            </p>
          </>
        ),
      },
      {
        id: "legal-contact",
        title: "Legal Contact",
        content: (
          <>
            <p>
              {mail("legal@ahurasense.com")} — government and law enforcement requests, preservation
              requests, sanctions and export control enquiries, contracting and Data Processing
              Agreement requests, and subprocessor list requests.
            </p>
            <p>
              Legal process should identify the AhuraSense entity being served, the legal instrument
              relied upon, and the specific accounts and data sought. Requests are handled by our
              legal function rather than by support.
            </p>
          </>
        ),
      },
      {
        id: "privacy-grievance-contact",
        title: "Privacy/Grievance Contact",
        content: (
          <>
            <p>
              {mail("legal@ahurasense.com")} — data protection enquiries, data subject and data
              principal rights requests, consent withdrawal, and complaints about how we handle
              personal data.
            </p>
            <p>
              This address reaches our Grievance Officer for the purposes of India&apos;s Digital
              Personal Data Protection Act and our data protection contact for UK and EU GDPR
              matters. We acknowledge grievances on receipt and respond within the timeframes the
              applicable law prescribes. If you are dissatisfied with our response you retain the
              right to complain to the relevant supervisory authority.
            </p>
          </>
        ),
      },
    ],
  },
];

export default function TrustPage() {
  return (
    <LegalPageShell
      currentPath="/trust"
      title="Trust & Compliance"
      description="How AhuraSense Cloud secures sovereign GPU and AI infrastructure — the controls we operate, the responsibilities that stay with you, where your data lives, and how we handle vulnerability reports, abuse, and legal requests."
      effectiveDate="1 March 2026"
      lastUpdated="1 March 2026"
      groups={GROUPS}
    />
  );
}
