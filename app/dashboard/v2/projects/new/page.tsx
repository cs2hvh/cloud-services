/**
 * New project — choose a repository and a plan.
 *
 * The tier list is passed from the server rather than fetched or duplicated, so
 * the plans a customer can pick are exactly the rows in lib/paas/tiers.ts —
 * which tiers.test.ts already pins against docs/v2/05-pricing.md. A hardcoded
 * list here would be a third copy of the price list and the one most likely to
 * go stale unnoticed, because nobody reads a dropdown for correctness.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TIERS } from "@/lib/paas/tiers";
import { Card } from "@/components/v2/kit";
import { Picker } from "./picker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?redirectTo=%2Fdashboard%2Fv2%2Fprojects%2Fnew");

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <header>
        <Link href="/dashboard/v2/projects" className="text-xs text-white/40 hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">New project</h1>
        <p className="mt-0.5 text-xs text-white/40">
          Pick a repository. It builds on push to its production branch, and every other branch gets a
          free preview that expires after 48 hours.
        </p>
      </header>

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
    </main>
  );
}
