"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function getStatusBadge(status: TransferRequest["status"]) {
  switch (status) {
    case "initiated":
    case "pending":
      return (
        <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-100">
          <Clock3 className="mr-1 h-3 w-3" /> In Progress
        </Badge>
      );
    case "approved":
      return (
        <Badge className="border-sky-500/30 bg-sky-500/15 text-sky-100">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Approved
        </Badge>
      );
    case "completed":
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-100">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge className="border-red-500/30 bg-red-500/15 text-red-100">
          <XCircle className="mr-1 h-3 w-3" /> Failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="border-white/20 bg-white/10 text-white/75">
          <X className="mr-1 h-3 w-3" /> Cancelled
        </Badge>
      );
  }
}

function getStatusMessage(transfer: TransferRequest): string {
  const providerStatus = transfer.provider_status?.toLowerCase() || "";

  if (transfer.status === "pending" || transfer.status === "initiated") {
    if (providerStatus.includes("retrieving email")) {
      return "We are retrieving the approval contact email from the registry before the transfer can move forward.";
    }
    if (providerStatus.includes("pending approval")) {
      return transfer.provider_email
        ? `Approval is pending. The registrar should send instructions to ${transfer.provider_email}.`
        : "Approval is pending with the current registrar.";
    }
    return "The transfer has been created and is now moving through registrar checks. Most transfers complete in 5 to 7 days.";
  }

  if (transfer.status === "approved") {
    return "Approval has been recorded and the transfer is moving into final completion.";
  }

  if (transfer.status === "completed") {
    return "Transfer completed successfully. The domain is now managed in your AhuraCloud account.";
  }

  if (transfer.status === "failed") {
    return transfer.last_error || "The registrar rejected the transfer. Review the error and retry after correcting the issue.";
  }

  if (transfer.status === "cancelled") {
    return "This transfer request was cancelled before completion.";
  }

  return "Transfer initiated.";
}

function getTransferProgress(status: TransferRequest["status"]) {
  switch (status) {
    case "initiated":
      return 20;
    case "pending":
      return 45;
    case "approved":
      return 75;
    case "completed":
      return 100;
    case "failed":
    case "cancelled":
      return 100;
  }
}

