import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Service-Specific Terms",
  description:
    "Additional terms governing the technical and commercial characteristics of individual AhuraSense Services, supplementing the Terms & Services.",
  alternates: {
    canonical: `${siteConfig.url}/service-specific-terms`,
  },
  openGraph: {
    title: "Service-Specific Terms | AhuraSense Cloud",
    description:
      "Service-level conditions for compute, GPU, AI inference, managed platform, networking and third-party components across AhuraSense Cloud.",
    url: `${siteConfig.url}/service-specific-terms`,
  },
};

const RELATED = [
  { href: "/terms", label: "Terms & Services" },
  { href: "/billing-policy", label: "Billing, Refunds & Cancellation" },
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
              These Service-Specific Terms govern the technical and commercial characteristics of
              individual AhuraSense Services. They supplement the Terms &amp; Services and apply only
              to the relevant Services.
            </p>
            <p>
              Where a particular Service is subject to additional conditions presented during
              ordering, described in Documentation, or stated in an Order Form, those conditions form
              part of the Service-Specific Terms for that Service.
            </p>
            <p>
              Services may have different availability, durability, performance, billing, backup,
              data residency and support characteristics. Customers are responsible for reviewing the
              specifications of the Service selected before deploying production workloads.
            </p>
          </>
        ),
      },
      {
        id: "general-infrastructure-terms",
        title: "General Infrastructure Terms",
        content: (
          <>
            <p>
              Resources are supplied subject to capacity, regional availability, technical
              compatibility, quotas and applicable compliance controls.
            </p>
            <p>
              AhuraSense may perform maintenance, security updates, hardware replacements, migrations,
              capacity balancing and other operational changes reasonably required to operate the
              platform. Where technically possible, we will endeavour to minimise disruption.
            </p>
            <p>
              Applicable availability commitments are governed exclusively by the Service Level
              Agreement or a separately negotiated commitment. Customers must not rely on
              undocumented implementation behaviour.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Compute & Infrastructure",
    sections: [
      {
        id: "virtual-machines-and-compute",
        title: "Virtual Machines and Compute",
        content: (
          <>
            <p>
              Virtual machines provide Customer-controlled computing environments. Unless expressly
              sold as a managed operating-system service, the Customer is responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Guest operating system administration and software installation.</li>
              <li>Patching, application security and malware protection.</li>
              <li>Firewall configuration and credentials.</li>
              <li>Licensing and backup.</li>
            </ul>
            <p>
              Charges continue for resources for as long as they remain allocated according to their
              billing state. Stopping an operating system from within a virtual machine does not
              necessarily release the underlying compute resource or stop billing.
            </p>
            <p>
              Termination or deletion of an instance may permanently remove local or ephemeral storage
              associated with it.
            </p>
          </>
        ),
      },
      {
        id: "bare-metal-and-dedicated-servers",
        title: "Bare-Metal and Dedicated Servers",
        content: (
          <>
            <p>
              Bare-metal and dedicated servers may require provisioning time and may be subject to
              minimum billing terms.
            </p>
            <p>
              Hardware remains the property of AhuraSense or its infrastructure supplier unless
              expressly sold under a separate written agreement.
            </p>
            <p>
              Hardware replacement is the Customer&apos;s remedy for verified hardware failure unless
              an applicable SLA or Order Form provides additional remedies.
            </p>
            <p>
              Customers must not tamper with physical equipment, firmware, management controllers or
              facility systems except where expressly authorised.
            </p>
          </>
        ),
      },
      {
        id: "gpu-compute",
        title: "GPU Compute",
        content: (
          <>
            <p>
              GPU services provide access to accelerator resources that may include NVIDIA or other
              GPU families identified during ordering. Specific accelerator models and quantities
              remain subject to availability until confirmed. On-demand capacity may become
              unavailable between separate provisioning requests, even where capacity was available
              previously.
            </p>
            <p>Customers are responsible for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Checkpointing training jobs.</li>
              <li>Storing durable model state outside temporary runtime storage.</li>
              <li>
                Designing workloads to tolerate failure appropriate to the relevant Service.
              </li>
            </ul>
            <p>
              GPU errors may include device resets, memory errors, driver failures, interconnect
              faults, node failures and other accelerator-specific failure modes. AhuraSense may
              replace, migrate or restart affected nodes as reasonably required.
            </p>
            <p>
              GPU capacity may be subject to enhanced KYC/KYB, export-control screening and end-use
              verification.
            </p>
          </>
        ),
      },
      {
        id: "reserved-and-dedicated-gpu-capacity",
        title: "Reserved and Dedicated GPU Capacity",
        content: (
          <>
            <p>
              Reserved capacity becomes binding when the reservation is confirmed in writing,
              activated through the Account, or accepted through an Order Form. Unless otherwise
              stated, the Customer is responsible for the committed charges for the entire reservation
              term regardless of utilisation.
            </p>
            <p>
              Reservations are specific to the quantity, GPU family, region and term specified in the
              Order. A reservation does not entitle the Customer to replacement with a newer
              accelerator generation.
            </p>
            <p>
              Where identical hardware cannot reasonably be restored following a permanent failure,
              AhuraSense may offer:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Equivalent or better capacity.</li>
              <li>An agreed commercial adjustment.</li>
              <li>Termination of the affected portion of the reservation.</li>
            </ul>
            <p>
              For large dedicated clusters, provisioning milestones, capacity acceptance, interconnect
              specifications, replacement arrangements and any spare-node commitments should be
              recorded in the applicable Order Form.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "AI Services",
    sections: [
      {
        id: "ai-inference-and-model-hosting",
        title: "AI Inference and Model Hosting",
        content: (
          <>
            <p>
              Customers may deploy models owned or licensed by them or use models made available
              through AhuraSense. Third-party models remain subject to their respective licences and
              provider conditions.
            </p>
            <p>
              AhuraSense does not grant rights in third-party model weights except to the extent
              AhuraSense is authorised to do so.
            </p>
            <p>
              Customers are responsible for determining whether model licences permit commercial use,
              fine-tuning, redistribution, output use and the Customer&apos;s intended application.
            </p>
          </>
        ),
      },
      {
        id: "fine-tuning-and-training",
        title: "Fine-Tuning and Training",
        content: (
          <>
            <p>
              Customers are responsible for datasets, licences, privacy permissions, data-subject
              rights, model rights, safety evaluation and resulting model artefacts.
            </p>
            <p>Training and fine-tuning workloads may fail because of:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Application errors or checkpoint configuration.</li>
              <li>Memory exhaustion or distributed-training failures.</li>
              <li>Dependency errors or accelerator faults.</li>
              <li>Other causes.</li>
            </ul>
            <p>
              Customers should configure checkpointing suitable to the expected workload duration.
              Unless expressly stated otherwise, compute consumed before a Customer-controlled
              workload fails remains billable.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Managed Platform",
    sections: [
      {
        id: "managed-databases",
        title: "Managed Databases",
        content: (
          <>
            <p>
              Managed databases include operation and maintenance of the database service components
              identified as managed in the applicable product description.
            </p>
            <p>Customers remain responsible for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Database users and application credentials.</li>
              <li>Schema design, queries and access policies.</li>
              <li>Network exposure and retention requirements.</li>
              <li>Application-level data integrity.</li>
            </ul>
            <p>
              Backups, point-in-time recovery, replicas and high-availability features apply only
              where enabled or included in the selected plan.
            </p>
          </>
        ),
      },
      {
        id: "kubernetes",
        title: "Kubernetes",
        content: (
          <>
            <p>
              For managed Kubernetes, AhuraSense manages only the platform components identified as
              managed in the relevant product documentation.
            </p>
            <p>
              Customers remain responsible for workloads, container images, Kubernetes RBAC, secrets,
              network policies, ingress configuration, application security, persistent volumes and
              worker-node configuration except where explicitly managed.
            </p>
          </>
        ),
      },
      {
        id: "object-and-block-storage",
        title: "Object and Block Storage",
        content: (
          <>
            <p>
              Storage capacity remains chargeable for as long as the relevant volume, bucket, snapshot
              or reserved storage allocation remains active.
            </p>
            <p>
              Deleting compute does not necessarily delete attached persistent storage. Customers must
              verify deletion workflows carefully.
            </p>
            <p>
              Versioning, object lock, replication, backup and lifecycle policies apply only when
              explicitly configured or included.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Networking & Domains",
    sections: [
      {
        id: "networking",
        title: "Networking",
        content: (
          <>
            <p>
              Public IP addresses, bandwidth, egress traffic, load balancers, private networking, BGP,
              BYOIP and other network services may be separately metered or limited.
            </p>
            <p>
              IP addresses remain AhuraSense or supplier resources unless separately assigned to the
              Customer. Customers must maintain accurate routing, firewall and DNS configuration.
            </p>
            <p>
              BYOIP customers must have legal authority to originate or authorise use of the relevant
              prefixes and must maintain valid route and registry information where required.
            </p>
          </>
        ),
      },
      {
        id: "domain-registration",
        title: "Domain Registration",
        content: (
          <>
            <p>
              Domain registration is subject to the rules of the relevant registry, registrar, ICANN
              where applicable, and any country-code administrator.
            </p>
            <p>
              A domain is not registered until confirmed by the responsible registry. Registration
              requests may fail even after an initial availability check.
            </p>
            <p>
              Customers are responsible for accurate registrant data, renewal, transfer credentials,
              expiry dates and applicable dispute procedures. Registry fees and renewal pricing may
              change independently of AhuraSense pricing.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Third-Party Components",
    sections: [
      {
        id: "third-party-and-marketplace-components",
        title: "Third-Party and Marketplace Components",
        content: (
          <>
            <p>
              Open-source software, marketplace images, model weights, operating systems and other
              third-party components are governed by their respective licences. AhuraSense is not
              responsible for a Customer&apos;s failure to comply with third-party licensing
              conditions.
            </p>
            <p>We may remove a third-party component where:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Its provider withdraws it.</li>
              <li>A licence changes.</li>
              <li>Continued distribution becomes unlawful.</li>
              <li>A material security issue arises.</li>
            </ul>
          </>
        ),
      },
    ],
  },
];

export default function ServiceSpecificTermsPage() {
  return (
    <LegalPageShell
      currentPath="/service-specific-terms"
      title="Service-Specific Terms"
      description="Additional terms governing the technical and commercial characteristics of individual AhuraSense Services, supplementing the Terms & Services."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      groups={GROUPS}
      relatedLinks={RELATED}
    />
  );
}
