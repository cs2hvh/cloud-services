"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TransferRequest {
  id: string;
  domain: string;
  status: "initiated" | "pending" | "approved" | "completed" | "failed" | "cancelled";
  purchase_price: number | null;
  currency: string;
  provider_status: string | null;
  provider_email: string | null;
  last_error: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface EligibilityResult {
  domain: string;
  eligible: boolean;
  reason: string | null;
  transferPrice: number | null;
  currency: string;
}

type TransferStage = "lookup" | "authorize";

const prepChecklist = [
  "Unlock the domain at your current registrar.",
  "Get the EPP or authorization code for the domain.",
  "Confirm you can access the registrant or admin approval email.",
  "Check the domain has not been registered or transferred in the last 60 days.",
];

const journeySteps = [
  {
    title: "Validate eligibility",
    description: "We confirm the domain exists and is not already being transferred in your account.",
  },
  {
    title: "Submit auth code",
    description: "Your EPP code is sent securely to Name.com and cleared from our transfer record after submission.",
  },
  {
    title: "Approve by email",
    description: "The current registrar may send approval instructions to the domain contact email.",
  },
  {
    title: "Track status",
    description: "The transfer is polled in the background and updates appear here with notification and email coverage.",
  },
] as const;

function statusColor(status: TransferRequest["status"]) {
  switch (status) {
    case "initiated":
    case "pending":
      return "bg-amber-500/15 text-amber-300 border-amber-500/25";
    case "approved":
      return "bg-sky-500/15 text-sky-300 border-sky-500/25";
    case "completed":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
    case "failed":
      return "bg-red-500/15 text-red-300 border-red-500/25";
    case "cancelled":
      return "bg-white/[0.06] text-white/50 border-white/10";
  }
}