function formatCurrency(amount: number | null, currency: string) {
  if (amount === null) return "Pricing confirmed during initiation";

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TransferSummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        <p className="mt-1 text-xs text-white/55">{hint}</p>
      </CardContent>
    </Card>
  );
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
  const isActive = transfer.status === "initiated" || transfer.status === "pending" || transfer.status === "approved";

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-white">{transfer.domain}</p>
            {getStatusBadge(transfer.status)}
          </div>

          <p className="mt-3 text-sm leading-6 text-white/70">{getStatusMessage(transfer)}</p>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-white/55">
              <span>Transfer progress</span>
              <span>{getTransferProgress(transfer.status)}%</span>
            </div>
            <Progress
              value={getTransferProgress(transfer.status)}
              className="h-2 bg-white/10 [&_[data-slot=progress-indicator]]:bg-cyan-400"
            />
          </div>

          <div className="mt-4 grid gap-3 text-xs text-white/55 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Started</p>
              <p className="mt-1 text-sm text-white/80">{formatDateTime(transfer.created_at)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Last update</p>
              <p className="mt-1 text-sm text-white/80">{formatDateTime(transfer.updated_at)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Transfer fee</p>
              <p className="mt-1 text-sm text-white/80">{formatCurrency(transfer.purchase_price, transfer.currency)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Approval email</p>
              <p className="mt-1 break-all text-sm text-white/80">{transfer.provider_email || "Waiting for registrar"}</p>
            </div>
          </div>

          {(transfer.provider_status || transfer.last_error) && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {transfer.provider_status && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Registrar status</p>
                  <p className="mt-1 text-sm text-white/80">{transfer.provider_status}</p>
                </div>
              )}
              {transfer.last_error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-100/85">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-red-100/60">Last error</p>
                  <p className="mt-1 text-sm">{transfer.last_error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-row gap-2 lg:flex-col lg:items-end">
          {transfer.status === "completed" && (
            <Link href={`/dashboard/domains/${encodeURIComponent(transfer.domain)}`}>
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Manage Domain
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}

          {isActive && (
            <Button
              variant="outline"
              className="border-red-500/25 text-red-100 hover:bg-red-500/10"
              disabled={cancellingId === transfer.id}
              onClick={() => onCancel(transfer.id)}
            >
              {cancellingId === transfer.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cancel Transfer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DomainTransferPage() {
  const searchParams = useSearchParams();

  const [domain, setDomain] = useState("");
  const [authCode, setAuthCode] = useState("");
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
      setDomain(decodeURIComponent(domainParam).trim().toLowerCase());
    }
  }, [searchParams]);

  const fetchTransfers = useCallback(async () => {
    try {
      const response = await fetch("/api/domains/transfer?limit=50");
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message || "Failed to fetch transfers");
      }

      setTransfers(json.data || []);
      setActivityError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch transfers";
      setActivityError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchTransfers();
  }, [fetchTransfers]);

  const activeTransfers = useMemo(
    () => transfers.filter((transfer) => ["initiated", "pending", "approved"].includes(transfer.status)),
    [transfers]
  );

  const historyTransfers = useMemo(
    () => transfers.filter((transfer) => ["completed", "failed", "cancelled"].includes(transfer.status)),
    [transfers]
  );

  const completedCount = useMemo(
    () => transfers.filter((transfer) => transfer.status === "completed").length,
    [transfers]
  );

  const failedCount = useMemo(
    () => transfers.filter((transfer) => transfer.status === "failed").length,
    [transfers]
  );

  const handleCheckEligibility = useCallback(async () => {
    const cleanDomain = domain.trim().toLowerCase();
    if (!cleanDomain || !cleanDomain.includes(".")) {
      const message = "Please enter a valid domain name such as mybrand.com.";
      setEligibilityFeedback(message);
      toast.error(message);
      return;
    }

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

      if (!response.ok) {
        const message = json.message || "Failed to check transfer eligibility.";
        setEligibilityFeedback(message);
        toast.error(message);
        return;
      }

      const result = json.data as EligibilityResult;
      setEligibility(result);

      if (result.eligible) {
        setStage("authorize");
        setEligibilityFeedback(null);
        toast.success(`${result.domain} is eligible for transfer.`);
      } else {
        const message = result.reason || "This domain is not eligible for transfer.";
        setStage("lookup");
        setEligibilityFeedback(message);
        toast.error(message);
      }
    } catch {
      const message = "Failed to check domain eligibility. Please try again.";
      setEligibilityFeedback(message);
      toast.error(message);
    } finally {
      setChecking(false);
    }
  }, [domain]);

  const handleStartTransfer = useCallback(async () => {
    if (!eligibility?.eligible || !authCode.trim()) {
      const message = "Enter the authorization code from your current registrar before starting the transfer.";
      setEligibilityFeedback(message);
      toast.error(message);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/domains/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: eligibility.domain,
          auth_code: authCode.trim(),
          purchase_price: eligibility.transferPrice || undefined,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        const errorMap: Record<string, string> = {
          TRANSFER_AUTH_CODE_INVALID: "The authorization code is invalid. Copy it again from your current registrar and retry.",
          TRANSFER_DOMAIN_LOCKED: "The domain is locked. Unlock it at your current registrar first.",
          TRANSFER_NOT_ELIGIBLE: "The domain is not eligible for transfer right now.",
          TRANSFER_ALREADY_IN_PROGRESS: "A transfer is already in progress for this domain.",
          INSUFFICIENT_CREDITS: "Your account does not have enough credits for this transfer.",
        };

        const message = errorMap[json.error] || json.message || "Failed to start transfer.";
        setEligibilityFeedback(message);
        toast.error(message);
        return;
      }

      setSubmittedDomain(eligibility.domain);
      setDomain("");
      setAuthCode("");
      setStage("lookup");
      setEligibility(null);
      setEligibilityFeedback(null);
      toast.success("Transfer initiated. You will receive status updates as it progresses.");
      void fetchTransfers();
    } catch {
      const message = "Failed to start transfer. Please try again.";
      setEligibilityFeedback(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [authCode, eligibility, fetchTransfers]);

  const handleCancelTransfer = useCallback(async (transferId: string) => {
    setCancellingId(transferId);

    try {
      const response = await fetch(`/api/domains/transfer/${transferId}/cancel`, {
        method: "POST",
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(json.message || "Failed to cancel transfer.");
        return;
      }

      toast.success("Transfer cancelled.");
      void fetchTransfers();
    } catch {
      toast.error("Failed to cancel transfer.");
    } finally {
      setCancellingId(null);
    }
  }, [fetchTransfers]);

  const stageIndex = stage === "lookup" ? 1 : 2;

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <div className="mb-6 space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-sky-600/20 via-cyan-500/10 to-emerald-500/10 p-5 sm:p-7">
          <div className="absolute right-0 top-0 h-44 w-44 translate-x-1/4 -translate-y-1/4 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-36 w-36 -translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-400/20 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
                Domain Transfer Center
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Transfer an existing domain into your AhuraCloud account.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-[15px]">
                This page now covers the complete operational flow: eligibility check, auth code submission, approval expectations,
                transfer progress, and historical outcomes. Most transfers finish within 5 to 7 days with no downtime to the website.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-500/20 bg-cyan-500/15 text-cyan-100">Registrar-backed workflow</Badge>
                <Badge className="border-white/20 bg-white/10 text-white/90">Email and dashboard status updates</Badge>
                <Badge className="border-emerald-500/20 bg-emerald-500/15 text-emerald-100">Zero-downtime transfer path</Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/domains">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                  Open Domains Dashboard
                </Button>
              </Link>
              <Link href="/dashboard/domains/marketplace">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                  Buy New Domain
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <TransferSummaryStat
            label="Active Transfers"
            value={String(activeTransfers.length)}
            hint="Currently waiting on registrar progress or approval."
          />
          <TransferSummaryStat
            label="Completed"
            value={String(completedCount)}
            hint="Finished successfully and ready to manage from your domains dashboard."
          />
          <TransferSummaryStat
            label="Failed"
            value={String(failedCount)}
            hint="Transfers that need a corrected auth code, unlock, or registrar action."
          />
          <TransferSummaryStat
            label="Typical Window"
            value="5-7 days"
            hint="The transfer duration after approval and registrar processing begins."
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
        <Card className="glass-panel border-white/10 bg-white/[0.03]">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl text-white">
                  <ArrowRightLeft className="h-5 w-5 text-cyan-300" />
                  Start a Transfer
                </CardTitle>
                <CardDescription className="mt-2 max-w-2xl text-white/60">
                  Run the transfer in order: validate the domain, add the registrar auth code, then submit and track status from this page.
                </CardDescription>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/60">
                <p className="font-medium text-white/85">Current step</p>
                <p className="mt-1 text-white/70">{stage === "lookup" ? "1 of 2: Validate domain" : "2 of 2: Submit authorization code"}</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2">
              <div className={`rounded-xl border p-4 ${stageIndex >= 1 ? "border-cyan-500/25 bg-cyan-500/10" : "border-white/10 bg-white/5"}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/20 text-sm font-semibold text-white">
                    1
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Validate domain</p>
                    <p className="text-xs text-white/60">Confirm the domain can enter the transfer flow.</p>
                  </div>
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${stageIndex >= 2 ? "border-cyan-500/25 bg-cyan-500/10" : "border-white/10 bg-white/5"}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/20 text-sm font-semibold text-white">
                    2
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Submit auth code</p>
                    <p className="text-xs text-white/60">Start the registrar transfer with the EPP code.</p>
                  </div>
                </div>
              </div>
            </div>

            {submittedDomain && (
              <Alert className="border-emerald-500/25 bg-emerald-500/10 text-emerald-50 [&>svg]:text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Transfer submitted for {submittedDomain}</AlertTitle>
                <AlertDescription className="text-emerald-50/85">
                  The request has been created, billing was handled through the transfer service, and status updates will continue through polling, notifications, and email.
                </AlertDescription>
              </Alert>
            )}

            {eligibilityFeedback && (
              <Alert className="border-amber-500/25 bg-amber-500/10 text-amber-50 [&>svg]:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Transfer guidance</AlertTitle>
                <AlertDescription className="text-amber-50/85">{eligibilityFeedback}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-5">
              <div className="space-y-2">
                <Label htmlFor="domain" className="text-white/80">Domain name</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="domain"
                    placeholder="mybrand.com"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleCheckEligibility();
                      }
                    }}
                    className="border-white/10 bg-black/30 text-white placeholder:text-white/35"
                  />
                  <Button
                    onClick={() => void handleCheckEligibility()}
                    disabled={checking || !domain.trim()}
                    className="min-w-40 bg-cyan-500 text-black hover:bg-cyan-400"
                  >
                    {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Check Eligibility
                  </Button>
                </div>
              </div>

              {eligibility && (
                <div className={`rounded-xl border p-4 ${eligibility.eligible ? "border-emerald-500/25 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${eligibility.eligible ? "text-emerald-100" : "text-amber-100"}`}>
                        {eligibility.eligible ? `${eligibility.domain} is eligible for transfer` : `${eligibility.domain} needs attention before transfer`}
                      </p>
                      <p className="mt-2 text-sm text-white/70">
                        {eligibility.eligible
                          ? "You can continue with the auth code from your current registrar."
                          : eligibility.reason || "Resolve the registrar-side issue, then re-run validation."}
                      </p>
                      <p className="mt-3 text-xs text-white/55">
                        Transfer fee: {formatCurrency(eligibility.transferPrice, eligibility.currency)}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      className="justify-start text-white hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setStage("lookup");
                        setEligibility(null);
                        setAuthCode("");
                        setEligibilityFeedback(null);
                      }}
                    >
                      Change Domain
                    </Button>
                  </div>
                </div>
              )}

              {stage === "authorize" && eligibility?.eligible && (
                <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="auth-code" className="text-white/80">Authorization code</Label>
                    <Input
                      id="auth-code"
                      type="password"
                      placeholder="Paste the EPP or auth code"
                      value={authCode}
                      onChange={(event) => setAuthCode(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleStartTransfer();
                        }
                      }}
                      className="border-white/10 bg-black/30 text-white placeholder:text-white/35"
                    />
                    <p className="text-xs leading-5 text-white/55">
                      The auth code is sent only to the registrar adapter during transfer creation and is cleared from the request record after submission.
                    </p>
                  </div>

                  <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Billing</p>
                      <p className="mt-1 text-sm text-white/80">Credits are charged before registrar initiation and refunded if setup fails.</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Notifications</p>
                      <p className="mt-1 text-sm text-white/80">Dashboard notifications and email alerts are sent for important status changes.</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Approval step</p>
                      <p className="mt-1 text-sm text-white/80">Watch the domain contact inbox for registrar approval instructions.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      onClick={() => {
                        setStage("lookup");
                        setAuthCode("");
                        setEligibilityFeedback(null);
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      className="bg-cyan-500 text-black hover:bg-cyan-400 sm:flex-1"
                      onClick={() => void handleStartTransfer()}
                      disabled={submitting || !authCode.trim()}
                    >
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                      Start Transfer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <ShieldCheck className="h-4 w-4 text-cyan-300" />
                Before You Transfer
              </CardTitle>
              <CardDescription className="text-white/55">
                Complete these prerequisites before you submit the domain to avoid preventable transfer failures.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {prepChecklist.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/75">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <p>{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Mail className="h-4 w-4 text-cyan-300" />
                Operational Flow
              </CardTitle>
              <CardDescription className="text-white/55">
                The UI now exposes the real transfer lifecycle instead of just the submission form.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {journeySteps.map((step, index) => (
                <div key={step.title} className="relative rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xs font-semibold text-white/85">
                      {index + 1}
                    </div>
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                  </div>
                  <p className="text-sm leading-6 text-white/60">{step.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Wallet className="h-4 w-4 text-cyan-300" />
                What This Page Covers
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-white/65">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                The page now explains prep, submission, approval, tracking, and post-completion management instead of showing only a light form.
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                Active transfers are always visible in the activity area with progress, registrar state, timestamps, and cancellation actions.
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                History remains accessible even when there are no active transfers, so the screen never feels empty or incomplete.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card id="transfer-activity" className="mt-6 glass-panel border-white/10 bg-white/[0.03]">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-white">Transfer Activity</CardTitle>
            <CardDescription className="text-white/55">
              Review current requests, understand each status, and inspect completed or failed transfer attempts.
            </CardDescription>
          </div>

          <Button
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={() => {
              setRefreshing(true);
              void fetchTransfers();
            }}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Activity
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {activityError && (
            <Alert className="border-red-500/25 bg-red-500/10 text-red-50 [&>svg]:text-red-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unable to load transfer activity</AlertTitle>
              <AlertDescription className="text-red-50/85">{activityError}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-white/10 bg-black/20">
              <div className="flex items-center gap-3 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading transfer activity...
              </div>
            </div>
          ) : (
            <Tabs defaultValue="active" className="space-y-4">
              <TabsList className="h-auto flex-wrap gap-1 border border-white/10 bg-white/5 p-1">
                <TabsTrigger value="active" className="data-[state=active]:bg-white/10 text-white/80">
                  Active ({activeTransfers.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-white/10 text-white/80">
                  History ({historyTransfers.length})
                </TabsTrigger>
                <TabsTrigger value="all" className="data-[state=active]:bg-white/10 text-white/80">
                  All ({transfers.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="space-y-3">
                {activeTransfers.length > 0 ? (
                  activeTransfers.map((transfer) => (
                    <TransferActivityCard
                      key={transfer.id}
                      transfer={transfer}
                      cancellingId={cancellingId}
                      onCancel={(transferId) => void handleCancelTransfer(transferId)}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
                    <ArrowRightLeft className="mx-auto h-10 w-10 text-white/25" />
                    <p className="mt-4 text-lg font-medium text-white">No active transfers</p>
                    <p className="mt-2 text-sm text-white/55">
                      Start with the validation step above. Once submitted, this tab will show registrar progress, approval status, and cancellation controls.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="space-y-3">
                {historyTransfers.length > 0 ? (
                  historyTransfers.map((transfer) => (
                    <TransferActivityCard
                      key={transfer.id}
                      transfer={transfer}
                      cancellingId={cancellingId}
                      onCancel={(transferId) => void handleCancelTransfer(transferId)}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
                    <Clock3 className="mx-auto h-10 w-10 text-white/25" />
                    <p className="mt-4 text-lg font-medium text-white">No transfer history yet</p>
                    <p className="mt-2 text-sm text-white/55">
                      Completed, failed, and cancelled transfers will remain here so users can audit past actions and outcomes.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="all" className="space-y-3">
                {transfers.length > 0 ? (
                  transfers.map((transfer) => (
                    <TransferActivityCard
                      key={transfer.id}
                      transfer={transfer}
                      cancellingId={cancellingId}
                      onCancel={(transferId) => void handleCancelTransfer(transferId)}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
                    <AlertTriangle className="mx-auto h-10 w-10 text-white/25" />
                    <p className="mt-4 text-lg font-medium text-white">No transfer records yet</p>
                    <p className="mt-2 text-sm text-white/55">
                      This screen is no longer visually empty, but there are still no transfer records for this account. Use the transfer form above to create the first request.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
