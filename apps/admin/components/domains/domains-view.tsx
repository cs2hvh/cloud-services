"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  RefreshCw,
  Globe,
  ShieldCheck,
  Star,
  Trash2,
  RotateCw,
  XCircle,
  Radar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { StatusChip, Table } from "@admin/components/deploy/bits";

/**
 * Panel-native domains console over the panel's own /api/admin/domains
 * routes. Three lifecycle tables (registered / purchases / transfers) plus
 * the domain-scoped audit activity, with the row actions the old v1 screen
 * buried in 1,475 lines of bespoke UI. Destructive actions confirm by name.
 */

interface RegisteredRow {
  id: string;
  domain: string;
  status: string;
  ssl_status: string | null;
  is_primary: boolean;
  user_email?: string | null;
  verified_at: string | null;
  activated_at: string | null;
  last_error: string | null;
  created_at: string;
}
interface PurchaseRow {
  id: string;
  domain: string;
  status: string;
  purchase_price: number | null;
  renewal_price: number | null;
  currency: string | null;
  provider: string | null;
  user_email?: string | null;
  registrant_email: string | null;
  last_error: string | null;
  created_at: string;
}
interface TransferRow {
  id: string;
  domain: string;
  status: string;
  provider: string | null;
  provider_status: string | null;
  user_email?: string | null;
  last_polled_at: string | null;
  poll_count: number | null;
  last_error: string | null;
  failure_reason: string | null;
  created_at: string;
}
interface ActivityRow {
  id: string;
  action: string;
  service_name: string | null;
  service_id: string | null;
  user_email: string | null;
  created_at: string;
}

function useTabData<T>(url: string, search: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: "50" });
      if (search.trim()) q.set("search", search.trim());
      const res = await fetch(`${url}?${q}`);
      const data = await res.json();
      if (res.ok) {
        setRows(data.data ?? []);
        setTotal(data.meta?.total ?? (data.data ?? []).length);
      } else {
        toast.error(data.error ?? "Failed to load");
      }
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [url, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, total, loading, reload: load };
}

async function act(path: string, label: string): Promise<boolean> {
  try {
    const res = await fetch(path, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`${label} — done`);
      return true;
    }
    toast.error(data.error ?? `${label} failed`);
    return false;
  } catch {
    toast.error(`${label} failed`);
    return false;
  }
}

const when = (iso: string | null) =>
  iso ? iso.slice(0, 16).replace("T", " ") : "—";

