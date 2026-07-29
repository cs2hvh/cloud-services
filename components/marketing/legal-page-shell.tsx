import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import {
  LegalDocumentNav,
  PRIVACY_DOCUMENT_LINKS,
} from "@/components/marketing/legal-document-nav";
import { cn } from "@/lib/utils";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

/** A titled cluster of sections — renders as a labelled block in the side nav. */
export type LegalSectionGroup = {
  label: string;
  sections: LegalSection[];
};

type LegalPageShellProps = {
  currentPath: string;
  title: string;
  description: string;
  lastUpdated: string;
  effectiveDate: string;
  /** Grouped table of contents. Sections are numbered continuously across groups. */
  groups: LegalSectionGroup[];
  /** Show the Privacy Policy / Cookie Policy / DPA selector (Privacy & Data area). */
  showPrivacyDocSelector?: boolean;
  /**
   * Sibling documents that sit beneath this one in the hierarchy (e.g. the
   * Service-Specific Terms / Billing / Support subpages under Terms & Services).
   * Rendered at the foot of the side nav rather than as top-level tabs.
   */
  relatedLinks?: { href: string; label: string }[];
};

export function LegalPageShell({
  currentPath,
  title,
  description,
  lastUpdated,
  effectiveDate,
  groups,
  showPrivacyDocSelector = false,
  relatedLinks,
}: LegalPageShellProps) {
  // Continuous numbering across all groups, so "12. Taxes" stays stable
  // regardless of which group a section sits in.
  let sectionNumber = 0;

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative overflow-hidden border-b border-white/[0.08] pt-28 pb-10 sm:pt-32 sm:pb-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,149,255,0.12),transparent_55%),radial-gradient(circle_at_90%_20%,rgba(255,255,255,0.08),transparent_45%)]" />
        <Container className="relative">
          <LegalDocumentNav currentPath={currentPath} className="mb-8" />
          <div className="max-w-4xl">
            <p className="mb-4 text-[11px] uppercase tracking-[0.2em] text-[#0095FF]">
              Legal Center
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight leading-tight">
              {title}
            </h1>
            <p className="mt-5 max-w-3xl text-sm sm:text-base leading-7 text-white/65">
              {description}
            </p>
            <div className="mt-8 flex flex-wrap gap-5 text-xs sm:text-sm text-white/55">
              <p>
                <span className="text-white/80">Effective date:</span> {effectiveDate}
              </p>
              <p>
                <span className="text-white/80">Last updated:</span> {lastUpdated}
              </p>
            </div>
          </div>

          {showPrivacyDocSelector && (
            <div className="mt-9 max-w-4xl">
              <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/45">
                Documents in this category
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {PRIVACY_DOCUMENT_LINKS.map((doc) => {
                  const active = doc.href === currentPath;
                  return (
                    <Link
                      key={doc.href}
                      href={doc.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center justify-between gap-3 border px-4 py-3 text-sm transition-all duration-300 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]",
                        active
                          ? "border-[#0095FF] bg-[#0095FF]/[0.12] text-white"
                          : "border-white/[0.08] bg-white/[0.02] text-white/65 hover:-translate-y-0.5 hover:border-[#0095FF] hover:text-white"
                      )}
                    >
                      {doc.label}
                      <ArrowUpRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-colors",
                          active ? "text-[#0095FF]" : "text-white/35 group-hover:text-[#0095FF]"
                        )}
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </Container>
      </section>

      <section className="py-10 sm:py-12 lg:py-16">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
            {/*
              Side nav is pinned on lg+. It scrolls independently of the article:
              max-h caps it to the viewport and overflow-y-auto gives it its own
              scrollbar, so a long ToC never drags the document along with it
              (overscroll-contain stops scroll chaining at its edges).
            */}
            <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:overscroll-contain border border-white/[0.08] bg-white/[0.02] p-5 [scrollbar-width:thin]">
              <h2 className="text-sm font-medium text-white">On this page</h2>
              <nav aria-label="Document sections" className="mt-4 space-y-5">
                {groups.map((group) => {
                  let groupCounter = sectionNumber;
                  return (
                    <div key={group.label}>
                      <p className="text-[10.5px] uppercase tracking-[0.16em] text-white/40">
                        {group.label}
                      </p>
                      <ul className="mt-2.5 space-y-2 border-l border-white/[0.08] pl-3">
                        {group.sections.map((section) => {
                          groupCounter += 1;
                          return (
                            <li key={section.id}>
                              <a
                                href={`#${section.id}`}
                                className="block text-[13px] leading-snug text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
                              >
                                {section.title}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </nav>
              {relatedLinks && relatedLinks.length > 0 && (
                <div className="mt-6 border-t border-white/[0.08] pt-5">
                  <p className="text-[10.5px] uppercase tracking-[0.16em] text-white/40">
                    Related documents
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    {relatedLinks.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="group inline-flex items-start gap-1.5 text-[13px] leading-snug text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
                        >
                          {link.label}
                          <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-white/30 transition-colors group-hover:text-[#0095FF]" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link
                href="mailto:legal@ahurasense.com"
                className="mt-6 inline-flex items-center gap-1.5 text-sm text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
              >
                Contact legal
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </aside>

            {/* Document column — scrolls with the page, independent of the aside. */}
            <article aria-label={`${title} content`} className="min-w-0 space-y-12">
              {groups.map((group) => (
                <div key={group.label} className="space-y-6">
                  <h2 className="border-b border-white/[0.08] pb-3 text-[11px] uppercase tracking-[0.2em] text-[#0095FF]">
                    {group.label}
                  </h2>
                  {group.sections.map((section) => {
                    sectionNumber += 1;
                    return (
                      <section
                        key={section.id}
                        id={section.id}
                        aria-labelledby={`${section.id}-title`}
                        className="scroll-mt-28 border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8"
                      >
                        <h3
                          id={`${section.id}-title`}
                          className="text-xl sm:text-2xl leading-tight text-white"
                        >
                          {sectionNumber}. {section.title}
                        </h3>
                        <div className="mt-4 space-y-4 text-sm sm:text-[15px] leading-7 text-white/70">
                          {section.content}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ))}
            </article>
          </div>
        </Container>
      </section>
    </main>
  );
}
