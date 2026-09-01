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
import { GitConnections } from "@/components/v2/git-connections";
import { FrameworkMarquee } from "@/components/v2/framework-marquee";
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

      <Hero lead="Deploy" accent="application" />

      {/*
        Two-up, because the form has a natural width and the page does not. The
        column that holds the fields keeps a readable measure; the space that
        used to sit empty beside it now carries the frameworks the detector
        handles, which is the question somebody on this page is actually asking.

        The wall is hidden below lg. On a narrow viewport it would push the
        thing you came here to use below the fold.
      */}
      {/* BOTH COLUMNS ARE BOUNDED. The second was minmax(0,1fr), which on this
          full-bleed page grew to whatever the monitor was — the framework wall
          ran off the right edge of a wide screen. A fixed measure keeps the two
          columns beside each other instead of one chasing the viewport. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,620px)_minmax(0,520px)]">
        <div>
        <Card title="Repository">
          <Picker
            tiers={TIERS.map((t) => ({
              id: t.id,
              label: t.label,
              memoryMib: t.memoryMib,
              vcpu: t.vcpu,
              priceUsd: t.priceUsd,
              // Public pricing. costUsd is deliberately NOT passed — it is our
              // margin and must never reach a client bundle.
              transferGb: t.transferGb,
            }))}
          />
        </Card>

        {/*
          Below the picker, because the common case is picking a repository and
          the uncommon one is fixing which account you can pick from. It is here
          rather than buried in settings so that somebody who cannot find their
          repository has the answer on the same screen as the problem.
        */}
        <Card title="Git accounts" subtitle="Where repositories are read from" className="mt-4">
          <GitConnections />
        </Card>
        </div>

        {/* Sticky, so it stays beside the form instead of scrolling away from
            it — and so it can never be the thing that makes the page taller. */}
        <div className="hidden lg:block">
          <div className="sticky top-8">
            <FrameworkMarquee />
          </div>
        </div>
      </div>
    </ServiceShell>
  );
}
