/**
 * New project — choose a repository and a plan.
 *
 * The tier list is passed from the server rather than fetched or duplicated, so
 * the plans a customer can pick are exactly the rows in lib/paas/tiers.ts —
 * which tiers.test.ts already pins against docs/v2/05-pricing.md. A hardcoded
 * list here would be a third copy of the price list and the one most likely to
 * go stale unnoticed, because nobody reads a dropdown for correctness.
 *
 * THE SHELL IS FULL BLEED AND THE FORM IS NOT, which is the one place this page
 * departs from the list beside it. The list is a table and wants every pixel;
 * a form stretched across a wide monitor puts the label and its field an arm's
 * length apart. So the background, the glows and the padding are shared, and the
 * column that holds the fields keeps a readable measure.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { TIERS } from "@/lib/paas/tiers";
import { Card, Hero, ServiceShell, V2_MONO } from "@/components/v2/kit";
import { Picker } from "./picker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Encoded, and it pointed at the OLD path until this was noticed — the move to
  // /dashboard/services/apps rewrote the plain occurrences and could not see
  // this one, so signing in here returned you to a route that no longer exists.
  if (!user) redirect("/signin?redirectTo=%2Fdashboard%2Fservices%2Fapps%2Fnew");

  return (
    <ServiceShell>
      <Link
        href="/dashboard/services/apps"
        className={`${V2_MONO} mb-6 inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-white/40 transition-colors hover:text-white/70`}
      >
        <ChevronLeft className="h-3 w-3" aria-hidden />
        Projects
      </Link>

      <Hero lead="Deploy a" accent="new application" />

      <div className="max-w-3xl">
        <Card title="Repository">
          <Picker
            tiers={TIERS.map((t) => ({
              id: t.id,
              label: t.label,
              memoryMib: t.memoryMib,
              vcpu: t.vcpu,
              priceUsd: t.priceUsd,
            }))}
          />
        </Card>
      </div>
    </ServiceShell>
  );
}
