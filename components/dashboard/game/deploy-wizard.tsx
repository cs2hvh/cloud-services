"use client";

// Game server deploy wizard — game → plan → region → configure → deploy.
// Prices are prepaid monthly; the plan grid greys out combinations that no
// region currently has capacity for. Games marked coming-soon (CS2 / FiveM)
// render disabled with their BYO-license note.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, ShieldAlert } from "lucide-react";

import {
  GAME_ICONS,
  type GameOptionsResponse,
} from "./types";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const SERIF: React.CSSProperties = { fontFamily: "var(--font-nunito), system-ui, sans-serif" };

function newIdempotencyKey(): string {
  return `game:${Date.now()}:${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export default function GameDeployWizard() {
  const router = useRouter();
  const [options, setOptions] = useState<GameOptionsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [gameType, setGameType] = useState<string>("");
  const [planSlug, setPlanSlug] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [name, setName] = useState("");
  const [env, setEnv] = useState<Record<string, string>>({});
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idemKey] = useState(newIdempotencyKey);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/services/game/options", { cache: "no-store" });
        const data = (await res.json()) as GameOptionsResponse;
        if (!res.ok || !data.ok) throw new Error("Failed to load options");
        setOptions(data);
        const firstAvailable = data.games.find((g) => g.available);
        if (firstAvailable) setGameType(firstAvailable.id);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load options");
      }
    })();
  }, []);

  const game = useMemo(() => options?.games.find((g) => g.id === gameType) ?? null, [options, gameType]);
  const gamePlans = useMemo(() => (options?.plans ?? []).filter((p) => p.gameType === gameType), [options, gameType]);
  const plan = useMemo(() => gamePlans.find((p) => p.slug === planSlug) ?? null, [gamePlans, planSlug]);

  const regionsForPlan = useMemo(() => {
    if (!options) return [];
    return options.regions.map((r) => ({
      ...r,
      available: planSlug ? Boolean(options.planAvailability[r.region]?.[planSlug]) : true,
    }));
  }, [options, planSlug]);

  // Reset downstream picks when upstream changes.
  useEffect(() => {
    setPlanSlug("");
    setEnv({});
    setEulaAccepted(false);
  }, [gameType]);
  useEffect(() => {
    setRegion((r) => (regionsForPlan.find((x) => x.region === r && x.available) ? r : ""));
  }, [regionsForPlan]);

  const canDeploy =
    Boolean(game?.available && plan && region && name.trim().length >= 3) &&
    (!game?.requiresEula || eulaAccepted) &&
    game!.envSchema.filter((f) => f.required).every((f) => (env[f.key] ?? f.default)?.length > 0);

  const deploy = async () => {
    if (!canDeploy || submitting || !game || !plan) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/services/game/servers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey },
        body: JSON.stringify({
          name: name.trim(),
          gameType: game.id,
          planSlug: plan.slug,
          region,
          environment: env,
          eulaAccepted,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Deployment failed");
        return;
      }
      toast.success("Order placed — provisioning your server");
      router.push(`/dashboard/services/game/${data.serverId}`);
    } catch {
      toast.error("Deployment failed — try again");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return <div className="py-20 text-center text-sm text-red-400">{loadError}</div>;
  }
  if (!options) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <button
        type="button"
        onClick={() => router.push("/dashboard/services/game")}
        className={`${MONO} mb-6 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-white/45 transition-colors hover:text-white`}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Game servers
      </button>

      <h1 className="text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] text-white sm:text-[42px]">
        Deploy a <span style={SERIF} className="font-normal text-[#0095FF]">game server</span>
      </h1>
      <p className={`${MONO} mt-3 text-[11.5px] leading-relaxed text-white/45`}>
        Prepaid monthly — one charge now, your server runs for 30 days, renews automatically.
      </p>

      {!options.deployEnabled && (
        <div className="mt-6 flex items-start gap-3 rounded-[6px] border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[13px] text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          New deployments are temporarily paused — check back soon.
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0">

      {/* 1 · Game */}
      <Section index={1} title="Choose your game">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {options.games.map((g) => {
            const selected = gameType === g.id;
            return (
              <button
                key={g.id}
                type="button"
                disabled={!g.available}
                onClick={() => setGameType(g.id)}
                className={`relative rounded-[8px] border px-4 py-4 text-left transition-all ${
                  selected
                    ? "border-[#0095FF]/50 bg-[#0095FF]/[0.08]"
                    : g.available
                      ? "border-white/[0.08] bg-[#111216] hover:border-white/[0.2]"
                      : "cursor-not-allowed border-white/[0.05] bg-white/[0.01] opacity-45"
                }`}
              >
                <span className="text-xl">{GAME_ICONS[g.id] ?? "🎮"}</span>
                <p className="mt-2 text-sm font-medium text-white">{g.displayName}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/40">
                  {g.available ? g.description : "Coming soon"}
                </p>
                {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-[#0095FF]" />}
              </button>
            );
          })}
        </div>
      </Section>

      {/* 2 · Plan */}
      {game?.available && (
        <Section index={2} title="Pick a plan">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {gamePlans.map((p) => {
              const selected = planSlug === p.slug;
              const anyRegionFits = options.regions.some((r) => options.planAvailability[r.region]?.[p.slug]);
              return (
                <button
                  key={p.slug}
                  type="button"
                  disabled={!anyRegionFits}
                  onClick={() => setPlanSlug(p.slug)}
                  className={`relative rounded-[8px] border px-4 py-4 text-left transition-all ${
                    selected
                      ? "border-[#0095FF]/50 bg-[#0095FF]/[0.08]"
                      : anyRegionFits
                        ? "border-white/[0.08] bg-[#111216] hover:border-white/[0.2]"
                        : "cursor-not-allowed border-white/[0.05] bg-white/[0.01] opacity-45"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  {p.tagline && <p className="mt-0.5 text-[11px] text-white/40">{p.tagline}</p>}
                  <p className="mt-3">
                    <span style={SERIF} className="text-[24px] font-bold leading-none tabular-nums text-white">${p.monthlyPrice.toFixed(2)}</span>
                    <span className={`${MONO} ml-1 text-[10px] uppercase tracking-wider text-white/40`}>/mo</span>
                  </p>
                  <div className={`${MONO} mt-2 space-y-0.5 text-[11px] text-white/45`}>
                    <p>{(p.memoryMB / 1024).toFixed(0)} GB RAM · {p.diskGB} GB NVMe</p>
                    <p>{(p.cpuPct / 100).toFixed(1)} vCPU · {p.backups} backups</p>
                  </div>
                  {!anyRegionFits && <p className="mt-2 text-[10.5px] text-amber-300/80">No capacity right now</p>}
                  {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-[#0095FF]" />}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* 3 · Region */}
      {plan && (
        <Section index={3} title="Choose a region">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {regionsForPlan.map((r) => {
              const selected = region === r.region;
              return (
                <button
                  key={r.region}
                  type="button"
                  disabled={!r.available}
                  onClick={() => setRegion(r.region)}
                  className={`relative rounded-[8px] border px-4 py-3.5 text-left transition-all ${
                    selected
                      ? "border-[#0095FF]/50 bg-[#0095FF]/[0.08]"
                      : r.available
                        ? "border-white/[0.08] bg-[#111216] hover:border-white/[0.2]"
                        : "cursor-not-allowed border-white/[0.05] bg-white/[0.01] opacity-45"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{r.displayRegion}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {r.available ? `${r.hosts} machine${r.hosts === 1 ? "" : "s"}` : "At capacity"}
                  </p>
                  {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-[#0095FF]" />}
                </button>
              );
            })}
            {regionsForPlan.length === 0 && (
              <p className="col-span-full text-[13px] text-white/40">No regions online yet.</p>
            )}
          </div>
        </Section>
      )}

      {/* 4 · Configure */}
      {plan && region && game && (
        <Section index={4} title="Configure">
          <div className="grid gap-4 sm:max-w-[560px]">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-white/60">Server name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-awesome-server"
                maxLength={48}
                className="h-10 w-full border border-white/[0.1] bg-black/20 px-3 text-sm text-white placeholder:text-white/25 focus:border-[#0095FF]/50 focus:outline-none"
              />
            </label>

            {game.envSchema.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-white/60">
                  {f.label}
                  {f.required && <span className="ml-1 text-red-400">*</span>}
                </span>
                <input
                  type={f.secret ? "password" : "text"}
                  value={env[f.key] ?? ""}
                  onChange={(e) => setEnv((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.default || undefined}
                  className="h-10 w-full border border-white/[0.1] bg-black/20 px-3 text-sm text-white placeholder:text-white/25 focus:border-[#0095FF]/50 focus:outline-none"
                />
                {f.help && <span className="mt-1 block text-[11px] text-white/35">{f.help}</span>}
              </label>
            ))}

            {game.requiresEula && (
              <label className="flex items-start gap-2.5 text-[12.5px] text-white/60">
                <input
                  type="checkbox"
                  checked={eulaAccepted}
                  onChange={(e) => setEulaAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#0095FF]"
                />
                <span>
                  I accept the{" "}
                  <a href="https://www.minecraft.net/en-us/eula" target="_blank" rel="noopener noreferrer" className="text-[#82adfb] underline underline-offset-2">
                    Minecraft EULA
                  </a>
                </span>
              </label>
            )}
          </div>
        </Section>
      )}

        </div>
        {/* end left column */}

        {/* Order summary (sticky checkout) */}
        <aside className="lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#111216]">
            <div className="h-px w-full bg-gradient-to-r from-[#0095FF]/40 via-[#0095FF]/10 to-transparent" />
            <div className="px-5 py-5">
              <p className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40`}>Order summary</p>
              <div className="mt-4 space-y-3">
                <SummaryRow label="Game" value={game?.available ? game.displayName : "—"} icon={game?.available ? GAME_ICONS[game.id] : undefined} />
                <SummaryRow label="Plan" value={plan?.name ?? "—"} />
                <SummaryRow label="Region" value={regionsForPlan.find((r) => r.region === region)?.displayRegion ?? "—"} />
                <SummaryRow label="Name" value={name.trim() || "—"} />
              </div>
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <div className="flex items-baseline justify-between">
                  <span className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/45`}>Due now</span>
                  <span style={SERIF} className="text-[32px] font-bold leading-none tabular-nums text-white">
                    ${(plan?.monthlyPrice ?? 0).toFixed(2)}
                  </span>
                </div>
                <p className={`${MONO} mt-1 text-right text-[10.5px] text-white/35`}>per month · auto-renews</p>
              </div>
              <button
                type="button"
                disabled={!canDeploy || submitting || !options.deployEnabled}
                onClick={() => void deploy()}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[5px] border border-[#0095FF]/30 bg-[#0095FF] text-sm font-semibold text-white transition-colors hover:bg-[#33adff] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.06] disabled:text-white/30"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? "Placing order…" : "Deploy server"}
              </button>
              <p className={`${MONO} mt-3 text-center text-[10px] leading-relaxed text-white/30`}>
                Charged to your balance now. Cancel anytime — turn off auto-renew and it stops at period end.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9 first:mt-0">
      <h2 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-white">
        <span className={`${MONO} inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-[#0095FF]/25 bg-[#0095FF]/[0.08] text-[11px] font-semibold text-[#82adfb]`}>
          {index}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`${MONO} text-[11px] uppercase tracking-[0.1em] text-white/40`}>{label}</span>
      <span className="flex items-center gap-1.5 truncate text-right text-[13px] text-white/85">
        {icon && <span className="text-sm">{icon}</span>}
        {value}
      </span>
    </div>
  );
}
