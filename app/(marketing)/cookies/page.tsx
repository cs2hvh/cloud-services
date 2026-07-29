import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSectionGroup } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Learn how AhuraSense Technologies Private Limited uses cookies and similar technologies for authentication, security, analytics, and user preferences across its cloud infrastructure and AI compute platform.",
  alternates: {
    canonical: `${siteConfig.url}/cookies`,
  },
  openGraph: {
    title: "Cookie Policy | AhuraSense",
    description:
      "Cookie usage details for AhuraSense websites, dashboards, APIs, and customer-facing services.",
    url: `${siteConfig.url}/cookies`,
  },
};

const GROUPS: LegalSectionGroup[] = [
  {
    label: "About Cookies",
    sections: [
      {
        id: "overview",
        title: "Overview",
        content: (
          <>
            <p>
              This Cookie Policy explains how AhuraSense Technologies Private Limited (&quot;AhuraSense&quot;,
              &quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) uses cookies,
              pixels, local storage, software development kits, tags, device identifiers, session
              identifiers, and similar technologies on our websites, portals, dashboards, APIs,
              documentation, billing interfaces, support systems, and related online services.
            </p>
            <p>
              This policy applies when you visit or use our public website, customer dashboard,
              developer portal, API documentation, billing pages, authentication pages, support pages,
              product pages, and related online interfaces.
            </p>
            <p>
              This Cookie Policy should be read together with our{" "}
              <a href="/privacy" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                Privacy Policy
              </a>
              ,{" "}
              <a href="/terms" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                Terms of Service
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
        id: "what-cookies-are",
        title: "What Cookies Are",
        content: (
          <>
            <p>
              Cookies are small text files placed on your browser or device when you visit a website.
              They help websites remember information about your visit, such as login status, language
              preferences, device details, security settings, and user preferences.
            </p>
            <p>Similar technologies may include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white/90">Local storage:</span> browser-based storage used to
                remember settings or session data.
              </li>
              <li>
                <span className="text-white/90">Session storage:</span> temporary storage that may
                expire when you close your browser.
              </li>
              <li>
                <span className="text-white/90">Pixels and tags:</span> small code snippets used to
                understand page usage, conversion events, and marketing performance.
              </li>
              <li>
                <span className="text-white/90">Device identifiers:</span> technical identifiers used
                for fraud prevention, authentication, analytics, and security.
              </li>
              <li>
                <span className="text-white/90">SDKs and scripts:</span> code provided by AhuraSense or
                third parties to support analytics, support chat, payments, authentication, monitoring,
                and product functionality.
              </li>
            </ul>
            <p>
              In this Cookie Policy, we refer to all of these technologies collectively as
              &quot;cookies.&quot;
            </p>
          </>
        ),
      },
      {
        id: "why-we-use-cookies",
        title: "Why We Use Cookies",
        content: (
          <>
            <p>
              We use cookies to operate, secure, improve, personalize, and measure our services.
              Because AhuraSense provides cloud infrastructure and AI compute services, some cookies and
              similar technologies are important for account security, billing accuracy, abuse
              prevention, dashboard functionality, API access management, and operational monitoring.
            </p>
            <p>
              Without cookies we could not keep you signed in across dashboard pages, protect
              authentication and billing flows against cross-site request forgery, distribute traffic
              across our infrastructure, detect automated abuse of compute and GPU resources, or
              remember the cookie preferences you have already expressed. Other cookies are optional:
              they help us understand how our documentation and product interfaces are used and, where
              you consent, measure the effectiveness of our marketing.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Cookie Usage",
    sections: [
      {
        id: "cookie-categories",
        title: "Cookie Categories",
        content: (
          <>
            <h3 className="text-base font-semibold text-white/90">Strictly Necessary Cookies</h3>
            <p>
              These cookies are required for our website, dashboard, and platform to function. Without
              them, core features may not work. Examples include cookies used for:
            </p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Account login and session management.</li>
              <li>Authentication and multi-factor authentication.</li>
              <li>API dashboard access.</li>
              <li>Load balancing.</li>
              <li>Security controls and CSRF protection.</li>
              <li>Fraud prevention.</li>
              <li>Billing session continuity.</li>
              <li>Remembering cookie consent choices.</li>
              <li>Maintaining dashboard state during resource provisioning.</li>
            </ul>
            <p>
              These cookies cannot usually be disabled through our cookie preference tool because they
              are necessary to provide the service.
            </p>

            <h3 className="mt-6 text-base font-semibold text-white/90">
              Security and Abuse Prevention Cookies
            </h3>
            <p>We may use cookies and similar technologies to detect, prevent, and investigate:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Unauthorized login attempts and credential stuffing.</li>
              <li>Suspicious API activity and bot activity.</li>
              <li>Payment fraud and denial-of-service patterns.</li>
              <li>Abuse of compute, GPU, domain, or deployment services.</li>
              <li>Attempts to bypass rate limits or account restrictions.</li>
            </ul>
            <p>
              These technologies help protect AhuraSense, our customers, infrastructure suppliers,
              network partners, and other users.
            </p>

            <h3 className="mt-6 text-base font-semibold text-white/90">Functional Cookies</h3>
            <p>
              Functional cookies allow us to remember your choices and improve your user experience,
              including language preferences, dashboard layout, region or product preference, recently
              viewed resources, theme preferences, form progress, support widget preferences, and
              documentation display settings.
            </p>
            <p>
              Disabling functional cookies may make the platform less convenient, but core services may
              still remain available.
            </p>

            <h3 className="mt-6 text-base font-semibold text-white/90">
              Analytics and Performance Cookies
            </h3>
            <p>
              Analytics cookies help us understand how visitors and customers use our websites and
              platform interfaces — including page visits, feature usage, documentation usage, dashboard
              performance, error rates, conversion funnels, referral sources, latency, and product
              adoption patterns.
            </p>

            <h3 className="mt-6 text-base font-semibold text-white/90">
              Product Usage and Operational Telemetry
            </h3>
            <p>
              Because AhuraSense provides infrastructure services, we may collect platform usage and
              operational telemetry that may be linked to accounts, projects, resources, API keys,
              workloads, or billing profiles. This may include API request metadata, dashboard actions,
              resource creation and deletion events, billing events, authentication events, error logs,
              service health signals, security alerts, and quota and rate-limit events.
            </p>

            <h3 className="mt-6 text-base font-semibold text-white/90">
              Marketing and Advertising Cookies
            </h3>
            <p>
              Where permitted by law and your consent choices, we may use marketing cookies to
              understand interest in our services and measure advertising effectiveness — including
              campaign performance, referral sources, and aggregated audience insights.
            </p>
            <p>
              We do not use marketing cookies to access your Customer Data, workloads, model weights,
              datasets, prompts, outputs, containers, databases, or object storage contents.
            </p>
          </>
        ),
      },
      {
        id: "cookies-we-may-use",
        title: "Cookies We May Use",
        content: (
          <>
            <p>
              The exact cookies may change over time depending on product updates, security
              requirements, analytics tools, payment providers, support systems, and marketing systems.
              Typical cookie categories include:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/[0.10]">
                    <th className="py-3 pr-6 text-left text-xs uppercase tracking-[0.12em] text-white/50 font-semibold">
                      Category
                    </th>
                    <th className="py-3 pr-6 text-left text-xs uppercase tracking-[0.12em] text-white/50 font-semibold">
                      Purpose
                    </th>
                    <th className="py-3 text-left text-xs uppercase tracking-[0.12em] text-white/50 font-semibold">
                      Examples
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {[
                    {
                      category: "Necessary",
                      purpose: "Login, session, security, dashboard operation",
                      examples: "Session ID, CSRF token, auth token reference",
                    },
                    {
                      category: "Security",
                      purpose: "Abuse prevention, fraud detection, bot protection",
                      examples: "Device risk token, suspicious activity marker",
                    },
                    {
                      category: "Functional",
                      purpose: "Preferences and usability",
                      examples: "Theme, region, language, dashboard state",
                    },
                    {
                      category: "Analytics",
                      purpose: "Product and website performance",
                      examples: "Page views, event analytics, usage measurement",
                    },
                    {
                      category: "Marketing",
                      purpose: "Campaign and conversion tracking",
                      examples: "Referral source, ad campaign ID",
                    },
                    {
                      category: "Support",
                      purpose: "Support chat and ticketing",
                      examples: "Chat session ID, support widget state",
                    },
                    {
                      category: "Billing",
                      purpose: "Payment and invoicing flow",
                      examples: "Checkout session, invoice flow continuity",
                    },
                  ].map((row) => (
                    <tr key={row.category}>
                      <td className="py-3 pr-6 text-white/85 font-medium">{row.category}</td>
                      <td className="py-3 pr-6 text-white/65">{row.purpose}</td>
                      <td className="py-3 text-white/55">{row.examples}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        id: "third-party-cookies",
        title: "Third-Party Cookies",
        content: (
          <>
            <p>
              Some cookies may be placed by third-party service providers that help us operate our
              business. These may include providers for hosting and content delivery, analytics, payment
              processing, customer support, email delivery, security and bot detection, authentication,
              error monitoring, product analytics, advertising and marketing measurement, and domain and
              DNS services.
            </p>
            <p>
              Third-party providers may process information according to their own privacy policies and
              contractual obligations with us. We do not permit third parties to use cookies to access
              Customer Data stored in your cloud resources unless expressly required to provide a
              service requested by you and covered by applicable agreements.
            </p>
          </>
        ),
      },
      {
        id: "customer-data-and-cookies",
        title: "Customer Data and Cookies",
        content: (
          <>
            <p>
              Cookies used on our website and dashboard are separate from the infrastructure content
              you upload, host, process, train, infer, or store using AhuraSense services. Cookies
              operate in your browser, against our public and control-plane interfaces; Customer Data
              lives inside the resources you provision and is governed by our{" "}
              <a href="/dpa" className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors">
                Data Processing Agreement
              </a>
              , not by this policy.
            </p>
            <p>For clarity, cookies do not give marketing or analytics providers access to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your private datasets or model weights.</li>
              <li>Training data, prompts, and responses.</li>
              <li>Object storage contents and database records.</li>
              <li>Kubernetes secrets and source code.</li>
              <li>Containers, VM file systems, and customer workloads.</li>
            </ul>
            <p>
              Operational telemetry may record technical events related to resource usage, access,
              billing, security, and performance, as described in our Privacy Policy and Terms of
              Service.
            </p>
            <p>
              If you operate your own application on AhuraSense infrastructure and set cookies in your
              end users&apos; browsers, you are the controller or data fiduciary for those cookies. You
              are responsible for your own cookie notice, for obtaining consent where required under
              the ePrivacy rules, the GDPR or UK GDPR, or India&apos;s Digital Personal Data Protection
              Act 2023, and for honouring your end users&apos; choices. This Cookie Policy does not
              cover cookies set by customer applications.
            </p>
          </>
        ),
      },
      {
        id: "cookies-currently-in-use",
        title: "Cookies and Technologies Currently in Use",
        content: (
          <>
            <p>
              The specific cookies and similar technologies currently deployed on AhuraSense websites
              and platform interfaces are maintained in the AhuraSense Cookie Preference Centre. For
              each non-essential technology, the Preference Centre will identify, where applicable:
            </p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Cookie or technology name.</li>
              <li>Provider.</li>
              <li>Purpose.</li>
              <li>Category.</li>
              <li>Duration or expiry.</li>
              <li>Whether the technology is first-party or third-party.</li>
            </ul>
            <p>
              The inventory shown in the Preference Centre forms part of this Cookie Policy and may be
              updated when providers, platform functionality or technologies change.
            </p>
            <p>
              Non-essential analytics, advertising and marketing technologies will be activated in
              accordance with applicable consent requirements. A cookie that is necessary solely for
              authentication, fraud prevention, security, load balancing, billing continuity or another
              essential platform function may operate without an optional-cookie consent where permitted
              by Applicable Law.
            </p>
            <p>
              Third-party technologies are not authorised to access Customer workload content merely
              because they operate on the AhuraSense website, dashboard or marketing interfaces.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Your Choices",
    sections: [
      {
        id: "cookie-consent",
        title: "Cookie Consent",
        content: (
          <>
            <p>
              Where required by applicable law, we will ask for your consent before placing
              non-essential cookies, such as analytics or marketing cookies.
            </p>
            <p>You may be able to manage cookie choices through:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Our cookie banner and cookie preference center.</li>
              <li>Browser settings and device settings.</li>
              <li>Privacy controls provided by third-party platforms.</li>
            </ul>
            <p>
              Consent is requested on an opt-in basis where the GDPR, UK GDPR, and the ePrivacy rules
              apply, is recorded together with its scope and timestamp, and can be withdrawn at any
              time through the preference centre without affecting the lawfulness of processing carried
              out before withdrawal. Strictly necessary cookies may remain active because they are
              required to operate and secure the services.
            </p>
          </>
        ),
      },
      {
        id: "managing-cookies",
        title: "Managing Cookies",
        content: (
          <>
            <p>
              Most browsers allow you to block, delete, or manage cookies. Browser controls may allow
              you to delete existing cookies, block all or third-party cookies, allow cookies for
              selected websites, clear cookies after each session, or disable tracking technologies.
            </p>
            <p>
              If you disable cookies, certain features may not work correctly. For example, you may not
              be able to stay logged in, complete billing flows, manage cloud resources, use dashboards,
              or access support tools properly.
            </p>
          </>
        ),
      },
      {
        id: "global-privacy-controls-do-not-track",
        title: "Global Privacy Controls / Do Not Track",
        content: (
          <>
            <p>
              Some browsers and extensions transmit automated preference signals, such as the legacy
              &quot;Do Not Track&quot; header or the Global Privacy Control (GPC) signal. These signals
              tell a website that the user objects to certain non-essential processing without the user
              having to interact with a consent banner.
            </p>
            <p>
              There is no single industry standard for responding to &quot;Do Not Track&quot; in all
              jurisdictions, and our response may vary depending on the specific signal, region, legal
              requirement, and technical feasibility. Where an opt-out preference signal is legally
              recognised in your jurisdiction and is technically supported by our consent tooling, we
              treat it as a valid withdrawal of consent to non-essential cookies: analytics and
              marketing cookies are not set, and any previously set non-essential cookies are treated
              as revoked on your next visit.
            </p>
            <p>
              A preference signal does not disable strictly necessary cookies, which remain in place to
              authenticate you, secure billing flows, and protect the platform against abuse. You can
              always express or change your choices directly through our cookie preference centre,
              which takes precedence over an automated signal where the two conflict.
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
        id: "retention-of-cookie-data",
        title: "Retention of Cookie Data",
        content: (
          <>
            <p>Cookie retention depends on the cookie type:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Session cookies may expire when you close your browser.</li>
              <li>Persistent cookies may remain for a defined period unless deleted.</li>
              <li>
                Security cookies may be retained as needed for fraud prevention and abuse
                investigation.
              </li>
              <li>Analytics cookies may be retained for measurement and product improvement.</li>
              <li>Consent cookies may be retained to remember your choices.</li>
            </ul>
            <p>
              We retain cookie-derived information only for as long as reasonably necessary for the
              purposes described in this policy, unless a longer period is required for legal, security,
              fraud prevention, billing, dispute resolution, or compliance purposes.
            </p>
          </>
        ),
      },
      {
        id: "changes-to-cookie-policy",
        title: "Changes to Cookie Policy",
        content: (
          <>
            <p>
              We may update this Cookie Policy from time to time to reflect changes in technology, law,
              product features, analytics tools, security practices, or business operations.
            </p>
            <p>
              The updated version will be posted on our website or otherwise made available. The
              &quot;Effective Date&quot; above will indicate when the policy was last updated.
            </p>
          </>
        ),
      },
      {
        id: "contact",
        title: "Contact",
        content: (
          <>
            <p>For questions about this Cookie Policy, contact:</p>
            <div className="mt-4 space-y-1.5 rounded border border-white/[0.08] bg-white/[0.02] p-5 text-sm">
              <p className="font-semibold text-white/90">AhuraSense Technologies Private Limited</p>
              <p className="text-white/60">
                CIN: <span className="text-white/45">[To be updated]</span>
              </p>
              <p className="text-white/60">
                Registered Address: <span className="text-white/45">[To be updated]</span>
              </p>
              <p className="text-white/60">
                Privacy Email:{" "}
                <a
                  href="mailto:legal@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  legal@ahurasense.com
                </a>
              </p>
              <p className="text-white/60">
                Legal Email:{" "}
                <a
                  href="mailto:legal@ahurasense.com"
                  className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
                >
                  legal@ahurasense.com
                </a>
              </p>
              <p className="text-white/60">
                Phone: <span className="text-white/45">[To be updated]</span>
              </p>
            </div>
          </>
        ),
      },
    ],
  },
];

export default function CookiesPolicyPage() {
  return (
    <LegalPageShell
      currentPath="/cookies"
      title="Cookie Policy"
      description="This policy explains the cookies and similar technologies used across AhuraSense Technologies Private Limited websites, dashboards, APIs, and customer-facing services — including how they support security, billing, authentication, and product operations."
      effectiveDate="May 30, 2026"
      lastUpdated="May 30, 2026"
      groups={GROUPS}
      showPrivacyDocSelector
    />
  );
}
