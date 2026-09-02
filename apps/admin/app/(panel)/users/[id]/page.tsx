import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import {
  auditCustomerRead,
  requireCustomerDataAccess,
} from "@admin/lib/customer-data";
import { PageHeader } from "@admin/components/page-header";
import { StatCard } from "@admin/components/stat-card";
import {
  Panel,
  StatusChip,
  Table,
  money,
} from "@admin/components/deploy/bits";
import { Wallet, ReceiptText, Boxes } from "lucide-react";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Per-user billing: wallet balance, ledger, and v2 project charges. A read
 * of customer financial data — gated by requireCustomerDataAccess and
 * audited per view. Stripe identifiers are shown as presence only, never as
 * raw ids.
 */
export default async function UserBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireCustomerDataAccess();
  if (!admin.ok) {
    notFound();
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createServiceClient();
  const billing = supabase.schema("billing");
  const paas = supabase.schema("paas");

  const [{ data: au }, profileRes, creditRes, txRes, chargeRes, teamRes] =
    await Promise.all([
      supabase.auth.admin.getUserById(id),
      supabase.from("user_profiles").select("username, display_name, roles, suspend").eq("id", id).limit(1),
      billing.from("user_credits").select("credit_balance, created_at").eq("user_id", id).limit(1),
      // account_ledger, NOT transactions: charge_service_hour deducts the
      // balance without writing a transaction row, so raw transactions show
      // top-ups only and hide every hourly charge. The view unions both.
      billing
        .from("account_ledger")
        .select("created_at, type, status, amount, balance_after, description, service_type")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      paas
        .from("project_charges")
        .select("project_id, period_start, amount_usd, tier")
        .eq("user_id", id)
        .order("period_start", { ascending: false })
        .limit(48),
      paas.from("teams").select("id, slug").eq("created_by", id),
    ]);

  const email = au?.user?.email ?? null;
  const profile = profileRes.data?.[0];
  if (!email && !profile) {
    notFound();
  }

  const balance = creditRes.data?.[0]?.credit_balance;
  const transactions = txRes.data ?? [];
  const v2Charges = chargeRes.data ?? [];
  const v2Total = v2Charges.reduce((s, c) => s + Number(c.amount_usd), 0);

  await auditCustomerRead({
    admin,
    serviceType: "billing",
    subjectId: id,
    subjectName: email ?? profile?.username ?? id,
    viewed: "user billing: balance, transactions, v2 charges",
  });

  return (
    <div>
      <PageHeader
        title={profile?.display_name || profile?.username || email || id}
        description={`${email ?? "no auth row"} · roles ${profile?.roles?.join(", ") ?? "—"}${profile?.suspend ? " · SUSPENDED" : ""}`}
        actions={
          <Link href="/users" className="text-xs text-muted-foreground underline">
            ← users
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Wallet balance"
          value={balance === undefined ? "no wallet" : money(Number(balance))}
          icon={Wallet}
          tone={balance !== undefined && Number(balance) < 0 ? "critical" : undefined}
        />
        <StatCard
          label="Ledger entries"
          value={`${transactions.length}${transactions.length === 50 ? "+" : ""}`}
          hint="usage rolled up per day, not per charge"
          icon={ReceiptText}
        />
        <StatCard
          label="Deploy v2 spend"
          value={money(v2Total, 4)}
          hint={`${v2Charges.length}${v2Charges.length === 48 ? "+" : ""} billed hour(s)`}
          icon={Boxes}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Panel
          title="Account ledger"
          subtitle="billing.account_ledger — top-ups AND usage (rolled up per service per day, not per hour; hour-level rows live in service_charges); Stripe references omitted"
        >
          {transactions.length > 0 ? (
            <Table head={["when", "type", "status", "amount", "balance after", "description"]}>
              {transactions.map((t, i) => (
                <tr key={`${t.created_at}-${i}`} className="border-t border-border/60">
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    {t.created_at.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-1.5 pr-4">{t.type}</td>
                  <td className="py-1.5 pr-4"><StatusChip status={t.status} /></td>
                  <td className={`py-1.5 pr-4 ${Number(t.amount) < 0 ? "text-red-300" : ""}`}>
                    {/* Sub-cent usage rolls up here ($0.018/hr × 1h) — at 2dp
                        that renders $0.02, and under half a cent it renders
                        $0.00, which reads as "not billed". Show 4dp whenever
                        cents alone can't say the true amount. */}
                    {money(
                      Number(t.amount),
                      Math.round(Number(t.amount) * 10000) % 100 === 0 ? 2 : 4,
                    )}
                  </td>
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    {t.balance_after === null ? "—" : money(Number(t.balance_after))}
                  </td>
                  <td className="max-w-[320px] truncate py-1.5 text-muted-foreground">
                    {t.description ?? ""}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">
              No ledger rows. Pre-relaunch history lives in the billing
              archive, and some 2025 promocode credits predate the ledger
              entirely — absence here is not proof nothing happened.
            </p>
          )}
        </Panel>

        <Panel
          title="Deploy v2 charges"
          subtitle={`paas.project_charges for this user · teams: ${(teamRes.data ?? []).map((t) => t.slug).join(", ") || "none"}`}
        >
          {v2Charges.length > 0 ? (
            <Table head={["period", "project", "tier", "amount"]}>
              {v2Charges.map((c, i) => (
                <tr key={`${c.period_start}-${i}`} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{c.period_start.slice(0, 13).replace("T", " ")}:00</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{c.project_id.slice(0, 8)}…</td>
                  <td className="py-1.5 pr-4">{c.tier}</td>
                  <td className="py-1.5">{money(Number(c.amount_usd), 4)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">No v2 billed hours.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
