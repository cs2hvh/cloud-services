"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CreditCard, Ticket, Shield, ExternalLink, Receipt, ChevronLeft, ChevronRight, Search, X, Download } from "lucide-react";
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

export default function BillingTabs({
  initialBalance = 0.0,
  availableCoupons = [],
  paymentStatus,
}: {
  initialBalance?: number;
  promoCredits?: number;
  topupCredits?: number;
  availableCoupons?: Coupon[];
  paymentStatus?: string | null;
}) {
  const [tab, setTab] = useState<"balance" | "payment" | "coupons" | "transactions">("balance");
  const [coupons, setCoupons] = useState<Coupon[]>(availableCoupons);
  const [amount, setAmount] = useState("");
  const [loadingTopup, setLoadingTopup] = useState(false);
  const [balance, setBalance] = useState<number>(initialBalance);
  const [manualCouponCode, setManualCouponCode] = useState("");
  const [loadingManualCoupon, setLoadingManualCoupon] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: Toast["type"], message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };

  // Show toast on return from Stripe checkout
  useEffect(() => {
    if (paymentStatus === "success") {
      pushToast("success", "Payment successful! Your balance will update shortly.");
    } else if (paymentStatus === "cancelled") {
      pushToast("error", "Payment was cancelled.");
    }
  }, [paymentStatus]);

  const remaining = balance;

  const onTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      pushToast("error", "Enter a valid amount > 0");
      return;
    }
    if (parsed > 10000) {
      pushToast("error", "Maximum top-up amount is $10,000");
      return;
    }
    try {
      setLoadingTopup(true);
      const res = await api.post("/billing/create-checkout-session", {
        amount: parsed,
      });
      const data = res.data;
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (_err: unknown) {
      pushToast("error", _err instanceof Error ? _err.message : "Failed to start payment");
      setLoadingTopup(false);
    }
  };

  const handleRedeemCoupon = async (code: string) => {
    // try {
      const res = await api.post("/billing/coupons/redeem", { code });
      
      if (res.data.success) {
        setBalance(res.data.balance);
        setCoupons(coupons.filter((c) => c.code !== code));
        pushToast("success", res.data.message || "Coupon redeemed successfully!");
      }
      // } else {
      //   pushToast("error", res.data.error || "Failed to redeem coupon");
      // }
    // } catch (error: unknown) {
    //   pushToast("error", (error as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to redeem coupon");
    // }
  // };
    }

  const handleManualCouponApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCouponCode.trim();
    if (!code) {
      pushToast("error", "Please enter a coupon code");
      return;
    }
    try {
      setLoadingManualCoupon(true);
      const res = await api.post("/billing/coupons/redeem", { code });
      
      if (res?.data?.success) {
        setBalance(res.data.balance);
        setCoupons(coupons.filter((c) => c.code !== code));
        pushToast("success", res.data.message || "Coupon redeemed successfully!");
        setManualCouponCode("");
      }
      // } else {
      //   pushToast("error", res.data.error || "Failed to redeem coupon");
      // }
    }
    // } catch (error: unknown) {
    //   pushToast("error", (error as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to redeem coupon");
    // } 
    finally {
      setLoadingManualCoupon(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "balance" | "payment" | "coupons" | "transactions")} className="w-full">
        <TabsList className="w-full grid grid-cols-2 sm:grid-cols-3 gap-2 bg-transparent p-0 h-auto mb-6">
          <TabsTrigger
            value="balance"
            className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
          >
            Balance
          </TabsTrigger>
          {/* <TabsTrigger
            value="payment"
            className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
          >
            Payment Method
          </TabsTrigger> */}
          <TabsTrigger
            value="coupons"
            className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
          >
            Coupons
          </TabsTrigger>
          <TabsTrigger
            value="transactions"
            className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
          >
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balance" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* <StatCard label="Promo Credits" value={promoCredits} />
              <StatCard label="Top-up Credits" value={topupCredits} /> */}
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
                  {loadingTopup ? "Redirecting to Stripe..." : "Top up"}
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
            <PaymentMethod />
          </motion.div>
        </TabsContent>

        <TabsContent value="coupons" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Manual Coupon Code Input */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
              <h3 className="text-base font-semibold text-white mb-2">Have a Coupon Code?</h3>
              <p className="text-sm text-neutral-400 mb-3">
                Enter your coupon code below to redeem it
              </p>
              <form onSubmit={handleManualCouponApply} className="flex gap-2">
                <input
                  type="text"
                  value={manualCouponCode}
                  onChange={(e) => setManualCouponCode(e.target.value.toUpperCase())}
                  className="w-full sm:w-64 md:w-80 lg:w-auto max-w-full  bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50 font-mono"
                  placeholder="Enter coupon code"
                />
                <button
                  disabled={loadingManualCoupon}
                  type="submit"
                  className="w-24 sm:w-auto cursor-pointer px-5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {loadingManualCoupon ? "Applying..." : "Apply"}
                </button>
              </form>
            </div>

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
        <TabsContent value="transactions" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <TransactionsTab />
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

function PaymentMethod() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-white font-medium">Secure Payments by Stripe</div>
            <div className="text-xs text-gray-400">Your payment details are handled securely by Stripe</div>
          </div>
        </div>

        <div className="rounded-lg border border-white/5 bg-white/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CreditCard className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-white">Payment methods are managed during checkout</p>
              <p className="text-xs text-neutral-400 mt-1">
                When you top up your balance, you&apos;ll be redirected to Stripe&apos;s secure checkout
                where you can pay with credit card, debit card, or other supported methods.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-white">PCI-DSS Compliant</p>
              <p className="text-xs text-neutral-400 mt-1">
                Your card details never touch our servers. All payment processing is handled
                entirely by Stripe, a PCI Level 1 certified payment processor.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ExternalLink className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-white">How it works</p>
              <p className="text-xs text-neutral-400 mt-1">
                Go to the Balance tab, enter an amount, and click &quot;Top up&quot;.
                You&apos;ll be securely redirected to Stripe to complete the payment.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Transactions Tab ────────────────────────────────────────────────

