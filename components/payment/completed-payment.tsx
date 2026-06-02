"use client";
import { assetUrl } from "@/lib/asset-url";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { formatAmount, formatUSD } from "@/lib/utils";
import { FaqSheet } from "./faq-sheet";
import { PublicPaymentData } from "@/types/database/payment";
import Image from "next/image";

interface CompletedPaymentProps {
  payment: PublicPaymentData;
}

export function CompletedPayment({ payment }: CompletedPaymentProps) {
  const [countdown, setCountdown] = useState(10);
  const isPartiallyPaid = payment.status === 'partially_paid';
  const redirectUrl = payment.domain + '/dashboard';

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && redirectUrl) {
      window.location.href = redirectUrl;
    }
  }, [countdown, redirectUrl]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="-mt-2">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-1.5">
              <span className="text-lg font-semibold font-mono">ahura<span className="text-blue-300">sense</span></span>
            </Link>
            <FaqSheet />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Image
                  src={assetUrl(`/currencies/${payment.currency.toLowerCase()}.svg`)}
                  alt={payment.currency}
                  className="w-9 h-9"
                />
                <div>
                  <p className="text-sm font-medium">{payment.currency}</p>
                </div>
              </div>
              <p className="text-green-300 flex items-center gap-1 mt-2">
                <CheckCircle2 className="w-4 h-4" />Payment completed
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">
                {formatAmount(payment.amount_to_pay.crypto, 2)} {payment.currency}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                ≈{formatUSD(payment.amount_to_pay.usd)}
              </p>
            </div>
          </div>

          <Separator />

          <div className="text-center space-y-1 py-4">
            <div className="flex justify-center mb-4">
              {isPartiallyPaid ? (
                <AlertCircle className="h-20 w-20 text-amber-400" />
              ) : (
                <CheckCircle2 className="h-20 w-20 text-green-300" />
              )}
            </div>
            <h2 className="text-2xl font-semibold">
              {isPartiallyPaid ? 'Partially Paid' : 'Payment Completed'}
            </h2>
            <p className="text-muted-foreground">
              {isPartiallyPaid
                ? 'Your payment was partially received.'
                : 'Your payment has been successfully processed.'
              }
            </p>
          </div>

          <Separator />

          <div className="text-center space-y-4">
            <div>
              <p className="text-lg font-medium">Redirecting in {countdown}...</p>
              <p className="text-sm text-muted-foreground">
                You will be automatically redirected to your dashboard.
              </p>
            </div>
            <Button variant="outline" className="gap-2" asChild>
              <Link href={redirectUrl}>
                Click here if not redirected
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
