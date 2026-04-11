import { Suspense } from "react";
import { PaymentDetails } from "@/components/payment/payment-details";
import { PaymentLoading } from "@/components/payment/payment-loading";
import { AutoRefresh } from "@/components/payment/auto-refresh";
import ErrorCard from "@/components/error-card";
import { getPublicPayment } from "@/actions/get-public-payment";

export const dynamic = 'force-dynamic';

interface PaymentPageProps {
  params: Promise<{
    id: string;
  }>;
}

const POLLING_STATUSES = new Set(["pending", "confirming"]);

async function PaymentContent({ paymentId }: { paymentId: string }) {
  const result = await getPublicPayment(paymentId);
  if (!result.success || !result.data) {
    return <ErrorCard text={result.error || "Payment not found"} />
  }

  const status = result.data.status;

  return (
    <>
      {POLLING_STATUSES.has(status) && <AutoRefresh />}
      <PaymentDetails payment={result.data} />
    </>
  );
}

export default async function PaymentPage({ params }: PaymentPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<PaymentLoading />}>
      <PaymentContent paymentId={id} />
    </Suspense>
  );
}
