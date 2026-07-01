import { Suspense } from "react";
import BillingTabs from "./BillingTabs";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { createClient } from "@/lib/supabase/server";
import { Billing } from "@/lib/supabase/queries/billing";
import { Promocodes } from "@/lib/supabase/queries/promocodes";
import { getCurrencies } from "@/actions/currencies";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function BillingSuspense({
  paymentStatus,
}: {
  paymentStatus?: string | null;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  const userEmail = data.user?.email || "";
  if (!userId) redirect("/signin");

  const [credits, availableCoupons, recurringTopup, currenciesRes] =
    await Promise.all([
      Billing.get_user_credits(userId),
      Promocodes.get_available_for_user(userId, userEmail),
      Billing.get_recurring_topup(userId),
      getCurrencies(),
    ]);

  return (
    <BillingTabs
      initialBalance={credits.credit_balance}
      availableCoupons={availableCoupons}
      paymentStatus={paymentStatus}
      initialRecurring={recurringTopup}
      currencies={currenciesRes.data ?? []}
    />
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
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">
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
    </div>
  );
}
