import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Service Level Agreement",
  description:
    "Read the AhuraSense Cloud Service Level Agreement covering per-service availability commitments, downtime measurement, service credits, and exclusions.",
  alternates: {
    canonical: `${siteConfig.url}/sla`,
  },
  openGraph: {
    title: "Service Level Agreement | AhuraSense Cloud",
    description:
      "Per-service availability commitments, downtime calculation, and service credit terms for AhuraSense Cloud infrastructure.",
    url: `${siteConfig.url}/sla`,
  },
};

const GROUPS: LegalSectionGroup[] = [
  {
    label: "SLA Overview",
    sections: [
      {
        id: "scope",
        title: "Scope",
        content: (
          <>
            <p>
              This Service Level Agreement (the &quot;SLA&quot;) sets out the availability
              commitments AhuraSense makes for the eligible services listed below, how availability
              is measured, and the service credits available if we do not meet a commitment in a
              given calendar month.
            </p>
            <p>
              The contracting entity is AhuraSense Technologies Private Limited (2/26 Umiya Nagar,
              Nirnay Nagar, Ahmedabad, Gujarat 382481, India) unless an Order Form, Master Services
              Agreement, invoice, or other written agreement expressly identifies another AhuraSense
              entity — such as AhuraSense Ltd (20 Wenlock Road, London, England N1 7GU, United
              Kingdom) — as the contracting party. References to &quot;AhuraSense&quot;,
              &quot;we&quot;, &quot;us&quot;, or &quot;our&quot; mean the applicable contracting
              entity.
            </p>
            <p>
              This SLA forms part of, and is governed by, the AhuraSense Terms &amp; Services.
              Capitalised terms not defined here have the meaning given in the Terms. Where an order
              form, enterprise agreement, or negotiated addendum states different commitments, that
              document prevails for the services it covers.
            </p>
            <p>
              Commitments are stated per service, per region, and per calendar month. We deliberately
              do not apply a single headline number to every service: a reserved multi-GPU cluster,
              an object storage endpoint, and an on-demand single GPU have materially different
              failure characteristics, and this SLA reflects those differences honestly.
            </p>
          </>
        ),
      },
      {
        id: "definitions",
        title: "Definitions",
        content: (
          <>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white/90">Monthly Uptime Percentage</span> — the availability
                figure calculated for an eligible service in a region for a calendar month, using
                the formula in this SLA.
              </li>
              <li>
                <span className="text-white/90">Unavailable / Unavailability</span> — a state in
                which an eligible resource is wholly unreachable or unable to perform its core
                function through no fault of the customer, as observed by our monitoring systems.
                Degraded performance that does not render the resource unusable is not
                Unavailability.
              </li>
              <li>
                <span className="text-white/90">Downtime Minutes</span> — the number of minutes in
                the month during which a resource was Unavailable, measured in consecutive-minute
                intervals.
              </li>
              <li>
                <span className="text-white/90">Excluded Minutes</span> — minutes attributable to
                Scheduled Maintenance or to any circumstance listed under SLA Exclusions.
              </li>
              <li>
                <span className="text-white/90">Service Credit</span> — a credit applied to your
                AhuraSense Cloud account, expressed as a percentage of the monthly charges for the
                affected service in the affected region.
              </li>
              <li>
                <span className="text-white/90">Region</span> — a distinct AhuraSense Cloud
                geographic deployment in which a Service is made generally available.
              </li>
              <li>
                <span className="text-white/90">Control Plane</span> — the management APIs, console,
                and orchestration systems used to create, modify, and inspect resources, as distinct
                from the running workloads themselves.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "eligible-services",
        title: "Eligible Services",
        content: (
          <>
            <p>
              This SLA applies only to paid, generally available AhuraSense Services expressly
              identified as SLA-eligible in the applicable product description, Order Form or this
              SLA. A Service is covered only after it has been made generally available in the
              relevant region.
            </p>
            <p>
              Alpha, beta, preview, technology-preview, evaluation, trial, free-tier, experimental,
              preemptible, spot and expressly interruptible Services are excluded unless an Order
              Form expressly states otherwise.
            </p>
            <p>
              A Service not listed as SLA-eligible does not acquire an availability commitment
              merely because it interoperates with a covered Service.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Availability Commitments",
    sections: [
      {
        id: "cloud-compute",
        title: "Cloud Compute",
        content: (
          <>
            <p>
              For eligible Cloud Compute resources, the applicable Monthly Uptime Commitment is the
              commitment published for the relevant compute product or stated in the
              Customer&apos;s Order Form. Where no separate higher commitment is expressly stated,
              eligible standard Cloud Compute carries a{" "}
              <span className="text-white/90">99.9%</span> Monthly Uptime Commitment.
            </p>
            <p>
              The commitment applies to platform-side availability of the allocated compute resource
              and does not guarantee uninterrupted operation of Customer applications, guest
              operating systems, software dependencies or external networks.
            </p>
            <p>
              A compute resource is Unavailable when a platform-side failure prevents the resource
              from operating and AhuraSense is unable to restore or replace the affected allocation
              within the measured Downtime period.
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
              Eligible on-demand GPU resources carry a{" "}
              <span className="text-white/90">99.5%</span> Monthly Uptime Commitment unless another
              commitment is stated in the applicable product description or Order Form. Reserved or
              dedicated GPU capacity may carry a higher commitment where specified in the relevant
              reservation Order Form.
            </p>
            <p>
              A GPU resource is Unavailable where a platform-side hardware, accelerator, host,
              power, interconnect or orchestration failure prevents the relevant allocated GPU
              capacity from performing its core function and the Customer cannot reasonably access
              replacement capacity within the covered allocation.
            </p>
            <p>
              GPU application errors, CUDA or framework errors arising from Customer software,
              out-of-memory conditions caused by the Customer workload, Customer-selected driver
              incompatibilities and failure to checkpoint application state are not platform
              Unavailability.
            </p>
            <p>
              Preemptible and interruptible GPU capacity does not carry an availability commitment
              unless expressly stated otherwise.
            </p>
          </>
        ),
      },
      {
        id: "networking",
        title: "Networking",
        content: (
          <>
            <p>
              For the AhuraSense regional network fabric — including intra-region routing, virtual
              networks, and regional load balancing — we commit to a Monthly Uptime Percentage of{" "}
              <span className="text-white/90">99.99%</span>. The fabric is Unavailable when a
              customer resource cannot send or receive traffic through our network due to a fault
              within our infrastructure.
            </p>
            <p>
              This commitment ends at our network edge. The public internet, upstream transit and
              peering providers, customer ISPs, customer-managed VPN endpoints, and third-party
              interconnect partners are outside our control and are excluded. Packet loss, latency,
              or reachability problems occurring beyond our edge do not constitute Unavailability
              under this SLA, even where they affect your users.
            </p>
            <p>
              Unless separately agreed in an order form, this SLA covers availability only and does
              not set latency, jitter, throughput, or packet-loss targets.
            </p>
          </>
        ),
      },
      {
        id: "storage",
        title: "Storage",
        content: (
          <>
            <p>
              For object storage, we commit to a Monthly Uptime Percentage of{" "}
              <span className="text-white/90">99.99%</span>, measured as the proportion of valid
              requests to the storage endpoint that are not answered with an internal server error or
              service-unavailable response.
            </p>
            <p>
              For block volumes attached to a running instance, we commit to a Monthly Uptime
              Percentage of <span className="text-white/90">99.9%</span>. A volume is Unavailable
              when read and write operations to it fail for reasons within our infrastructure.
            </p>
            <p>
              AhuraSense storage services are designed to provide high durability through
              redundancy, integrity controls and appropriate failure-domain protection for the
              relevant storage architecture.
            </p>
            <p>
              Durability is distinct from availability and does not protect against Customer
              deletion, overwriting, compromised credentials, ransomware or application-level
              corruption. Customers remain responsible for backups, versioning and recovery
              arrangements appropriate to the importance of their data.
            </p>
            <p>
              Unless expressly stated in an Order Form, durability figures are engineering
              objectives and do not create separate service-credit entitlements.
            </p>
          </>
        ),
      },
      {
        id: "managed-services",
        title: "Managed Services",
        content: (
          <>
            <p>
              For single-node managed databases and the single-node managed Kubernetes control plane,
              we commit to a Monthly Uptime Percentage of{" "}
              <span className="text-white/90">99.9%</span>.
            </p>
            <p>
              For high-availability configurations — managed databases deployed with a standby or
              replica set, and multi-node highly available Kubernetes control planes — we commit to
              a Monthly Uptime Percentage of{" "}
              <span className="text-white/90">99.95%</span>. The higher commitment reflects that
              failover to a healthy node can absorb an individual node failure without customer-facing
              Unavailability.
            </p>
            <p>
              Brief failover events within a documented failover window, and connection interruptions
              caused by customer-initiated version upgrades, parameter changes, or resizing
              operations, are not counted as Downtime. Kubernetes worker nodes are covered under the
              relevant Cloud Compute or GPU Compute commitment rather than under Managed Services.
            </p>
          </>
        ),
      },
      {
        id: "control-plane-and-api",
        title: "Control Plane and API",
        content: (
          <>
            <p>
              For the AhuraSense management console and public management API, the applicable
              commitment is <span className="text-white/90">99.9%</span> Monthly Uptime where the
              Service is designated as generally available.
            </p>
            <p>
              Control Plane Unavailability does not constitute data-plane Unavailability where
              existing Customer workloads continue operating normally.
            </p>
            <p>
              Where the Control Plane is not separately charged, an approved Control Plane SLA
              credit will be calculated against{" "}
              <span className="text-white/90">10% of the Customer&apos;s eligible monthly regional
              service charges</span>{" "}
              for the affected region, unless an Order Form specifies another calculation basis.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Downtime",
    sections: [
      {
        id: "how-availability-is-calculated",
        title: "How Availability Is Calculated",
        content: (
          <>
            <p>
              Monthly Uptime Percentage is calculated per eligible service, per region, per calendar
              month, using the following formula:
            </p>
            <p className="border border-white/[0.08] bg-black/40 px-4 py-3 font-mono text-[13px] leading-6 text-white/85">
              Monthly Uptime Percentage = ((Total Minutes in Month &minus; Excluded Minutes &minus;
              Downtime Minutes) / (Total Minutes in Month &minus; Excluded Minutes)) &times; 100
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white/90">Total Minutes in Month</span> is the number of
                minutes in the calendar month, measured in UTC.
              </li>
              <li>
                <span className="text-white/90">Excluded Minutes</span> are minutes attributable to
                Scheduled Maintenance or to any SLA Exclusion. Excluded Minutes are removed from both
                the numerator and the denominator, so excluded time neither helps nor harms the
                resulting percentage.
              </li>
              <li>
                <span className="text-white/90">Downtime Minutes</span> are the sum of
                consecutive-minute intervals during which the resource was Unavailable. Downtime is
                measured per resource — per instance, per volume, per cluster, per endpoint — and not
                averaged across your whole fleet.
              </li>
            </ul>
            <p>
              A partial minute of Unavailability is counted as a full Downtime Minute. Where a
              resource is Unavailable for a period shorter than one consecutive minute, that period is
              not counted as Downtime. For services measured by request success rate — object storage
              and the Control Plane and API — a minute is treated as a Downtime Minute when the error
              rate for valid requests in that minute exceeds the applicable threshold.
            </p>
            <p>
              Measurement is taken from AhuraSense monitoring and telemetry systems, which are the
              primary record. We will, however, review credible customer-supplied evidence — logs,
              timestamped traces, probe results, and error responses — and where that evidence
              demonstrates Unavailability our systems did not record, we will take it into account in
              good faith when assessing a claim.
            </p>
          </>
        ),
      },
      {
        id: "scheduled-maintenance",
        title: "Scheduled Maintenance",
        content: (
          <>
            <p>
              Scheduled Maintenance is planned maintenance reasonably required to update, repair,
              secure or operate the Services.
            </p>
            <p>
              Where Scheduled Maintenance is expected to create material Customer-facing disruption,
              AhuraSense will use reasonable efforts to provide advance notice through the status
              page, Account notification or registered technical contacts. Where practicable,
              AhuraSense aims to provide at least{" "}
              <span className="text-white/90">seventy-two hours&apos;</span> notice of materially
              disruptive planned maintenance. Shorter notice may be given where operational
              circumstances reasonably require.
            </p>
            <p>
              Routine work that does not create Customer-facing Unavailability does not require
              individual Customer notice. Scheduled Maintenance is excluded from the availability
              calculation.
            </p>
          </>
        ),
      },
      {
        id: "emergency-maintenance",
        title: "Emergency Maintenance",
        content: (
          <>
            <p>
              Emergency Maintenance is unplanned work we must carry out at short notice to preserve
              the security, integrity, or stability of the platform — for example applying a critical
              security patch, mitigating an active exploit, replacing hardware showing imminent
              failure, or responding to an upstream vendor advisory.
            </p>
            <p>
              We will give as much notice as circumstances reasonably allow, which in a genuine
              emergency may be little or none, and we will publish the reason and the resolution on
              the status page afterwards.
            </p>
            <p>
              Emergency Maintenance is treated as Excluded Minutes where it is undertaken to prevent
              imminent harm to the platform, to customer data, or to security. Where an incident is
              instead the consequence of a failure within our infrastructure, the resulting outage is
              counted as Downtime and credits apply in the normal way. We will not reclassify an
              outage as Emergency Maintenance in order to avoid a credit obligation.
            </p>
          </>
        ),
      },
      {
        id: "sla-exclusions",
        title: "SLA Exclusions",
        content: (
          <>
            <p>
              The following are excluded from Downtime Minutes and do not qualify for service
              credits:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Customer misconfiguration, including incorrect security group, firewall, routing,
                DNS, IAM, or load balancer settings.
              </li>
              <li>
                Exceeding account quotas, service limits, documented rate limits, or provisioned
                capacity, including resource exhaustion caused by customer workload growth.
              </li>
              <li>
                Any alpha, beta, preview, technology preview, trial, evaluation, or free-tier
                service, and any service not yet generally available in the region concerned.
              </li>
              <li>
                Suspension, throttling, or termination of service arising from breach of the
                Acceptable Use Policy, breach of the Terms of Service, non-payment, or an outstanding
                balance.
              </li>
              <li>
                Force majeure and other events beyond our reasonable control, as described in this
                SLA.
              </li>
              <li>
                Faults in customer software, application code, container images, dependencies, or
                deployment automation.
              </li>
              <li>
                Faults in the customer-managed guest layer — guest operating system, kernel, drivers,
                agents, patching, filesystem corruption, and in-guest resource exhaustion.
              </li>
              <li>
                The public internet, upstream transit and peering providers, customer ISPs,
                third-party networks, third-party SaaS or API dependencies, and marketplace or
                third-party software.
              </li>
              <li>
                Side effects of DDoS detection and mitigation, including traffic scrubbing, rate
                limiting, connection throttling, or blackholing applied to protect the platform or
                other customers.
              </li>
              <li>Scheduled Maintenance and qualifying Emergency Maintenance.</li>
              <li>
                Preemptible, spot, or interruptible capacity reclaimed in accordance with its
                documented terms.
              </li>
              <li>
                Unavailability caused by the customer&apos;s own actions or those of its users,
                agents, or contractors — including shutting down, deleting, resizing, or detaching
                resources, or credential loss and compromise.
              </li>
              <li>
                Resources that are stopped, deallocated, suspended, or otherwise not in a running
                state at the customer&apos;s direction.
              </li>
              <li>
                Degraded performance that does not amount to Unavailability, and failures to meet
                latency, throughput, or benchmark expectations not expressly committed in writing.
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    label: "Service Credits",
    sections: [
      {
        id: "credit-eligibility",
        title: "Credit Eligibility",
        content: (
          <>
            <p>
              You are eligible for a Service Credit where, in a calendar month, the Monthly Uptime
              Percentage for an eligible service in a region falls below the commitment stated for
              that service, and you submit a valid claim in accordance with the Claim Process below.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Your account must be in good standing, with no overdue balance at the time the claim
                is submitted or the credit is applied.
              </li>
              <li>
                The affected service must have been a paid, generally available service in that
                region for the month in question.
              </li>
              <li>
                Credits are assessed independently for each service and each region. Falling short in
                one region does not create a claim against another.
              </li>
              <li>
                Where a single incident causes shortfalls in more than one eligible service, credits
                are calculated separately for each affected service against its own charges.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "credit-calculation",
        title: "Credit Calculation",
        content: (
          <>
            <p>
              Service Credits are expressed as a percentage of the monthly charges for the affected
              Service in the affected region. Tiers are assessed against the applicable Monthly
              Uptime Commitment for that Service, rather than against a single fixed figure:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Below the applicable Monthly Uptime Commitment but at or above 99.0% —{" "}
                <span className="text-white/90">10%</span> credit.
              </li>
              <li>
                Below 99.0% but at or above 95.0% — <span className="text-white/90">25%</span>{" "}
                credit.
              </li>
              <li>
                Below 95.0% — <span className="text-white/90">50%</span> credit.
              </li>
            </ul>
            <p>
              The same three-tier structure applies to every eligible Service, anchored to that
              Service&apos;s own Monthly Uptime Commitment. Where the applicable commitment is at or
              below 99.0%, the first tier applies to any shortfall below the commitment down to the
              99.0% threshold.
            </p>
            <p>
              Credits apply only to the monthly charges for the affected service in the affected
              region for the month in which the shortfall occurred. They are not calculated against
              your total account spend, against unaffected services, or against charges in other
              regions. Charges already discounted, credited, or waived are excluded from the
              calculation base.
            </p>
          </>
        ),
      },
      {
        id: "maximum-credits",
        title: "Maximum Credits",
        content: (
          <>
            <p>
              The total Service Credits for an eligible Service in a region for any calendar month
              will not exceed{" "}
              <span className="text-white/90">50% of the eligible monthly charges</span> for that
              affected Service in that region, unless an Order Form expressly provides a higher
              remedy.
            </p>
            <p>
              Credits are applied against future invoices, have no cash value and cannot be
              transferred.
            </p>
            <p>
              Service Credits are the sole contractual remedy for failure to meet an availability
              commitment, except to the extent such limitation is prohibited by Applicable Law or a
              separately negotiated agreement expressly provides another remedy.
            </p>
          </>
        ),
      },
      {
        id: "claim-process",
        title: "Claim Process",
        content: (
          <>
            <p>
              Service Credits are not applied automatically. To claim, you must submit a request
              within <span className="text-white/90">thirty (30) days</span> of the end of the
              incident giving rise to the claim. Claims received after that period are not eligible.
            </p>
            <p>
              Submit claims by raising a support ticket from the AhuraSense Cloud console, or by
              email to{" "}
              <a
                href="mailto:support@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                support@ahurasense.com
              </a>{" "}
              with the subject line &quot;SLA Credit Request&quot;. Each claim must include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your account identifier and the affected region.</li>
              <li>
                The resource identifiers affected — instance IDs, volume IDs, cluster IDs, endpoint
                names, or bucket names.
              </li>
              <li>
                The start and end timestamps of each period of claimed Unavailability, expressed in{" "}
                <span className="text-white/90">UTC</span>.
              </li>
              <li>
                Evidence of the failure — error logs, error codes and response bodies, timestamped
                traces, monitoring or probe output, or screenshots showing the failure and its time.
              </li>
              <li>A description of the customer-facing impact.</li>
            </ul>
            <p>
              We will acknowledge a claim within{" "}
              <span className="text-white/90">two (2) business days</span> and issue a determination
              within <span className="text-white/90">thirty (30) days</span> of receiving a complete
              claim, requesting further information where needed. If a claim is declined, we will
              explain the basis for that decision, including the relevant measurement data or
              exclusion relied upon.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Additional Terms",
    sections: [
      {
        id: "customer-responsibilities",
        title: "Customer Responsibilities",
        content: (
          <>
            <p>
              The commitments in this SLA describe our infrastructure. The resilience your
              application actually experiences depends on how you architect on top of it, and that
              part remains yours.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Use redundant deployments and high-availability configurations where continuity
                matters to you. A single instance will not deliver redundant resilience regardless
                of our commitments.
              </li>
              <li>
                Maintain your own backups, snapshots, versioning, and tested restore procedures.
                Durability engineering is not a substitute for backups.
              </li>
              <li>
                Keep guest operating systems, kernels, drivers, agents, and application dependencies
                patched and supported.
              </li>
              <li>
                Implement retries with exponential backoff, timeouts, circuit breakers, and graceful
                degradation, particularly for API and storage calls.
              </li>
              <li>
                Monitor your own workloads, and keep the technical contacts on your account current
                so maintenance and incident notices reach you.
              </li>
              <li>
                Stay within quotas and published limits, and request increases in advance of planned
                growth.
              </li>
              <li>
                Safeguard credentials, API keys, and access tokens, and follow least-privilege access
                practice.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "force-majeure",
        title: "Force Majeure",
        content: (
          <>
            <p>
              Neither party is responsible for failure caused by an event outside its reasonable
              control that could not reasonably have been avoided or overcome through commercially
              reasonable measures. Such events may include natural disasters, war, terrorism, civil
              unrest, widespread utility failure, governmental action, major telecommunications
              disruption or other extraordinary events of comparable nature.
            </p>
            <p>
              Ordinary hardware failure, ordinary data-centre equipment failure, routine supplier
              failure, capacity-management failures, software defects within AhuraSense-controlled
              systems and incidents that AhuraSense could reasonably have prevented or mitigated
              through ordinary redundancy and operating controls are not automatically Force Majeure
              merely because a third-party supplier or facility was involved.
            </p>
          </>
        ),
      },
      {
        id: "changes-to-sla",
        title: "Changes to SLA",
        content: (
          <>
            <p>
              We may update this SLA to reflect changes to our services, infrastructure, measurement
              methods, or legal and regulatory requirements. The current version is always published
              on this page with its effective date and last updated date.
            </p>
            <p>
              Where a change materially reduces a commitment or narrows your rights, we will give at
              least <span className="text-white/90">thirty (30) days</span> notice before it takes
              effect, by notice to the registered account contacts and on this page. Changes that
              improve a commitment, add an eligible service, or clarify existing wording may take
              effect immediately.
            </p>
            <p>
              Claims are assessed against the version of this SLA in force at the time of the
              incident. Customers under an enterprise agreement or negotiated addendum are governed
              by the commitments in that document for its term.
            </p>
          </>
        ),
      },
      {
        id: "contact",
        title: "Contact",
        content: (
          <>
            <p>
              For service credit claims, incident reports, and questions about measurement, contact{" "}
              <a
                href="mailto:support@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                support@ahurasense.com
              </a>{" "}
              or raise a ticket from the AhuraSense Cloud console.
            </p>
            <p>
              For contractual questions about this SLA, enterprise commitments, or negotiated
              addenda, contact{" "}
              <a
                href="mailto:legal@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                legal@ahurasense.com
              </a>
              .
            </p>
            <p>
              Live platform status, incident history, and maintenance notices are published on the
              AhuraSense Cloud status page.
            </p>
          </>
        ),
      },
    ],
  },
];

export default function SlaPage() {
  return (
    <LegalPageShell
      currentPath="/sla"
      title="Service Level Agreement"
      description="Per-service availability commitments for AhuraSense Cloud, with the measurement method, exclusions, and service credit terms that apply to each."
      effectiveDate="1 March 2026"
      lastUpdated="1 March 2026"
      groups={GROUPS}
    />
  );
}
