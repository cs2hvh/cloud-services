"use client";

// Billing & payments — editorial pill-tab nav (Balance / Coupons /
// Transactions), big Nunito balance hero, top-up form + recurring
// card, coupon redemption, and a clean transactions table. All
// Stripe / crypto / coupon / recurring wiring preserved.

import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Download,
    ExternalLink,
    Loader2,
    Receipt,
    Search,
    Shield,
    Ticket,
    Wallet,
    X,
} from "lucide-react";

import api from "@/lib/axios/axios";
import { createDepositPayment } from "@/actions/crypto-deposit";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

type Toast = { id: number; type: "success" | "error"; message: string };

interface Coupon {
    id: string;
    code: string;
    amount: number;
    valid_till: string;
    coupon_type: string;
}

interface RecurringTopup {
    id: string;
    amount: number;
    currency: string;
    interval: "week" | "month" | "year";
    status:
        | "pending"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "trialing"
        | "paused";
    cancel_at_period_end: boolean;
    stripe_subscription_id: string | null;
}

const TABS = [
    { value: "balance", label: "Balance", icon: Wallet },
    { value: "coupons", label: "Coupons", icon: Ticket },
    { value: "transactions", label: "Transactions", icon: Receipt },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function BillingTabs({
    initialBalance = 0.0,
    availableCoupons = [],
    paymentStatus,
    initialRecurring = null,
}: {
    initialBalance?: number;
    promoCredits?: number;
    topupCredits?: number;
    availableCoupons?: Coupon[];
    paymentStatus?: string | null;
    initialRecurring?: RecurringTopup | null;
}) {
    const [tab, setTab] = useState<TabValue>("balance");
    const [coupons, setCoupons] = useState<Coupon[]>(availableCoupons);
    const [amount, setAmount] = useState("");
    const [loadingTopup, setLoadingTopup] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<"stripe" | "crypto">(
        "stripe",
    );
    const [balance, setBalance] = useState<number>(initialBalance);
    const [manualCouponCode, setManualCouponCode] = useState("");
    const [loadingManualCoupon, setLoadingManualCoupon] = useState(false);
    const [recurringTopup, setRecurringTopup] = useState<RecurringTopup | null>(
        initialRecurring,
    );
    const [recurringAmount, setRecurringAmount] = useState(
        initialRecurring ? String(initialRecurring.amount) : "",
    );
    const [recurringInterval, setRecurringInterval] = useState<
        "week" | "month" | "year"
    >(initialRecurring?.interval ?? "month");
    const [loadingRecurring, setLoadingRecurring] = useState(false);
    const [loadingCancelRecurring, setLoadingCancelRecurring] = useState(false);

    const [toasts, setToasts] = useState<Toast[]>([]);
    const pushToast = (type: Toast["type"], message: string) => {
        const id = Date.now();
        setToasts((t) => [...t, { id, type, message }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
    };

    useEffect(() => {
        if (!paymentStatus) return;
        if (paymentStatus === "success")
            pushToast("success", "Payment successful. Balance will update shortly.");
        else if (paymentStatus === "cancelled")
            pushToast("error", "Payment was cancelled.");
        else if (paymentStatus === "recurring_success")
            pushToast("success", "Auto top-up enabled.");
        else if (paymentStatus === "recurring_cancelled")
            pushToast("error", "Recurring setup was cancelled.");

        if (typeof window !== "undefined") {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.delete("status");
            nextUrl.searchParams.delete("session_id");
            const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
            window.history.replaceState({}, "", nextPath);
        }
    }, [paymentStatus]);

    const recurringConfigured =
        recurringTopup && recurringTopup.stripe_subscription_id;

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
            if (paymentMethod === "crypto") {
                const formData = new FormData();
                formData.set("amount_usd", String(parsed));
                formData.set("currency", "USDT_TRC20");
                const result = await createDepositPayment(
                    {
                        values: { amount_usd: parsed, currency: "USDT_TRC20" },
                        errors: null,
                        success: false,
                    },
                    formData,
                );
                if (result.success && result.payment_url) {
                    window.location.href = result.payment_url;
                } else {
                    const msg =
                        result.errors?.amount_usd?.[0] ??
                        result.errors?.currency?.[0] ??
                        "Failed to create crypto payment";
                    pushToast("error", msg);
                }
            } else {
                const res = await api.post("/billing/create-checkout-session", {
                    amount: parsed,
                });
                const data = res?.data;
                if (data.url) window.location.href = data.url;
                else throw new Error("No checkout URL returned");
            }
        } catch (err: unknown) {
            pushToast(
                "error",
                err instanceof Error ? err?.message : "Failed to start payment",
            );
        } finally {
            setLoadingTopup(false);
        }
    };

    const refreshRecurringTopup = async () => {
        const res = await api.get("/billing/recurring");
        if (res?.data?.success) {
            setRecurringTopup(res?.data?.data ?? null);
            if (res?.data?.data?.amount)
                setRecurringAmount(String(res?.data?.data?.amount));
            if (res?.data?.data?.interval)
                setRecurringInterval(res?.data?.data?.interval);
        }
    };

    const onEnableRecurring = async (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = Number(recurringAmount);
        if (Number.isNaN(parsed) || parsed <= 0) {
            pushToast("error", "Enter a valid recurring amount > 0");
            return;
        }
        if (parsed > 10000) {
            pushToast("error", "Maximum recurring amount is $10,000");
            return;
        }
        try {
            setLoadingRecurring(true);
            const res = await api.post(
                "/billing/recurring/create-checkout-session",
                { amount: parsed, interval: recurringInterval },
            );
            if (res?.data?.url) {
                window.location.href = res?.data?.url;
                return;
            }
            pushToast("error", "Failed to start recurring checkout");
        } finally {
            setLoadingRecurring(false);
        }
    };

    const onCancelRecurring = async () => {
        try {
            setLoadingCancelRecurring(true);
            const res = await api.post("/billing/recurring", { action: "cancel" });
            if (res?.data?.success) {
                pushToast(
                    "success",
                    "Recurring top-up will stop at period end.",
                );
                await refreshRecurringTopup();
            }
        } finally {
            setLoadingCancelRecurring(false);
        }
    };

    useEffect(() => {
        if (paymentStatus === "recurring_success") refreshRecurringTopup();
    }, [paymentStatus]);

    const handleRedeemCoupon = async (code: string) => {
        const res = await api.post("/billing/coupons/redeem", { code });
        if (res?.data?.success) {
            setBalance((prev) => res?.data?.balance ?? prev);
            setCoupons((cs) => cs.filter((c) => c.code !== code));
            pushToast(
                "success",
                res?.data?.message || "Coupon redeemed successfully",
            );
        }
    };

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
                setBalance((prev) => res?.data?.balance ?? prev);
                setCoupons((cs) => cs.filter((c) => c.code !== code));
                pushToast(
                    "success",
                    res?.data?.message || "Coupon redeemed successfully",
                );
                setManualCouponCode("");
            }
        } finally {
            setLoadingManualCoupon(false);
        }
    };

    return (
        <div className="min-w-0">
            {/* Hero */}
            <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
                Billing{" "}
                <span style={SERIF_STYLE} className="text-white/55 font-normal">
                    & payments
                </span>
                .
            </h1>
            <p
                className={`${MONO} max-w-xl text-[11.5px] text-white/45 leading-relaxed mb-10`}
            >
                Manage your balance, redeem coupons, and review every charge —
                paid via Stripe or USDT.
            </p>

            {/* Pill tab nav */}
            <div className="border-b border-white/[0.06] mb-8">
                <div className="flex items-center gap-1 -mb-px overflow-x-auto no-scrollbar">
                    {TABS.map((t) => {
                        const isActive = tab === t.value;
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.value}
                                type="button"
                                onClick={() => setTab(t.value)}
                                className={`${MONO} relative inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap`}
                                style={{
                                    color: isActive
                                        ? "#ffffff"
                                        : "rgba(255,255,255,0.45)",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive)
                                        e.currentTarget.style.color =
                                            "rgba(255,255,255,0.75)";
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive)
                                        e.currentTarget.style.color =
                                            "rgba(255,255,255,0.45)";
                                }}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {t.label}
                                {isActive && (
                                    <span
                                        className="absolute left-2 right-2 bottom-0 h-[2px]"
                                        style={{
                                            background: ACCENT,
                                            boxShadow:
                                                "0 0 8px rgba(0,149,255,0.5)",
                                        }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab content */}
            {tab === "balance" && (
                <BalanceTab
                    balance={balance}
                    amount={amount}
                    setAmount={setAmount}
                    paymentMethod={paymentMethod}
                    setPaymentMethod={setPaymentMethod}
                    onTopup={onTopup}
                    loadingTopup={loadingTopup}
                    recurringTopup={recurringTopup}
                    recurringConfigured={!!recurringConfigured}
                    recurringAmount={recurringAmount}
                    setRecurringAmount={setRecurringAmount}
                    recurringInterval={recurringInterval}
                    setRecurringInterval={setRecurringInterval}
                    onEnableRecurring={onEnableRecurring}
                    loadingRecurring={loadingRecurring}
                    onCancelRecurring={onCancelRecurring}
                    loadingCancelRecurring={loadingCancelRecurring}
                />
            )}

            {tab === "coupons" && (
                <CouponsTab
                    coupons={coupons}
                    onRedeem={handleRedeemCoupon}
                    manualCouponCode={manualCouponCode}
                    setManualCouponCode={setManualCouponCode}
                    onManualApply={handleManualCouponApply}
                    loadingManualCoupon={loadingManualCoupon}
                />
            )}

            {tab === "transactions" && <TransactionsTab />}

            {/* Toasts */}
            <div className="fixed bottom-4 right-4 z-[60] space-y-2">
                <AnimatePresence>
                    {toasts.map((t) => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className={`min-w-[240px] rounded-[6px] border shadow-xl px-4 py-3 ${MONO} text-[11.5px] ${
                                t.type === "success"
                                    ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/25"
                                    : "bg-red-500/15 text-red-100 border-red-400/25"
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

// ─── Balance tab ──────────────────────────────────────────────────

function BalanceTab({
    balance,
    amount,
    setAmount,
    paymentMethod,
    setPaymentMethod,
    onTopup,
    loadingTopup,
    recurringTopup,
    recurringConfigured,
    recurringAmount,
    setRecurringAmount,
    recurringInterval,
    setRecurringInterval,
    onEnableRecurring,
    loadingRecurring,
    onCancelRecurring,
    loadingCancelRecurring,
}: {
    balance: number;
    amount: string;
    setAmount: (v: string) => void;
    paymentMethod: "stripe" | "crypto";
    setPaymentMethod: (m: "stripe" | "crypto") => void;
    onTopup: (e: React.FormEvent) => void;
    loadingTopup: boolean;
    recurringTopup: RecurringTopup | null;
    recurringConfigured: boolean;
    recurringAmount: string;
    setRecurringAmount: (v: string) => void;
    recurringInterval: "week" | "month" | "year";
    setRecurringInterval: (v: "week" | "month" | "year") => void;
    onEnableRecurring: (e: React.FormEvent) => void;
    loadingRecurring: boolean;
    onCancelRecurring: () => void;
    loadingCancelRecurring: boolean;
}) {
    const formattedBalance = Number.isFinite(balance) ? balance : 0;
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
            {/* Balance + top-up */}
            <Section
                num="01"
                title="Available balance"
                desc="Credits available for compute, storage, and managed services."
            >
                {/* Balance hero */}
                <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden mb-5">
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(circle at 80% 0%, rgba(0,149,255,0.08), transparent 60%)",
                        }}
                    />
                    <div className="relative p-6">
                        <div
                            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}
                        >
                            Remaining balance
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span
                                style={SERIF_STYLE}
                                className="text-[24px] text-white/55 font-medium leading-none"
                            >
                                $
                            </span>
                            <span
                                style={SERIF_STYLE}
                                className="text-[54px] font-bold tabular-nums tracking-[-0.035em] text-white leading-none"
                            >
                                {formattedBalance.toFixed(2)}
                            </span>
                        </div>
                        <p
                            className={`${MONO} mt-3 text-[10.5px] text-white/40`}
                        >
                            Auto-deducted hourly for running services
                        </p>
                    </div>
                </div>

                {/* Top-up form */}
                <form onSubmit={onTopup} className="space-y-4">
                    <div>
                        <FieldLabel hint="USD · max $10,000">
                            Top up amount
                        </FieldLabel>
                        <Input
                            type="number"
                            step="0.01"
                            min="1"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="25"
                            mono
                        />
                    </div>

                    <div>
                        <FieldLabel>Payment method</FieldLabel>
                        <div className="grid grid-cols-2 gap-2">
                            <PaymentMethodCard
                                active={paymentMethod === "stripe"}
                                onClick={() => setPaymentMethod("stripe")}
                                icon={<CreditCard className="h-3.5 w-3.5" />}
                                label="Stripe"
                                desc="Card, Apple Pay, Google Pay"
                            />
                            <PaymentMethodCard
                                active={paymentMethod === "crypto"}
                                onClick={() => setPaymentMethod("crypto")}
                                icon={
                                    <span className={`${MONO} text-[11px] font-bold`}>
                                        ₿
                                    </span>
                                }
                                label="Crypto"
                                desc="USDT (TRC20) · instant"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loadingTopup}
                        className={`${MONO} w-full inline-flex h-11 items-center justify-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                        style={{
                            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                            color: "#ffffff",
                            boxShadow:
                                "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}
                        onMouseEnter={(e) => {
                            if (loadingTopup) return;
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                        }}
                        onMouseLeave={(e) => {
                            if (loadingTopup) return;
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                        }}
                    >
                        {loadingTopup ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {paymentMethod === "crypto"
                                    ? "Processing"
                                    : "Redirecting"}
                            </>
                        ) : (
                            <>
                                Pay {amount && `$${amount}`}
                                <ArrowRight className="h-3.5 w-3.5" />
                            </>
                        )}
                    </button>
                </form>
            </Section>

            {/* Auto top-up */}
            <Section
                num="02"
                title="Auto top-up"
                desc="Scheduled recurring payments to keep your balance funded."
            >
                {recurringTopup && (
                    <div className="mb-4 flex items-center justify-between gap-3 border border-white/[0.06] bg-[#111216] rounded-[6px] px-4 py-3">
                        <div className="min-w-0">
                            <div className="flex items-baseline gap-1">
                                <span
                                    style={SERIF_STYLE}
                                    className="text-[20px] font-bold tabular-nums tracking-[-0.02em] text-white"
                                >
                                    ${Number(recurringTopup.amount).toFixed(2)}
                                </span>
                                <span
                                    className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40 ml-1`}
                                >
                                    / {recurringTopup.interval}
                                </span>
                            </div>
                            <p
                                className={`${MONO} mt-1 text-[10.5px] text-white/45`}
                            >
                                {recurringTopup.cancel_at_period_end
                                    ? "Stops at end of current billing period"
                                    : recurringConfigured
                                      ? "Active subscription"
                                      : "Awaiting checkout completion"}
                            </p>
                        </div>
                        <StatusPill
                            color={
                                recurringTopup.cancel_at_period_end
                                    ? "#fbbf24"
                                    : recurringTopup.status === "active"
                                      ? "#4ade80"
                                      : "rgba(255,255,255,0.55)"
                            }
                            label={
                                recurringTopup.cancel_at_period_end
                                    ? "Canceling"
                                    : recurringTopup.status
                            }
                        />
                    </div>
                )}

                {!recurringConfigured && (
                    <form onSubmit={onEnableRecurring} className="space-y-4">
                        <div>
                            <FieldLabel hint="USD · max $10,000">
                                Recurring amount
                            </FieldLabel>
                            <Input
                                type="number"
                                step="0.01"
                                min="1"
                                value={recurringAmount}
                                onChange={(e) =>
                                    setRecurringAmount(e.target.value)
                                }
                                placeholder="50"
                                mono
                            />
                        </div>

                        <div>
                            <FieldLabel>Interval</FieldLabel>
                            <div className="grid grid-cols-3 gap-2">
                                {(
                                    [
                                        { v: "week", label: "Weekly" },
                                        { v: "month", label: "Monthly" },
                                        { v: "year", label: "Yearly" },
                                    ] as const
                                ).map((opt) => {
                                    const sel = recurringInterval === opt.v;
                                    return (
                                        <button
                                            key={opt.v}
                                            type="button"
                                            onClick={() =>
                                                setRecurringInterval(opt.v)
                                            }
                                            className={`${MONO} h-9 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold border rounded-[5px] transition-colors`}
                                            style={
                                                sel
                                                    ? {
                                                          color: ACCENT,
                                                          borderColor:
                                                              "rgba(0,149,255,0.4)",
                                                          background: ACCENT_DIM,
                                                      }
                                                    : {
                                                          color: "rgba(255,255,255,0.55)",
                                                          borderColor:
                                                              "rgba(255,255,255,0.08)",
                                                          background: "#111216",
                                                      }
                                            }
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loadingRecurring}
                            className={`${MONO} w-full inline-flex h-11 items-center justify-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold border border-white/[0.08] bg-[#111216] text-white/85 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {loadingRecurring ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Redirecting
                                </>
                            ) : (
                                <>
                                    Enable auto top-up
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </>
                            )}
                        </button>
                    </form>
                )}

                {recurringTopup &&
                    !recurringTopup.cancel_at_period_end &&
                    recurringConfigured && (
                        <button
                            type="button"
                            onClick={onCancelRecurring}
                            disabled={loadingCancelRecurring}
                            className={`${MONO} mt-3 inline-flex h-9 items-center gap-2 px-3.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold border border-red-500/25 bg-red-500/[0.06] text-red-300 hover:text-red-200 hover:bg-red-500/[0.14] rounded-[5px] transition-colors disabled:opacity-50`}
                        >
                            {loadingCancelRecurring ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            Cancel at period end
                        </button>
                    )}

                {/* Stripe info card */}
                <div className="mt-6 border border-white/[0.06] bg-[#111216] rounded-[6px] p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Shield className="h-3.5 w-3.5 text-emerald-300" />
                        <span
                            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/55`}
                        >
                            Secure payments by Stripe
                        </span>
                    </div>
                    <p
                        className={`${MONO} text-[10.5px] text-white/45 leading-relaxed`}
                    >
                        Card details never touch our servers. All payment
                        processing is handled by Stripe (PCI Level 1
                        certified). Crypto deposits are settled by our payment
                        provider.
                    </p>
                </div>
            </Section>
        </div>
    );
}

// ─── Coupons tab ──────────────────────────────────────────────────

function CouponsTab({
    coupons,
    onRedeem,
    manualCouponCode,
    setManualCouponCode,
    onManualApply,
    loadingManualCoupon,
}: {
    coupons: Coupon[];
    onRedeem: (code: string) => void;
    manualCouponCode: string;
    setManualCouponCode: (v: string) => void;
    onManualApply: (e: React.FormEvent) => void;
    loadingManualCoupon: boolean;
}) {
    return (
        <div className="min-w-0">
            <Section
                num="01"
                title="Redeem a code"
                desc="Add credit to your balance with a promotional or referral code."
            >
                <form
                    onSubmit={onManualApply}
                    className="flex flex-col sm:flex-row gap-2 max-w-[640px]"
                >
                    <Input
                        type="text"
                        value={manualCouponCode}
                        onChange={(e) =>
                            setManualCouponCode(e.target.value.toUpperCase())
                        }
                        placeholder="ENTER-COUPON-CODE"
                        mono
                        className="sm:flex-1"
                    />
                    <button
                        type="submit"
                        disabled={loadingManualCoupon}
                        className={`${MONO} inline-flex h-11 items-center justify-center gap-2 px-5 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                        style={{
                            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                            color: "#ffffff",
                            boxShadow:
                                "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}
                    >
                        {loadingManualCoupon ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Applying
                            </>
                        ) : (
                            "Apply code"
                        )}
                    </button>
                </form>
            </Section>

            <Section
                num="02"
                title="Available coupons"
                desc="Codes assigned to your account, ready to redeem."
                rightMeta={
                    coupons.length > 0
                        ? `${coupons.length} available`
                        : undefined
                }
            >
                {coupons.length === 0 ? (
                    <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-14 text-center overflow-hidden">
                        <div
                            className="pointer-events-none absolute inset-0"
                            style={{
                                background:
                                    "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%)",
                            }}
                        />
                        <div
                            className="relative z-10 h-12 w-12 mb-5 mx-auto inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]"
                            style={{ color: ACCENT }}
                        >
                            <Ticket className="h-5 w-5" />
                        </div>
                        <h3 className="relative z-10 text-[16px] font-semibold tracking-[-0.015em] text-white">
                            No coupons assigned
                        </h3>
                        <p
                            className={`${MONO} relative z-10 mt-2 max-w-md mx-auto text-[11px] text-white/45 leading-relaxed`}
                        >
                            Promotional offers and referral rewards will show
                            up here automatically.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {coupons.map((c) => (
                            <CouponCard
                                key={c.id}
                                coupon={c}
                                onRedeem={onRedeem}
                            />
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}

function CouponCard({
    coupon,
    onRedeem,
}: {
    coupon: Coupon;
    onRedeem: (code: string) => void;
}) {
    const [loading, setLoading] = useState(false);
    const handle = async () => {
        setLoading(true);
        await onRedeem(coupon.code);
        setLoading(false);
    };
    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    return (
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <code
                        className={`${MONO} text-[11px] text-white font-semibold px-1.5 py-0.5 rounded-[3px]`}
                        style={{
                            background: ACCENT_DIM,
                            border: "1px solid rgba(0,149,255,0.25)",
                            color: ACCENT,
                        }}
                    >
                        {coupon.code}
                    </code>
                    <p
                        className={`${MONO} mt-2 text-[10px] uppercase tracking-[0.12em] text-white/40`}
                    >
                        {coupon.coupon_type} · expires{" "}
                        {formatDate(coupon.valid_till)}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <div className="flex items-baseline gap-0.5 justify-end">
                        <span
                            style={SERIF_STYLE}
                            className="text-[12px] text-white/55 font-medium"
                        >
                            $
                        </span>
                        <span
                            style={SERIF_STYLE}
                            className="text-[24px] font-bold tabular-nums tracking-[-0.025em] text-white"
                        >
                            {coupon.amount}
                        </span>
                    </div>
                </div>
            </div>
            <button
                type="button"
                onClick={handle}
                disabled={loading}
                className={`${MONO} mt-auto inline-flex h-8 items-center justify-center gap-1.5 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                style={{
                    background: ACCENT,
                    color: "#ffffff",
                }}
                onMouseEnter={(e) => {
                    if (loading) return;
                    e.currentTarget.style.background = ACCENT_BRIGHT;
                }}
                onMouseLeave={(e) => {
                    if (loading) return;
                    e.currentTarget.style.background = ACCENT;
                }}
            >
                {loading ? (
                    <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Applying
                    </>
                ) : (
                    "Redeem"
                )}
            </button>
        </div>
    );
}

// ─── Transactions tab ─────────────────────────────────────────────

interface Transaction {
    id: string;
    stripe_session_id: string | null;
    stripe_invoice_id: string | null;
    amount: number;
    currency: string;
    status: string;
    type: string;
    balance_after: number | null;
    description: string | null;
    receipt_url: string | null;
    service_id: string | null;
    service_type: string | null;
    period_start: string | null;
    period_end: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

type StatusFilter = "" | "completed" | "pending" | "failed";
type TypeFilter =
    | ""
    | "topup"
    | "refund"
    | "coupon"
    | "recurring"
    | "setup"
    | "usage"
    | "purchase";
type ServiceTypeFilter =
    | ""
    | "kubernetes"
    | "database"
    | "objectspace"
    | "spectrum"
    | "platform_apps"
    | "domain";

const CREDIT_TRANSACTION_TYPES = new Set([
    "topup",
    "refund",
    "coupon",
    "recurring",
]);

function TransactionsTab() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
    const [serviceTypeFilter, setServiceTypeFilter] =
        useState<ServiceTypeFilter>("");
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
            if (serviceTypeFilter) params.set("service_type", serviceTypeFilter);
            if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                params.set("to", end.toISOString());
            }
            const res = await api.get(
                `/billing/transactions?${params.toString()}`,
            );
            const data = res?.data;
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
    }, [statusFilter, typeFilter, serviceTypeFilter, dateFrom, dateTo]);

    const clearFilters = () => {
        setStatusFilter("");
        setTypeFilter("");
        setServiceTypeFilter("");
        setDateFrom("");
        setDateTo("");
        setSearchId("");
    };

    const hasActiveFilters =
        statusFilter ||
        typeFilter ||
        serviceTypeFilter ||
        dateFrom ||
        dateTo;

    const filteredTransactions = useMemo(() => {
        if (!searchId) return transactions;
        const q = searchId.toLowerCase();
        return transactions.filter(
            (t) =>
                t.id.toLowerCase().includes(q) ||
                (t.stripe_session_id?.toLowerCase().includes(q) ?? false) ||
                (t.stripe_invoice_id?.toLowerCase().includes(q) ?? false) ||
                (t.description?.toLowerCase().includes(q) ?? false),
        );
    }, [transactions, searchId]);

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

    const statusMeta = (status: string) => {
        if (status === "completed")
            return { color: "#4ade80", label: "Completed" };
        if (status === "pending")
            return { color: "#fbbf24", label: "Pending" };
        if (status === "failed") return { color: "#f87171", label: "Failed" };
        return { color: "rgba(255,255,255,0.55)", label: status };
    };

    const typeColor = (type: string) => {
        const map: Record<string, string> = {
            topup: ACCENT,
            refund: "#a78bfa",
            coupon: "#fbbf24",
            recurring: "#06b6d4",
            setup: "#fb7185",
            usage: "#fb923c",
            purchase: "#c084fc",
        };
        return map[type] ?? "rgba(255,255,255,0.55)";
    };

    const formatAmount = (t: Transaction) => {
        const sign = CREDIT_TRANSACTION_TYPES.has(t.type) ? "+" : "-";
        return `${sign}$${t.amount.toFixed(2)}`;
    };

    const amountColor = (t: Transaction) =>
        CREDIT_TRANSACTION_TYPES.has(t.type) ? "#4ade80" : "#ffffff";

    return (
        <div className="min-w-0">
            {/* Filters */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between flex-wrap">
                <div className="flex w-full sm:w-72 items-center gap-2 border border-white/[0.08] bg-[#0d0e11] px-3 h-9 rounded-[5px]">
                    <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    <input
                        value={searchId}
                        onChange={(e) => setSearchId(e.target.value)}
                        placeholder="Search transaction ID, description…"
                        className={`${MONO} flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none`}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <FilterSelect
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v as StatusFilter)}
                        options={[
                            { value: "", label: "All statuses" },
                            { value: "completed", label: "Completed" },
                            { value: "pending", label: "Pending" },
                            { value: "failed", label: "Failed" },
                        ]}
                    />
                    <FilterSelect
                        value={typeFilter}
                        onChange={(v) => setTypeFilter(v as TypeFilter)}
                        options={[
                            { value: "", label: "All types" },
                            { value: "topup", label: "Top-up" },
                            { value: "refund", label: "Refund" },
                            { value: "coupon", label: "Coupon" },
                            { value: "recurring", label: "Recurring" },
                            { value: "setup", label: "Setup" },
                            { value: "usage", label: "Usage" },
                            { value: "purchase", label: "Purchase" },
                        ]}
                    />
                    <FilterSelect
                        value={serviceTypeFilter}
                        onChange={(v) =>
                            setServiceTypeFilter(v as ServiceTypeFilter)
                        }
                        options={[
                            { value: "", label: "All services" },
                            { value: "kubernetes", label: "Kubernetes" },
                            { value: "database", label: "Database" },
                            { value: "objectspace", label: "Object Storage" },
                            { value: "spectrum", label: "DDoS / Spectrum" },
                            { value: "platform_apps", label: "Platform Apps" },
                            { value: "domain", label: "Domains" },
                        ]}
                    />
                    <DateInput value={dateFrom} onChange={setDateFrom} />
                    <DateInput value={dateTo} onChange={setDateTo} />
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className={`${MONO} inline-flex items-center gap-1 h-9 px-3 border border-white/[0.08] bg-[#111216] text-[10.5px] uppercase tracking-[0.12em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                        >
                            <X className="h-3 w-3" /> Clear
                        </button>
                    )}
                </div>
            </div>

            <div
                className={`${MONO} flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-white/45 mb-2 px-1`}
            >
                <span>
                    {total} transaction{total !== 1 ? "s" : ""}
                </span>
                {totalPages > 1 && (
                    <span>
                        Page {page} of {totalPages}
                    </span>
                )}
            </div>

            {loading ? (
                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] flex items-center justify-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin text-white/40" />
                </div>
            ) : filteredTransactions.length === 0 ? (
                <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-14 text-center overflow-hidden">
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%)",
                        }}
                    />
                    <div
                        className="relative z-10 h-12 w-12 mb-5 mx-auto inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]"
                        style={{ color: ACCENT }}
                    >
                        <Receipt className="h-5 w-5" />
                    </div>
                    <h3 className="relative z-10 text-[16px] font-semibold tracking-[-0.015em] text-white">
                        No transactions
                    </h3>
                    <p
                        className={`${MONO} relative z-10 mt-2 text-[11px] text-white/45`}
                    >
                        {hasActiveFilters
                            ? "Try clearing the filters."
                            : "Transactions appear here after your first top-up or service charge."}
                    </p>
                </div>
            ) : (
                <>
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                        {/* Desktop table */}
                        <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
                            <ColHead>Date</ColHead>
                            <ColHead>Type</ColHead>
                            <ColHead>Description</ColHead>
                            <ColHead align="right">Amount</ColHead>
                            <ColHead align="right">Status</ColHead>
                            <ColHead align="right">Invoice</ColHead>
                        </div>
                        {filteredTransactions.map((txn) => {
                            const status = statusMeta(txn.status);
                            return (
                                <div
                                    key={txn.id}
                                    className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto] md:items-center"
                                >
                                    {/* Date */}
                                    <div className="min-w-0">
                                        <div
                                            className={`${MONO} text-[11.5px] text-white/85`}
                                        >
                                            {formatDate(txn.created_at)}
                                        </div>
                                        <div
                                            className={`${MONO} text-[10px] text-white/30 truncate uppercase tracking-[0.06em]`}
                                            title={txn.id}
                                        >
                                            {txn.id.slice(0, 8)}…
                                        </div>
                                    </div>
                                    {/* Type */}
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                            className="h-1.5 w-1.5 rounded-full shrink-0"
                                            style={{
                                                background: typeColor(txn.type),
                                                boxShadow: `0 0 5px ${typeColor(txn.type)}`,
                                            }}
                                        />
                                        <span
                                            className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold capitalize`}
                                            style={{
                                                color: typeColor(txn.type),
                                            }}
                                        >
                                            {txn.type.replace("_", " ")}
                                        </span>
                                    </div>
                                    {/* Description */}
                                    <div
                                        className={`${MONO} text-[11px] text-white/55 truncate min-w-0`}
                                        title={txn.description || ""}
                                    >
                                        {txn.description || "—"}
                                    </div>
                                    {/* Amount */}
                                    <div className="md:text-right">
                                        <span
                                            className="text-[16px] font-bold tabular-nums"
                                            style={{
                                                ...SERIF_STYLE,
                                                color: amountColor(txn),
                                            }}
                                        >
                                            {formatAmount(txn)}
                                        </span>
                                        {txn.balance_after != null && (
                                            <div
                                                className={`${MONO} text-[10px] text-white/35 mt-0.5`}
                                            >
                                                bal $
                                                {txn.balance_after.toFixed(2)}
                                            </div>
                                        )}
                                    </div>
                                    {/* Status */}
                                    <div className="md:text-right">
                                        <StatusPill
                                            color={status.color}
                                            label={status.label}
                                        />
                                    </div>
                                    {/* Invoice */}
                                    <div className="md:text-right">
                                        {txn.receipt_url ? (
                                            <a
                                                href={txn.receipt_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`${MONO} inline-flex items-center gap-1 h-7 px-2.5 text-[10px] uppercase tracking-[0.12em] font-semibold border rounded-[4px] transition-colors`}
                                                style={{
                                                    color: ACCENT,
                                                    borderColor:
                                                        "rgba(0,149,255,0.3)",
                                                    background: ACCENT_DIM,
                                                }}
                                            >
                                                <Download className="h-3 w-3" />
                                                Receipt
                                            </a>
                                        ) : (
                                            <span className="text-white/25">
                                                —
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-4">
                            <PageBtn
                                onClick={() => fetchTransactions(page - 1)}
                                disabled={page <= 1}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </PageBtn>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(
                                    (p) =>
                                        p === 1 ||
                                        p === totalPages ||
                                        Math.abs(p - page) <= 1,
                                )
                                .reduce<(number | "ellipsis")[]>(
                                    (acc, p, idx, arr) => {
                                        if (
                                            idx > 0 &&
                                            p - (arr[idx - 1] as number) > 1
                                        )
                                            acc.push("ellipsis");
                                        acc.push(p);
                                        return acc;
                                    },
                                    [],
                                )
                                .map((item, idx) =>
                                    item === "ellipsis" ? (
                                        <span
                                            key={`e-${idx}`}
                                            className={`${MONO} px-1 text-white/30 text-[11px]`}
                                        >
                                            …
                                        </span>
                                    ) : (
                                        <PageBtn
                                            key={item}
                                            active={page === item}
                                            onClick={() =>
                                                fetchTransactions(item)
                                            }
                                        >
                                            {item}
                                        </PageBtn>
                                    ),
                                )}
                            <PageBtn
                                onClick={() => fetchTransactions(page + 1)}
                                disabled={page >= totalPages}
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </PageBtn>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Reusable subcomponents ────────────────────────────────────────

function Section({
    num,
    title,
    desc,
    rightMeta,
    children,
}: {
    num: string;
    title: string;
    desc: string;
    rightMeta?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-t border-white/[0.06] py-8 first:border-t-0 first:pt-0">
            <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                    <span
                        className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30 mt-0.5`}
                    >
                        {num}
                    </span>
                    <div>
                        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">
                            {title}
                        </h2>
                        <p
                            className={`${MONO} mt-1 text-[11px] text-white/45 leading-snug max-w-[520px]`}
                        >
                            {desc}
                        </p>
                    </div>
                </div>
                {rightMeta && (
                    <span
                        className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45 tabular-nums`}
                    >
                        {rightMeta}
                    </span>
                )}
            </header>
            {children}
        </section>
    );
}

function FieldLabel({
    children,
    hint,
}: {
    children: React.ReactNode;
    hint?: string;
}) {
    return (
        <label className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-white/85">
                {children}
            </span>
            {hint && (
                <span className={`${MONO} text-[10px] text-white/35`}>
                    {hint}
                </span>
            )}
        </label>
    );
}

function Input({
    mono,
    className,
    ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
    return (
        <input
            {...rest}
            className={`${mono ? MONO : ""} w-full h-11 bg-[#0d0e11] border border-white/[0.08] text-white text-[12.5px] px-3 rounded-[6px] outline-none placeholder:text-white/25 hover:border-white/15 focus:border-[${ACCENT}] focus:shadow-[0_0_0_3px_rgba(0,149,255,0.09)] transition-all ${className ?? ""}`}
        />
    );
}

function PaymentMethodCard({
    active,
    onClick,
    icon,
    label,
    desc,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    desc: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-left border rounded-[6px] p-3 flex items-start gap-3 transition-all"
            style={
                active
                    ? {
                          borderColor: ACCENT,
                          background:
                              "linear-gradient(135deg, #111216 0%, rgba(0,149,255,0.05) 100%)",
                          boxShadow: `0 0 0 1px ${ACCENT}, 0 4px 14px rgba(0,149,255,0.08)`,
                      }
                    : {
                          borderColor: "rgba(255,255,255,0.06)",
                          background: "#111216",
                      }
            }
        >
            <span
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center border rounded-[5px]"
                style={{
                    color: active ? ACCENT : "rgba(255,255,255,0.65)",
                    background: active ? ACCENT_DIM : "#0d0e11",
                    borderColor: active
                        ? "rgba(0,149,255,0.3)"
                        : "rgba(255,255,255,0.08)",
                }}
            >
                {icon}
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-white">
                    {label}
                </div>
                <p
                    className={`${MONO} mt-0.5 text-[10px] text-white/45 leading-snug`}
                >
                    {desc}
                </p>
            </div>
        </button>
    );
}

function StatusPill({ color, label }: { color: string; label: string }) {
    return (
        <span
            className={`${MONO} inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-semibold border rounded-[4px] capitalize whitespace-nowrap`}
            style={{
                color,
                borderColor:
                    color === "rgba(255,255,255,0.55)"
                        ? "rgba(255,255,255,0.08)"
                        : `${color}40`,
                background:
                    color === "rgba(255,255,255,0.55)" ? "#0d0e11" : `${color}10`,
            }}
        >
            <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                    background: color,
                    boxShadow:
                        color === "rgba(255,255,255,0.55)"
                            ? "none"
                            : `0 0 5px ${color}`,
                }}
            />
            {label}
        </span>
    );
}

function FilterSelect({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${MONO} h-9 bg-[#111216] border border-white/[0.08] text-white text-[11px] px-3 rounded-[5px] outline-none hover:border-white/15 cursor-pointer`}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

function DateInput({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${MONO} h-9 bg-[#111216] border border-white/[0.08] text-white text-[11px] px-3 rounded-[5px] outline-none hover:border-white/15 cursor-pointer [color-scheme:dark]`}
        />
    );
}

function ColHead({
    children,
    align = "left",
}: {
    children: React.ReactNode;
    align?: "left" | "right";
}) {
    return (
        <span
            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 ${
                align === "right" ? "text-right" : ""
            }`}
        >
            {children}
        </span>
    );
}

function PageBtn({
    children,
    onClick,
    disabled,
    active,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`${MONO} inline-flex h-9 min-w-[36px] items-center justify-center px-2 text-[11px] font-semibold border rounded-[5px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
            style={
                active
                    ? {
                          color: ACCENT,
                          borderColor: "rgba(0,149,255,0.4)",
                          background: ACCENT_DIM,
                      }
                    : {
                          color: "rgba(255,255,255,0.65)",
                          borderColor: "rgba(255,255,255,0.08)",
                          background: "#111216",
                      }
            }
        >
            {children}
        </button>
    );
}
