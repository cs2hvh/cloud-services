import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPageShell, type LegalSection } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Cookies Policy",
  description:
    "Learn how AhuraSense Cloud uses cookies and similar technologies for authentication, security, analytics, and user preferences.",
  alternates: {
    canonical: `${siteConfig.url}/cookies`,
  },
  openGraph: {
    title: "Cookies Policy | AhuraSense Cloud",
    description: "Cookie usage details for AhuraSense Cloud websites and services.",
    url: `${siteConfig.url}/cookies`,
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "what-are-cookies",
    title: "What Are Cookies",
    content: (
      <>
        <p>
          Cookies are small text files stored on your device when you visit websites or use web
          applications. Similar technologies include local storage, pixels, and SDK identifiers.
        </p>
        <p>
          We use these technologies to support secure sign-in, improve performance, measure usage,
          and provide a consistent experience across sessions.
        </p>
      </>
    ),
  },
  {
    id: "why-we-use-cookies",
    title: "Why We Use Cookies",
    content: (
      <>
        <ul className="list-disc pl-6 space-y-2">
          <li>Maintain account sessions and authentication state.</li>
          <li>Protect accounts and platform integrity through security controls.</li>
          <li>Remember interface preferences and product selections.</li>
          <li>Measure product usage and improve website performance.</li>
        </ul>
      </>
    ),
  },
  {
    id: "cookie-categories",
    title: "Cookie Categories",
    content: (
      <>
        <p>We use the following categories of cookies:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <span className="text-white/90">Strictly Necessary:</span> Required for sign-in,
            security, and core site operation.
          </li>
          <li>
            <span className="text-white/90">Functional:</span> Store preferences such as language,
            display choices, and dashboard behavior.
          </li>
          <li>
            <span className="text-white/90">Performance and Analytics:</span> Help us understand
            traffic patterns, feature adoption, and reliability trends.
          </li>
          <li>
            <span className="text-white/90">Communication and Campaign:</span> Measure campaign
            effectiveness and improve onboarding journeys where permitted.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "third-party-cookies",
    title: "Third-Party Technologies",
    content: (
      <>
        <p>
          Some cookies and similar technologies are set by service providers acting on our behalf,
          such as authentication, payments, analytics, and support tooling providers.
        </p>
        <p>
          Third-party providers are contractually required to process data according to our
          instructions and applicable privacy obligations.
        </p>
      </>
    ),
  },
  {
    id: "how-to-manage",
    title: "How to Manage Cookies",
    content: (
      <>
        <p>
          You can manage cookie preferences through browser settings, device controls, and any cookie
          controls we provide. Blocking certain categories may affect website functionality.
        </p>
        <p>
          For account-related preferences and privacy requests, contact{" "}
          <a
            href="mailto:privacy@ahuracloud.com"
            className="text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors"
          >
            privacy@ahuracloud.com
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "do-not-track",
    title: "Do Not Track",
    content: (
      <>
        <p>
          Browser &quot;Do Not Track&quot; signals are not currently interpreted as a universal opt-out
          standard because no consistent industry specification has been adopted.
        </p>
      </>
    ),
  },
  {
    id: "policy-changes",
    title: "Changes to This Policy",
    content: (
      <>
        <p>
          We may revise this Cookies Policy as our services evolve or legal requirements change.
          Updated versions will appear on this page with a revised date.
        </p>
      </>
    ),
  },
];

export default function CookiesPolicyPage() {
  return (
    <LegalPageShell
      currentPath="/cookies"
      title="Cookies Policy"
      description="This policy explains the cookies and similar technologies used across AhuraSense Cloud websites and customer-facing services."
      effectiveDate="April 15, 2026"
      lastUpdated="April 15, 2026"
      sections={SECTIONS}
    />
  );
}

