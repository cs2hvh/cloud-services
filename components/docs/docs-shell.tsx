import type { ReactNode } from "react";
import { DocsSidebar } from "./docs-sidebar";
import { INFERENCE_DOCS } from "./nav";
import { TableOfContents } from "./toc";

/**
 * Sidebar, content column and, on wide screens, an "on this page" rail,
 * under the fixed marketing navbar.
 *
 * The content column is capped at a reading width; code blocks and tables
 * scroll inside themselves, so the page never scrolls sideways on a phone.
 * `ah-docs` scopes the dark scrollbars and selection colour in globals.css.
 */
export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <main className="ah-docs min-h-screen bg-[#0E0F0F] text-[var(--ah-ink)]">
      <div className="mx-auto w-full max-w-[1360px] px-[clamp(16px,3vw,40px)] pb-24 pt-24 sm:pt-28">
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[220px_minmax(0,1fr)_200px] xl:gap-14">
          <aside className="ah-scroll lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
            <DocsSidebar groups={INFERENCE_DOCS} />
          </aside>
          <div className="min-w-0 max-w-[780px]">{children}</div>
          <aside className="hidden xl:block xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto ah-scroll">
            <TableOfContents />
          </aside>
        </div>
      </div>
    </main>
  );
}