export function DomainsView() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");

  const registered = useTabData<RegisteredRow>("/api/admin/domains/registered", applied);
  const purchases = useTabData<PurchaseRow>("/api/admin/domains/purchases", applied);
  const transfers = useTabData<TransferRow>("/api/admin/domains/transfers", applied);
  const activity = useTabData<ActivityRow>("/api/admin/domains/activity", applied);

  const [deleting, setDeleting] = useState<RegisteredRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rowAction = async (id: string, path: string, label: string, reload: () => void) => {
    setBusyId(id);
    const okDone = await act(path, label);
    setBusyId(null);
    if (okDone) reload();
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setApplied(search)}
            placeholder="Search domains…  (Enter)"
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setApplied(search)}>
          Search
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            registered.reload();
            purchases.reload();
            transfers.reload();
            activity.reload();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Tabs defaultValue="registered">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="registered">
            Registered{registered.total !== null && ` (${registered.total})`}
          </TabsTrigger>
          <TabsTrigger value="purchases">
            Purchases{purchases.total !== null && ` (${purchases.total})`}
          </TabsTrigger>
          <TabsTrigger value="transfers">
            Transfers{transfers.total !== null && ` (${transfers.total})`}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="registered">
          <TabShell loading={registered.loading} empty={registered.rows.length === 0}>
            <Table head={["domain", "owner", "status", "ssl", "verified", "error", ""]}>
              {registered.rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">
                    <span className="inline-flex items-center gap-1.5">
                      {r.is_primary && <Star className="h-3 w-3 text-amber-300" />}
                      {r.domain}
                    </span>
                  </td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.user_email ?? "—"}</td>
                  <td className="py-1.5 pr-4"><StatusChip status={r.status} /></td>
                  <td className="py-1.5 pr-4">
                    {r.ssl_status ? <StatusChip status={r.ssl_status} /> : "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{when(r.verified_at)}</td>
                  <td className="max-w-[240px] truncate py-1.5 pr-4 text-red-300">{r.last_error ?? ""}</td>
                  <td className="py-1.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={busyId === r.id}>
                          {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => rowAction(r.id, `/api/admin/domains/registered/${r.id}/dns-check`, "DNS check", registered.reload)}>
                          <Radar className="mr-2 h-4 w-4" /> Check DNS
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => rowAction(r.id, `/api/admin/domains/registered/${r.id}/check-ssl`, "SSL check", registered.reload)}>
                          <ShieldCheck className="mr-2 h-4 w-4" /> Check SSL
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => rowAction(r.id, `/api/admin/domains/registered/${r.id}/force-verify`, "Force verify", registered.reload)}>
                          <ShieldCheck className="mr-2 h-4 w-4" /> Force verify
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => rowAction(r.id, `/api/admin/domains/registered/${r.id}/activate`, "Activate", registered.reload)}>
                          <Globe className="mr-2 h-4 w-4" /> Force activate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => rowAction(r.id, `/api/admin/domains/registered/${r.id}/set-primary`, "Set primary", registered.reload)}>
                          <Star className="mr-2 h-4 w-4" /> Set primary
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-400" onClick={() => setDeleting(r)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </Table>
          </TabShell>
        </TabsContent>

        <TabsContent value="purchases">
          <TabShell loading={purchases.loading} empty={purchases.rows.length === 0}>
            <Table head={["domain", "owner", "status", "price", "renewal", "provider", "error", ""]}>
              {purchases.rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{r.domain}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.user_email ?? r.registrant_email ?? "—"}</td>
                  <td className="py-1.5 pr-4"><StatusChip status={r.status} /></td>
                  <td className="py-1.5 pr-4">{r.purchase_price != null ? `$${r.purchase_price}` : "—"}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.renewal_price != null ? `$${r.renewal_price}/yr` : "—"}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.provider ?? "—"}</td>
                  <td className="max-w-[220px] truncate py-1.5 pr-4 text-red-300">{r.last_error ?? ""}</td>
                  <td className="py-1.5 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" disabled={busyId === r.id} title="Retry"
                        onClick={() => rowAction(r.id, `/api/admin/domains/purchases/${r.id}/retry`, "Retry purchase", purchases.reload)}>
                        <RotateCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busyId === r.id} title="Sync contact"
                        onClick={() => rowAction(r.id, `/api/admin/domains/purchases/${r.id}/sync-contact`, "Sync contact", purchases.reload)}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busyId === r.id} title="Cancel"
                        onClick={() => rowAction(r.id, `/api/admin/domains/purchases/${r.id}/cancel`, "Cancel purchase", purchases.reload)}>
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </TabShell>
        </TabsContent>

        <TabsContent value="transfers">
          <TabShell loading={transfers.loading} empty={transfers.rows.length === 0}>
            <Table head={["domain", "owner", "status", "provider status", "polled", "error", ""]}>
              {transfers.rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{r.domain}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.user_email ?? "—"}</td>
                  <td className="py-1.5 pr-4"><StatusChip status={r.status} /></td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.provider_status ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    {when(r.last_polled_at)}{r.poll_count ? ` (×${r.poll_count})` : ""}
                  </td>
                  <td className="max-w-[220px] truncate py-1.5 pr-4 text-red-300">{r.failure_reason ?? r.last_error ?? ""}</td>
                  <td className="py-1.5 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" disabled={busyId === r.id} title="Poll now"
                        onClick={() => rowAction(r.id, `/api/admin/domains/transfers/${r.id}/poll`, "Poll transfer", transfers.reload)}>
                        <RotateCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busyId === r.id} title="Cancel"
                        onClick={() => rowAction(r.id, `/api/admin/domains/transfers/${r.id}/cancel`, "Cancel transfer", transfers.reload)}>
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </TabShell>
        </TabsContent>

        <TabsContent value="activity">
          <TabShell loading={activity.loading} empty={activity.rows.length === 0}>
            <Table head={["when", "action", "domain", "by", "ref"]}>
              {activity.rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4 text-muted-foreground">{when(r.created_at)}</td>
                  <td className="py-1.5 pr-4"><StatusChip status={r.action} /></td>
                  <td className="py-1.5 pr-4">{r.service_name ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.user_email ?? "—"}</td>
                  <td className="py-1.5 text-muted-foreground">{r.service_id ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </TabShell>
        </TabsContent>
      </Tabs>

      {deleting && (
        <DeleteDomainDialog
          row={deleting}
          onClose={(changed) => {
            setDeleting(null);
            if (changed) registered.reload();
          }}
        />
      )}
    </>
  );
}

function TabShell({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {children}
      {empty && (
        <p className="py-4 text-center text-xs text-muted-foreground">Nothing here.</p>
      )}
    </div>
  );
}

function DeleteDomainDialog({
  row,
  onClose,
}: {
  row: RegisteredRow;
  onClose: (changed: boolean) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    setBusy(true);
    const okDone = await act(
      `/api/admin/domains/registered/${row.id}/delete`,
      `Delete ${row.domain}`,
    );
    setBusy(false);
    if (okDone) onClose(true);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {row.domain}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-red-300">
            Removes the domain{row.user_email ? ` belonging to ${row.user_email}` : ""} and its
            routing. Type the domain to confirm.
          </p>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={row.domain} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onClose(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" disabled={confirm !== row.domain || busy} onClick={doDelete}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete domain
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
