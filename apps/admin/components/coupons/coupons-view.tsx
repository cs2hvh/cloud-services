"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DISCOUNT_KINDS,
  discountValueLabel,
  promoStatus,
  type Discount,
  type Promocode,
} from "@admin/lib/offers";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function CouponsView({
  promocodes,
  discounts,
  grantCounts,
  serviceTypes,
}: {
  promocodes: Promocode[];
  discounts: Discount[];
  grantCounts: Record<string, number>;
  serviceTypes: string[];
}) {
  const [creating, setCreating] = useState(false);
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const router = useRouter();

  const toggleDiscount = async (d: Discount) => {
    const next = !d.is_active;
    setToggling(d.id);
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, is_active: next }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "Update failed");
        return;
      }
      toast.success(`${d.name} ${next ? "reactivated" : "deactivated"}`);
      router.refresh();
    } catch {
      toast.error("Update failed");
    } finally {
      setToggling(null);
    }
  };

  const toggleCoupon = async (p: Promocode) => {
    const next = !(p.is_active ?? true);
    setToggling(p.id);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, is_active: next }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "Update failed");
        return;
      }
      toast.success(`${p.code} ${next ? "reactivated" : "deactivated"}`);
      router.refresh();
    } catch {
      toast.error("Update failed");
    } finally {
      setToggling(null);
    }
  };

  return (
    <Tabs defaultValue="discounts">
      <TabsList className="mb-4">
        <TabsTrigger value="discounts">
          Discounts ({discounts.length})
        </TabsTrigger>
        <TabsTrigger value="promocodes">
          Promocodes ({promocodes.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="discounts">
        <div className="mb-3 flex items-start justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            A discount changes what an hour costs — percent off, amount off,
            or free hours. Exactly one applies per charge (priority → scope →
            age); stacking is deliberately unsupported. Blank scope means
            &quot;any&quot;. Codeless discounts apply automatically.
          </p>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New discount
          </Button>
        </div>

        {discounts.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-xs text-muted-foreground">
            No discounts yet — this table starts empty by design; legacy
            promocodes were not migrated because they are a different
            instrument (credit, not rate).
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4">
            <Table head={["name", "code", "value", "scope", "window", "grants", "priority", "status", ""]}>
              {discounts.map((d) => (
                <tr key={d.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{d.name}</td>
                  <td className="py-1.5 pr-4">{d.code ?? <span className="text-muted-foreground">automatic</span>}</td>
                  <td className="py-1.5 pr-4">{discountValueLabel(d.kind, Number(d.value))}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    {d.service_type ?? "any"}{d.plan_key ? ` / ${d.plan_key}` : ""}
                  </td>
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    {day(d.starts_at)} → {day(d.ends_at)}
                  </td>
                  <td className="py-1.5 pr-4">
                    {grantCounts[d.id] ?? 0}
                    {d.max_grants !== null ? ` / ${d.max_grants}` : ""}
                  </td>
                  <td className="py-1.5 pr-4">{d.priority}</td>
                  <td className="py-1.5 pr-4">
                    <StatusChip
                      status={
                        !d.is_active
                          ? "suspended"
                          : d.ends_at && Date.parse(d.ends_at) < Date.now()
                            ? "expired"
                            : "live"
                      }
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={toggling === d.id}
                      onClick={() => void toggleDiscount(d)}
                    >
                      {toggling === d.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : d.is_active ? (
                        "Deactivate"
                      ) : (
                        "Reactivate"
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="promocodes">
        <div className="mb-3 flex items-start justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            A promocode puts money in a wallet — it does not change rates.
            Customers redeem once each; a total cap is optional. Deactivating
            a code refuses further redemptions immediately.
          </p>
          <Button size="sm" onClick={() => setCreatingCoupon(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New coupon
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <Table head={["code", "credit", "semantics", "redeemed", "valid till", "status", ""]}>
            {promocodes.map((p) => {
              const redemptions = p.redeem_by?.length ?? 0;
              const status = promoStatus(p);
              return (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{p.code}</td>
                  <td className="py-1.5 pr-4">${Number(p.amount).toFixed(2)}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    {/* Every coupon_type redeems once per user — the redeem
                        function reads the type in exactly one branch: 'limited'
                        auto-deactivates at the cap. Semantics are shown from
                        the columns that actually gate redemption. */}
                    once per user
                    {p.max_redemptions !== null && `, cap ${p.max_redemptions} total`}
                    {p.coupon_type === "limited" && " (auto-off at cap)"}
                  </td>
                  <td className="py-1.5 pr-4">
                    {redemptions}
                    {p.max_redemptions !== null && ` / ${p.max_redemptions}`}
                  </td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{day(p.valid_till)}</td>
                  <td className="py-1.5 pr-4">
                    <StatusChip status={status} />
                  </td>
                  <td className="py-1.5 text-right">
                    {/* Reactivating an exhausted/expired code is allowed but
                        pointless (cap and expiry still refuse) — only offer
                        the toggle where it changes behavior. */}
                    {(status === "live" || status === "suspended") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={toggling === p.id}
                        onClick={() => void toggleCoupon(p)}
                      >
                        {toggling === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : status === "suspended" ? (
                          "Reactivate"
                        ) : (
                          "Deactivate"
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Roughly a third of pre-2026 redemptions predate the ledger&apos;s
            coupon type and have no transaction row — a missing row means the
            ledger cannot answer, not that no credit was granted.
          </p>
        </div>
      </TabsContent>

      {creating && (
        <CreateDiscountDialog
          serviceTypes={serviceTypes}
          onClose={(changed) => {
            setCreating(false);
            if (changed) router.refresh();
          }}
        />
      )}
      {creatingCoupon && (
        <CreateCouponDialog
          onClose={(changed) => {
            setCreatingCoupon(false);
            if (changed) router.refresh();
          }}
        />
      )}
    </Tabs>
  );
}

const COUPON_SEMANTICS = [
  { id: "one_time", label: "One-time — a single redemption, total" },
  { id: "capped", label: "Capped — once per user, N redemptions total" },
  { id: "uncapped", label: "Uncapped — once per user, no total limit" },
] as const;

function CreateCouponDialog({ onClose }: { onClose: (changed: boolean) => void }) {
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [semantics, setSemantics] =
    useState<(typeof COUPON_SEMANTICS)[number]["id"]>("one_time");
  const [cap, setCap] = useState("");
  const [validTill, setValidTill] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amountNum = Number(amount);
  const capNum = Number(cap);
  const valid =
    /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    validTill.length > 0 &&
    (semantics !== "capped" || (Number.isInteger(capNum) && capNum >= 1));

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          amount: amountNum,
          semantics,
          cap: semantics === "capped" ? capNum : undefined,
          validTill,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "Create failed");
        return;
      }
      toast.success(`Coupon ${code} created`);
      onClose(true);
    } catch {
      toast.error("Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New coupon</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Credit ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5.00"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Semantics</Label>
            <Select
              value={semantics}
              onValueChange={(v) => setSemantics(v as typeof semantics)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUPON_SEMANTICS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {semantics === "capped" && (
              <div className="space-y-1.5">
                <Label>Total redemptions</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  placeholder="100"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Valid through (UTC day)</Label>
              <Input
                type="date"
                value={validTill}
                onChange={(e) => setValidTill(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Redemption credits the wallet instantly and is once per user
            always. Expiry is mandatory — a forgotten coupon should die on
            its own.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onClose(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!valid || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create coupon
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateDiscountDialog({
  serviceTypes,
  onClose,
}: {
  serviceTypes: string[];
  onClose: (changed: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<(typeof DISCOUNT_KINDS)[number]>("percent");
  const [value, setValue] = useState("");
  const [serviceType, setServiceType] = useState<string>("any");
  const [endsAt, setEndsAt] = useState("");
  const [maxGrants, setMaxGrants] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valueNum = Number(value);
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(valueNum) &&
    valueNum > 0 &&
    (kind !== "percent" || valueNum <= 100);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || undefined,
          kind,
          value: valueNum,
          serviceType: serviceType === "any" ? undefined : serviceType,
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
          maxGrants: maxGrants || undefined,
          priority: 0,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "Create failed");
        return;
      }
      toast.success(`Discount "${name.trim()}" created`);
      onClose(true);
    } catch {
      toast.error("Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New discount</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Launch week — 20% off GPU" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code (blank = automatic)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GPU20" />
            </div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCOUNT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                {kind === "percent" ? "Percent off" : kind === "amount_off_hour" ? "$ off per hour" : "Free hours"}
              </Label>
              <Input type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Service (blank scope = any)</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">any</SelectItem>
                  {serviceTypes.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ends (optional)</Label>
              <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Max grants (optional)</Label>
              <Input type="number" min="1" step="1" value={maxGrants} onChange={(e) => setMaxGrants(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onClose(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!valid || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create discount
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
