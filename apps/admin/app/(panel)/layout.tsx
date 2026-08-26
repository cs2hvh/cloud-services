import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { Sidebar } from "@admin/components/sidebar";
import { SignOutButton } from "@admin/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The middleware already gates every request; this is defense in depth so
  // the panel never renders for a non-admin even if the middleware matcher
  // misses a path.
  const admin = await requireAdmin();
  if (!admin.ok) {
    notFound();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <div />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {admin.email}
            </span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
}
