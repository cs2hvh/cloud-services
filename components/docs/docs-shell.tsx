import type { ReactNode } from "react";
import { DocsSidebar } from "./docs-sidebar";
import { INFERENCE_DOCS } from "./nav";

/**
 * Sidebar plus content column, under the fixed marketing navbar.
 *
 * The content column is capped at a reading width; code blocks scroll inside
 * themselves, so the page never scrolls sideways on a phone.
 */
export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0E0F0F] text-[var(--ah-ink)]">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(16px,3vw,40px)] pb-24 pt-24 sm:pt-28">
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
            <DocsSidebar groups={INFERENCE_DOCS} />
          </aside>
          <div className="min-w-0 max-w-[780px]">{children}</div>
        </div>
      </div>
    </main>
  );
}
