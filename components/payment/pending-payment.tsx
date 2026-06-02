"use client";
import { assetUrl } from "@/lib/asset-url";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PublicPaymentData } from "@/types/database/payment";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard, formatAmount, formatUSD } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { FaqSheet } from "./faq-sheet";
import { Spinner } from "../ui/spinner";
import Link from "next/link";
import Image from "next/image";

interface PendingPaymentProps {
  payment: PublicPaymentData;
}

export function PendingPayment({ payment }: PendingPaymentProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  const currencySymbol = payment.currency.toLowerCase();

  useEffect(() => {
    if (!payment.expires_at) return;

    const calculateTimeRemaining = () => {
      const expiresAt = new Date(payment.expires_at);
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining("00:00:00");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining(
        `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [payment.expires_at]);

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                src={assetUrl(`/currencies/${currencySymbol}.svg`)}
                alt={payment.currency}
                className="w-10 h-10"
              />
              <div>
                <p className="font-medium">{payment.currency}</p>
              </div>
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
            Scan the QR code or send to the address below
          </div>

          <div className="grid md:grid-cols-[auto_1fr] gap-4 items-start">
            {payment.address && (
              <div className="flex justify-center">
                <QRCodeSVG
                  value={payment.address}
                  size={180}
                  level="H"
                  includeMargin={true}
                  imageSettings={{
                    src: assetUrl(`/currencies/${currencySymbol}.svg`),
                    height: 40,
                    width: 40,
                    excavate: true,
                  }}
                  className="rounded-lg"
                />
              </div>
            )}

            <div className="flex flex-col gap-3 text-sm bg-muted/50 border border-border rounded-lg w-full">
              <div className="flex items-center justify-between gap-3 px-3 py-4">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="leading-none font-medium text-muted-foreground">
                    Wallet address for transfer
                  </div>
                  <div className="font-mono text-sm break-all">
                    {payment.address ?? "—"}
                  </div>
                </div>
                {payment.address && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 cursor-pointer"
                    onClick={() => {
                      copyToClipboard(payment.address!, 'Address copied to clipboard');
                      setCopiedAddress(true);
                      setTimeout(() => setCopiedAddress(false), 2000);
                    }}
                  >
                    {copiedAddress ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                )}
              </div>

              <Separator className="-my-2" />

              <div className="flex items-center justify-between gap-3 px-3 py-4">
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="leading-none font-medium text-muted-foreground">
                    Transfer amount
                  </div>
                  <div className="font-mono text-sm">
                    {formatAmount(payment.amount_to_pay.crypto, 2)} {payment.currency}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 cursor-pointer"
                  onClick={() => {
                    copyToClipboard(String(payment.amount_to_pay.crypto), 'Amount copied to clipboard');
                    setCopiedAmount(true);
                    setTimeout(() => setCopiedAmount(false), 2000);
                  }}
                >
                  {copiedAmount ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            After sending payment, please wait for blockchain confirmation
          </div>

          {payment.expires_at && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Spinner />
              <span>Time remaining: {timeRemaining}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
