import { Suspense } from "react";
import BillingTabs from "./BillingTabs";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { createClient } from "@/lib/supabase/server";
import { Billing } from "@/lib/supabase/queries/billing";
import {Promocodes} from "@/lib/supabase/queries/promocodes";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function BillingSuspense({ paymentStatus }: { paymentStatus?: string | null }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  const userEmail = data.user?.email || "";
  if (!userId) redirect("/signin");

  const [credits, availableCoupons, recurringTopup] = await Promise.all([
    Billing.get_user_credits(userId),
    Promocodes.get_available_for_user(userId, userEmail),
    Billing.get_recurring_topup(userId),
  ]);

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Billing($)</h1>
        <p className="text-sm text-neutral-400 mt-0.5">Manage balance and payment methods</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-4 sm:p-6">
        <BillingTabs
          initialBalance={credits.credit_balance}
          availableCoupons={availableCoupons}
          paymentStatus={paymentStatus}
          initialRecurring={recurringTopup}
        />
      </div>
    </div>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  const paymentStatus = params.status ?? null;

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <BillingSuspense paymentStatus={paymentStatus} />
      </Suspense>
    </div>
  );
}
