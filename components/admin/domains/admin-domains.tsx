"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, Globe, ArrowRightLeft, ShoppingCart, LayoutDashboard,
  ChevronLeft, ChevronRight, CheckCircle2, Clock, XCircle, AlertCircle,
  Loader2, Shield, ShieldCheck, ShieldAlert, AlertTriangle, Activity,
  ExternalLink, Ban, RotateCcw, Zap, Trash2, Wifi, WifiOff,
  MoreVertical, X, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "overview" | "purchases" | "transfers" | "registered" | "activity";

type DetailEntity =
  | { kind: "purchase"; row: PurchaseRow }
  | { kind: "transfer"; row: TransferRow }
  | { kind: "registered"; row: RegisteredRow };

interface PurchaseRow {
  id: string; user_id: string; user_email: string;
  app_id: string | null; app_name: string | null; app_slug: string | null;
  domain: string; status: string;
  purchase_price: number | null; renewal_price: number | null; currency: string;
  provider: string; registrant_email: string | null;
  last_error: string | null; metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
}

interface TransferRow {
  id: string; user_id: string; user_email: string; domain: string; status: string;
  provider_order_id: string | null; provider_status: string | null; provider_email: string | null;
  purchase_price: number | null; currency: string; provider: string;
  poll_count: number; last_polled_at: string | null;
  last_error: string | null; failure_reason: string | null; metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
}

interface RegisteredRow {
  id: string; user_id: string; user_email: string;
  app_id: string; app_name: string | null; app_slug: string | null;
  domain: string; status: string; ssl_status: string; is_primary: boolean;
  redirect_to_primary: boolean;
  verified_at: string | null; activated_at: string | null; last_error: string | null;
  created_at: string;
}

interface ActivityRow {
  id: string; user_id: string; user_email?: string; user_role: string;
  action: string; service_name?: string; service_id: string;
  metadata?: Record<string, unknown>; created_at: string;
}

interface DnsResult {
  ready: boolean; resolved_ips: string[];
  expected_ips: string[]; message: string;
}

interface RegistrarSettings {
  domain: string;
  managed: boolean;
  zone?: string;
  autorenew_enabled: boolean | null;
  locked: boolean | null;
  privacy_enabled: boolean | null;
  expires_at: string | null;
  nameservers?: string[];
  nameserver_mode?: "managed" | "custom";
}

