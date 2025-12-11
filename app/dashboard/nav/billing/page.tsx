import { Suspense } from "react";
import BillingTabs from "./BillingTabs";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { createClient } from "@/lib/supabase/server";
import { Billing, Promocodes } from "@/lib/supabase/queries";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function BillingSuspense() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  const userEmail = data.user?.email || "";
  if (!userId) redirect("/signin");

  const [credits, availableCoupons] = await Promise.all([
    Billing.get_user_credits(userId),
    Promocodes.get_available_for_user(userId, userEmail),
  ]);
  
  console.log(credits,"credits in billing page")

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Billing($)</h1>
        <p className="text-sm text-neutral-400 mt-0.5">Manage balance and payment methods</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-4 sm:p-6">
        <BillingTabs
          initialBalance={credits.credit_balance}
          promoCredits={credits.promo_credits}
          topupCredits={credits.topup_credits}
          availableCoupons={availableCoupons}
        />
      </div>
    </div>
  );
}

export default async function BillingPage() {
  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <BillingSuspense />
      </Suspense>
    </div>
  );
}
