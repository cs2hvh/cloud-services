import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Top-level legal navigation. Five commercial/legal areas — Privacy & Data is a
 * category that fans out to three documents (privacy, cookies, DPA) via the
 * sub-document selector rendered inside the page shell.
 */
export const LEGAL_DOCUMENT_LINKS = [
  { href: "/terms", label: "Terms & Services" },
  { href: "/privacy", label: "Privacy & Data" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/sla", label: "Service Level Agreement" },
  { href: "/trust", label: "Trust & Compliance" },
];

/** Documents that live under the Privacy & Data category. */
export const PRIVACY_DOCUMENT_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/dpa", label: "Data Processing Agreement" },
];

/** Paths that should highlight the "Privacy & Data" top-level tab. */
const PRIVACY_PATHS = [
  ...PRIVACY_DOCUMENT_LINKS.map((link) => link.href),
  "/subprocessors",
];

/** Subpages that sit beneath Terms & Services and keep that tab highlighted. */
const TERMS_PATHS = [
  "/terms",
  "/service-specific-terms",
  "/billing-policy",
  "/support-policy",
];

type LegalDocumentNavProps = {
  currentPath: string;
  className?: string;
};

export function LegalDocumentNav({ currentPath, className }: LegalDocumentNavProps) {
  return (
    <nav
      aria-label="Legal navigation"
      className={cn(
        "flex flex-wrap gap-2 border border-white/[0.08] bg-white/[0.02] p-2",
        className
      )}
    >
      {LEGAL_DOCUMENT_LINKS.map((link) => {
        // Subpages keep their parent tab lit: /cookies, /dpa and /subprocessors
        // sit under Privacy & Data; the billing/support/service-specific pages
        // sit under Terms & Services.
        const active =
          link.href === currentPath ||
          (link.href === "/privacy" && PRIVACY_PATHS.includes(currentPath)) ||
          (link.href === "/terms" && TERMS_PATHS.includes(currentPath));

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center px-3 py-1.5 text-xs sm:text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]",
              active
                ? "bg-[#0095FF] text-white"
                : "text-white/65 hover:text-white hover:bg-white/[0.05]"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
