"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users as UsersIcon,
  ShieldCheck,
  Ban,
  UserPlus,
  KeyRound,
  MoreHorizontal,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Copy,
  UserCog,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { useConfirm } from "@/components/ui/confirm";
import { PageHeader } from "@admin/components/page-header";
import { StatCard } from "@admin/components/stat-card";
import { ChartCard, ChartTooltip } from "@admin/components/chart-card";
import { SERIES, CHROME, axisProps } from "@admin/lib/chart-theme";

type UserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar: string | null;
  roles: string[] | null;
  suspend: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  email: string | null;
  stats: { servers: number; gameServers: number; clusters: number };
};

type UsersOverview = {
  totals: {
    users: number;
    admins: number;
    suspended: number;
    twoFactor: number;
    new30d: number;
  };
  signupSeries: { week: string; count: number }[];
};

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

export function UsersView() {
  const router = useRouter();
  const [overview, setOverview] = useState<UsersOverview | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    totalPages: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleDialogUser, setRoleDialogUser] = useState<UserRow | null>(null);
  const [roleDraft, setRoleDraft] = useState<string[]>([]);
  const confirm = useConfirm();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, roleFilter]);

  const loadOverview = useCallback(async () => {
    try {
      const res = await api.get<UsersOverview>("/admin/users/overview");
      setOverview(res.data);
    } catch {
      /* toasted by interceptor */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/users", {
        params: {
          page,
          limit: 25,
          search: debounced || undefined,
          role: roleFilter === "admin" || roleFilter === "member" ? roleFilter : undefined,
          suspended: roleFilter === "suspended" ? "true" : undefined,
        },
      });
      setRows(res.data.data ?? []);
      setPagination(res.data.pagination ?? null);
    } catch {
      /* toasted by interceptor */
    } finally {
      setLoading(false);
    }
  }, [page, debounced, roleFilter]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    load();
  }, [load]);

  const patchUser = async (
    user: UserRow,
    payload: { roles?: string[]; suspend?: boolean },
    successMessage: string,
  ) => {
    setBusyId(user.id);
    try {
      const res = await api.patch("/admin/users", {
        userId: user.id,
        ...payload,
      });
      if (res.data?.data) {
        toast.success(successMessage);
        await Promise.all([load(), loadOverview()]);
      }
    } catch {
      /* toasted by interceptor */
    } finally {
      setBusyId(null);
    }
  };

  const toggleSuspend = async (user: UserRow) => {
    const suspending = !user.suspend;
    const ok = await confirm({
      title: `${suspending ? "Suspend" : "Unsuspend"} ${user.username || user.email || user.id}?`,
      description: suspending
        ? "The account will be blocked from using the platform."
        : "The account will regain full access.",
      confirmText: suspending ? "Suspend" : "Unsuspend",
      danger: suspending,
    });
    if (!ok) return;
    await patchUser(
      user,
      { suspend: suspending },
      suspending ? "User suspended" : "User unsuspended",
    );
  };

  const saveRoles = async () => {
    if (!roleDialogUser) return;
    const user = roleDialogUser;
    setRoleDialogUser(null);
    await patchUser(user, { roles: roleDraft }, "Roles updated");
  };

  const t = overview?.totals;

  return (
    <div>
      <PageHeader
        title="Users"
        description="Accounts, roles, suspensions and signup growth."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total users" value={t ? t.users : "—"} icon={UsersIcon} />
        <StatCard label="New (30 days)" value={t ? t.new30d : "—"} icon={UserPlus} />
        <StatCard label="Admins" value={t ? t.admins : "—"} icon={ShieldCheck} />
        <StatCard
          label="Suspended"
          value={t ? t.suspended : "—"}
          icon={Ban}
          tone={t && t.suspended > 0 ? "warning" : undefined}
        />
        <StatCard
          label="2FA enabled"
          value={t ? t.twoFactor : "—"}
          icon={KeyRound}
          hint={
            t && t.users > 0
              ? `${Math.round((t.twoFactor / t.users) * 100)}% of accounts`
              : undefined
          }
        />
      </div>

      <div className="mt-3">
        <ChartCard title="Signups" subtitle="new accounts per week, last 12 weeks">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={overview?.signupSeries ?? []}
                margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="signups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHROME.grid} />
                <XAxis dataKey="week" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={38} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHROME.baseline }} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Signups"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#signups)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username or display name"
              className="w-72 pl-8"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="member">Members</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            {pagination && (
              <span className="text-xs text-muted-foreground">
                {pagination.total} user{pagination.total === 1 ? "" : "s"}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Resources</TableHead>
                <TableHead>2FA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Joined</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    No users match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((u) => (
                <TableRow key={u.id} className={busyId === u.id ? "opacity-50" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={u.avatar ?? undefined} />
                        <AvatarFallback>
                          {(u.username || u.email || "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium">
                          {u.display_name || u.username || "—"}
                        </div>
                        {u.username && (
                          <div className="text-xs text-muted-foreground">@{u.username}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-52 truncate text-sm">
                    {u.email ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(u.roles ?? []).map((r) => (
                        <span
                          key={r}
                          className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${
                            r === "admin"
                              ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.stats.servers} VMs · {u.stats.gameServers} game · {u.stats.clusters} k8s
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.two_factor_enabled ? (
                      <span className="text-emerald-400">on</span>
                    ) : (
                      <span className="text-muted-foreground">off</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.suspend ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                        <Ban className="h-3 w-3" /> Suspended
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Active</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={busyId === u.id}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/users/${u.id}`)}
                        >
                          <Wallet className="mr-2 h-4 w-4" /> Billing
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setRoleDraft(u.roles ?? ["member"]);
                            setRoleDialogUser(u);
                          }}
                        >
                          <UserCog className="mr-2 h-4 w-4" /> Edit roles
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleSuspend(u)}>
                          <Ban className="mr-2 h-4 w-4" />
                          {u.suspend ? "Unsuspend" : "Suspend"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.email && (
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(u.email!);
                              toast.success("Email copied");
                            }}
                          >
                            <Copy className="mr-2 h-4 w-4" /> Copy email
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(u.id);
                            toast.success("User ID copied");
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" /> Copy user ID
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-3">
            <span className="text-xs text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!roleDialogUser} onOpenChange={(open) => !open && setRoleDialogUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Roles — {roleDialogUser?.username || roleDialogUser?.email || ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {ROLE_OPTIONS.map((role) => (
              <label key={role.value} className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  checked={roleDraft.includes(role.value)}
                  onCheckedChange={(checked) =>
                    setRoleDraft((prev) =>
                      checked
                        ? [...prev, role.value]
                        : prev.filter((r) => r !== role.value),
                    )
                  }
                />
                {role.label}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Admin grants full access to this panel.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogUser(null)}>
              Cancel
            </Button>
            <Button onClick={saveRoles} disabled={roleDraft.length === 0}>
              Save roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
