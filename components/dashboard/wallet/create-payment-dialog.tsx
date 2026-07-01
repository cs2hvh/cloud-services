"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { toast } from "sonner"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { createDepositPayment } from "@/actions/crypto-deposit"
import { getCurrencies } from "@/actions/currencies"
import type { FormState } from "@/actions/create-payment-schema"
import {
  currencyIconUrl,
  groupCurrencies,
  networkLabel,
  type Currency,
  type CurrencyGroup,
} from "@/config/currencies"
import { CirclePlus } from "lucide-react"

// Pick a sensible default selection: USDT → TRC-20 when present, else the first
// asset of the first group.
function pickDefault(groups: CurrencyGroup[]): { symbol: string; assetId: string } {
  const g = groups.find((x) => x.symbol === "USDT") ?? groups[0]
  if (!g) return { symbol: "", assetId: "" }
  const a = g.assets.find((x) => x.id === "usdt-trc20") ?? g.assets[0]
  return { symbol: g.symbol, assetId: a?.id ?? "" }
}

export function CreatePaymentDialog({
  initialAmount = 20,
  currencies,
  trigger,
}: {
  /** Pre-seeds the amount field (USD). */
  initialAmount?: number
  /** Server-fetched currency list; the dialog also refreshes it on open. */
  currencies?: Currency[]
  /** Custom trigger node; defaults to an "Add Funds" button. */
  trigger?: React.ReactNode
}) {
  const [amount, setAmount] = useState<number>(initialAmount)
  // Seed from the server-provided list so a default is selected immediately and
  // the Create button is usable without waiting on a client round-trip.
  const [groups, setGroups] = useState<CurrencyGroup[]>(() =>
    groupCurrencies(currencies ?? [])
  )
  const [symbol, setSymbol] = useState<string>(
    () => pickDefault(groupCurrencies(currencies ?? [])).symbol
  )
  const [assetId, setAssetId] = useState<string>(
    () => pickDefault(groupCurrencies(currencies ?? [])).assetId
  )

  // Keep the amount in sync if the caller's seed changes while the dialog is closed.
  useEffect(() => {
    setAmount(initialAmount)
  }, [initialAmount])

  // Refresh the supported currencies from the gateway on open (and populate
  // when no server list was provided). Auto-select a default if the current
  // selection isn't offered by the fetched list.
  useEffect(() => {
    let active = true
      ; (async () => {
        const res = await getCurrencies()
        if (!active || !res.success || !res.data?.length) return
        const next = groupCurrencies(res.data)
        setGroups(next)
        const stillValid =
          !!assetId && next.some((g) => g.assets.some((a) => a.id === assetId))
        if (!stillValid) {
          const def = pickDefault(next)
          setSymbol(def.symbol)
          setAssetId(def.assetId)
        }
      })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const group = useMemo<CurrencyGroup | undefined>(
    () => groups.find((g) => g.symbol === symbol),
    [groups, symbol]
  )
  const multiNetwork = (group?.assets.length ?? 0) > 1

  const [formState, formAction, pending] = useActionState<FormState, FormData>(
    createDepositPayment,
    {
      values: { amount_usd: initialAmount, currency: "" },
      errors: null,
      success: false,
    }
  )

  useEffect(() => {
    if (formState.success && formState.payment_url) {
      toast.success("Payment created successfully!")
      // payment_url is the gateway-hosted checkout (cross-origin), so do a full
      // browser navigation rather than a client-side route push.
      window.location.href = formState.payment_url
    } else if (!formState.success && formState.errors) {
      const errorMessage = Object.values(formState.errors).flat()[0]
      if (errorMessage) toast.error(errorMessage)
    }
  }, [formState.success, formState.payment_url, formState.errors])

  // Picking a currency defaults to its first network; the network select (shown
  // only for multi-chain currencies) can change it.
  function selectSymbol(next: string) {
    setSymbol(next)
    const g = groups.find((x) => x.symbol === next)
    setAssetId(g?.assets[0]?.id ?? "")
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button disabled={pending} size="lg">
            <CirclePlus className="size-4" />
            Add Funds
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction} id="create-payment-form">
          {/* The resolved pay_asset_id is submitted as `currency`. */}
          <input type="hidden" name="currency" value={assetId} />

          {/* Amount is chosen on the billing form; submit it as a hidden field. */}
          <input type="hidden" name="amount_usd" value={amount} />

          <DialogHeader>
            <DialogTitle>Deposit Funds</DialogTitle>
            <DialogDescription>
              You&apos;re adding{" "}
              <span className="font-semibold text-foreground">${amount}</span> to
              your wallet. Choose a currency to continue.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <FieldSet>
              {formState.errors?.amount_usd && (
                <FieldError>{formState.errors.amount_usd[0]}</FieldError>
              )}

              <FieldSet data-invalid={!!formState.errors?.currency?.length}>
                <FieldLegend variant="label">Currency</FieldLegend>

                <RadioGroup
                  value={symbol}
                  onValueChange={selectSymbol}
                  disabled={pending}
                  className="grid grid-cols-2 gap-3"
                >
                  {groups.map((g) => {
                    const iconUrl = currencyIconUrl(g.symbol)
                    return (
                      <FieldLabel
                        key={g.symbol}
                        htmlFor={`currency-${g.symbol}`}
                        className="cursor-pointer"
                      >
                        <Field orientation="horizontal" className="py-3.5">
                          <FieldContent>
                            <div className="flex items-center gap-3">
                              <div className="relative size-9 shrink-0">
                                <Image
                                  src={iconUrl}
                                  alt={g.name}
                                  fill
                                  className="object-contain"
                                  unoptimized
                                />
                              </div>
                              <div className="flex flex-col">
                                <FieldTitle className="text-base">{g.name}</FieldTitle>
                                <span className="text-xs text-muted-foreground">
                                  {g.symbol}
                                </span>
                              </div>
                            </div>
                          </FieldContent>
                          <RadioGroupItem value={g.symbol} id={`currency-${g.symbol}`} />
                        </Field>
                      </FieldLabel>
                    )
                  })}
                </RadioGroup>

                {/* Network selection (only for multi-chain currencies) */}
                {multiNetwork && group && (
                  <Field className="mt-1">
                    <FieldLabel htmlFor="network">
                      <FieldTitle>Network</FieldTitle>
                    </FieldLabel>
                    <Select
                      value={assetId}
                      onValueChange={setAssetId}
                      disabled={pending}
                    >
                      <SelectTrigger id="network" className="w-full">
                        <SelectValue placeholder="Select network" />
                      </SelectTrigger>
                      <SelectContent>
                        {group.assets.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {networkLabel(a)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>Network fees apply.</FieldDescription>
                  </Field>
                )}

                {formState.errors?.currency && (
                  <FieldError>{formState.errors.currency[0]}</FieldError>
                )}
              </FieldSet>
            </FieldSet>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="submit"
              disabled={pending}
              form="create-payment-form"
              size="lg"
              className="w-full border-0 text-white hover:opacity-95 cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #0095FF, #0066B3)",
                boxShadow:
                  "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              {pending ? (
                <>
                  <Spinner />
                  Creating...
                </>
              ) : (
                `Create Payment ($${amount})`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
