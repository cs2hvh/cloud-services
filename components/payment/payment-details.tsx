"use client";

import type { PublicPaymentData } from "@/types/database/payment";
import { PendingPayment } from "./pending-payment";
import { ConfirmingPayment } from "./confirming-payment";
import { CompletedPayment } from "./completed-payment";
import { notFound } from "next/navigation";

interface PaymentDetailsProps {
  payment: PublicPaymentData;
}

export function PaymentDetails({ payment }: PaymentDetailsProps) {
  switch (payment.status) {
    case 'pending':
      return <PendingPayment payment={payment} />;

    case 'confirming':
      return <ConfirmingPayment payment={payment} />;

    case 'completed':
    case 'partially_paid':
      return <CompletedPayment payment={payment} />;

    case 'expired':
    case 'failed':
      notFound();

    default:
      notFound();
  }
}
