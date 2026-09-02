import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, Users, Server, Boxes, Cpu, Rocket, BadgeDollarSign } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ADMIN_SECTIONS,
  SECTION_GROUPS,
  sectionHref,
} from "@admin/lib/sections";
import { StatCard } from "@admin/components/stat-card";
import { StatusChip, Table } from "@admin/components/deploy/bits";

export const dynamic = "force-dynamic";

/** Cheap head-only counts — the overview must never be the slow page. */
async function LiveOverview() {
  const supabase = await createServiceClient();
  const count = (res: { count: number | null }) => res.count ?? 0;

  const [users, servers, clusters, pods, projects, prices, activity] =
    await Promise.all([
      supabase.from("user_profiles").select("id", { count: "exact", head: true }),
      supabase.from("servers").select("id", { count: "exact", head: true }).neq("status", "deleted"),
      supabase.from("clusters").select("id", { count: "exact", head: true }).neq("status", "deleted"),
      supabase.from("gpu_pods").select("id", { count: "exact", head: true }).eq("status", "running"),
      supabase.schema("paas").from("projects").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.schema("billing").from("service_pricing").select("id", { count: "exact", head: true }).is("effective_to", null),
      supabase
        .schema("audits")
        .from("audit_logs")
        .select("id, action, service_type, service_name, user_email, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Users" value={count(users)} icon={Users} />
        <StatCard label="VMs" value={count(servers)} icon={Server} />
        <StatCard label="K8s clusters" value={count(clusters)} icon={Boxes} />
        <StatCard label="GPU pods live" value={count(pods)} icon={Cpu} />
        <StatCard label="V2 projects" value={count(projects)} icon={Rocket} />
        <StatCard
          label="Live prices"
          value={count(prices)}
          hint="price book rows in force"
          icon={BadgeDollarSign}
          tone={count(prices) === 0 ? "critical" : undefined}
        />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Recent admin activity
          </h2>
          <Link href="/audit-logs" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            all audit logs →
          </Link>
        </div>
        <div className="p-4">
          {(activity.data ?? []).length > 0 ? (
            <Table head={["when", "action", "service", "what", "by"]}>
              {(activity.data ?? []).map((a) => (
                <tr key={a.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    {a.created_at.slice(5, 16).replace("T", " ")}
                  </td>
                  <td className="py-1.5 pr-4"><StatusChip status={a.action} /></td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{a.service_type}</td>
                  <td className="max-w-[280px] truncate py-1.5 pr-4">{a.service_name ?? "—"}</td>
                  <td className="py-1.5 text-muted-foreground">{a.user_email ?? "—"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">
              No audit entries yet — instrumented actions will appear here.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        Overview
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Live platform snapshot. Sections marked with an arrow still open in
        the main app.
      </p>

      <div className="mt-6">
        <Suspense
          fallback={
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[86px] animate-pulse rounded-xl border border-border bg-card" />
              ))}
            </div>
          }
        >
          <LiveOverview />
        </Suspense>
      </div>

      {SECTION_GROUPS.filter(Boolean).map((group) => {
        const sections = ADMIN_SECTIONS.filter((s) => s.group === group);
        if (sections.length === 0) return null;
        return (
          <div key={group} className="mt-7">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              {group}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sections.map((section) => {
                const href = sectionHref(section);
                const inner = (
                  <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#3987e5]/40">
                    <div className="flex items-center justify-between">
                      <section.icon className="h-5 w-5 text-muted-foreground" />
                      {!section.migrated && (
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="mt-3 text-sm font-medium">
                      {section.title}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {section.description}
                    </div>
                  </div>
                );

                return section.migrated ? (
                  <Link key={section.slug} href={href}>
                    {inner}
                  </Link>
                ) : (
                  <a key={section.slug} href={href}>
                    {inner}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