interface Meta { total: number; page: number; limit: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null, short = false): string {
  if (!d) return "—";
  const date = new Date(d);
  if (short) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtPrice(price: number | null, currency = "USD"): string {
  if (price == null || price === 0) return "—";
  return `$${Number(price).toFixed(2)} ${currency}`;
}

function relativeTime(d: string | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}d ago`;
  return fmt(d);
}

// Normalize raw registrar/provider error strings to user-readable messages
function normalizeError(raw: string | null): string | null {
  if (!raw) return null;
  const e = raw.toLowerCase();
  if (e.includes("epp") || e.includes("auth code") || e.includes("authorization code")) return "Invalid EPP / auth code";
  if (e.includes("domain locked") || e.includes("registrar lock")) return "Domain locked at registrar";
  if (e.includes("60-day") || e.includes("icann") || e.includes("recently transferred")) return "60-day ICANN transfer restriction";
  if (e.includes("nameserver") || e.includes("name server")) return "Nameserver validation failed";
  if (e.includes("transfer denied") || e.includes("denied by")) return "Transfer denied by registrar";
  if (e.includes("invalid argument") || e.includes("invalid domain") || e.includes("param")) return "Invalid domain format or parameter";
  if (e.includes("already registered") || e.includes("not available")) return "Domain not available for purchase";
  if (e.includes("insufficient") || e.includes("credit")) return "Insufficient credits";
  if (e.includes("timeout") || e.includes("timed out")) return "Registrar request timed out";
  if (e.includes("rate limit") || e.includes("too many")) return "Rate limit reached";
  // Truncate if still long
  if (raw.length > 80) return raw.slice(0, 80) + "…";
  return raw;
}

// Format metadata keys to human readable
function fmtMetaKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Format a metadata value to human-readable
function fmtMetaVal(key: string, val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (key.includes("price") || key.includes("amount")) return `$${Number(val).toFixed(2)}`;
  if (key.includes("_at") && typeof val === "string") return fmtDateTime(val);
  if (typeof val === "string" && val.length > 80) return val.slice(0, 80) + "…";
  return String(val);
}

// Keys to surface at the top of metadata display (in order)
const META_PRIORITY: Record<string, string[]> = {
  purchase: ["expires_at", "autorenew_enabled", "renewal_charged", "renewal_price", "source", "premium", "nameservers"],
  transfer: ["losing_registrar", "icann_restriction_days", "epp_verified", "nameservers"],
  registered: ["ingress_name", "namespace", "tls_secret", "certificate_status", "load_balancer_ip", "verification_token"],
};

// ── Status colors ─────────────────────────────────────────────────────────────

const PURCHASE_COLORS: Record<string, string> = {
  requested: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  processing: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  completed: "bg-green-500/15 text-green-300 border-green-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};
const TRANSFER_COLORS: Record<string, string> = {
  initiated: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  pending: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  approved: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  completed: "bg-green-500/15 text-green-300 border-green-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};
const DOMAIN_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  verified: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  active: "bg-green-500/15 text-green-300 border-green-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  removed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function StatusBadge({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  const cls = colorMap[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>{status}</span>;
}

// ── Small shared components ───────────────────────────────────────────────────

function AppPill({ name, slug }: { name: string | null; slug: string | null }) {
  if (!name) return <span className="text-white/25 text-xs italic">—</span>;
  return (
    <a href={slug ? `/dashboard/services/apps/${slug}` : "#"} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded transition-colors">
      {name}<ExternalLink className="h-2.5 w-2.5 opacity-60" />
    </a>
  );
}

function UserPill({ email }: { email: string }) {
  const isUUID = /^[0-9a-f-]{36}$/.test(email);
  return (
    <span className={`text-xs ${isUUID ? "font-mono text-white/30" : "text-white/60"}`}>
      {isUUID ? email.slice(0, 8) + "…" : email}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <Card className="bg-black/50 border-white/10 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
        <span className="text-white/55 text-sm">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </Card>
  );
}

function Pagination({ meta, onPage }: { meta: Meta; onPage: (p: number) => void }) {
  const pages = Math.ceil(meta.total / meta.limit);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-white/40">
      <span>{meta.total} total · page {meta.page} of {pages}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} className="border-white/10 bg-transparent text-white/50 hover:bg-white/5 h-8 px-3"><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" disabled={meta.page >= pages} onClick={() => onPage(meta.page + 1)} className="border-white/10 bg-transparent text-white/50 hover:bg-white/5 h-8 px-3"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

interface ConfirmAction { title: string; description: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void>; }

function ConfirmModal({ action, onClose }: { action: ConfirmAction | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  if (!action) return null;
  const run = async () => {
    setLoading(true);
    try { await action.onConfirm(); onClose(); } catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    finally { setLoading(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-950 border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            {action.danger && <AlertTriangle className="h-5 w-5 text-red-400" />}{action.title}
          </DialogTitle>
          <DialogDescription className="text-white/55 mt-1">{action.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-white/10 text-white/60">Cancel</Button>
          <Button onClick={run} disabled={loading} className={action.danger ? "bg-red-600 hover:bg-red-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : action.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Metadata display ──────────────────────────────────────────────────────────

function MetaDisplay({ meta, kind }: { meta: Record<string, unknown>; kind: "purchase" | "transfer" | "registered" }) {
  const [showRaw, setShowRaw] = useState(false);
  const priority = META_PRIORITY[kind] ?? [];
  const prioritized = priority.filter((k) => k in meta && meta[k] != null);
  const rest = Object.keys(meta).filter((k) => !priority.includes(k));
  const displayKeys = [...prioritized, ...rest].filter((k) => meta[k] != null);

  if (displayKeys.length === 0) return <span className="text-white/25 text-xs italic">No metadata</span>;

  return (
    <div className="space-y-1">
      {displayKeys.map((k) => (
        <div key={k} className="flex items-baseline gap-2">
          <span className="text-white/40 text-[11px] shrink-0 min-w-[120px]">{fmtMetaKey(k)}</span>
          <span className="text-white/75 text-[11px]">{fmtMetaVal(k, meta[k])}</span>
        </div>
      ))}
      <button onClick={() => setShowRaw((v) => !v)} className="text-[10px] text-white/25 hover:text-white/50 mt-1 underline underline-offset-2">
        {showRaw ? "Hide raw" : "View raw metadata"}
      </button>
      {showRaw && (
        <pre className="text-[10px] text-green-300/70 bg-black/40 rounded p-2 overflow-auto max-h-40 mt-1 whitespace-pre-wrap">
          {JSON.stringify(meta, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({ search, setSearch, statusFilter, setStatusFilter, onSearch, loading, onRefresh, statusOptions }: {
  search: string; setSearch: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  onSearch: () => void; loading: boolean; onRefresh: () => void;
  statusOptions: { value: string; label: string }[];
}) {
  return (
    <div className="flex gap-3 mb-5 flex-wrap">
      <div className="relative flex-1 min-w-48 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
        <Input placeholder="Search domain or email…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSearch()} className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/25 h-9" />
      </div>
      <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
        <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent className="bg-zinc-900 border-white/10 text-white">
          <SelectItem value="all">All statuses</SelectItem>
          {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={onRefresh} className="border-white/10 bg-transparent text-white/50 hover:bg-white/5 h-9 px-3">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

type DrawerTab = "overview" | "metadata" | "dns" | "registrar" | "activity";

function ActivityList({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/domains/activity?service_id=${serviceId}&limit=20`)
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>;
  if (rows.length === 0) return <p className="text-white/30 text-sm text-center py-6">No activity logged yet</p>;

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex gap-3 py-2 border-b border-white/5 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                row.action === "create" ? "bg-green-500/15 text-green-300" :
                row.action === "delete" ? "bg-red-500/15 text-red-300" :
                "bg-blue-500/15 text-blue-300"
              }`}>{row.action}</span>
              <span className="text-white/60 text-xs truncate">{row.service_name || "domain operation"}</span>
              {row.user_role === "admin" && <span className="text-[10px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">admin</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-white/30 text-[11px]">{relativeTime(row.created_at)}</span>
              {row.user_email && <span className="text-white/35 text-[11px]">· {row.user_email}</span>}
            </div>
            {row.metadata && Object.keys(row.metadata).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {Object.entries(row.metadata).slice(0, 3).map(([k, v]) => (
                  <span key={k} className="text-[10px] text-white/30">
                    <span className="text-white/20">{fmtMetaKey(k)}:</span> {String(v).slice(0, 40)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DnsCheckPanel({ domainId, domainName }: { domainId: string; domainName: string }) {
  const [result, setResult] = useState<DnsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/domains/registered/${domainId}/dns-check`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json.dns); setChecked(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "DNS check failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/70 text-sm font-medium">{domainName}</p>
          <p className="text-white/35 text-xs mt-0.5">Live DNS resolution against platform ingress IPs</p>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 h-8">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          {checked ? "Re-check" : "Check DNS"}
        </Button>
      </div>
      {result && (
        <div className={`rounded-lg border p-4 ${result.ready ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
          <div className="flex items-start gap-2">
            {result.ready
              ? <Wifi className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
              : <WifiOff className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
            <div>
              <p className={`text-sm font-medium ${result.ready ? "text-green-300" : "text-red-300"}`}>
                {result.ready ? "DNS is correctly configured" : "DNS is not pointing correctly"}
              </p>
              <p className="text-white/50 text-xs mt-1">{result.message}</p>
            </div>
          </div>
          {(result.resolved_ips.length > 0 || result.expected_ips.length > 0) && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Resolved</p>
                {result.resolved_ips.length > 0
                  ? result.resolved_ips.map((ip) => <p key={ip} className="text-xs font-mono text-white/65">{ip}</p>)
                  : <p className="text-xs text-white/25 italic">none</p>}
              </div>
              <div>
                <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Expected</p>
                {result.expected_ips.map((ip) => <p key={ip} className="text-xs font-mono text-white/65">{ip}</p>)}
              </div>
            </div>
          )}
        </div>
      )}
      {!checked && !loading && (
        <p className="text-white/25 text-xs text-center py-4">Click Check DNS to run a live DNS lookup</p>
      )}
    </div>
  );
}

function RegistrarPanel({ domainId }: { domainId: string }) {
  const [settings, setSettings] = useState<RegistrarSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [nameserverText, setNameserverText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/domains/registered/${domainId}/registrar`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSettings(json.data);
      setNameserverText((json.data?.nameservers ?? []).join("\n"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load registrar settings");
    } finally {
      setLoading(false);
    }
  }, [domainId]);

  useEffect(() => { load(); }, [load]);

  const update = async (key: "autorenew_enabled" | "locked" | "privacy_enabled", value: boolean) => {
    setSaving(key);
    try {
      const res = await fetch(`/api/admin/domains/registered/${domainId}/registrar`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSettings(json.data);
      setNameserverText((json.data?.nameservers ?? nameserverText.split(/\s+/).filter(Boolean)).join("\n"));
      toast.success(json.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update registrar settings");
    } finally {
      setSaving(null);
    }
  };

  const updateNameservers = async (mode: "managed" | "custom") => {
    setSaving("nameservers");
    try {
      const nameservers = nameserverText.split(/\s+/).map((v) => v.trim()).filter(Boolean);
      const res = await fetch(`/api/admin/domains/registered/${domainId}/registrar`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "managed" ? { nameserver_mode: "managed" } : { nameserver_mode: "custom", nameservers }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSettings(json.data);
      setNameserverText((json.data?.nameservers ?? nameservers).join("\n"));
      toast.success(json.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update nameservers");
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>;
  if (!settings) return <p className="text-white/30 text-sm text-center py-6">Registrar settings unavailable</p>;
  if (!settings.managed) return <p className="text-white/35 text-sm py-4">This domain is not managed by the platform registrar.</p>;

  const toggle = (key: "autorenew_enabled" | "locked" | "privacy_enabled", label: string, value: boolean | null) => (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0">
      <div>
        <p className="text-white/75 text-xs font-medium">{label}</p>
        <p className="text-white/35 text-[11px]">{value === null ? "Unknown" : value ? "Enabled" : "Disabled"}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={saving === key || value === null}
        onClick={() => update(key, !value)}
        className="border-white/10 bg-transparent text-white/60 hover:bg-white/5 h-8"
      >
        {saving === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : value ? "Disable" : "Enable"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.08] p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-white/75 text-sm font-medium">{settings.zone || settings.domain}</p>
            <p className="text-white/35 text-xs">Expires {fmt(settings.expires_at, true)}</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} className="border-white/10 bg-transparent text-white/50 hover:bg-white/5 h-8 px-3">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {toggle("autorenew_enabled", "Auto-renew", settings.autorenew_enabled)}
        {toggle("locked", "Registrar lock", settings.locked)}
        {toggle("privacy_enabled", "WHOIS privacy", settings.privacy_enabled)}
      </div>
      <div className="rounded-lg border border-white/[0.08] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-white/75 text-xs font-medium">Nameservers</p>
            <p className="text-white/35 text-[11px] capitalize">{settings.nameserver_mode || "unknown"} mode</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={saving === "nameservers"}
            onClick={() => updateNameservers("managed")}
            className="border-white/10 bg-transparent text-white/60 hover:bg-white/5 h-8"
          >
            Use Managed
          </Button>
        </div>
        <Textarea
          value={nameserverText}
          onChange={(e) => setNameserverText(e.target.value)}
          className="min-h-24 bg-black/40 border-white/10 text-white/70 font-mono text-xs"
          placeholder="ns1.example.com&#10;ns2.example.com"
        />
        <Button
          size="sm"
          disabled={saving === "nameservers"}
          onClick={() => updateNameservers("custom")}
          className="bg-blue-600 hover:bg-blue-700 text-white h-8"
        >
          {saving === "nameservers" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Custom Nameservers"}
        </Button>
      </div>
    </div>
  );
}

function DetailDrawer({ entity, onClose, onAction }: {
  entity: DetailEntity; onClose: () => void;
  onAction: (action: ConfirmAction) => void;
}) {
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const { kind } = entity;
  const id = entity.row.id;
  const domain = entity.row.domain;

  const drawerTabs: { id: DrawerTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "metadata", label: "Metadata" },
    ...(kind === "registered" ? [{ id: "dns" as DrawerTab, label: "DNS Check" }] : []),
    ...(kind === "registered" ? [{ id: "registrar" as DrawerTab, label: "Registrar" }] : []),
    { id: "activity", label: "Activity" },
  ];

  function OverviewSection() {
    if (kind === "purchase") {
      const r = entity.row as PurchaseRow;
      const fields: [string, string][] = [
        ["Domain", r.domain], ["Status", r.status], ["Provider", r.provider],
        ["User", r.user_email], ["Registrant", r.registrant_email || "—"],
        ["Purchase Price", fmtPrice(r.purchase_price, r.currency)],
        ["Renewal Price", fmtPrice(r.renewal_price, r.currency)],
        ["App", r.app_name || "—"], ["Created", fmtDateTime(r.created_at)],
        ["Updated", fmtDateTime(r.updated_at)],
      ];
      return <FieldList fields={fields} />;
    }
    if (kind === "transfer") {
      const r = entity.row as TransferRow;
      const err = normalizeError(r.last_error || r.failure_reason);
      const fields: [string, string][] = [
        ["Domain", r.domain], ["Status", r.status],
        ["Provider", r.provider], ["Provider Status", r.provider_status || "—"],
        ["Provider Email", r.provider_email || "—"],
        ["Order ID", r.provider_order_id || "—"],
        ["User", r.user_email], ["Price", fmtPrice(r.purchase_price, r.currency)],
        ["Registrar Sync Attempts", String(r.poll_count)],
        ["Last Sync", relativeTime(r.last_polled_at)],
        ["Created", fmtDateTime(r.created_at)],
        ...(err ? [["Error", err] as [string, string]] : []),
        ...(r.failure_reason && r.failure_reason !== r.last_error ? [["Failure Reason", r.failure_reason] as [string, string]] : []),
      ];
      return <FieldList fields={fields} />;
    }
    const r = entity.row as RegisteredRow;
    const fields: [string, string][] = [
      ["Domain", r.domain], ["Status", r.status], ["SSL", r.ssl_status],
      ["Primary", r.is_primary ? "Yes" : "No"],
      ["Redirect to Primary", r.redirect_to_primary ? "Yes" : "No"],
      ["App", r.app_name || "—"], ["User", r.user_email],
      ["Verified", fmtDateTime(r.verified_at)], ["Activated", fmtDateTime(r.activated_at)],
      ["Created", fmtDateTime(r.created_at)],
      ...(r.last_error ? [["Error", normalizeError(r.last_error) ?? r.last_error] as [string, string]] : []),
    ];
    return <FieldList fields={fields} />;
  }

  function FieldList({ fields }: { fields: [string, string][] }) {
    return (
      <div className="space-y-0">
        {fields.map(([label, value]) => (
          <div key={label} className="flex gap-4 py-2.5 border-b border-white/[0.06] last:border-0">
            <span className="text-white/40 text-xs w-32 shrink-0">{label}</span>
            <span className={`text-xs flex-1 break-all ${label === "Error" ? "text-red-400" : "text-white/75"}`}>{value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:w-[540px] bg-zinc-950 border-white/10 overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-white/[0.08]">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-white text-base font-semibold">{domain}</SheetTitle>
              <p className="text-white/40 text-xs mt-0.5 capitalize">{kind} · {entity.row.status}</p>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white/70 p-1 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        {/* Drawer tabs */}
        <div className="flex border-b border-white/[0.08] px-6">
          {drawerTabs.map((t) => (
            <button key={t.id} onClick={() => setDrawerTab(t.id)}
              className={`px-3 py-3 text-xs font-medium border-b-2 -mb-px transition-colors ${drawerTab === t.id ? "border-white text-white" : "border-transparent text-white/35 hover:text-white/60"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 flex-1 overflow-y-auto">
          {drawerTab === "overview" && <OverviewSection />}
          {drawerTab === "metadata" && (
            <MetaDisplay meta={(entity.row as PurchaseRow).metadata ?? {}} kind={kind} />
          )}
          {drawerTab === "dns" && kind === "registered" && (
            <DnsCheckPanel domainId={id} domainName={domain} />
          )}
          {drawerTab === "registrar" && kind === "registered" && (
            <RegistrarPanel domainId={id} />
          )}
          {drawerTab === "activity" && <ActivityList serviceId={id} />}
        </div>

        {/* Quick actions inside drawer */}
        <div className="px-6 py-4 border-t border-white/[0.08] flex flex-wrap gap-2">
          {kind === "purchase" && (() => {
            const r = entity.row as PurchaseRow;
            return <>
              {["requested", "processing"].includes(r.status) && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Cancel Purchase", description: `Cancel "${r.domain}"?${r.purchase_price ? ` Refund $${Number(r.purchase_price).toFixed(2)}.` : ""}`,
                  confirmLabel: "Cancel & Refund", danger: true,
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/purchases/${r.id}/cancel`, { method: "POST" });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8 text-xs"><Ban className="h-3 w-3 mr-1" />Cancel</Button>
              )}
              {r.status === "failed" && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Retry Purchase", description: `Create a new purchase attempt for "${r.domain}" and charge credits if the registrar accepts it?`,
                  confirmLabel: "Retry",
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/purchases/${r.id}/retry`, { method: "POST" });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-8 text-xs"><RotateCcw className="h-3 w-3 mr-1" />Retry</Button>
              )}
              {r.status === "completed" && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Sync Registrant Contact", description: `Push registrant contact to Name.com for "${r.domain}"?`,
                  confirmLabel: "Sync Contact",
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/purchases/${r.id}/sync-contact`, { method: "POST" });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-8 text-xs"><RefreshCw className="h-3 w-3 mr-1" />Contact</Button>
              )}
            </>;
          })()}
          {kind === "transfer" && (() => {
            const r = entity.row as TransferRow;
            const active = ["initiated", "pending", "approved"].includes(r.status);
            return <>
              <Button size="sm" variant="outline" onClick={() => onAction({
                title: "Sync Transfer", description: `Poll registrar status for "${r.domain}" now?`,
                confirmLabel: "Sync",
                onConfirm: async () => {
                  const res = await fetch(`/api/admin/domains/transfers/${r.id}/poll`, { method: "POST" });
                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                  toast.success(j.message); onClose();
                },
              })} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-8 text-xs"><RefreshCw className="h-3 w-3 mr-1" />Sync</Button>
              {active && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Cancel Transfer", description: `Cancel transfer of "${r.domain}"?${r.purchase_price ? ` Refund $${Number(r.purchase_price).toFixed(2)}.` : ""}`,
                  confirmLabel: "Cancel & Refund", danger: true,
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/transfers/${r.id}/cancel`, { method: "POST" });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8 text-xs"><Ban className="h-3 w-3 mr-1" />Cancel</Button>
              )}
            </>;
          })()}
          {kind === "registered" && (() => {
            const r = entity.row as RegisteredRow;
            return <>
              {["pending", "failed"].includes(r.status) && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Force-Verify", description: `Mark "${r.domain}" as verified without DNS check?`,
                  confirmLabel: "Force Verify",
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/registered/${r.id}/force-verify`, { method: "POST" });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-green-500/30 text-green-400 hover:bg-green-500/10 h-8 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Verify</Button>
              )}
              {r.status === "verified" && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Force-Activate", description: `Force-activate "${r.domain}"?`,
                  confirmLabel: "Activate",
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/registered/${r.id}/activate`, { method: "POST" });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-green-500/30 text-green-400 hover:bg-green-500/10 h-8 text-xs"><Zap className="h-3 w-3 mr-1" />Activate</Button>
              )}
              {r.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Check SSL", description: `Probe live SSL status for "${r.domain}"?`,
                  confirmLabel: "Check SSL",
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/registered/${r.id}/check-ssl`, { method: "POST" });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-8 text-xs"><ShieldCheck className="h-3 w-3 mr-1" />Check SSL</Button>
              )}
              {r.status === "active" && !r.is_primary && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Set Primary", description: `Make "${r.domain}" the primary domain for this app?`,
                  confirmLabel: "Set Primary",
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/registered/${r.id}/set-primary`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ redirect_to_primary: r.redirect_to_primary }),
                    });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 h-8 text-xs"><Star className="h-3 w-3 mr-1" />Primary</Button>
              )}
              {r.status !== "removed" && (
                <Button size="sm" variant="outline" onClick={() => onAction({
                  title: "Remove Connection", description: `Soft-delete "${r.domain}" from the app?`,
                  confirmLabel: "Remove", danger: true,
                  onConfirm: async () => {
                    const res = await fetch(`/api/admin/domains/registered/${r.id}/delete`, { method: "POST" });
                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                    toast.success(j.message); onClose();
                  },
                })} className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8 text-xs"><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
              )}
            </>;
          })()}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState<{ purchases: Record<string, number>; transfers: Record<string, number>; registered: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const pS = ["requested", "processing", "completed", "failed"];
        const tS = ["initiated", "pending", "approved", "completed", "failed"];
        const dS = ["pending", "verified", "active", "failed"];
        const [pr, tr, reg, pC, tC, dC] = await Promise.all([
          fetch("/api/admin/domains/purchases?limit=1").then((r) => r.json()),
          fetch("/api/admin/domains/transfers?limit=1").then((r) => r.json()),
          fetch("/api/admin/domains/registered?limit=1").then((r) => r.json()),
          Promise.all(pS.map((s) => fetch(`/api/admin/domains/purchases?status=${s}&limit=1`).then((r) => r.json()).then((j) => [s, j.meta?.total ?? 0] as [string, number]))),
          Promise.all(tS.map((s) => fetch(`/api/admin/domains/transfers?status=${s}&limit=1`).then((r) => r.json()).then((j) => [s, j.meta?.total ?? 0] as [string, number]))),
          Promise.all(dS.map((s) => fetch(`/api/admin/domains/registered?status=${s}&limit=1`).then((r) => r.json()).then((j) => [s, j.meta?.total ?? 0] as [string, number]))),
        ]);
        setStats({
          purchases: Object.fromEntries([["total", pr.meta?.total ?? 0], ...pC]),
          transfers: Object.fromEntries([["total", tr.meta?.total ?? 0], ...tC]),
          registered: Object.fromEntries([["total", reg.meta?.total ?? 0], ...dC]),
        });
      } catch { toast.error("Failed to load stats"); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>;
  if (!stats) return null;

  return (
    <div className="space-y-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-4">Purchases</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total" value={stats.purchases.total} icon={ShoppingCart} color="bg-blue-500/10 text-blue-400" />
          <StatCard label="Requested" value={stats.purchases.requested} icon={Clock} color="bg-yellow-500/10 text-yellow-400" />
          <StatCard label="Processing" value={stats.purchases.processing} icon={Loader2} color="bg-indigo-500/10 text-indigo-400" />
          <StatCard label="Completed" value={stats.purchases.completed} icon={CheckCircle2} color="bg-green-500/10 text-green-400" />
          <StatCard label="Failed" value={stats.purchases.failed} icon={XCircle} color="bg-red-500/10 text-red-400" />
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-4">Transfers</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total" value={stats.transfers.total} icon={ArrowRightLeft} color="bg-violet-500/10 text-violet-400" />
          <StatCard label="Initiated" value={stats.transfers.initiated} icon={Clock} color="bg-yellow-500/10 text-yellow-400" />
          <StatCard label="Pending" value={stats.transfers.pending} icon={Clock} color="bg-blue-500/10 text-blue-400" />
          <StatCard label="Approved" value={stats.transfers.approved} icon={CheckCircle2} color="bg-indigo-500/10 text-indigo-400" />
          <StatCard label="Completed" value={stats.transfers.completed} icon={CheckCircle2} color="bg-green-500/10 text-green-400" />
          <StatCard label="Failed" value={stats.transfers.failed} icon={XCircle} color="bg-red-500/10 text-red-400" />
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-4">Registered (App Platform)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total" value={stats.registered.total} icon={Globe} color="bg-cyan-500/10 text-cyan-400" />
          <StatCard label="Pending" value={stats.registered.pending} icon={Clock} color="bg-yellow-500/10 text-yellow-400" />
          <StatCard label="Verified" value={stats.registered.verified} icon={ShieldCheck} color="bg-indigo-500/10 text-indigo-400" />
          <StatCard label="Active" value={stats.registered.active} icon={CheckCircle2} color="bg-green-500/10 text-green-400" />
          <StatCard label="Failed" value={stats.registered.failed} icon={AlertCircle} color="bg-red-500/10 text-red-400" />
        </div>
      </div>
    </div>
  );
}

// ── Purchases tab ─────────────────────────────────────────────────────────────

function PurchasesTab() {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<DetailEntity | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) p.set("search", search);
      if (statusFilter) p.set("status", statusFilter);
      const res = await fetch(`/api/admin/domains/purchases?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRows(json.data); setMeta(json.meta);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div>
      <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        onSearch={() => load(1)} loading={loading} onRefresh={() => load(meta.page)}
        statusOptions={[
          { value: "requested", label: "Requested" }, { value: "processing", label: "Processing" },
          { value: "completed", label: "Completed" }, { value: "failed", label: "Failed" },
          { value: "cancelled", label: "Cancelled" },
        ]} />

      {loading
        ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
        : rows.length === 0 ? <div className="text-center py-16 text-white/30">No purchase requests found</div>
        : <>
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                  {["Domain", "Status", "User", "App", "Purchase", "Renewal", "Registrant", "Created", ""].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-white/40 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const err = normalizeError(row.last_error);
                  const expiry = (row.metadata?.expires_at as string) ?? null;
                  return (
                    <tr key={row.id} onClick={() => setDetail({ kind: "purchase", row })}
                      className={`border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors cursor-pointer ${i % 2 !== 0 ? "bg-white/[0.015]" : ""} ${row.last_error ? "border-l-2 border-l-red-500/40" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white text-sm">{row.domain}</div>
                        {expiry && <div className="text-[11px] text-white/30 mt-0.5">exp {fmt(expiry, true)}</div>}
                        {err && <div className="text-[11px] text-red-400/70 mt-0.5 max-w-[180px] truncate" title={row.last_error ?? ""}>{err}</div>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} colorMap={PURCHASE_COLORS} /></td>
                      <td className="px-4 py-3"><UserPill email={row.user_email} /></td>
                      <td className="px-4 py-3"><AppPill name={row.app_name} slug={row.app_slug} /></td>
                      <td className="px-4 py-3 text-white/70 text-sm">{fmtPrice(row.purchase_price, row.currency)}</td>
                      <td className="px-4 py-3 text-white/50 text-sm">{fmtPrice(row.renewal_price, row.currency)}</td>
                      <td className="px-4 py-3 text-white/45 text-xs">{row.registrant_email || "—"}</td>
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">{relativeTime(row.created_at)}</td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 rounded transition-colors">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white min-w-[160px]">
                            <DropdownMenuItem onClick={() => setDetail({ kind: "purchase", row })} className="text-white/70 hover:text-white focus:text-white focus:bg-white/5 cursor-pointer text-xs">View Details</DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            {["requested", "processing"].includes(row.status) && (
                              <DropdownMenuItem onClick={() => setConfirm({
                                title: "Cancel Purchase", description: `Cancel "${row.domain}"?${row.purchase_price ? ` Refund $${Number(row.purchase_price).toFixed(2)}.` : ""}`,
                                confirmLabel: "Cancel & Refund", danger: true,
                                onConfirm: async () => {
                                  const res = await fetch(`/api/admin/domains/purchases/${row.id}/cancel`, { method: "POST" });
                                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                  toast.success(j.message); load(meta.page);
                                },
                              })} className="text-red-400 hover:text-red-300 focus:text-red-300 focus:bg-red-500/10 cursor-pointer text-xs">
                                Cancel &amp; Refund
                              </DropdownMenuItem>
                            )}
                            {row.status === "failed" && (
                              <DropdownMenuItem onClick={() => setConfirm({
                                title: "Retry Purchase", description: `Create a new purchase attempt for "${row.domain}" and charge credits if the registrar accepts it?`,
                                confirmLabel: "Retry",
                                onConfirm: async () => {
                                  const res = await fetch(`/api/admin/domains/purchases/${row.id}/retry`, { method: "POST" });
                                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                  toast.success(j.message); load(meta.page);
                                },
                              })} className="text-blue-400 hover:text-blue-300 focus:text-blue-300 focus:bg-blue-500/10 cursor-pointer text-xs">
                                Retry Purchase
                              </DropdownMenuItem>
                            )}
                            {row.status === "completed" && (
                              <DropdownMenuItem onClick={() => setConfirm({
                                title: "Sync Registrant Contact", description: `Push registrant contact to Name.com for "${row.domain}"?`,
                                confirmLabel: "Sync Contact",
                                onConfirm: async () => {
                                  const res = await fetch(`/api/admin/domains/purchases/${row.id}/sync-contact`, { method: "POST" });
                                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                  toast.success(j.message); load(meta.page);
                                },
                              })} className="text-blue-400 hover:text-blue-300 focus:text-blue-300 focus:bg-blue-500/10 cursor-pointer text-xs">
                                Sync Registrant Contact
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={meta} onPage={load} />
        </>}

      {detail && <DetailDrawer entity={detail} onClose={() => setDetail(null)} onAction={setConfirm} />}
      <ConfirmModal action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

// ── Transfers tab ─────────────────────────────────────────────────────────────

function TransfersTab() {
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<DetailEntity | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) p.set("search", search);
      if (statusFilter) p.set("status", statusFilter);
      const res = await fetch(`/api/admin/domains/transfers?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRows(json.data); setMeta(json.meta);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(1); }, [load]);

  const isActive = (s: string) => ["initiated", "pending", "approved"].includes(s);

  return (
    <div>
      <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        onSearch={() => load(1)} loading={loading} onRefresh={() => load(meta.page)}
        statusOptions={[
          { value: "initiated", label: "Initiated" }, { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" }, { value: "completed", label: "Completed" },
          { value: "failed", label: "Failed" }, { value: "cancelled", label: "Cancelled" },
        ]} />

      {loading
        ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
        : rows.length === 0 ? <div className="text-center py-16 text-white/30">No transfer requests found</div>
        : <>
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                  {["Domain", "Status", "Provider Status", "User", "Price", "Order ID", "Sync Attempts", "Last Sync", ""].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-white/40 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const err = normalizeError(row.last_error || row.failure_reason);
                  return (
                    <tr key={row.id} onClick={() => setDetail({ kind: "transfer", row })}
                      className={`border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors cursor-pointer ${i % 2 !== 0 ? "bg-white/[0.015]" : ""} ${(row.last_error || row.failure_reason) ? "border-l-2 border-l-red-500/40" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white text-sm">{row.domain}</div>
                        {err && <div className="text-[11px] text-red-400/70 mt-0.5 max-w-[180px] truncate">{err}</div>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} colorMap={TRANSFER_COLORS} /></td>
                      <td className="px-4 py-3">
                        {row.provider_status
                          ? <span className="text-[11px] text-white/50 bg-white/5 px-2 py-0.5 rounded border border-white/10">{row.provider_status}</span>
                          : <span className="text-white/25 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3"><UserPill email={row.user_email} /></td>
                      <td className="px-4 py-3 text-white/70 text-sm">{fmtPrice(row.purchase_price, row.currency)}</td>
                      <td className="px-4 py-3 text-white/30 font-mono text-[11px]">{row.provider_order_id ? row.provider_order_id.slice(0, 10) + "…" : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-medium ${row.poll_count === 0 ? "text-white/30" : "text-white/70"}`}>{row.poll_count}</span>
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs">{relativeTime(row.last_polled_at)}</td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 rounded transition-colors">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white min-w-[160px]">
                            <DropdownMenuItem onClick={() => setDetail({ kind: "transfer", row })} className="text-white/70 hover:text-white focus:text-white focus:bg-white/5 cursor-pointer text-xs">View Details</DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem onClick={() => setConfirm({
                              title: "Sync Transfer", description: `Poll registrar status for "${row.domain}" now?`,
                              confirmLabel: "Sync",
                              onConfirm: async () => {
                                const res = await fetch(`/api/admin/domains/transfers/${row.id}/poll`, { method: "POST" });
                                const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                toast.success(j.message); load(meta.page);
                              },
                            })} className="text-blue-400 hover:text-blue-300 focus:text-blue-300 focus:bg-blue-500/10 cursor-pointer text-xs">
                              Sync Registrar Status
                            </DropdownMenuItem>
                            {isActive(row.status) && (
                              <DropdownMenuItem onClick={() => setConfirm({
                                title: "Cancel Transfer", description: `Cancel transfer of "${row.domain}"?${row.purchase_price ? ` Refund $${Number(row.purchase_price).toFixed(2)}.` : ""} Will attempt cancellation at Name.com.`,
                                confirmLabel: "Cancel & Refund", danger: true,
                                onConfirm: async () => {
                                  const res = await fetch(`/api/admin/domains/transfers/${row.id}/cancel`, { method: "POST" });
                                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                  toast.success(j.message); load(meta.page);
                                },
                              })} className="text-red-400 hover:text-red-300 focus:text-red-300 focus:bg-red-500/10 cursor-pointer text-xs">
                                Cancel &amp; Refund
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={meta} onPage={load} />
        </>}

      {detail && <DetailDrawer entity={detail} onClose={() => setDetail(null)} onAction={setConfirm} />}
      <ConfirmModal action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

// ── Registered tab ────────────────────────────────────────────────────────────

function RegisteredTab() {
  const [rows, setRows] = useState<RegisteredRow[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<DetailEntity | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) p.set("search", search);
      if (statusFilter) p.set("status", statusFilter);
      const res = await fetch(`/api/admin/domains/registered?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRows(json.data); setMeta(json.meta);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(1); }, [load]);

  function sslBadge(ssl: string) {
    if (ssl === "active") return <span className="flex items-center gap-1 text-green-400 text-[11px]"><ShieldCheck className="h-3.5 w-3.5" />Active</span>;
    if (ssl === "failed") return <span className="flex items-center gap-1 text-red-400 text-[11px]"><ShieldAlert className="h-3.5 w-3.5" />Failed</span>;
    if (ssl === "issuing") return <span className="flex items-center gap-1 text-yellow-400 text-[11px]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Issuing</span>;
    return <span className="flex items-center gap-1 text-white/30 text-[11px]"><Shield className="h-3.5 w-3.5" />{ssl}</span>;
  }

  return (
    <div>
      <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        onSearch={() => load(1)} loading={loading} onRefresh={() => load(meta.page)}
        statusOptions={[
          { value: "pending", label: "Pending" }, { value: "verified", label: "Verified" },
          { value: "active", label: "Active" }, { value: "failed", label: "Failed" },
          { value: "removed", label: "Removed" },
        ]} />

      {loading
        ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
        : rows.length === 0 ? <div className="text-center py-16 text-white/30">No registered domains found</div>
        : <>
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                  {["Domain", "Status", "SSL", "App", "User", "Primary", "Verified", "Activated", ""].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-white/40 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const err = normalizeError(row.last_error);
                  return (
                    <tr key={row.id} onClick={() => setDetail({ kind: "registered", row })}
                      className={`border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors cursor-pointer ${i % 2 !== 0 ? "bg-white/[0.015]" : ""} ${row.last_error ? "border-l-2 border-l-red-500/40" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white text-sm">{row.domain}</div>
                        {err && <div className="text-[11px] text-red-400/70 mt-0.5 max-w-[180px] truncate" title={row.last_error ?? ""}>{err}</div>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} colorMap={DOMAIN_COLORS} /></td>
                      <td className="px-4 py-3">{sslBadge(row.ssl_status)}</td>
                      <td className="px-4 py-3"><AppPill name={row.app_name} slug={row.app_slug} /></td>
                      <td className="px-4 py-3"><UserPill email={row.user_email} /></td>
                      <td className="px-4 py-3">
                        {row.is_primary
                          ? <span className="text-[11px] bg-blue-500/15 text-blue-300 border border-blue-500/25 px-2 py-0.5 rounded-full">Primary</span>
                          : <span className="text-white/25 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">{fmt(row.verified_at, true)}</td>
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">{fmt(row.activated_at, true)}</td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 rounded transition-colors">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white min-w-[160px]">
                            <DropdownMenuItem onClick={() => setDetail({ kind: "registered", row })} className="text-white/70 hover:text-white focus:text-white focus:bg-white/5 cursor-pointer text-xs">View Details</DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            {["pending", "failed"].includes(row.status) && (
                              <DropdownMenuItem onClick={() => setConfirm({
                                title: "Force-Verify Domain", description: `Skip DNS check and mark "${row.domain}" as verified?`,
                                confirmLabel: "Force Verify",
                                onConfirm: async () => {
                                  const res = await fetch(`/api/admin/domains/registered/${row.id}/force-verify`, { method: "POST" });
                                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                  toast.success(j.message); load(meta.page);
                                },
                              })} className="text-green-400 hover:text-green-300 focus:text-green-300 focus:bg-green-500/10 cursor-pointer text-xs">
                                Force Verify
                              </DropdownMenuItem>
                            )}
                            {row.status === "verified" && (
                              <DropdownMenuItem onClick={() => setConfirm({
                                title: "Force-Activate Domain", description: `Force "${row.domain}" to active?`,
                                confirmLabel: "Activate",
                                onConfirm: async () => {
                                  const res = await fetch(`/api/admin/domains/registered/${row.id}/activate`, { method: "POST" });
                                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                  toast.success(j.message); load(meta.page);
                                },
                              })} className="text-green-400 hover:text-green-300 focus:text-green-300 focus:bg-green-500/10 cursor-pointer text-xs">
                                Force Activate
                              </DropdownMenuItem>
                            )}
                            {row.status === "active" && (
                              <DropdownMenuItem onClick={() => setConfirm({
                                title: "Check SSL", description: `Probe live SSL status for "${row.domain}"?`,
                                confirmLabel: "Check SSL",
                                onConfirm: async () => {
                                  const res = await fetch(`/api/admin/domains/registered/${row.id}/check-ssl`, { method: "POST" });
                                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                  toast.success(j.message); load(meta.page);
                                },
                              })} className="text-blue-400 hover:text-blue-300 focus:text-blue-300 focus:bg-blue-500/10 cursor-pointer text-xs">
                                Check SSL
                              </DropdownMenuItem>
                            )}
                            {row.status === "active" && !row.is_primary && (
                              <DropdownMenuItem onClick={() => setConfirm({
                                title: "Set Primary Domain", description: `Make "${row.domain}" the primary domain for this app?`,
                                confirmLabel: "Set Primary",
                                onConfirm: async () => {
                                  const res = await fetch(`/api/admin/domains/registered/${row.id}/set-primary`, {
                                    method: "POST",
                                    headers: { "content-type": "application/json" },
                                    body: JSON.stringify({ redirect_to_primary: row.redirect_to_primary }),
                                  });
                                  const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                  toast.success(j.message); load(meta.page);
                                },
                              })} className="text-yellow-400 hover:text-yellow-300 focus:text-yellow-300 focus:bg-yellow-500/10 cursor-pointer text-xs">
                                Set as Primary
                              </DropdownMenuItem>
                            )}
                            {row.status !== "removed" && (
                              <>
                                <DropdownMenuSeparator className="bg-white/10" />
                                <DropdownMenuItem onClick={() => setConfirm({
                                  title: "Remove Connection", description: `Soft-delete "${row.domain}" from the app?`,
                                  confirmLabel: "Remove", danger: true,
                                  onConfirm: async () => {
                                    const res = await fetch(`/api/admin/domains/registered/${row.id}/delete`, { method: "POST" });
                                    const j = await res.json(); if (!res.ok) throw new Error(j.error);
                                    toast.success(j.message); load(meta.page);
                                  },
                                })} className="text-red-400 hover:text-red-300 focus:text-red-300 focus:bg-red-500/10 cursor-pointer text-xs">
                                  Remove Domain
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={meta} onPage={load} />
        </>}

      {detail && <DetailDrawer entity={detail} onClose={() => setDetail(null)} onAction={setConfirm} />}
      <ConfirmModal action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

// ── Activity tab ──────────────────────────────────────────────────────────────

function ActivityTab() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) p.set("search", search);
      const res = await fetch(`/api/admin/domains/activity?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRows(json.data); setMeta(json.meta);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(1); }, [load]);

  // Build a human sentence from the action + metadata
  function describeActivity(row: ActivityRow): string {
    const meta = row.metadata ?? {};
    const name = row.service_name || (meta.domain as string) || "domain";
    switch (row.action) {
      case "create": return `Domain added: ${name}`;
      case "update": return `Domain updated: ${name}`;
      case "delete": return `Domain removed: ${name}`;
      default: return `${row.action}: ${name}`;
    }
  }

  function describeDetail(meta: Record<string, unknown>): string | null {
    const parts: string[] = [];
    if (meta.event) parts.push(`Event: ${meta.event}`);
    if (meta.app_name || meta.app_id) parts.push(`App: ${meta.app_name || (meta.app_id as string)?.slice(0, 8)}`);
    if (meta.domain) parts.push(`Domain: ${meta.domain}`);
    if (meta.status) parts.push(`Status: ${meta.status}`);
    return parts.length ? parts.join(" · ") : null;
  }

  return (
    <div>
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
          <Input placeholder="Search activity…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(1)} className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/25 h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => load(meta.page)} className="border-white/10 bg-transparent text-white/50 hover:bg-white/5 h-9 px-3">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading
        ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
        : rows.length === 0 ? <div className="text-center py-16 text-white/30">No activity logs found</div>
        : <>
          <div className="space-y-0 rounded-lg border border-white/[0.08] overflow-hidden">
            {rows.map((row, i) => {
              const detail = describeDetail(row.metadata ?? {});
              return (
                <div key={row.id} className={`flex gap-4 px-4 py-3 border-b border-white/[0.05] last:border-0 ${i % 2 !== 0 ? "bg-white/[0.015]" : ""}`}>
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      row.action === "create" ? "bg-green-500" :
                      row.action === "delete" ? "bg-red-500" :
                      "bg-blue-500"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white/80 text-xs font-medium">{describeActivity(row)}</span>
                      {row.user_role === "admin" && (
                        <span className="text-[10px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20 shrink-0">admin</span>
                      )}
                    </div>
                    {detail && <p className="text-white/35 text-[11px] mt-0.5">{detail}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-white/25 text-[11px]">{relativeTime(row.created_at)}</span>
                      {row.user_email && <span className="text-white/25 text-[11px]">· {row.user_email}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      row.action === "create" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                      row.action === "delete" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                      "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    }`}>{row.action}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination meta={meta} onPage={load} />
        </>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "purchases", label: "Purchases", icon: ShoppingCart },
  { id: "transfers", label: "Transfers", icon: ArrowRightLeft },
  { id: "registered", label: "Registered", icon: Globe },
  { id: "activity", label: "Activity", icon: Activity },
];

export default function AdminDomains() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Domain Administration</h1>
          <p className="text-white/40 text-sm">Purchases, transfers, app-connected domains and activity across all users</p>
        </div>

        <div className="flex gap-0 mb-8 border-b border-white/[0.08] overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${tab === id ? "border-white text-white" : "border-transparent text-white/35 hover:text-white/65 hover:border-white/20"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab />}
        {tab === "purchases" && <PurchasesTab />}
        {tab === "transfers" && <TransfersTab />}
        {tab === "registered" && <RegisteredTab />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </div>
  );
}
