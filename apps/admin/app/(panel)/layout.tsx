import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { ConfirmProvider } from "@/components/ui/confirm";
import { PanelChrome } from "@admin/components/panel-chrome";

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
    <PanelChrome email={admin.email ?? null}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </PanelChrome>
  );
}