interface Transaction {
  id: string;
  stripe_session_id: string | null;
  amount: number;
  currency: string;
  status: string;
  type: string;
  balance_after: number | null;
  description: string | null;
  receipt_url: string | null;
  created_at: string;
}

type StatusFilter = "" | "completed" | "pending" | "failed";
type TypeFilter = "" | "topup" | "refund" | "coupon";

function TransactionsTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchId, setSearchId] = useState("");

  const limit = 10;

  const fetchTransactions = async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(limit));
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.set("to", end.toISOString());
      }

      const res = await api.get(`/billing/transactions?${params.toString()}`);
      const data = res.data;
      setTransactions(data.data ?? []);
      setTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setPage(data.pagination?.page ?? 1);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setStatusFilter("");
    setTypeFilter("");
    setDateFrom("");
    setDateTo("");
    setSearchId("");
  };

  const hasActiveFilters = statusFilter || typeFilter || dateFrom || dateTo;

  const filteredTransactions = searchId
    ? transactions.filter(
        (t) =>
          t.id.toLowerCase().includes(searchId.toLowerCase()) ||
          (t.stripe_session_id?.toLowerCase().includes(searchId.toLowerCase()) ?? false) ||
          (t.description?.toLowerCase().includes(searchId.toLowerCase()) ?? false)
      )
    : transactions;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
      pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/20",
      failed: "bg-red-500/15 text-red-300 border-red-500/20",
    };
    return map[status] ?? "bg-white/10 text-neutral-300 border-white/10";
  };

  const typeBadge = (type: string) => {
    const map: Record<string, string> = {
      topup: "bg-blue-500/15 text-blue-300 border-blue-500/20",
      refund: "bg-purple-500/15 text-purple-300 border-purple-500/20",
      coupon: "bg-amber-500/15 text-amber-300 border-amber-500/20",
    };
    return map[type] ?? "bg-white/10 text-neutral-300 border-white/10";
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50"
              placeholder="Search by transaction ID..."
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50 cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          {/* Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50 cursor-pointer"
          >
            <option value="">All Types</option>
            <option value="topup">Top-up</option>
            <option value="refund">Refund</option>
            <option value="coupon">Coupon</option>
          </select>

          {/* Date From */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50"
            placeholder="From"
          />

          {/* Date To */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50"
            placeholder="To"
          />

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="cursor-pointer flex items-center gap-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-all"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-neutral-400 px-1">
        <span>
          {total} transaction{total !== 1 ? "s" : ""} found
        </span>
        {totalPages > 1 && (
          <span>
            Page {page} of {totalPages}
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-16 rounded-lg border border-white/10 bg-black/20">
          <Receipt className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-400">No transactions found</p>
          <p className="text-sm text-neutral-500 mt-1">
            {hasActiveFilters
              ? "Try adjusting your filters"
              : "Transactions will appear here after your first top-up"}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Transaction ID
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Invoice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTransactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-neutral-300 whitespace-nowrap">
                      {formatDate(txn.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-xs font-mono text-neutral-400">
                        {txn.id.slice(0, 8)}...
                      </code>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${typeBadge(txn.type)}`}
                      >
                        {txn.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-white">
                      {txn.type === "refund" ? "-" : "+"}${txn.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-neutral-300">
                      {txn.balance_after != null ? `$${txn.balance_after.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${statusBadge(txn.status)}`}
                      >
                        {txn.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {txn.receipt_url ? (
                        <a
                          href={txn.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20 hover:bg-blue-500/25 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          Receipt
                        </a>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filteredTransactions.map((txn) => (
              <div
                key={txn.id}
                className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{formatDate(txn.created_at)}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${statusBadge(txn.status)}`}
                  >
                    {txn.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${typeBadge(txn.type)}`}
                    >
                      {txn.type}
                    </span>
                    <code className="text-xs font-mono text-neutral-500">
                      {txn.id.slice(0, 8)}...
                    </code>
                  </div>
                  <span className="text-base font-semibold text-white">
                    {txn.type === "refund" ? "-" : "+"}${txn.amount.toFixed(2)}
                  </span>
                </div>
                {txn.balance_after != null && (
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Balance</span>
                    <span>${txn.balance_after.toFixed(2)}</span>
                  </div>
                )}
                {txn.description && (
                  <div className="text-xs text-neutral-500">
                    Code: {txn.description}
                  </div>
                )}
                {txn.receipt_url && (
                  <a
                    href={txn.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20 hover:bg-blue-500/25 transition-colors w-fit"
                  >
                    <Download className="w-3 h-3" />
                    Download Receipt
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => fetchTransactions(page - 1)}
                disabled={page <= 1}
                className="cursor-pointer p-2 rounded-lg bg-white/10 hover:bg-white/15 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
                )
                .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "ellipsis" ? (
                    <span key={`e-${idx}`} className="px-1 text-neutral-500">
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => fetchTransactions(item as number)}
                      className={`cursor-pointer min-w-[36px] h-9 rounded-lg text-sm font-medium transition-all ${
                        page === item
                          ? "bg-white text-black shadow-md"
                          : "bg-white/10 hover:bg-white/15 text-white"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              <button
                onClick={() => fetchTransactions(page + 1)}
                disabled={page >= totalPages}
                className="cursor-pointer p-2 rounded-lg bg-white/10 hover:bg-white/15 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
