"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CreditCard, Wallet, X, Ticket } from "lucide-react";
import { z } from "zod";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import api from "@/lib/axios/axios";

type Toast = { id: number; type: "success" | "error"; message: string };

interface Coupon {
  id: string;
  code: string;
  amount: number;
  valid_till: string;
  coupon_type: string;
}

const cardSchema = z.object({
  cardNumber: z
    .string()
    .min(12, "Card number is too short")
    .max(19, "Card number is too long")
    .regex(/^\d{12,19}$/g, "Card number must be digits only"),
  expiry: z
    .string()
    .regex(/^(0[1-9]|1[0-2])\/(\d{2})$/g, "Use MM/YY format"),
  cvv: z.string().regex(/^\d{3,4}$/g, "CVV must be 3-4 digits"),
});

export default function BillingTabs({
  initialBalance = 0.0,
  promoCredits = 0,
  topupCredits = 0,
  availableCoupons = [],
}: {
  initialBalance?: number;
  promoCredits?: number;
  topupCredits?: number;
  availableCoupons?: Coupon[];
}) {
  const [tab, setTab] = useState<"balance" | "payment" | "coupons">("balance");
  const [coupons, setCoupons] = useState<Coupon[]>(availableCoupons);
  const [amount, setAmount] = useState("");
  const [loadingTopup, setLoadingTopup] = useState(false);
  const [balance, setBalance] = useState<number>(initialBalance);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: Toast["type"], message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };

  // Values from server; only remaining balance must be real
  const remaining = balance;
  console.log(remaining,"remaining balance")

  const onTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      pushToast("error", "Enter a valid amount > 0");
      return;
    }
    try {
      setLoadingTopup(true);
      const res = await api.post("/billing/topup", {
        amount: parsed,
      });
      if (res.status !== 200) throw new Error("Top-up failed");
      const data = await res.data
      if (typeof data.balance === "number") setBalance(data.balance);
      pushToast("success", "Top-up successful");
      setAmount("");
    } catch (_err: any) {
      pushToast("error", _err?.message || "Failed to top up");
    } finally {
      setLoadingTopup(false);
    }
  };

  const handleRedeemCoupon = async (code: string) => {
    try {
      const res = await api.post("/billing/coupons/redeem", { code });
      
      if (res.data.success) {
        setBalance(res.data.balance);
        setCoupons(coupons.filter((c) => c.code !== code));
        pushToast("success", res.data.message || "Coupon redeemed successfully!");
      } else {
        pushToast("error", res.data.error || "Failed to redeem coupon");
      }
    } catch (error: any) {
      pushToast("error", error.response?.data?.error || "Failed to redeem coupon");
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "balance" | "payment" | "coupons")} className="w-full">
        <TabsList className="w-full grid grid-cols-3 gap-2 bg-transparent p-0 h-auto mb-6">
          <TabsTrigger
            value="balance"
            className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
          >
            Balance
          </TabsTrigger>
          <TabsTrigger
            value="payment"
            className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
          >
            Payment Method
          </TabsTrigger>
          <TabsTrigger
            value="coupons"
            className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
          >
            Coupons
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balance" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Promo Credits" value={promoCredits} />
              <StatCard label="Top-up Credits" value={topupCredits} />
              <StatCard label="Remaining Balance" value={remaining} highlight />
            </div>

            <form onSubmit={onTopup} className="space-y-3">
              <label className="block text-sm text-gray-300">Enter amount to top up($)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                  placeholder="e.g. 25"
                />
                <button
                  disabled={loadingTopup}
                  type="submit"
                  className="cursor-pointer px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingTopup ? "Processing..." : "Top up"}
                </button>
              </div>
            </form>
          </motion.div>
        </TabsContent>

        <TabsContent value="payment" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <PaymentMethod pushToast={pushToast} />
          </motion.div>
        </TabsContent>

        <TabsContent value="coupons" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white mb-1">Available Coupons</h3>
              <p className="text-sm text-neutral-400">
                Apply coupons to add credits to your balance
              </p>
            </div>

            {coupons.length === 0 ? (
              <div className="text-center py-12 rounded-lg border border-white/10 bg-black/20">
                <Ticket className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                <p className="text-neutral-400">No coupons available at the moment</p>
                <p className="text-sm text-neutral-500 mt-1">
                  Check back later for promotional offers
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {coupons.map((coupon) => (
                  <CouponCard
                    key={coupon.id}
                    coupon={coupon}
                    onRedeem={handleRedeemCoupon}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`min-w-[240px] rounded-lg border shadow-xl px-4 py-3 backdrop-blur-xl ${
                t.type === "success"
                  ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/20"
                  : "bg-red-500/15 text-red-100 border-red-400/20"
              }`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-white/10 p-4 backdrop-blur-xl ${
        highlight ? "bg-white/5" : "bg-black/30"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">${value}</div>
    </div>
  );
}

function CouponCard({ coupon, onRedeem }: { coupon: Coupon; onRedeem: (code: string) => void }) {
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    setLoading(true);
    await onRedeem(coupon.code);
    setLoading(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  className="rounded-lg border border-white/10 bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-4 backdrop-blur-xl hover:border-white/20 transition-all"
>
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <div className="p-1.5 bg-white/10 rounded">
        <Ticket className="h-4 w-4 text-white" />
      </div>
      <code className="text-xs font-mono font-semibold text-white bg-white/10 px-2 py-0.5 rounded">
        {coupon.code}
      </code>
    </div>
    <div className="text-right">
      <div className="text-base font-bold text-white">${coupon.amount}</div>
    </div>
  </div>
  
  <div className="mb-3 pb-3 border-b border-white/10">
    <div className="flex items-center justify-between text-xs">
      <span className="text-neutral-300 capitalize">{coupon.coupon_type}</span>
      <span className="text-neutral-300">Expires: {formatDate(coupon.valid_till)}</span>
    </div>
  </div>

  <button
    onClick={handleApply}
    disabled={loading}
    className="px-3 py-1.5 rounded-md bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-all"
  >
    {loading ? "Applying..." : "Apply"}
  </button>
</motion.div>
  );
}

function PaymentMethod({ pushToast }: { pushToast: (type: Toast["type"], message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ cardNumber: "", expiry: "", cvv: "" });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = cardSchema.safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message || "Invalid details";
      pushToast("error", first);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/billing/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) throw new Error("Failed to save payment method");
      pushToast("success", "Payment method saved");
      setOpen(false);
      setForm({ cardNumber: "", expiry: "", cvv: "" });
    } catch (_err: any) {
      pushToast("error", _err?.message || "Error saving payment method");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-black/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-white font-medium">Visa •••• 4242</div>
            <div className="text-xs text-gray-400">Expires 12/29</div>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="cursor-pointer px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm"
        >
          Add Payment Method
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70]"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => !loading && setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md rounded-2xl border border-white/10 bg-black/80 backdrop-blur-2xl p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white font-medium">
                  <Wallet className="w-4 h-4" /> Add Payment Method
                </div>
                <button
                  onClick={() => !loading && setOpen(false)}
                  className="cursor-pointer p-1 rounded-md hover:bg-white/10 text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Card Number</label>
                  <input
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234123412341234"
                    value={form.cardNumber}
                    onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value.replace(/\s/g, "") }))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Expiry (MM/YY)</label>
                    <input
                      placeholder="MM/YY"
                      autoComplete="cc-exp"
                      value={form.expiry}
                      onChange={(e) => setForm((f) => ({ ...f, expiry: e.target.value }))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">CVV</label>
                    <input
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      value={form.cvv}
                      onChange={(e) => setForm((f) => ({ ...f, cvv: e.target.value }))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                    />
                  </div>
                </div>
                <button
                  disabled={loading}
                  type="submit"
                  className="cursor-pointer w-full px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving..." : "Save Payment Method"}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
