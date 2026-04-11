"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard, formatAmount, formatUSD } from "@/lib/utils";
import { useState } from "react";
import { FaqSheet } from "./faq-sheet";
import { Spinner } from "../ui/spinner";
import Link from "next/link";
import { PublicPaymentData } from "@/types/database/payment";

interface ConfirmingPaymentProps {
  payment: PublicPaymentData;
}

export function ConfirmingPayment({ payment }: ConfirmingPaymentProps) {
  const [copiedTxId, setCopiedTxId] = useState(false);

  const requiredConfirmations = 19;

  const transaction = payment.transactions && payment.transactions.length > 0 ? payment.transactions[0] : null;

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
                <img
                  src={`/currencies/${payment.currency.toLowerCase()}.svg`}
                  alt={payment.currency}
                  className="w-9 h-9"
                />
                <div>
                  <p className="text-sm font-medium">{payment.currency}</p>
                </div>
              </div>
              <p className="text-yellow-300 mt-2">Payment confirming...</p>
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

          <div className="text-center text-sm text-muted-foreground">
            Your payment is being confirmed on the blockchain
          </div>

          <div className="flex flex-col gap-3 text-sm bg-muted/50 border border-border rounded-lg">
            <div className="flex items-center justify-between gap-3 px-3 py-4">
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="leading-none font-medium text-muted-foreground">
                  Confirmations
                </div>
                <div className="font-mono text-sm">
                  {transaction?.confirmations || 0}/{requiredConfirmations}
                </div>
              </div>
              <Spinner className="size-7 text-yellow-300" />
            </div>

            {transaction && (
              <>
                <Separator className="-my-2" />
                <div className="flex items-center justify-between gap-3 px-3 py-4">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="leading-none font-medium text-muted-foreground">
                      Transaction ID
                    </div>
                    <div className="font-mono text-sm break-all">
                      {transaction.txid}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      copyToClipboard(transaction.txid, 'Transaction ID copied to clipboard');
                      setCopiedTxId(true);
                      setTimeout(() => setCopiedTxId(false), 2000);
                    }}
                  >
                    {copiedTxId ? (
                      <Check className="h-4 w-4 text-green-300" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="text-center text-sm text-muted-foreground">
            Please wait for the required number of confirmations
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