function StatusBadge({ status }: { status: TransferRequest["status"] }) {
  const icons: Record<TransferRequest["status"], React.ReactNode> = {
    initiated: <Clock3 className="h-3 w-3" />,
    pending: <Clock3 className="h-3 w-3" />,
    approved: <CheckCircle2 className="h-3 w-3" />,
    completed: <CheckCircle2 className="h-3 w-3" />,
    failed: <XCircle className="h-3 w-3" />,
    cancelled: <X className="h-3 w-3" />,
  };
  const labels: Record<TransferRequest["status"], string> = {
    initiated: "In Progress", pending: "In Progress",
    approved: "Approved", completed: "Completed",
    failed: "Failed", cancelled: "Cancelled",
  };
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${statusColor(status)}`}>
      {icons[status]}
      {labels[status]}
    </span>
  );
}

function getStatusMessage(transfer: TransferRequest): string {
  const providerStatus = transfer.provider_status?.toLowerCase() || "";
  if (transfer.status === "pending" || transfer.status === "initiated") {
    if (providerStatus.includes("retrieving email"))
      return "We are retrieving the approval contact email from the registry before the transfer can move forward.";
    if (providerStatus.includes("pending approval"))
      return transfer.provider_email
        ? `Approval is pending. The registrar should send instructions to ${transfer.provider_email}.`
        : "Approval is pending with the current registrar.";
    return "The transfer has been created and is now moving through registrar checks. Most transfers complete in 5 to 7 days.";
  }
  if (transfer.status === "approved") return "Approval has been recorded and the transfer is moving into final completion.";
  if (transfer.status === "completed") return "Transfer completed successfully. The domain is now managed in your account.";
  if (transfer.status === "failed") return transfer.last_error || "The registrar rejected the transfer. Review the error and retry after correcting the issue.";
  if (transfer.status === "cancelled") return "This transfer request was cancelled before completion.";
  return "Transfer initiated.";
}

function getTransferProgress(status: TransferRequest["status"]) {
  switch (status) {
    case "initiated": return 20;
    case "pending": return 45;
    case "approved": return 75;
    case "completed": return 100;
    default: return 100;
  }
}

function formatCurrency(amount: number | null, currency: string) {
  if (amount === null) return "Confirmed on initiation";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function TransferActivityCard({
  transfer,
  cancellingId,
  onCancel,
}: {
  transfer: TransferRequest;
  cancellingId: string | null;
  onCancel: (transferId: string) => void;
}) {
  const isActive = ["initiated", "pending", "approved"].includes(transfer.status);

  return (
    <div className="border border-white/[0.07] bg-white/[0.02]">
      {/* Status accent bar */}
      <div className={`h-0.5 w-full ${transfer.status === "completed" ? "bg-emerald-500/60" : transfer.status === "failed" ? "bg-red-500/60" : transfer.status === "cancelled" ? "bg-white/20" : "bg-cyan-500/60"}`} />

      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="font-mono text-sm font-semibold text-white">{transfer.domain}</p>
              <StatusBadge status={transfer.status} />
            </div>

            <p className="mt-2.5 text-sm leading-6 text-white/60">{getStatusMessage(transfer)}</p>

            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-white/45">
                <span>Transfer progress</span>
                <span className="tabular-nums">{getTransferProgress(transfer.status)}%</span>
              </div>
              <Progress
                value={getTransferProgress(transfer.status)}
                className="h-1.5 bg-white/[0.07] [&_[data-slot=progress-indicator]]:bg-cyan-400"
              />
            </div>

            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Started", value: formatDateTime(transfer.created_at) },
                { label: "Last update", value: formatDateTime(transfer.updated_at) },
                { label: "Transfer fee", value: formatCurrency(transfer.purchase_price, transfer.currency) },
                { label: "Approval email", value: transfer.provider_email || "Waiting for registrar" },
              ].map(({ label, value }) => (
                <div key={label} className="border border-white/[0.07] bg-white/[0.03] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
                  <p className="mt-1 break-all text-sm text-white/75">{value}</p>
                </div>
              ))}
            </div>

            {(transfer.provider_status || transfer.last_error) && (
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {transfer.provider_status && (
                  <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Registrar status</p>
                    <p className="mt-1 text-sm text-white/75">{transfer.provider_status}</p>
                  </div>
                )}
                {transfer.last_error && (
                  <div className="border border-red-500/20 bg-red-500/10 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-300/60">Last error</p>
                    <p className="mt-1 text-sm text-red-200/80">{transfer.last_error}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-row gap-2 lg:flex-col lg:items-end">
            {transfer.status === "completed" && (
              <Link href={`/dashboard/domains/${encodeURIComponent(transfer.domain)}`}>
                <Button variant="outline" className="rounded-none border-white/15 text-white hover:bg-white/[0.08]">
                  Manage Domain
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            )}
            {isActive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-none border-red-500/25 text-red-300 hover:bg-red-500/10"
                    disabled={cancellingId === transfer.id}
                  >
                    {cancellingId === transfer.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-white/10 bg-zinc-900">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Cancel transfer?</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">
                      Cancel the transfer for <span className="font-medium text-white/80">{transfer.domain}</span>? This may not be reversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-none border-white/10 text-white hover:bg-white/10">Keep Transfer</AlertDialogCancel>
                    <AlertDialogAction className="rounded-none bg-red-600 text-white hover:bg-red-700" onClick={() => onCancel(transfer.id)}>
                      Cancel Transfer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DomainTransferPage() {
  const searchParams = useSearchParams();

  const [domain, setDomain] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [showAuthCode, setShowAuthCode] = useState(false);
  const [stage, setStage] = useState<TransferStage>("lookup");
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [eligibilityFeedback, setEligibilityFeedback] = useState<string | null>(null);
  const [submittedDomain, setSubmittedDomain] = useState<string | null>(null);

  useEffect(() => {
    const domainParam = searchParams.get("domain");
    if (domainParam) {
      const cleaned = decodeURIComponent(domainParam).trim().toLowerCase();
      if (!cleaned.includes("@") && cleaned.includes(".") && cleaned.length >= 3 && cleaned.length <= 253) {
        setDomain(cleaned);
      }
    }
  }, [searchParams]);

  const fetchTransfers = useCallback(async () => {
    try {
      const response = await fetch("/api/domains/transfer?limit=50");
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Failed to fetch transfers");
      setTransfers(json.data || []);
      setActivityError(null);
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Failed to fetch transfers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchTransfers(); }, [fetchTransfers]);

  const activeTransfers = useMemo(() => transfers.filter((t) => ["initiated", "pending", "approved"].includes(t.status)), [transfers]);
  const historyTransfers = useMemo(() => transfers.filter((t) => ["completed", "failed", "cancelled"].includes(t.status)), [transfers]);
  const completedCount = useMemo(() => transfers.filter((t) => t.status === "completed").length, [transfers]);
  const failedCount = useMemo(() => transfers.filter((t) => t.status === "failed").length, [transfers]);

  function normalizeDomainInput(value: string): string {
    return value.trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/^www\./, "")
      .replace(/\/.*$/, "").replace(/\?.*$/, "").replace(/\.+$/, "");
  }

  const handleCheckEligibility = useCallback(async () => {
    const cleanDomain = normalizeDomainInput(domain);
    if (cleanDomain !== domain) setDomain(cleanDomain);
    if (!cleanDomain) { setEligibilityFeedback("Please enter a domain name."); return; }
    if (cleanDomain.includes("@")) { setEligibilityFeedback("Please enter a domain name, not an email address."); return; }
    if (!cleanDomain.includes(".")) { setEligibilityFeedback("Please enter a valid domain such as mybrand.com."); return; }
    if (cleanDomain.length < 3 || cleanDomain.length > 253) { setEligibilityFeedback("Domain must be between 3 and 253 characters."); return; }
    const parts = cleanDomain.split(".");
    if (parts.some((l) => !l || l.length > 63 || /^-|-$/.test(l) || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(l))) {
      setEligibilityFeedback("Domain contains invalid characters. Each label must start and end with a letter or number."); return;
    }
    if (parts[parts.length - 1].length < 2) { setEligibilityFeedback("Domain extension must be at least 2 characters."); return; }
    if (parts.length > 3) { setEligibilityFeedback("This looks like a subdomain. Transfers only work on root-level domains."); return; }

    setChecking(true);
    setEligibilityFeedback(null);
    setSubmittedDomain(null);
    try {
      const response = await fetch("/api/domains/transfer/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: cleanDomain }),
      });
      const json = await response.json();
      if (!response.ok) { setEligibilityFeedback(json.message || "Failed to check transfer eligibility."); return; }
      const result = json.data as EligibilityResult;
      setEligibility(result);
      if (result.eligible) { setStage("authorize"); setEligibilityFeedback(null); toast.success(`${result.domain} is eligible for transfer.`); }
      else { setStage("lookup"); setEligibilityFeedback(result.reason || "This domain is not eligible for transfer."); }
    } catch {
      setEligibilityFeedback("Failed to check domain eligibility. Please try again.");
    } finally {
      setChecking(false);
    }
  }, [domain]);

  const handleStartTransfer = useCallback(async () => {
    if (!eligibility?.eligible || !authCode.trim()) { setEligibilityFeedback("Enter the authorization code from your current registrar."); return; }
    if (authCode.trim().length < 4) { setEligibilityFeedback("Authorization code must be at least 4 characters."); return; }

    setSubmitting(true);
    try {
      const response = await fetch("/api/domains/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: eligibility.domain, auth_code: authCode.trim(), purchase_price: eligibility.transferPrice ?? undefined }),
      });
      const json = await response.json();
      if (!response.ok) {
        const errorMap: Record<string, string> = {
          TRANSFER_AUTH_CODE_INVALID: "The authorization code is invalid. Copy it again from your current registrar.",
          TRANSFER_DOMAIN_LOCKED: "The domain is locked. Unlock it at your current registrar first.",
          TRANSFER_NOT_ELIGIBLE: "The domain is not eligible for transfer right now.",
          TRANSFER_ALREADY_IN_PROGRESS: "A transfer is already in progress for this domain.",
          INSUFFICIENT_CREDITS: "Your account does not have enough credits for this transfer.",
          PROVIDER_VALIDATION_FAILED: "The registrar rejected the request. Ensure the domain is unlocked and the auth code is correct.",
        };
        setEligibilityFeedback(errorMap[json.error] || json.message || "Failed to start transfer.");
        return;
      }
      setSubmittedDomain(eligibility.domain);
      setDomain(""); setAuthCode(""); setStage("lookup"); setEligibility(null); setEligibilityFeedback(null);
      toast.success("Transfer initiated. Status updates will appear as it progresses.");
      void fetchTransfers();
    } catch {
      setEligibilityFeedback("Failed to start transfer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [authCode, eligibility, fetchTransfers]);

  const handleCancelTransfer = useCallback(async (transferId: string) => {
    setCancellingId(transferId);
    try {
      const response = await fetch(`/api/domains/transfer/${transferId}/cancel`, { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { toast.error(json.message || "Failed to cancel transfer."); return; }
      toast.success("Transfer cancelled.");
      void fetchTransfers();
    } catch {
      toast.error("Failed to cancel transfer.");
    } finally {
      setCancellingId(null);
    }
  }, [fetchTransfers]);

  const stageIndex = stage === "lookup" ? 1 : 2;
  const inputCls = "rounded-none border-white/[0.18] bg-black/35 text-white placeholder:text-white/45 focus:border-white/30 transition-colors";

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8">

      {/* Header */}
      <div className="mb-6 glass-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Domain Transfer Center</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Transfer an existing domain into your account.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
              Validate eligibility, submit your auth code, and track progress from initiation to completion. Most transfers finish in 5–7 days.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Registrar-backed workflow", "Email & dashboard updates", "Zero-downtime transfer"].map((tag) => (
                <span key={tag} className="inline-flex items-center border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/42">{tag}</span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-none border-white/15 text-white hover:bg-white/[0.08]">
                <Link href="/dashboard/domains">Open Domains</Link>
              </Button>
              <Button asChild size="sm" className="rounded-none border border-cyan-400/25 bg-cyan-500/90 text-slate-950 hover:bg-cyan-400">
                <Link href="/dashboard/domains/marketplace">
                  Buy New Domain
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Active Transfers", value: String(activeTransfers.length), hint: "Waiting on registrar or approval" },
          { label: "Completed", value: String(completedCount), hint: "Successfully transferred domains" },
          { label: "Failed", value: String(failedCount), hint: "Need corrected code or unlock" },
          { label: "Typical Window", value: "5–7 days", hint: "After approval & processing begins" },
        ].map((stat) => (
          <div key={stat.label} className="glass-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{stat.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-white tabular-nums">{stat.value}</p>
            <p className="mt-1 text-xs text-white/40">{stat.hint}</p>
          </div>
        ))}
      </div>

      {/* Main two-column layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">

        {/* Transfer form */}
        <div className="glass-panel overflow-hidden">
          <div className="h-px w-full bg-gradient-to-r from-cyan-400/40 via-cyan-300/10 to-transparent" />
          <div className="border-b border-white/[0.06] px-6 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <Image src="/dashboard-icons/domain.png" alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain opacity-70"  unoptimized />
                  <h2 className="text-lg font-semibold text-white">Start a Transfer</h2>
                </div>
                <p className="mt-1.5 text-sm text-white/50">
                  Validate the domain, submit your EPP auth code, then track progress from this page.
                </p>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs text-white/55 shrink-0">
                <p className="font-semibold text-white/80">Current step</p>
                <p className="mt-0.5">{stage === "lookup" ? "1 of 2 — Validate domain" : "2 of 2 — Submit auth code"}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Step indicators */}
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { n: 1, title: "Validate domain", desc: "Confirm the domain can enter the transfer flow.", icon: "/dashboard-icons/domain.png" },
                { n: 2, title: "Submit auth code", desc: "Start the registrar transfer with the EPP code.", icon: "/dashboard-icons/valid-keys.png" },
              ].map(({ n, title, desc, icon }) => (
                <div key={n} className={`border p-4 ${stageIndex >= n ? "border-cyan-500/25 bg-cyan-500/[0.08]" : "border-white/[0.07] bg-white/[0.03]"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center border text-sm font-semibold ${stageIndex >= n ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-200" : "border-white/15 bg-white/[0.05] text-white/50"}`}>
                      {n}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="text-xs text-white/45">{desc}</p>
                    </div>
                    <Image src={icon} alt="" width={28} height={28} className={`h-7 w-7 shrink-0 object-contain ${stageIndex >= n ? "opacity-60" : "opacity-25"}`} unoptimized />
                  </div>
                </div>
              ))}
            </div>

            {submittedDomain && (
              <Alert className="border-emerald-500/25 bg-emerald-500/10 text-emerald-50 [&>svg]:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Transfer submitted for {submittedDomain}</AlertTitle>
                <AlertDescription className="text-emerald-50/80">
                  Status updates will continue through polling, notifications, and email.
                </AlertDescription>
              </Alert>
            )}

            {eligibilityFeedback && (
              <Alert className="border-amber-500/25 bg-amber-500/10 text-amber-50 [&>svg]:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Transfer guidance</AlertTitle>
                <AlertDescription className="text-amber-50/80">{eligibilityFeedback}</AlertDescription>
              </Alert>
            )}

            {/* Domain input */}
            <div className="overflow-hidden border border-white/[0.12] bg-white/[0.04]">
              <div className="h-px w-full bg-gradient-to-r from-cyan-400/25 via-cyan-300/5 to-transparent" />
              <div className="space-y-4 p-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Image src="/dashboard-icons/domain.png" alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0 object-contain opacity-55"  unoptimized />
                  <Label htmlFor="domain" className="text-white/75">Domain name</Label>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="domain"
                    name="domainNoAuto"
                    placeholder="Enter the domain to transfer — e.g. yourbrand.com"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCheckEligibility(); } }}
                    className={`${inputCls} h-12`}
                  />
                  <Button
                    onClick={() => void handleCheckEligibility()}
                    disabled={checking || !domain.trim()}
                    className="rounded-none h-12 min-w-44 bg-cyan-500 text-black hover:bg-cyan-400 disabled:bg-white/[0.07] disabled:text-white/30"
                  >
                    {checking ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Image src="/dashboard-icons/healthy.png" alt="" width={16} height={16} className="mr-2 h-4 w-4 shrink-0 object-contain"  unoptimized />
                    )}
                    Check Eligibility
                  </Button>
                </div>
              </div>

              {eligibility && (
                <div className={`border p-4 ${eligibility.eligible ? "border-emerald-500/25 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${eligibility.eligible ? "text-emerald-200" : "text-amber-200"}`}>
                        {eligibility.eligible ? `${eligibility.domain} is eligible for transfer` : `${eligibility.domain} needs attention`}
                      </p>
                      <p className="mt-1.5 text-sm text-white/65">
                        {eligibility.eligible
                          ? "Continue with the auth code from your current registrar."
                          : eligibility.reason || "Resolve the registrar-side issue, then re-run validation."}
                      </p>
                      <p className="mt-2 text-xs text-white/45">
                        Transfer fee: {formatCurrency(eligibility.transferPrice, eligibility.currency)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-none justify-start text-white/60 hover:bg-white/[0.06] hover:text-white"
                      onClick={() => { setStage("lookup"); setEligibility(null); setAuthCode(""); setEligibilityFeedback(null); }}
                    >
                      Change domain
                    </Button>
                  </div>
                </div>
              )}

              {stage === "authorize" && eligibility?.eligible && (
                <div className="border border-white/[0.07] bg-white/[0.02] p-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Image src="/dashboard-icons/valid-keys.png" alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0 object-contain opacity-55"  unoptimized />
                      <Label htmlFor="auth-code" className="text-white/75">Authorization code (EPP code)</Label>
                    </div>
                    <div className="relative">
                      <Input
                        id="auth-code"
                        type={showAuthCode ? "text" : "password"}
                        placeholder="Paste the EPP / auth code from your registrar's domain panel"
                        value={authCode}
                        onChange={(e) => setAuthCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleStartTransfer(); } }}
                        className={`${inputCls} h-12 pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAuthCode((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/38 hover:text-white/65"
                        tabIndex={-1}
                      >
                        {showAuthCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs leading-5 text-white/45">
                      The auth code (EPP code) is typically 6–16 characters. Copy it from your registrar&apos;s domain panel.
                    </p>
                  </div>

                  <div className="grid gap-2 border border-white/[0.07] bg-white/[0.03] p-4 sm:grid-cols-3">
                    {[
                      { label: "Billing", text: "Credits are charged before registrar initiation and refunded if setup fails." },
                      { label: "Notifications", text: "Dashboard and email alerts are sent for important status changes." },
                      { label: "Approval step", text: "Watch the domain contact inbox for registrar approval instructions." },
                    ].map(({ label, text }) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
                        <p className="mt-1 text-xs text-white/60">{text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      className="rounded-none border-white/15 text-white hover:bg-white/[0.08]"
                      onClick={() => { setStage("lookup"); setAuthCode(""); setEligibilityFeedback(null); }}
                    >
                      Back
                    </Button>
                    <Button
                      className="rounded-none bg-cyan-500 text-black hover:bg-cyan-400 sm:flex-1 disabled:bg-white/[0.07] disabled:text-white/30"
                      onClick={() => void handleStartTransfer()}
                      disabled={submitting || !authCode.trim() || authCode.trim().length < 6}
                    >
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                      Start Transfer
                    </Button>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          {/* Before you transfer */}
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Image src="/dashboard-icons/ip-firewall.png" alt="" width={18} height={18} className="h-5 w-5 shrink-0 object-contain opacity-70"  unoptimized />
                <h3 className="text-sm font-semibold text-white">Before You Transfer</h3>
              </div>
              <p className="mt-1 text-xs text-white/45">Complete these steps to avoid preventable failures.</p>
            </div>
            <div className="px-5 py-4 space-y-2">
              {prepChecklist.map((item) => (
                <div key={item} className="flex items-start gap-3 border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-white/65">
                  <Image src="/dashboard-icons/healthy.png" alt="" width={14} height={14} className="mt-0.5 h-3.5 w-3.5 shrink-0 object-contain opacity-70"  unoptimized />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Operational flow */}
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Image src="/dashboard-icons/configure.png" alt="" width={18} height={18} className="h-5 w-5 shrink-0 object-contain opacity-70"  unoptimized />
                <h3 className="text-sm font-semibold text-white">How It Works</h3>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2">
              {[
                { ...journeySteps[0], icon: "/dashboard-icons/domain.png" },
                { ...journeySteps[1], icon: "/dashboard-icons/valid-keys.png" },
                { ...journeySteps[2], icon: "/dashboard-icons/messages.png" },
                { ...journeySteps[3], icon: "/dashboard-icons/pending.png" },
              ].map((step, i) => (
                <div key={step.title} className="flex gap-3 border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-white/15 bg-white/[0.05] text-xs font-semibold text-white/70">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-white/50">{step.description}</p>
                  </div>
                  <Image src={step.icon} alt="" width={22} height={22} className="mt-0.5 h-5 w-5 shrink-0 object-contain opacity-35" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Activity */}
      <div id="transfer-activity" className="mt-6 glass-panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Transfer Activity</h2>
            <p className="mt-1 text-sm text-white/45">Current requests, status details, and completed or failed attempts.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-none border-white/15 text-white hover:bg-white/[0.08] self-start"
            onClick={() => { setRefreshing(true); void fetchTransfers(); }}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="px-6 py-5">
          {activityError && (
            <Alert className="mb-4 border-red-500/25 bg-red-500/10 text-red-50 [&>svg]:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unable to load transfer activity</AlertTitle>
              <AlertDescription className="text-red-50/80">{activityError}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center border border-white/[0.07] bg-white/[0.02]">
              <div className="flex items-center gap-3 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading transfer activity...
              </div>
            </div>
          ) : (
            <Tabs defaultValue="active" className="space-y-4">
              <TabsList className="h-auto flex-wrap gap-1 border border-white/[0.08] bg-white/[0.04] p-1">
                <TabsTrigger value="active" className="rounded-none data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">
                  Active ({activeTransfers.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="rounded-none data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">
                  History ({historyTransfers.length})
                </TabsTrigger>
                <TabsTrigger value="all" className="rounded-none data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">
                  All ({transfers.length})
                </TabsTrigger>
              </TabsList>

              {[
                { value: "active", items: activeTransfers, emptyIcon: <Image src="/dashboard-icons/pending.png" alt="" width={48} height={48} className="mx-auto h-12 w-12 object-contain opacity-20"  unoptimized />, emptyTitle: "No active transfers", emptyMsg: "Start with the validation step above. Once submitted, progress appears here." },
                { value: "history", items: historyTransfers, emptyIcon: <Image src="/dashboard-icons/review.png" alt="" width={48} height={48} className="mx-auto h-12 w-12 object-contain opacity-20"  unoptimized />, emptyTitle: "No transfer history yet", emptyMsg: "Completed, failed, and cancelled transfers will stay here for auditing." },
                { value: "all", items: transfers, emptyIcon: <Image src="/dashboard-icons/domain.png" alt="" width={48} height={48} className="mx-auto h-12 w-12 object-contain opacity-20"  unoptimized />, emptyTitle: "No transfer records yet", emptyMsg: "Use the form above to start your first domain transfer request." },
              ].map(({ value, items, emptyIcon, emptyTitle, emptyMsg }) => (
                <TabsContent key={value} value={value} className="space-y-3">
                  {items.length > 0 ? (
                    items.map((transfer) => (
                      <TransferActivityCard
                        key={transfer.id}
                        transfer={transfer}
                        cancellingId={cancellingId}
                        onCancel={(id) => void handleCancelTransfer(id)}
                      />
                    ))
                  ) : (
                    <div className="border border-dashed border-white/[0.08] bg-white/[0.01] px-6 py-14 text-center">
                      {emptyIcon}
                      <p className="mt-4 text-base font-semibold text-white">{emptyTitle}</p>
                      <p className="mt-2 max-w-sm mx-auto text-sm text-white/45">{emptyMsg}</p>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
