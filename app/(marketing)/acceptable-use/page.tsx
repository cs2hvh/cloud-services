import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import {
  LegalPageShell,
  type LegalSectionGroup,
} from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description:
    "The AhuraSense Cloud Acceptable Use Policy: prohibited activities, network and infrastructure abuse rules, AI acceptable use standards, and how we enforce them.",
  alternates: {
    canonical: `${siteConfig.url}/acceptable-use`,
  },
  openGraph: {
    title: "Acceptable Use Policy | AhuraSense Cloud",
    description:
      "Rules governing the use of AhuraSense Cloud compute, GPU, storage, networking, and AI inference services.",
    url: `${siteConfig.url}/acceptable-use`,
  },
};

const GROUPS: LegalSectionGroup[] = [
  {
    label: "General",
    sections: [
      {
        id: "purpose-and-scope",
        title: "Purpose and Scope",
        content: (
          <>
            <p>
              This Acceptable Use Policy (the &quot;Policy&quot;) sets out the activities that are
              prohibited on AhuraSense Cloud. It applies to every service we operate, including
              virtual machines and bare-metal servers, GPU and accelerator instances, block and
              object storage, networking and egress, managed databases, model hosting, and public
              or private inference endpoints. It also applies to our websites, consoles, APIs, and
              support channels.
            </p>
            <p>
              The Policy is incorporated by reference into our Terms of Service and into any order
              form, enterprise agreement, or reseller agreement under which you obtain the
              services. Where a negotiated agreement addresses a matter covered here, the more
              specific and more restrictive requirement applies. Defined terms not explained in
              this Policy carry the meaning given to them in the Terms of Service.
            </p>
            <p>
              We operate shared, multi-tenant infrastructure across facilities in India and serve
              customers contracting with our UK entity. Conduct that would be tolerable on
              dedicated, isolated hardware can still be prohibited here because of its effect on
              other tenants, on our IP reputation, on upstream transit providers, or on our
              obligations to data-centre operators and regulators. This Policy is intentionally
              broad; it describes categories of prohibited conduct rather than an exhaustive list,
              and we may treat conduct that is materially similar to a listed prohibition as a
              breach.
            </p>
          </>
        ),
      },
      {
        id: "customer-responsibility",
        title: "Customer Responsibility",
        content: (
          <>
            <p>
              You are responsible for all activity that occurs under your account, whether carried
              out by you, your employees, your contractors, your end users, or anyone using
              credentials issued to you. This includes activity performed by automated agents,
              scheduled jobs, and third-party software you deploy, and it applies regardless of
              whether you were aware of the activity at the time.
            </p>
            <p>
              If you resell capacity, host workloads for customers of your own, or expose an
              inference endpoint to the public, you must impose terms on your users that are at
              least as protective as this Policy, and you must have a practical means of
              investigating and stopping their abuse. &quot;My user did it&quot; is not a defence
              to a breach of this Policy, though your cooperation and speed of response are
              relevant to how we respond.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Protect account credentials, API keys, SSH keys, and service tokens; rotate them on
                a defined schedule and revoke them immediately when staff or contractors leave.
              </li>
              <li>
                Maintain a monitored abuse or security contact for your organisation and keep it
                current in the console, so we can reach a human quickly.
              </li>
              <li>
                Secure what you deploy: patch operating systems and container images, avoid default
                or shared passwords, and do not expose administrative interfaces, model weight
                stores, or unauthenticated inference endpoints to the open internet.
              </li>
              <li>
                Have a lawful basis and any necessary rights, licences, or consents for the data,
                content, and model weights you upload, process, fine-tune on, or serve.
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    label: "Prohibited Activities",
    sections: [
      {
        id: "illegal-activities",
        title: "Illegal Activities",
        content: (
          <>
            <p>
              You must not use AhuraSense Cloud to conduct, facilitate, promote, enable, or conceal
              conduct that violates Applicable Law or this Policy.
            </p>
            <p>
              A workload may be subject to more than one legal regime depending on the Customer, the
              infrastructure location, the individuals affected, and the nature of the activity. You
              are responsible for identifying and complying with laws applicable to your use of the
              Services.
            </p>
            <p>
              Where legal obligations conflict or the legality of a proposed workload is uncertain,
              you should obtain appropriate legal advice before deploying it. Nothing in this Policy
              authorises activity merely because it may be lawful in one jurisdiction if it is
              prohibited by law applicable to the relevant Customer, workload, or infrastructure.
            </p>
            <p>
              AhuraSense may restrict or decline Services where providing them would expose
              AhuraSense, its Affiliates, infrastructure providers, or customers to material legal or
              regulatory risk.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Trafficking in controlled substances, weapons, endangered species, stolen goods, or
                human beings, and the operation of marketplaces or logistics for the same.
              </li>
              <li>
                Money laundering, terrorist financing, sanctions evasion, or the operation of
                unlicensed payment, remittance, or virtual-asset services.
              </li>
              <li>
                Gambling, lotteries, pharmaceutical sales, financial advice, or other regulated
                activity conducted without the licences your jurisdiction requires.
              </li>
              <li>
                Distribution of material that is unlawful to possess or transmit, or the use of our
                storage and egress capacity as a staging point for such material.
              </li>
            </ul>
            <p>
              We may be required to restrict access from, or workloads associated with, embargoed
              territories and sanctioned parties. You must not use the services in breach of export
              control or sanctions law, including by re-exporting access to GPU capacity, model
              weights, or inference results to restricted parties.
            </p>
          </>
        ),
      },
      {
        id: "fraud-and-deception",
        title: "Fraud and Deception",
        content: (
          <>
            <p>
              You must not use the services to defraud, mislead, or extract value from anyone under
              false pretences. This covers advance-fee and investment fraud, fake storefronts and
              counterfeit goods, romance and confidence scams, invoice and business email
              compromise, ticket and refund fraud, and any scheme that depends on the target
              misunderstanding who they are dealing with.
            </p>
            <p>
              It also covers fraud against us. You must not open multiple accounts to obtain
              repeated free trials or promotional credits, provide false identity or billing
              information, use stolen or unauthorised payment instruments, or use anonymising
              infrastructure to evade a prior suspension. Trial and credit-funded capacity exists
              so that customers can evaluate the platform, and we monitor for signup patterns that
              indicate systematic abuse of it.
            </p>
            <p>
              Deceptive automation is treated as fraud where it is used at scale: mass creation of
              fake accounts, reviews, engagement, or ad impressions; synthetic traffic intended to
              distort analytics or ad spend; and credential-stuffing or scalping operations against
              third-party platforms.
            </p>
          </>
        ),
      },
      {
        id: "intellectual-property-violations",
        title: "Intellectual Property Violations",
        content: (
          <>
            <p>
              You must not store, host, transmit, or serve material that infringes copyright, trade
              marks, patents, database rights, trade secrets, or rights of publicity. This includes
              pirated media libraries, cracked or unlicensed software, keygens and licence
              circumvention tooling, counterfeit branding, and mirrors or proxies whose purpose is
              to distribute infringing material.
            </p>
            <p>
              For AI workloads specifically, you are responsible for having the rights to the
              training data, fine-tuning datasets, and model weights you bring to the platform, and
              for complying with the licence terms attached to any open-weight or
              commercially-licensed model you deploy. Deploying a model whose licence prohibits
              your intended use, or redistributing weights you are not licensed to redistribute, is
              a breach of this Policy as well as of the underlying licence.
            </p>
            <p>
              We respond to properly substantiated infringement notices. Send them to{" "}
              <a
                href="mailto:legal@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                legal@ahurasense.com
              </a>{" "}
              with enough detail to identify the work, the material complained of, and the location
              of that material on our infrastructure. We may remove or disable access to the
              material, forward the notice to the customer, and terminate accounts of repeat
              infringers.
            </p>
          </>
        ),
      },
      {
        id: "harmful-or-abusive-content",
        title: "Harmful or Abusive Content",
        content: (
          <>
            <p>
              You must not use the services to store, generate, or distribute content that
              incites or promotes violence, terrorism, or violent extremism; that constitutes
              hate speech targeting people on the basis of protected characteristics; that
              glorifies or provides instruction for self-harm, suicide, or eating disorders; or
              that provides operational instructions for weapons capable of mass casualties,
              including chemical, biological, radiological, nuclear, or explosive weapons.
            </p>
            <p>
              We recognise that legitimate work touches difficult subject matter. Security
              research, trust-and-safety tooling, content moderation, academic study, journalism,
              and medical or public-health work frequently require handling material that would be
              prohibited if published or acted upon. Such work is permitted where it has a genuine
              protective or scholarly purpose, is appropriately access-controlled, and is not used
              to distribute the harmful material itself. If your workload sits near this line, tell
              us in advance rather than after an abuse report.
            </p>
            <p>
              Content whose distribution is lawful may still be restricted on our network where it
              causes disproportionate operational harm — for example, material that reliably
              triggers upstream blocklisting, transit provider complaints, or law-enforcement
              action affecting shared address space.
            </p>
          </>
        ),
      },
      {
        id: "child-safety",
        title: "Child Safety",
        content: (
          <>
            <p>
              AhuraSense Cloud has zero tolerance for child sexual abuse material (CSAM) and for
              any content or conduct that sexualises minors. This prohibition is absolute. It
              covers real imagery, recordings, and text; it covers computer-generated, drawn, and
              AI-synthesised depictions; and it covers models, LoRAs, embeddings, datasets, prompts,
              and pipelines created or tuned to produce such material. It also covers grooming,
              sextortion, the solicitation or trafficking of minors, and the operation of services
              whose purpose is to index or distribute this material.
            </p>
            <p>
              Where we identify CSAM or related conduct on our infrastructure, we will terminate
              the account immediately and without prior notice. We will preserve relevant data and
              logs, and we will report the matter to law enforcement and to the appropriate child
              protection body — including the National Center for Missing &amp; Exploited Children
              (NCMEC) or the equivalent reporting authority in the relevant jurisdiction, such as
              the Internet Watch Foundation in the United Kingdom and the National Cyber Crime
              Reporting Portal and law enforcement in India.
            </p>
            <p>
              No grace period, remediation window, appeal, or refund applies to termination under
              this section. Nothing in the graduated enforcement described later in this Policy
              limits our ability to act instantly here. Attempts to evade detection — including
              encryption, obfuscation, or distribution across multiple accounts — are treated as
              aggravating conduct and may extend termination to affiliated accounts and
              organisations.
            </p>
          </>
        ),
      },
      {
        id: "harassment-and-exploitation",
        title: "Harassment and Exploitation",
        content: (
          <>
            <p>
              You must not use the services to harass, stalk, threaten, intimidate, or degrade any
              individual. Prohibited conduct includes coordinated brigading campaigns, doxxing or
              the publication of private information such as home addresses, identity numbers, or
              medical records, and the operation of platforms whose primary function is to enable
              targeted abuse.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Non-consensual intimate imagery, including synthetically generated or altered
                imagery of identifiable people, and services that solicit or distribute it.
              </li>
              <li>
                Stalkerware, covert location tracking, and surveillance tooling deployed against
                individuals without their informed consent or a lawful basis.
              </li>
              <li>
                Scraping, aggregating, or enriching personal data to build profiles used for
                harassment, blackmail, or intimidation.
              </li>
              <li>
                Sexual services involving coercion or trafficking, and any content produced without
                the documented consent of the people depicted.
              </li>
            </ul>
            <p>
              Where an individual reports that our infrastructure is being used to target them, we
              will act on credible reports quickly and may restrict the offending workload while we
              investigate, prioritising the safety of the person at risk.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Network & Infrastructure Abuse",
    sections: [
      {
        id: "malware-and-botnets",
        title: "Malware and Botnets",
        content: (
          <>
            <p>
              You must not build, host, distribute, or operate malicious software or the
              infrastructure that supports it. This includes viruses, worms, trojans, rootkits,
              ransomware, wipers, keyloggers, info-stealers, and loaders, as well as command-and-
              control servers, exploit kits, malvertising redirect chains, and drop sites for
              exfiltrated data.
            </p>
            <p>
              Operating or renting botnet capacity is prohibited outright, as is participating in a
              botnet with instances under your control. If one of your instances is compromised and
              conscripted, we treat that as a security incident rather than as intentional abuse —
              but you are still required to remediate promptly, and we may isolate the instance at
              the network level in the meantime to protect other tenants and our address space.
            </p>
            <p>
              Legitimate security work is permitted with appropriate controls. Malware analysis,
              reverse engineering, detonation sandboxes, and red-team tooling development are
              acceptable where samples are contained, egress is restricted so that samples cannot
              reach third parties, and the environment is isolated from other tenants. Tell us in
              advance if you intend to run this kind of workload so that our abuse team can
              distinguish it from a live compromise.
            </p>
          </>
        ),
      },
      {
        id: "phishing-and-credential-theft",
        title: "Phishing and Credential Theft",
        content: (
          <>
            <p>
              You must not host phishing pages, credential harvesting forms, fake login portals, or
              lookalike sites impersonating banks, government bodies, cloud providers, exchanges,
              or any other organisation. This extends to the supporting infrastructure: typosquatted
              domains resolving to our IP space, redirectors and link shorteners fronting phishing
              destinations, phishing kits stored in object storage, and mail infrastructure used to
              deliver the lure.
            </p>
            <p>
              Also prohibited are credential stuffing and password spraying against third-party
              services, the operation of adversary-in-the-middle proxies designed to capture
              sessions or bypass multi-factor authentication, the trafficking of stolen credential
              dumps, and the use of GPU capacity to crack password hashes you are not authorised to
              test.
            </p>
            <p>
              Phishing content is treated as severe abuse because of the immediate harm to victims
              and to the reputation of the addresses we share across tenants. It is one of the
              categories where we routinely act without prior notice, typically by disabling access
              to the specific content or instance first and contacting you immediately afterwards.
            </p>
          </>
        ),
      },
      {
        id: "unauthorised-access",
        title: "Unauthorised Access",
        content: (
          <>
            <p>
              You must not access, or attempt to access, any system, network, account, or data
              without authorisation. This applies to third-party systems reached from our network,
              to other tenants on our infrastructure, and to AhuraSense systems themselves —
              including the hypervisor, the management network, the metadata service, the billing
              and console back-ends, and any accelerator or storage device beyond the boundary of
              the resources allocated to you.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Attempting to escape a virtual machine or container, cross a tenancy boundary, or
                read memory, VRAM, or storage belonging to another customer.
              </li>
              <li>
                Probing or exploiting the hypervisor, GPU firmware, device passthrough paths, or
                shared storage fabric.
              </li>
              <li>
                Circumventing quotas, rate limits, metering, licensing checks, or authentication
                controls in our services.
              </li>
              <li>
                Using another customer&apos;s API keys, tokens, or session material, however
                obtained.
              </li>
            </ul>
            <p>
              If you discover a vulnerability in an AhuraSense-operated system, report it promptly to{" "}
              <a
                href="mailto:abuse@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                abuse@ahurasense.com
              </a>{" "}
              in accordance with our Vulnerability Disclosure Policy. Do not continue testing beyond
              what is reasonably necessary to establish the existence and impact of the vulnerability,
              and do not access, copy, modify, or retain another Customer&apos;s data.
            </p>
            <p>
              Legal process, regulatory enquiries, and formal notices should instead be sent to{" "}
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
      {
        id: "network-attacks-and-ddos",
        title: "Network Attacks and DDoS",
        content: (
          <>
            <p>
              You must not originate or participate in denial-of-service or distributed
              denial-of-service attacks from our network, and you must not use our capacity to
              coordinate, control, or amplify such attacks elsewhere. This includes volumetric
              floods, application-layer attacks, and slow-resource-exhaustion techniques.
            </p>
            <p>
              You must not operate open resolvers, open relays, open proxies, or misconfigured
              services usable for reflection and amplification, including DNS, NTP, memcached,
              SSDP, CLDAP, and similar protocols. You must not spoof source addresses, forge packet
              headers, or otherwise disguise the origin of traffic leaving our network. You must
              not hijack, announce, or attempt to route address space you do not control.
            </p>
            <p>
              Load testing and stress testing against your own systems are permitted, but must be
              arranged with us in advance where they will generate substantial egress or sustained
              packet rates, so that we can distinguish them from an attack and avoid automated
              mitigation being applied to your traffic. Testing against systems you do not own
              requires documented authorisation from the owner and remains subject to the section
              on scanning and exploitation.
            </p>
          </>
        ),
      },
      {
        id: "scanning-and-exploitation",
        title: "Scanning and Exploitation",
        content: (
          <>
            <p>
              Unauthorised port scanning, vulnerability scanning, service enumeration, brute-force
              authentication attempts, and exploitation of third-party systems from our network are
              prohibited. Internet-wide scanning campaigns are prohibited without our prior written
              approval, because they generate abuse complaints and blocklist entries that affect
              every tenant sharing the originating address space.
            </p>
            <p>
              Authorised penetration testing is permitted where you can produce written
              authorisation from the owner of the target system, the scope is bounded, and the
              testing does not degrade shared infrastructure. We may ask to see that authorisation
              when we receive a complaint. Bug bounty participation is acceptable within the scope
              published by the programme owner.
            </p>
            <p>
              Web scraping and crawling must respect the technical and legal boundaries set by the
              target: honour robots directives and rate limits, do not circumvent authentication or
              anti-bot controls, do not use residential proxy networks to disguise your origin, and
              do not collect personal data without a lawful basis. Aggressive crawling that
              functions as a denial-of-service attack will be treated as one.
            </p>
          </>
        ),
      },
      {
        id: "spam-and-messaging-abuse",
        title: "Spam and Messaging Abuse",
        content: (
          <>
            <p>
              You must not send unsolicited bulk email, SMS, chat, push, or voice messages from our
              infrastructure, and you must not use our capacity to build, host, or operate the
              tooling behind such campaigns. All commercial messaging you send must be based on
              verifiable opt-in consent, must accurately identify the sender, and must offer a
              functioning and promptly honoured unsubscribe mechanism.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Purchased, scraped, harvested, or otherwise non-consensual recipient lists, and
                list-washing or list-validation services run against them.
              </li>
              <li>
                Forged headers, misleading subject lines, deceptive sender identities, and
                snowshoe patterns that spread volume across many addresses to evade filtering.
              </li>
              <li>
                Mass posting, comment spam, forum and wiki spam, and automated engagement against
                social platforms.
              </li>
              <li>
                Bulk outbound messaging generated by language models, which is subject to this
                section in exactly the same way as messaging written by a person.
              </li>
            </ul>
            <p>
              Outbound SMTP may be restricted by default on new accounts and can be enabled after
              review. Because deliverability depends on the reputation of shared address space, we
              may cap send rates, require dedicated addresses, or require the use of a reputable
              third-party sending provider for high-volume workloads.
            </p>
          </>
        ),
      },
      {
        id: "resource-abuse",
        title: "Resource Abuse",
        content: (
          <>
            <p>
              Our shared and burstable products are sized on the expectation of variable, bursty
              usage. You must not consume compute, GPU, memory, storage IOPS, or network capacity
              in a way that degrades service for other tenants, and you must not run sustained
              full-utilisation workloads on burstable instance types where a dedicated or reserved
              product is the appropriate fit. If you need sustained throughput, buy it — we will
              help you size it.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Circumventing quotas, rate limits, or metering, including by fragmenting a workload
                across many accounts to stay under per-account thresholds.
              </li>
              <li>
                Using trial, free-tier, or promotional GPU credits for production workloads,
                sustained training runs, or resale of capacity.
              </li>
              <li>
                Operating open proxies, exit relays, or free VPN services that anonymise third-party
                traffic through our address space without prior written approval.
              </li>
              <li>
                Using storage or egress as a free content distribution network detached from any
                compute workload on the platform.
              </li>
            </ul>
            <p>
              Where usage is abusive rather than merely heavy, we may throttle, cap egress, resize
              or reschedule the workload, or require migration to an appropriate product. We will
              normally contact you first and give you the option to move to suitable capacity.
            </p>
          </>
        ),
      },
      {
        id: "cryptomining",
        title: "Cryptomining",
        content: (
          <>
            <p>
              Cryptocurrency mining, minting, and proof-of-work or proof-of-space validation are{" "}
              <strong className="text-white/90">prohibited</strong> on trial accounts, free-tier
              resources, and any capacity funded by promotional or granted credits, without
              exception. They are also prohibited on shared, burstable, or spot-style compute and
              GPU resources unless we have given you prior written approval.
            </p>
            <p>
              Mining is <strong className="text-white/90">permitted only</strong> on dedicated or
              reserved capacity that we have approved in advance in writing for that purpose. If
              you want to mine on AhuraSense Cloud, contact us before you deploy: we will discuss
              the appropriate dedicated or reserved product, power and thermal constraints, and
              commercial terms. Approval is specific to the account, the capacity, and the workload
              described, and it is not transferable.
            </p>
            <p>
              Unapproved mining is treated as resource abuse and, where it is funded by credits or
              free capacity, as fraud. It is one of the most common misuses of stolen credentials
              and stolen payment methods, so where we detect it on an unapproved footprint we may
              suspend the affected instances immediately, void the associated credits, and invoice
              for the capacity consumed at on-demand rates.
            </p>
            <p>
              Blockchain work that is not proof-of-work mining — running validators or full nodes,
              indexing chain data, or developing and testing smart contracts — is generally
              acceptable on appropriately sized paid capacity, subject to the resource abuse
              section above.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "AI Acceptable Use",
    sections: [
      {
        id: "prohibited-ai-uses",
        title: "Prohibited AI Uses",
        content: (
          <>
            <p>
              The prohibitions in this Policy apply in full to model training, fine-tuning,
              evaluation, and inference on our GPU instances and hosted endpoints. Using a model as
              an intermediary does not change whether conduct is permitted: if you could not do it
              yourself on our infrastructure, you may not build or operate a model that does it for
              you.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Training, fine-tuning, or serving models whose purpose is to generate prohibited
                content, including CSAM, non-consensual intimate imagery, malware, or weapons
                instructions.
              </li>
              <li>
                Building or operating models designed to defeat safety systems, content filters,
                CAPTCHAs, age verification, or fraud controls.
              </li>
              <li>
                Deliberately removing, bypassing, or degrading the safety mitigations of a model you
                deploy, where doing so is intended to enable prohibited outputs.
              </li>
              <li>
                Using model weights, datasets, or inference outputs in breach of the licence,
                contract, or platform terms under which you obtained them.
              </li>
            </ul>
            <p>
              Safety research, red-teaming, and evaluation work that necessarily probes these
              boundaries is permitted where it is conducted in a contained environment, with
              restricted egress, for a genuine protective purpose, and without publishing the
              resulting harmful capability or content. Tell us in advance if you intend to run this
              kind of work.
            </p>
          </>
        ),
      },
      {
        id: "harmful-ai-content",
        title: "Harmful AI Content",
        content: (
          <>
            <p>
              You must not use our inference endpoints or hosted models to generate content that
              would be prohibited if you uploaded it directly. This includes sexual content
              involving minors, non-consensual sexual imagery of real people, targeted harassment
              and hate content, self-harm encouragement, and operational uplift for weapons capable
              of mass casualties or for serious cyberattacks.
            </p>
            <p>
              If you operate an endpoint that is reachable by people other than your own staff, you
              are responsible for the outputs it produces. We expect you to apply input and output
              filtering proportionate to the risk of your application, to retain sufficient logs to
              investigate abuse reports, to rate limit anonymous access, and to give your users a
              way to report harmful outputs to you.
            </p>
            <p>
              You must not present model output as verified fact where doing so would foreseeably
              cause harm, and you must not use generated content to fabricate evidence, records,
              credentials, or official communications.
            </p>
          </>
        ),
      },
      {
        id: "deepfakes-and-impersonation",
        title: "Deepfakes and Impersonation",
        content: (
          <>
            <p>
              You must not use our services to generate synthetic media that depicts a real,
              identifiable person without their consent in a way that is deceptive or harmful. This
              includes face and voice cloning used for fraud, synthetic imagery or audio of
              politicians, officials, or journalists presented as authentic, fabricated statements
              attributed to real people, and synthetic identity documents or biometric samples
              intended to defeat verification systems.
            </p>
            <p>
              Impersonating an organisation is equally prohibited: generating communications, brand
              assets, or support channels that purport to come from a company, public body, or
              regulator you do not represent. Using generated audio or video to bypass voice
              authentication, liveness checks, or know-your-customer processes is treated as fraud
              under this Policy.
            </p>
            <p>
              Consensual and clearly labelled synthetic media is permitted — including
              entertainment, satire that a reasonable viewer would recognise as such, accessibility
              tooling, dubbing and localisation, and corporate avatars used with the subject&apos;s
              permission. Where you generate synthetic likenesses at scale, we expect you to obtain
              and retain evidence of consent, to disclose the synthetic nature of the output to
              viewers, and to apply provenance signalling such as watermarking or content
              credentials where it is practical to do so.
            </p>
          </>
        ),
      },
      {
        id: "automated-abuse",
        title: "Automated Abuse",
        content: (
          <>
            <p>
              Scale is an aggravating factor. Conduct that might be a minor nuisance performed once
              by a person becomes serious abuse when a model or agent performs it thousands of
              times per hour, and our enforcement reflects that. Automated systems you deploy must
              operate within the same boundaries as your staff.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Bulk generation of spam, review manipulation, astroturfing, or synthetic engagement
                across social, commerce, or review platforms.
              </li>
              <li>
                Agentic systems that create accounts, complete transactions, or interact with
                third-party services in breach of those services&apos; terms, or that circumvent
                bot detection and rate limits.
              </li>
              <li>
                Automated scraping pipelines that ignore access controls or that assemble personal
                data at scale without a lawful basis.
              </li>
              <li>
                Autonomous agents with unbounded outbound network access and no human oversight,
                where a malfunction or prompt injection could cause harm to third parties.
              </li>
            </ul>
            <p>
              If you run agents that act on the open internet, you must be able to identify the
              agent, attribute its actions, throttle it, and stop it quickly. We may require you to
              demonstrate those controls where an agentic workload generates abuse complaints.
            </p>
          </>
        ),
      },
      {
        id: "high-risk-ai-uses",
        title: "High-Risk AI Uses",
        content: (
          <>
            <p>
              Some applications are permitted but carry heightened obligations because a wrong
              output materially affects someone&apos;s rights, safety, livelihood, or liberty. If
              you deploy models on our infrastructure for the uses below, you must maintain
              meaningful human oversight, document the limitations of your system, test for
              accuracy and bias across affected groups, and provide affected people with a route to
              challenge or appeal an outcome.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-white/90">Medical and health:</strong> diagnosis, triage,
                treatment recommendation, mental health support, or drug interaction advice —
                requiring qualified clinical review and appropriate regulatory clearance before
                clinical use.
              </li>
              <li>
                <strong className="text-white/90">Legal:</strong> advice, document generation, or
                case assessment presented to a person as a substitute for a qualified practitioner.
              </li>
              <li>
                <strong className="text-white/90">Financial:</strong> credit scoring, lending,
                insurance underwriting, and investment advice, where explainability and
                anti-discrimination obligations apply.
              </li>
              <li>
                <strong className="text-white/90">Employment and education:</strong> automated
                screening, ranking, monitoring, discipline, or admissions decisions affecting
                candidates and students.
              </li>
              <li>
                <strong className="text-white/90">Biometric identification:</strong> facial
                recognition, gait or voice identification, and emotion inference — which must have a
                lawful basis and must not be used for indiscriminate mass surveillance or for
                inferring protected characteristics.
              </li>
              <li>
                <strong className="text-white/90">Critical infrastructure:</strong> control or
                safety functions in energy, water, transport, telecommunications, or industrial
                systems, which require fail-safe design and human-in-the-loop control.
              </li>
              <li>
                <strong className="text-white/90">Law enforcement and justice:</strong> predictive
                policing, risk assessment, evidence evaluation, and immigration or border
                decisions, which must not be operated autonomously against individuals.
              </li>
            </ul>
            <p>
              Fully automated decision-making in these domains, with no human able to review or
              reverse the outcome, is prohibited. You remain responsible for meeting the sectoral
              and data protection requirements that apply to you; we can support your compliance
              programme with documentation about the infrastructure we operate, but we do not
              certify your application, and nothing in this Policy should be read as a claim that
              your use case is compliant.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Enforcement",
    sections: [
      {
        id: "abuse-investigation",
        title: "Abuse Investigation",
        content: (
          <>
            <p>
              We investigate suspected breaches of this Policy on the basis of abuse reports,
              complaints from third parties and upstream providers, blocklist and IP reputation
              signals, network telemetry such as traffic patterns and flow data, and billing or
              signup signals that indicate fraud. We do not routinely inspect the content of
              customer workloads, and we access customer data only where it is necessary to
              investigate a specific report, to comply with a legal obligation, or to protect the
              platform and its users.
            </p>
            <p>
              Where an investigation requires your input, we will normally contact your registered
              abuse or technical contact with a description of the issue and a deadline for
              response. Deadlines reflect severity: hours for active phishing, malware
              distribution, or an ongoing attack; several business days for lower-risk matters such
              as configuration issues or contested content claims.
            </p>
            <p>
              Cooperating fully and quickly is the single biggest factor in how a matter resolves.
              Failing to respond, providing inaccurate information, or repeatedly recurring abuse
              after remediation will escalate our response.
            </p>
          </>
        ),
      },
      {
        id: "reporting-abuse",
        title: "Reporting Abuse",
        content: (
          <>
            <p>
              If you believe AhuraSense Cloud infrastructure is being used in breach of this
              Policy, report it to{" "}
              <a
                href="mailto:abuse@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                abuse@ahurasense.com
              </a>
              . Reports are reviewed by our abuse team, and reports concerning child safety, active
              phishing, and ongoing attacks are prioritised.
            </p>
            <p>
              A useful report includes the IP address, hostname, or endpoint URL involved; accurate
              timestamps with the time zone; relevant log excerpts or raw message headers; a
              description of the harm; and contact details we can use for follow-up. Reports
              without enough detail to identify the responsible resource are difficult to action.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Legal notices, infringement claims, and requests from law enforcement should go to{" "}
                <a
                  href="mailto:legal@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  legal@ahurasense.com
                </a>
                .
              </li>
              <li>
                Please do not include copies of illegal material in your report — describe its
                location instead, and report child sexual abuse material directly to law
                enforcement or the relevant national hotline as well as to us.
              </li>
              <li>
                We treat reporter identities as confidential where we can, but we may need to share
                details of a report with the customer to allow them to remediate it.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "content-resource-removal",
        title: "Content/Resource Removal",
        content: (
          <>
            <p>
              Where a breach is limited to specific material or a specific resource, we prefer the
              narrowest effective remedy. That may mean disabling access to a file or bucket,
              null-routing a single IP address, disabling an inference endpoint or API key,
              stopping one instance, or removing a DNS record — rather than acting against your
              whole account.
            </p>
            <p>
              Where we can, we will ask you to remove or remediate the material yourself within a
              stated window, because you are better placed to do so without disrupting your other
              workloads. Where the harm is active and severe, we may remove or disable access
              first and notify you immediately afterwards.
            </p>
            <p>
              We will tell you what was actioned and why, and we will restore access if a
              subsequent review shows the material did not breach this Policy. We do not maintain
              copies of removed customer content beyond what we are required to retain for legal or
              evidential purposes.
            </p>
          </>
        ),
      },
      {
        id: "suspension-and-termination",
        title: "Suspension and Termination",
        content: (
          <>
            <p>
              Our response to a breach is normally graduated, and we escalate only as far as the
              circumstances require. The typical sequence is: a notice describing the issue with a
              remediation window; a limitation such as rate limiting, egress caps, or blocking a
              specific port or protocol; suspension of the affected resources or of the account;
              and finally termination.
            </p>
            <p>
              We reserve the right to skip these steps and act immediately, without prior notice,
              where the conduct causes or threatens severe harm. That includes child safety
              matters, active phishing or malware distribution, attacks originating from our
              network, compromised instances, conduct exposing us or other customers to legal
              liability, and payment fraud. In those cases we act first and notify you as soon as
              practicable.
            </p>
            <p>
              In assessing severity we consider the harm caused, whether the conduct was
              intentional, its scale and duration, your history on the platform, the speed and
              quality of your response, and whether you have taken credible steps to prevent
              recurrence. Repeat breaches of the same kind, or evasion of an enforcement action,
              will usually result in termination.
            </p>
            <p>
              Fees remain payable for the period up to suspension or termination, and suspension for
              breach does not entitle you to a refund or service credit. If you believe an
              enforcement action was mistaken, you may ask us to review it by writing to{" "}
              <a
                href="mailto:abuse@ahurasense.com"
                className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
              >
                abuse@ahurasense.com
              </a>
              ; no appeal is available for terminations under the child safety section.
            </p>
          </>
        ),
      },
      {
        id: "cooperation-with-authorities",
        title: "Cooperation With Authorities",
        content: (
          <>
            <p>
              We comply with valid legal process from competent authorities in the jurisdictions in
              which we operate, including India and the United Kingdom. We assess each request for
              validity, scope, and proportionality, and we push back on requests that are overbroad
              or that lack a proper legal basis.
            </p>
            <p>
              Where a request concerns your account, we will notify you so that you can seek to
              challenge it, unless we are legally prohibited from doing so or notification would
              create a risk to life or to an investigation. We may preserve data pending a valid
              request, and we may disclose information voluntarily where we believe in good faith
              that it is necessary to prevent imminent harm to a person.
            </p>
            <p>
              Certain categories — child sexual abuse material above all — are reported proactively
              to the relevant authorities and child protection organisations without waiting for a
              request, and without notice to the account holder.
            </p>
          </>
        ),
      },
      {
        id: "changes-and-contact",
        title: "Changes and Contact",
        content: (
          <>
            <p>
              We may update this Policy to reflect changes in law, in the threat landscape, or in
              the services we offer. Material changes will be posted on this page with a revised
              &quot;Last updated&quot; date and, where the change materially restricts a use you
              rely on, we will make reasonable efforts to notify account administrators in advance.
              Continued use of the services after a change takes effect constitutes acceptance of
              the updated Policy.
            </p>
            <p>
              This Policy should be read alongside our Terms of Service and Privacy Policy. If you
              are unsure whether a planned workload is permitted — particularly for security
              research, red-teaming, high-volume scanning, bulk messaging, mining on dedicated
              capacity, or a high-risk AI application — ask us before you deploy. We would much
              rather scope it with you in advance than discover it through an abuse report.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Abuse reports and enforcement questions:{" "}
                <a
                  href="mailto:abuse@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  abuse@ahurasense.com
                </a>
              </li>
              <li>
                Legal notices, infringement claims, and law enforcement requests:{" "}
                <a
                  href="mailto:legal@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  legal@ahurasense.com
                </a>
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
];

export default function AcceptableUsePage() {
  return (
    <LegalPageShell
      currentPath="/acceptable-use"
      title="Acceptable Use Policy"
      description="What you may and may not do on AhuraSense Cloud — covering prohibited activities, network and infrastructure abuse, AI acceptable use, and how we investigate and enforce breaches."
      effectiveDate="1 March 2026"
      lastUpdated="1 March 2026"
      groups={GROUPS}
    />
  );
}
