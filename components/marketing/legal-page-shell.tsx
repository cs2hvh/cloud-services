import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { LegalDocumentNav } from "@/components/marketing/legal-document-nav";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalPageShellProps = {
  currentPath: string;
  title: string;
  description: string;
  lastUpdated: string;
  effectiveDate: string;
  sections: LegalSection[];
};

export function LegalPageShell({
  currentPath,
  title,
  description,
  lastUpdated,
  effectiveDate,
  sections,
}: LegalPageShellProps) {
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
        </Container>
      </section>

      <section className="py-10 sm:py-12 lg:py-16">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="h-fit lg:sticky lg:top-24 border border-white/[0.08] bg-white/[0.02] p-5">
              <h2 className="text-sm font-medium text-white">On this page</h2>
              <ul className="mt-4 space-y-2.5">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm text-white/60 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
              <Link
                href="mailto:legal@ahurasense.com"
                className="mt-6 inline-flex items-center gap-1.5 text-sm text-[#9ad5ff] hover:text-[#c6e8ff] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
              >
                Contact legal
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </aside>

            <article aria-label={`${title} content`} className="space-y-10">
              {sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-title`}
                  className="scroll-mt-28 border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8"
                >
                  <h2
                    id={`${section.id}-title`}
                    className="text-2xl sm:text-3xl leading-tight text-white"
                  >
                    {index + 1}. {section.title}
                  </h2>
                  <div className="mt-4 space-y-4 text-sm sm:text-[15px] leading-7 text-white/70">
                    {section.content}
                  </div>
                </section>
              ))}
            </article>
          </div>
        </Container>
      </section>
    </main>
  );
}

