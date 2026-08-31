"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip, Table } from "@admin/components/deploy/bits";
import {
  RATE_MODELS,
  UNITS_BY_MODEL,
  formatRate,
  hourlyEquivalent,
  monthlyEquivalent,
  specSummary,
  type PriceRow,
  type RateModel,
  type ServicePlan,
} from "@admin/lib/pricing";

interface Props {
  plans: ServicePlan[];
  prices: PriceRow[];
}

const money = (n: number, places = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places })}`;

export function PriceBook({ plans, prices }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<ServicePlan | null>(null);

  const priceOf = useMemo(() => {
    const m = new Map<string, PriceRow>();
    for (const p of prices) m.set(`${p.service_type}:${p.plan_key}`, p);
    return m;
  }, [prices]);

  const groups = useMemo(() => {
    const byType = new Map<string, ServicePlan[]>();
    for (const plan of plans) {
      const list = byType.get(plan.service_type) ?? [];
      list.push(plan);
      byType.set(plan.service_type, list);
    }
    return [...byType.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [plans]);

  return (
    <div className="space-y-6">
      {groups.map(([serviceType, groupPlans]) => (
        <section
          key={serviceType}
          className="rounded-xl border border-border bg-card"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-heading text-sm font-semibold tracking-tight">
              {serviceType}
            </h2>
            <span className="text-xs text-muted-foreground">
              {groupPlans.filter((p) => priceOf.has(`${p.service_type}:${p.plan_key}`)).length}
              /{groupPlans.length} priced
            </span>
          </header>
          <div className="p-4">
            <Table head={["plan", "key", "specs", "rate", "≈ hourly", "≈ monthly", "since", ""]}>
              {groupPlans.map((plan) => {
                const price = priceOf.get(`${plan.service_type}:${plan.plan_key}`);
                const hourly = price
                  ? hourlyEquivalent(price.rate_model, price.unit, Number(price.amount))
                  : null;
                const monthly = price
                  ? monthlyEquivalent(price.rate_model, price.unit, Number(price.amount))
                  : null;
                const perGb = price?.rate_model === "per_gb_hour" ? "/GB" : "";
                return (
                  <tr key={plan.plan_key} className="border-t border-border/60">
                    <td className="py-1.5 pr-4">{plan.display_name}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{plan.plan_key}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{specSummary(plan)}</td>
                    <td className="py-1.5 pr-4">
                      {price ? formatRate(price) : <StatusChip status="unpriced" />}
                    </td>
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {hourly === null ? "—" : `${money(hourly, 4)}${perGb}`}
                    </td>
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {monthly === null ? "—" : `${money(monthly)}${perGb}`}
                    </td>
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {price ? price.effective_from.slice(0, 13).replace("T", " ") + ":00" : "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(plan)}
                      >
                        <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                        {price ? "Change" : "Set price"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </section>
      ))}

      {editing && (
        <SetPriceDialog
          plan={editing}
          current={priceOf.get(`${editing.service_type}:${editing.plan_key}`) ?? null}
          onClose={(changed) => {
            setEditing(null);
            if (changed) router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SetPriceDialog({
  plan,
  current,
  onClose,
}: {
  plan: ServicePlan;
  current: PriceRow | null;
  onClose: (changed: boolean) => void;
}) {
  const [rateModel, setRateModel] = useState<RateModel>(
    current?.rate_model ?? "fixed_hourly",
  );
  const [unit, setUnit] = useState<string>(current?.unit ?? "usd_per_hour");
  const [amount, setAmount] = useState<string>(current ? String(current.amount) : "");
  const [note, setNote] = useState("");
  const [confirmOutlier, setConfirmOutlier] = useState(false);
  const [outlierWarning, setOutlierWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amountNum = Number(amount);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const hourly = validAmount ? hourlyEquivalent(rateModel, unit, amountNum) : null;
  const monthly = validAmount ? monthlyEquivalent(rateModel, unit, amountNum) : null;
  const perGb = rateModel === "per_gb_hour" ? " per GB" : "";

  const changeModel = (m: RateModel) => {
    setRateModel(m);
    setUnit(UNITS_BY_MODEL[m][0]);
    setOutlierWarning(null);
    setConfirmOutlier(false);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/pricing/set-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: plan.service_type,
          planKey: plan.plan_key,
          rateModel,
          unit,
          amount: amountNum,
          note: note || undefined,
          confirmOutlier,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.requiresConfirmation) {
        setOutlierWarning(data.error);
        return;
      }
      if (!data.success) {
        toast.error(data.error ?? "Price write failed");
        return;
      }
      toast.success(
        `Price ${data.action === "corrected" ? "corrected" : "set"} for ${plan.display_name}`,
      );
      onClose(true);
    } catch {
      toast.error("Price write failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {current ? "Change price" : "Set price"} — {plan.display_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {plan.service_type} · {plan.plan_key} · {specSummary(plan)}
            {current && (
              <>
                {" "}
                · currently {formatRate(current)}
              </>
            )}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rate model</Label>
              <Select value={rateModel} onValueChange={(v) => changeModel(v as RateModel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_MODELS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS_BY_MODEL[rateModel].map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Amount (in that unit — never converted by hand)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setOutlierWarning(null);
                setConfirmOutlier(false);
              }}
              placeholder={unit === "multiplier" ? "1.25" : "0.05"}
            />
          </div>

          {/* The preview that catches the 720× class at entry. */}
          {validAmount && (
            <div className="rounded-md border border-border bg-black/20 p-3 font-mono text-xs">
              {rateModel === "markup" ? (
                <>Charges will be upstream cost × {amountNum}.</>
              ) : (
                <>
                  ≈ {hourly === null ? "—" : money(hourly, 4)}/hr{perGb} ·{" "}
                  <span className={monthly !== null && monthly >= 5000 ? "text-red-300" : ""}>
                    ≈ {monthly === null ? "—" : money(monthly)}/mo{perGb}
                  </span>
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Note (lands in the price row and the audit log)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="why this price"
            />
          </div>

          {outlierWarning && (
            <div className="space-y-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <p>{outlierWarning}</p>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={confirmOutlier}
                  onCheckedChange={(v) => setConfirmOutlier(v === true)}
                />
                I confirm this out-of-band rate is intentional
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onClose(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!validAmount || submitting || (!!outlierWarning && !confirmOutlier)}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {current ? "Replace price" : "Set price"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
