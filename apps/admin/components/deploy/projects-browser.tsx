"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, FolderGit2, Trash2, AlertTriangle, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@admin/components/stat-card";
import { StatusChip, Table } from "@admin/components/deploy/bits";

export interface BrowserProject {
  id: string;
  ref: string;
  name: string;
  slug: string;
  repo_full_name: string | null;
  framework: string | null;
  tier: string | null;
  team_id: string;
  created_at: string;
  deleted_at: string | null;
  arrears_since: string | null;
}

type StatusFilter = "all" | "live" | "deleted" | "arrears";

function statusOf(p: BrowserProject): Exclude<StatusFilter, "all"> {
  if (p.deleted_at) return "deleted";
  if (p.arrears_since) return "arrears";
  return "live";
}

const ANY = "__any__";

export function ProjectsBrowser({
  projects,
  teamSlugs,
  deployCounts,
}: {
  projects: BrowserProject[];
  teamSlugs: Record<string, string>;
  deployCounts: Record<string, number>;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [team, setTeam] = useState<string>(ANY);
  const [framework, setFramework] = useState<string>(ANY);
  const [tier, setTier] = useState<string>(ANY);

  const teams = useMemo(
    () => [...new Set(Object.values(teamSlugs))].sort(),
    [teamSlugs],
  );
  const frameworks = useMemo(
    () =>
      [...new Set(projects.map((p) => p.framework).filter((f): f is string => !!f))].sort(),
    [projects],
  );
  const tiers = useMemo(
    () =>
      [...new Set(projects.map((p) => p.tier).filter((t): t is string => !!t))].sort(),
    [projects],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (status !== "all" && statusOf(p) !== status) return false;
      if (team !== ANY && teamSlugs[p.team_id] !== team) return false;
      if (framework !== ANY && p.framework !== framework) return false;
      if (tier !== ANY && p.tier !== tier) return false;
      if (needle) {
        const hay =
          `${p.name} ${p.ref} ${p.slug} ${p.repo_full_name ?? ""} ${teamSlugs[p.team_id] ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [projects, q, status, team, framework, tier, teamSlugs]);

  const live = projects.filter((p) => statusOf(p) === "live").length;
  const deleted = projects.filter((p) => statusOf(p) === "deleted").length;
  const arrears = projects.filter((p) => statusOf(p) === "arrears").length;
  const hasFilters = q.trim() !== "" || status !== "all" || team !== ANY || framework !== ANY || tier !== ANY;

  const clear = () => {
    setQ("");
    setStatus("all");
    setTeam(ANY);
    setFramework(ANY);
    setTier(ANY);
  };

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Projects" value={projects.length} icon={FolderGit2} />
        <StatCard label="Live" value={live} icon={FolderGit2} tone="good" />
        <StatCard
          label="Deleted"
          value={deleted}
          hint="retained for charge audit"
          icon={Trash2}
        />
        <StatCard
          label="In arrears"
          value={arrears}
          icon={AlertTriangle}
          tone={arrears > 0 ? "serious" : undefined}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, ref, repo, team…"
            className="pl-8"
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
            <SelectItem value="arrears">In arrears</SelectItem>
          </SelectContent>
        </Select>

        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger className="w-[150px]">
            <Users className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={framework} onValueChange={setFramework}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Framework" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All frameworks</SelectItem>
            {frameworks.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All tiers</SelectItem>
            {tiers.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {projects.length}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <Table
          head={["project", "ref", "team", "repo", "framework", "tier", "deploys", "created", "status"]}
        >
          {filtered.map((p) => (
            <tr
              key={p.id}
              className={`border-t border-border/60 ${p.deleted_at ? "opacity-60" : ""}`}
            >
              <td className="py-1.5 pr-4">
                <Link
                  href={`/deploy/projects/${encodeURIComponent(p.ref)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {p.name}
                </Link>
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">{p.ref}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {teamSlugs[p.team_id] ?? "—"}
              </td>
              <td className="max-w-[260px] truncate py-1.5 pr-4 text-muted-foreground">
                {p.repo_full_name ?? "—"}
              </td>
              <td className="py-1.5 pr-4">{p.framework ?? "—"}</td>
              <td className="py-1.5 pr-4">{p.tier ?? "—"}</td>
              <td className="py-1.5 pr-4">{deployCounts[p.id] ?? 0}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {p.created_at.slice(0, 10)}
              </td>
              <td className="py-1.5">
                <StatusChip status={statusOf(p)} />
              </td>
            </tr>
          ))}
        </Table>
        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No projects match the current filters.
          </p>
        )}
      </div>
    </>
  );
}
