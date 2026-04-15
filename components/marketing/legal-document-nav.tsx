import Link from "next/link";
import { cn } from "@/lib/utils";

export const LEGAL_DOCUMENT_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookies Policy" },
  { href: "/dpa", label: "Data Processing Agreement" },
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
        const active = link.href === currentPath;

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

