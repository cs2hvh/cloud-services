"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
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
  renewal_price: number | null;
  currency: string;
  provider: string;
  provider_order_id: string | null;
  provider_status: string | null;
  provider_email: string | null;
  last_error: string | null;
  failure_reason: string | null;
  last_polled_at: string | null;
  poll_count: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface EligibilityResult {
  domain: string;
  eligible: boolean;
  reason: string | null;
  transferPrice: number | null;
  renewalPrice: number | null;
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
      return "bg-[#0095FF]/15 text-[#82adfb] border-[#0095FF]/25";
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

function formatRelativeTime(value: string | null): string {
  if (!value) return "Never";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

function looksLikeRegistrableRoot(parts: string[]) {
  if (parts.length === 2) return true;
  if (parts.length !== 3) return false;
  return parts[2].length === 2 && ["ac", "co", "com", "edu", "gov", "net", "org"].includes(parts[1]);
}

function TransferActivityCard({
  transfer,
  cancellingId,
  deletingId,
  onCancel,
  onDelete,
  onRetry,
}: {
  transfer: TransferRequest;
  cancellingId: string | null;
  deletingId: string | null;
  onCancel: (transferId: string) => void;
  onDelete: (transferId: string) => void;
  onRetry: (transfer: TransferRequest) => void;
}) {
  const isActive = ["initiated", "pending", "approved"].includes(transfer.status);
  const isTerminal = ["completed", "failed", "cancelled"].includes(transfer.status);
  const nameservers = Array.isArray(transfer.metadata?.nameservers)
    ? transfer.metadata.nameservers.filter((value): value is string => typeof value === "string")
    : [];

  return (
    <div className="border border-white/[0.07] bg-white/[0.02]">
      {/* Status accent bar */}
      <div className={`h-0.5 w-full ${transfer.status === "completed" ? "bg-emerald-500/60" : transfer.status === "failed" ? "bg-red-500/60" : transfer.status === "cancelled" ? "bg-white/20" : "bg-[#0095FF]/60"}`} />

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
              {/* Always-visible fields */}
              <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Started</p>
                <p className="mt-1 break-all text-sm text-white/75">{formatDateTime(transfer.created_at)}</p>
              </div>
              <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Last status change</p>
                <p className="mt-1 break-all text-sm text-white/75">{formatDateTime(transfer.updated_at)}</p>
              </div>

              {/* Transfer fee: active → "Confirmed on initiation" or price; terminal → actual price or "—" */}
              <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Transfer fee</p>
                <p className="mt-1 break-all text-sm text-white/75">
                  {transfer.purchase_price !== null
                    ? formatCurrency(transfer.purchase_price, transfer.currency)
                    : isActive
                      ? "Confirmed on initiation"
                      : "Included in renewal"}
                </p>
              </div>

              {/* Approval email: only meaningful while waiting; hide for terminal states unless we have an address */}
              {(isActive || transfer.provider_email) && (
                <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Approval email</p>
                  <p className="mt-1 break-all text-sm text-white/75">
                    {transfer.provider_email || (isActive ? "Waiting for registrar" : "—")}
                  </p>
                </div>
              )}

              {/* Last polled: only for in-flight transfers */}
              {isActive && (
                <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Last polled</p>
                  <p className="mt-1 break-all text-sm text-white/75">
                    {transfer.last_polled_at ? formatRelativeTime(transfer.last_polled_at) : "Pending first check"}
                  </p>
                </div>
              )}

              {/* Renewal price: show once known */}
              {transfer.renewal_price !== null && (
                <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Renewal price</p>
                  <p className="mt-1 break-all text-sm text-white/75">
                    {formatCurrency(transfer.renewal_price, transfer.currency)}
                  </p>
                </div>
              )}

              {/* Order ID: show for completed/failed to help with support queries */}
              {transfer.provider_order_id && isTerminal && (
                <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Order ID</p>
                  <p className="mt-1 break-all text-sm font-mono text-white/75">{transfer.provider_order_id}</p>
                </div>
              )}
            </div>

            {(transfer.provider_status || transfer.last_error || nameservers.length > 0) && (
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
                {nameservers.length > 0 && (
                  <div className="border border-white/[0.07] bg-white/[0.03] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Nameservers</p>
                    <div className="mt-1 text-sm text-white/75 space-y-1">
                      {nameservers.map((nameserver) => (
                        <p key={nameserver}>{nameserver}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-row gap-2 lg:flex-col lg:items-end">
            {transfer.status === "completed" && (
              <Link href={`/dashboard/domains/${encodeURIComponent(transfer.domain)}`}>
                <Button variant="outline" className="border-white/15 text-white hover:bg-white/[0.08]">
                  Manage Domain
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            )}
            {transfer.status === "failed" && (
              <Button
                variant="outline"
                className="border-[#0095FF]/25 text-[#82adfb] hover:bg-[#0095FF]/10"
                onClick={() => onRetry(transfer)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
            {isActive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-red-500/25 text-red-300 hover:bg-red-500/10"
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
                    <AlertDialogCancel className="border-white/10 text-white hover:bg-white/10">Keep Transfer</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => onCancel(transfer.id)}>
                      Cancel Transfer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {/* Completed: archive the record. Domain is safe — make that explicit. */}
            {transfer.status === "completed" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-white/15 text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                    disabled={deletingId === transfer.id}
                  >
                    {deletingId === transfer.id
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Archive className="mr-2 h-4 w-4" />}
                    Archive record
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-white/10 bg-zinc-900">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Archive transfer record?</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">
                      This removes the transfer entry from your activity list.{" "}
                      <span className="font-medium text-white/85">
                        {transfer.domain} remains fully active in your account
                      </span>{" "}
                      and can still be managed from My Domains. Billing and audit records are retained.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-white/10 text-white hover:bg-white/10">Keep Visible</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-white/10 text-white hover:bg-white/20"
                      onClick={() => onDelete(transfer.id)}
                    >
                      Archive
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Failed / Cancelled: dismiss the record. No live domain to worry about. */}
            {(transfer.status === "failed" || transfer.status === "cancelled") && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-white/15 text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                    disabled={deletingId === transfer.id}
                  >
                    {deletingId === transfer.id
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <X className="mr-2 h-4 w-4" />}
                    Dismiss
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-white/10 bg-zinc-900">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Remove from history?</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">
                      Remove <span className="font-medium text-white/80">{transfer.domain}</span> from your transfer activity list. Billing and audit records are retained for account security.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-white/10 text-white hover:bg-white/10">Keep Visible</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 text-white hover:bg-red-700"
                      onClick={() => onDelete(transfer.id)}
                    >
                      Remove
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
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [contactCity, setContactCity] = useState("");
  const [contactState, setContactState] = useState("");
  const [contactZip, setContactZip] = useState("");
  const [contactCountry, setContactCountry] = useState("");
  const [stage, setStage] = useState<TransferStage>("lookup");
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoChecking, setAutoChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [eligibilityFeedback, setEligibilityFeedback] = useState<string | null>(null);
  const [submittedDomain, setSubmittedDomain] = useState<string | null>(null);
  const [activityTab, setActivityTab] = useState<"active" | "history" | "all">("active");
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const domainParam = searchParams.get("domain");
    if (domainParam) {
      const cleaned = decodeURIComponent(domainParam).trim().toLowerCase();
      if (!cleaned.includes("@") && cleaned.includes(".") && cleaned.length >= 3 && cleaned.length <= 253) {
        setDomain(cleaned);
      }
    }
  }, [searchParams]);

  const fetchTransfers = useCallback(async (isAuto = false, selectTab = false) => {
    if (isAuto) setAutoChecking(true);
    try {
      const response = await fetch("/api/domains/transfer?limit=50");
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Failed to fetch transfers");
      const fetched: TransferRequest[] = json.data || [];
      setTransfers(fetched);
      setLastCheckedAt(new Date());
      setActivityError(null);
      // Auto-select the most relevant tab on first load or after submission
      if (selectTab) {
        const hasActive = fetched.some((t) => ["initiated", "pending", "approved"].includes(t.status));
        const hasHistory = fetched.some((t) => ["completed", "failed", "cancelled"].includes(t.status));
        setActivityTab(hasActive ? "active" : hasHistory ? "history" : "all");
      }
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Failed to fetch transfers");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setAutoChecking(false);
    }
  }, []);

  // Initial load — select the right tab based on what exists
  useEffect(() => { void fetchTransfers(false, true); }, [fetchTransfers]);

  // Auto-refresh every 30s when there are active transfers; stop when all settle.
  // When an active transfer settles (completes/fails), switch the tab to history so
  // the user sees the result without a manual click.
  const prevActiveCountRef = useRef(0);
  useEffect(() => {
    const hasActive = transfers.some((t) => ["initiated", "pending", "approved"].includes(t.status));
    const activeCount = transfers.filter((t) => ["initiated", "pending", "approved"].includes(t.status)).length;

    // If we just went from having active transfers to having none, switch to history
    if (prevActiveCountRef.current > 0 && activeCount === 0 && transfers.length > 0) {
      setActivityTab("history");
    }
    prevActiveCountRef.current = activeCount;

    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }

    if (hasActive) {
      autoRefreshRef.current = setInterval(() => {
        void fetchTransfers(true);
      }, 30_000);
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [transfers, fetchTransfers]);

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
    if (!looksLikeRegistrableRoot(parts)) { setEligibilityFeedback("This looks like a subdomain. Transfers only work on root-level domains, such as yourbrand.com."); return; }

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

  function buildRegistrantContact() {
    const fields = {
      firstName: contactFirstName.trim(),
      lastName: contactLastName.trim(),
      email: contactEmail.trim(),
      phone: contactPhone.trim(),
      companyName: contactCompany.trim(),
      address1: contactAddress.trim(),
      city: contactCity.trim(),
      state: contactState.trim(),
      zip: contactZip.trim(),
      country: contactCountry.trim(),
    };
    const filled = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== ""));
    return Object.keys(filled).length > 0 ? filled : undefined;
  }

  const handleStartTransfer = useCallback(async () => {
    if (!eligibility?.eligible || !authCode.trim()) { setEligibilityFeedback("Enter the authorization code from your current registrar."); return; }
    if (authCode.trim().length < 6) { setEligibilityFeedback("Authorization code must be at least 6 characters."); return; }

    setSubmitting(true);
    try {
      const response = await fetch("/api/domains/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify((() => {
          const rc = buildRegistrantContact();
          return {
            domain: eligibility.domain,
            auth_code: authCode.trim(),
            ...(rc ? { registrant_contact: rc } : {}),
          };
        })()),
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
      setShowContactForm(false);
      setContactFirstName(""); setContactLastName(""); setContactEmail(""); setContactPhone("");
      setContactCompany(""); setContactAddress(""); setContactCity(""); setContactState("");
      setContactZip(""); setContactCountry("");
      setActivityTab("active");
      toast.success("Transfer initiated. Status updates will appear as it progresses.");
      void fetchTransfers(false, false);
    } catch {
      setEligibilityFeedback("Failed to start transfer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [authCode, eligibility, fetchTransfers,
    contactFirstName, contactLastName, contactEmail, contactPhone,
    contactCompany, contactAddress, contactCity, contactState, contactZip, contactCountry]);

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

  const handleDeleteTransfer = useCallback(async (transferId: string) => {
    setDeletingId(transferId);
    try {
      const response = await fetch(`/api/domains/transfer/${transferId}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { toast.error(json.message || "Failed to delete transfer from history."); return; }
      toast.success("Transfer deleted from history.");
      void fetchTransfers();
    } catch {
      toast.error("Failed to delete transfer from history.");
    } finally {
      setDeletingId(null);
    }
  }, [fetchTransfers]);

  const handleRetryTransfer = useCallback((transfer: TransferRequest) => {
    setDomain(transfer.domain);
    setAuthCode("");
    setEligibility(null);
    setEligibilityFeedback("Fix the registrar-side issue, then re-check eligibility and submit a fresh authorization code.");
    setStage("lookup");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const stageIndex = stage === "lookup" ? 1 : 2;
  const inputCls = "border-white/[0.08] bg-[#0d0e11] text-white placeholder:text-white/30 focus:border-white/25 transition-colors rounded-[5px] font-[var(--font-geist-mono),ui-monospace,monospace] text-[12.5px]";
  const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
  const SERIF_STYLE: React.CSSProperties = { fontFamily: "var(--font-nunito), system-ui, sans-serif" };

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer (clipped, doesn't break sticky descendants) */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">

        {/* Back link */}
        <Link
          href="/dashboard/domains"
          className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors mb-6`}
        >
          ← My domains
        </Link>

        {/* ── Hero ──────────────────────────────────────── */}
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className={`${MONO} mb-3 inline-flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
              <span className="h-px w-4 bg-white/30" />
              Domain Transfer Center
            </div>
            <h1 className="text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
              Transfer{" "}
              <span style={SERIF_STYLE} className="text-white/55 font-normal">
                an existing domain
              </span>
            </h1>
            <p className={`${MONO} mt-3 max-w-xl text-[11.5px] text-white/45 leading-relaxed`}>
              Validate eligibility · submit auth code · track to completion · most transfers complete in 5–7 days
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard/domains"
              className={`${MONO} h-10 inline-flex items-center px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
            >
              My domains
            </Link>
            <Link
              href="/dashboard/domains/marketplace"
              className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
              style={{
                background: `linear-gradient(135deg, #0095FF, #0066B3)`,
                color: "#ffffff",
                boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, #33adff, #0095FF)`;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, #0095FF, #0066B3)`;
                e.currentTarget.style.transform = "none";
              }}
            >
              Buy a new domain
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          { label: "Active", value: String(activeTransfers.length), hint: "Waiting on registrar or approval" },
          { label: "Completed", value: String(completedCount), hint: "Successfully transferred" },
          { label: "Failed", value: String(failedCount), hint: "Need code or unlock" },
          { label: "Typical window", value: "5–7", unit: "days", hint: "After approval starts" },
        ].map((stat) => (
          <div key={stat.label} className="border border-white/[0.06] bg-[#111216] rounded-[5px] p-4 flex flex-col gap-2">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>{stat.label}</p>
            <div className="flex items-baseline gap-1.5">
              <span
                style={SERIF_STYLE}
                className="text-[32px] leading-none font-bold tabular-nums tracking-[-0.03em] text-white"
              >
                {stat.value}
              </span>
              {stat.unit && (
                <span className={`${MONO} text-[11px] text-white/45`}>{stat.unit}</span>
              )}
            </div>
            <p className={`${MONO} text-[10.5px] text-white/40 mt-auto`}>{stat.hint}</p>
          </div>
        ))}
      </div>

      {/* Main two-column layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">

        {/* Transfer form */}
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
          <div className="h-px w-full bg-gradient-to-r from-[#0095FF]/40 via-[#0095FF]/10 to-transparent" />
          <div className="border-b border-white/[0.06] px-6 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
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
                { n: 1, title: "Validate domain", desc: "Confirm the domain can enter the transfer flow." },
                { n: 2, title: "Submit auth code", desc: "Start the registrar transfer with the EPP code." },
              ].map(({ n, title, desc }) => (
                <div
                  key={n}
                  className={`border rounded-[5px] p-3.5 ${stageIndex >= n ? "border-[#0095FF]/40 bg-[#0095FF]/[0.06]" : "border-white/[0.06] bg-[#0d0e11]"}`}
                  style={stageIndex >= n ? { boxShadow: `0 0 0 1px #0095FF` } : {}}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`${MONO} flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-semibold transition-all`}
                      style={
                        stageIndex >= n
                          ? { background: "#0095FF", color: "#001930", boxShadow: `0 0 0 3px rgba(0,149,255,0.18)` }
                          : { background: "#111216", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
                      }
                    >
                      {n.toString().padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold tracking-[-0.005em] text-white">{title}</p>
                      <p className={`${MONO} mt-0.5 text-[10.5px] text-white/45 leading-snug`}>{desc}</p>
                    </div>
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
              <div className="h-px w-full bg-gradient-to-r from-[#0095FF]/30 via-[#0095FF]/5 to-transparent" />
              <div className="space-y-4 p-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
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
                    className="h-12 min-w-44 bg-[#0095FF] text-white hover:bg-[#33adff] disabled:bg-white/[0.07] disabled:text-white/30"
                  >
                    {checking ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
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
                      <p className="text-xs text-white/45">
                        Renewal price: {formatCurrency(eligibility.renewalPrice, eligibility.currency)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-white/60 hover:bg-white/[0.06] hover:text-white"
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

                  {/* Optional registrant contact */}
                  <div className="border border-white/[0.07]">
                    <button
                      type="button"
                      onClick={() => setShowContactForm((v) => !v)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-white/70 hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="font-medium">
                        Registrant Contact
                        <span className="ml-2 text-[11px] font-normal text-white/40">Optional — WHOIS / ICANN records</span>
                      </span>
                      {showContactForm
                        ? <ChevronUp className="h-4 w-4 shrink-0 text-white/40" />
                        : <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />}
                    </button>

                    {showContactForm && (
                      <div className="border-t border-white/[0.07] px-4 pb-4 pt-3">
                        <p className="mb-3 text-xs text-white/40">
                          Applied when the transfer completes. Leave blank to use your account email and platform address defaults.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ["First Name", contactFirstName, setContactFirstName, "col-span-1", "text"],
                            ["Last Name", contactLastName, setContactLastName, "col-span-1", "text"],
                            ["Email", contactEmail, setContactEmail, "col-span-2", "email"],
                            ["Phone (e.g. +1.2025551234)", contactPhone, setContactPhone, "col-span-1", "text"],
                            ["Company (optional)", contactCompany, setContactCompany, "col-span-1", "text"],
                            ["Address", contactAddress, setContactAddress, "col-span-2", "text"],
                            ["City", contactCity, setContactCity, "col-span-1", "text"],
                            ["State / Province", contactState, setContactState, "col-span-1", "text"],
                            ["ZIP / Postal Code", contactZip, setContactZip, "col-span-1", "text"],
                            ["Country Code (e.g. US)", contactCountry, setContactCountry, "col-span-1", "text"],
                          ] as const).map(([label, value, setter, span, type]) => (
                            <div key={label} className={span}>
                              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                                {label}
                              </label>
                              <input
                                type={type}
                                value={value}
                                onChange={(e) => setter(e.target.value)}
                                className="h-9 w-full border border-white/[0.08] bg-black/20 px-3 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      className="border-white/15 text-white hover:bg-white/[0.08]"
                      onClick={() => { setStage("lookup"); setAuthCode(""); setEligibilityFeedback(null); setShowContactForm(false); }}
                    >
                      Back
                    </Button>
                    <Button
                      className="bg-[#0095FF] text-white hover:bg-[#33adff] sm:flex-1 disabled:bg-white/[0.07] disabled:text-white/30"
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
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold text-white">Before You Transfer</h3>
              </div>
              <p className="mt-1 text-xs text-white/45">Complete these steps to avoid preventable failures.</p>
            </div>
            <div className="px-5 py-4 space-y-2">
              {prepChecklist.map((item) => (
                <div key={item} className="flex items-start gap-3 border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-white/65">
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Operational flow */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold text-white">How It Works</h3>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2">
              {journeySteps.map((step, i) => (
                <div
                  key={step.title}
                  className="flex gap-3 border border-white/[0.06] bg-[#0d0e11] rounded-[5px] p-3"
                >
                  <div className={`${MONO} flex h-6 w-6 shrink-0 items-center justify-center border border-white/15 bg-[#111216] rounded-[4px] text-[10.5px] font-semibold text-white/70`}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-white tracking-[-0.005em]">{step.title}</p>
                    <p className={`${MONO} mt-0.5 text-[10.5px] leading-[1.5] text-white/45`}>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Activity */}
      <div id="transfer-activity" className="mt-6 border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Transfer Activity</h2>
            <p className="mt-1 text-sm text-white/45">Current requests, status details, and completed or failed attempts.</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 self-start">
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 text-white hover:bg-white/[0.08]"
              onClick={() => { setRefreshing(true); void fetchTransfers(); }}
              disabled={refreshing || autoChecking}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing || autoChecking ? "animate-spin" : ""}`} />
              {autoChecking ? "Checking…" : "Refresh"}
            </Button>
            {lastCheckedAt && (
              <p className="text-[10px] text-white/30">
                {transfers.some((t) => ["initiated", "pending", "approved"].includes(t.status))
                  ? `Auto-updating · checked ${formatRelativeTime(lastCheckedAt.toISOString())}`
                  : `Last checked ${formatRelativeTime(lastCheckedAt.toISOString())}`}
              </p>
            )}
          </div>
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
            <Tabs value={activityTab} onValueChange={(v) => setActivityTab(v as typeof activityTab)} className="space-y-4">
              <TabsList className="h-auto flex-wrap gap-1 border border-white/[0.08] bg-white/[0.04] p-1">
                <TabsTrigger value="active" className="data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">
                  Active ({activeTransfers.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">
                  History ({historyTransfers.length})
                </TabsTrigger>
                <TabsTrigger value="all" className="data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">
                  All ({transfers.length})
                </TabsTrigger>
              </TabsList>

              {([
                {
                  value: "active",
                  items: activeTransfers,
                  emptyTitle: "No active transfers",
                  emptyMsg: "Start with the validation step above. Once submitted, progress appears here.",
                },
                {
                  value: "history",
                  items: historyTransfers,
                  emptyTitle: "No transfer history yet",
                  emptyMsg: "Completed, failed, and cancelled transfers will stay here for auditing.",
                },
                {
                  value: "all",
                  items: transfers,
                  emptyTitle: "No transfer records yet",
                  emptyMsg: "Use the form above to start your first domain transfer request.",
                },
              ] as const).map(({ value, items, emptyTitle, emptyMsg }) => (
                <TabsContent key={value} value={value} className="space-y-3">
                  {items.length > 0 ? (
                    items.map((transfer) => (
                      <TransferActivityCard
                        key={transfer.id}
                        transfer={transfer}
                        cancellingId={cancellingId}
                        deletingId={deletingId}
                        onCancel={(id) => void handleCancelTransfer(id)}
                        onDelete={(id) => void handleDeleteTransfer(id)}
                        onRetry={handleRetryTransfer}
                      />
                    ))
                  ) : (
                    <div className="border border-dashed border-white/[0.08] bg-[#111216] rounded-[6px] px-6 py-14 text-center">
                      <p className="text-[14px] font-semibold text-white">{emptyTitle}</p>
                      <p className={`${MONO} mt-2 max-w-sm mx-auto text-[11px] text-white/45 leading-relaxed`}>{emptyMsg}</p>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
