"use client";

// Game servers — marketing page body. Editorial house style: dark #08090b
// canvas, dotted grid + aurora glow, MONO eyebrows, Nunito display accents,
// brand-blue #0095FF. Hero mirrors the launcher concept: a featured-game
// showcase on the left, a clickable rail of games on the right.
//
// Game art is intentionally CSS-only (per-game gradient scenes + monogram) —
// CSP-safe placeholders until real key art lands on the CDN.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
    ArrowRight,
    Check,
    CheckCircle2,
    Cpu,
    DatabaseBackup,
    Gauge,
    Puzzle,
    ShieldCheck,
    TerminalSquare,
    Timer,
    Zap,
} from "lucide-react";

const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

// The hero auto-advances through the games; the active rail card shows a filling
// progress bar synced to this interval, and any manual click resets the countdown.
const AUTO_ADVANCE_MS = 10000;

// Universal selling points appended to each game's own chips in the pricing
// card's hover panel (keeps every card at a tidy 6-item, two-column checklist).
const CARD_EXTRA_FEATURES = ["Full console", "DDoS protection", "24/7 support"];

// ─── Catalog (matches game_catalog + game_server_plans) ──────────────────────

interface GamePlan {
    name: string;
    ramGB: number;
    monthlyUSD: number;
}

interface Game {
    id: string;
    name: string;
    shortName: string;
    monogram: string;
    tagline: string;
    description: string;
    fromUSD: number;
    modLine: string;
    chips: string[];
    /** CSS gradient scene used as key-art placeholder. */
    art: string;
    artGlow: string;
    /** Wide (16:9-ish) key-art layered behind the hero gradient, blurred + dimmed. */
    artImage?: string;
    /** Square (1:1) key-art used for the portrait pricing cards. */
    artSquare?: string;
    plans: GamePlan[];
}

const GAMES: Game[] = [
    {
        id: "minecraft",
        name: "Minecraft",
        shortName: "Minecraft",
        monogram: "MC",
        tagline: "Java Edition · Paper",
        description:
            "Paper-powered Java servers with full plugin support. Pick a version, invite your friends, and keep every world safe with automated backups.",
        fromUSD: 4,
        modLine: "Paper plugins · any version",
        chips: ["Paper & plugins", "Version picker", "Instant setup"],
        art: "radial-gradient(120% 90% at 15% 10%, rgba(74,222,128,0.32), transparent 55%), radial-gradient(100% 80% at 85% 90%, rgba(16,185,129,0.22), transparent 60%), linear-gradient(160deg, #0c1f14, #08090b 70%)",
        artGlow: "rgba(74,222,128,0.35)",
        artImage: "/game/minecraft.png",
        artSquare: "/game/minecraft2.png",
        plans: [
            { name: "2 GB", ramGB: 2, monthlyUSD: 4 },
            { name: "4 GB", ramGB: 4, monthlyUSD: 8 },
            { name: "8 GB", ramGB: 8, monthlyUSD: 15 },
            { name: "12 GB", ramGB: 12, monthlyUSD: 22 },
        ],
    },
    {
        id: "rust",
        name: "Rust",
        shortName: "Rust",
        monogram: "RU",
        tagline: "Oxide & Carbon ready",
        description:
            "High-clock RustDedicated servers that hold their tick rate on wipe day. Oxide and Carbon modding out of the box, custom maps, and RCON access.",
        fromUSD: 18,
        modLine: "Oxide & Carbon · custom maps",
        chips: ["Oxide / Carbon", "Wipe-day stable", "RCON access"],
        art: "radial-gradient(120% 90% at 20% 15%, rgba(249,115,22,0.30), transparent 55%), radial-gradient(90% 70% at 85% 85%, rgba(180,83,9,0.24), transparent 60%), linear-gradient(160deg, #1f130a, #08090b 70%)",
        artGlow: "rgba(249,115,22,0.35)",
        artImage: "/game/Rust.png",
        artSquare: "/game/Rust2.png",
        plans: [
            { name: "6 GB", ramGB: 6, monthlyUSD: 18 },
            { name: "8 GB", ramGB: 8, monthlyUSD: 24 },
            { name: "12 GB", ramGB: 12, monthlyUSD: 34 },
        ],
    },
    {
        id: "cs2",
        name: "Counter-Strike 2",
        shortName: "CS2",
        monogram: "CS",
        tagline: "128-tick ready · GSLT",
        description:
            "Competitive CS2 servers on dedicated high-frequency cores. Bring your Steam GSLT, load your configs and workshop maps, and scrim without jitter.",
        fromUSD: 9,
        modLine: "Workshop maps · custom configs",
        chips: ["Low-latency cores", "Workshop maps", "Match configs"],
        art: "radial-gradient(120% 90% at 18% 12%, rgba(250,204,21,0.26), transparent 55%), radial-gradient(90% 75% at 85% 88%, rgba(0,149,255,0.18), transparent 60%), linear-gradient(160deg, #1a160a, #08090b 70%)",
        artGlow: "rgba(250,204,21,0.30)",
        artImage: "/game/cs2.png",
        artSquare: "/game/cs2-2.png",
        plans: [
            { name: "Standard", ramGB: 3, monthlyUSD: 9 },
            { name: "Plus", ramGB: 4, monthlyUSD: 14 },
        ],
    },
    {
        id: "fivem",
        name: "FiveM (GTA V)",
        shortName: "FiveM",
        monogram: "FM",
        tagline: "FXServer + txAdmin",
        description:
            "Roleplay-grade FXServer hosting with txAdmin preinstalled. Bring your cfx.re key, drop in your resources, and scale RAM as your city grows.",
        fromUSD: 12,
        modLine: "txAdmin console · ESX / QBCore",
        chips: ["txAdmin built-in", "ESX / QBCore", "Scales to 16 GB"],
        art: "radial-gradient(120% 90% at 18% 12%, rgba(251,146,60,0.28), transparent 55%), radial-gradient(95% 80% at 85% 88%, rgba(139,92,246,0.20), transparent 60%), linear-gradient(160deg, #180f1d, #08090b 70%)",
        artGlow: "rgba(251,146,60,0.32)",
        artImage: "/game/fivem.png",
        artSquare: "/game/fivem2.png",
        plans: [
            { name: "4 GB", ramGB: 4, monthlyUSD: 12 },
            { name: "8 GB", ramGB: 8, monthlyUSD: 22 },
            { name: "16 GB", ramGB: 16, monthlyUSD: 44 },
        ],
    },
];

const DEPLOY_HREF = "/dashboard/services/game";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GamesServicePage() {
    const [featuredId, setFeaturedId] = useState<string>("fivem");
    const featured = GAMES.find((g) => g.id === featuredId) ?? GAMES[0];

    // Auto-advance to the next game every AUTO_ADVANCE_MS. The timer is keyed to
    // featuredId, so selecting a game (which changes featuredId) restarts the
    // countdown — and its progress bar — from that game.
    useEffect(() => {
        const timer = setTimeout(() => {
            setFeaturedId((current) => {
                const index = GAMES.findIndex((g) => g.id === current);
                return GAMES[(index + 1) % GAMES.length]!.id;
            });
        }, AUTO_ADVANCE_MS);
        return () => clearTimeout(timer);
    }, [featuredId]);

    return (
        <main className="relative bg-[#08090b] text-white overflow-hidden">
            {/* Canvas: aurora + dotted grid */}
            <div className="pointer-events-none absolute inset-0 z-0">
                <div
                    className="absolute -top-[280px] -right-[220px] h-[820px] w-[820px] blur-[70px]"
                    style={{ background: "radial-gradient(circle, rgba(0,149,255,0.08), transparent 60%)" }}
                />
                <div
                    className="absolute top-[38%] -left-[260px] h-[700px] w-[700px] blur-[80px]"
                    style={{ background: "radial-gradient(circle, rgba(0,149,255,0.05), transparent 60%)" }}
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

            {/* ─── 01 · Hero — featured game + switcher rail ─────────────── */}
            <section className="relative z-10 px-6 sm:px-10 pt-24 sm:pt-28 pb-14 max-w-[1280px] 2xl:max-w-[1600px] mx-auto">
                <h1 className="text-[38px] sm:text-[52px] leading-[1.04] tracking-[-0.028em] font-semibold max-w-[720px]">
                    Your server,{" "}
                    <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                        online in a minute
                    </span>
                    .
                </h1>
                <p className={`${MONO} mt-4 max-w-[560px] text-[12px] leading-relaxed text-white/45`}>
                    Dedicated game hosting on high-clock CPUs and NVMe — DDoS-protected,
                    mod-ready, and managed from a full web console. Per-month pricing,
                    cancel anytime.
                </p>

                <div className="mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-stretch">
                    {/* Featured showcase — the whole face crossfades on shift */}
                    <div className="relative overflow-hidden rounded-[10px] border border-white/[0.08] min-h-[420px]">
                        <AnimatePresence>
                            <motion.div
                                key={featuredId}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                                className="absolute inset-0 flex"
                                style={{ background: featured.art }}
                            >
                        {/* Photographic key-art — shown near full strength so the
                            scene actually reads. Legibility comes from a directional
                            scrim on the left (where the copy sits) rather than from
                            blurring or dimming the whole image. */}
                        {featured.artImage && (
                            <div aria-hidden className="absolute inset-0">
                                <img
                                    src={featured.artImage}
                                    alt=""
                                    className="h-full w-full object-cover opacity-[0.92]"
                                />
                                {/* Left-weighted scrim: near-solid behind the text
                                    column, clearing to nothing by mid-frame so the
                                    right side of the artwork stays fully visible. */}
                                <div className="absolute inset-0 bg-gradient-to-r from-[#08090b] from-[6%] via-[#08090b]/72 via-[38%] to-transparent to-[72%]" />
                                {/* Gentle floor so bottom-edge detail doesn't clash
                                    with the chips and CTA row. */}
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#08090b]/80 to-transparent" />
                            </div>
                        )}
                        {/* scene texture */}
                        <div
                            aria-hidden
                            className="absolute inset-0"
                            style={{
                                backgroundImage:
                                    "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
                                backgroundSize: "22px 22px",
                                maskImage: "linear-gradient(to top, transparent 30%, black)",
                                WebkitMaskImage: "linear-gradient(to top, transparent 30%, black)",
                            }}
                        />
                        {/* giant monogram */}
                        <span
                            aria-hidden
                            style={SERIF_STYLE}
                            className="absolute -right-6 -top-10 text-[240px] font-bold leading-none text-white/[0.05] select-none"
                        >
                            {featured.monogram}
                        </span>
                        {/* Bottom veil, confined to the left half so it grounds the
                            copy without flattening the artwork on the right. */}
                        <div className="pointer-events-none absolute inset-y-0 left-0 w-3/5 bg-gradient-to-t from-[#08090b] via-[#08090b]/45 to-transparent" />

                        <motion.div
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                            className="relative self-end p-7 sm:p-9 max-w-[560px]"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <span
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/[0.14] bg-white/[0.06] backdrop-blur-sm"
                                    style={{ boxShadow: `0 0 24px ${featured.artGlow}` }}
                                >
                                    <span className={`${MONO} text-[13px] font-bold text-white`}>
                                        {featured.monogram}
                                    </span>
                                </span>
                                <div>
                                    <h2 className="text-[24px] font-semibold tracking-[-0.015em] leading-none">
                                        {featured.name}
                                    </h2>
                                    <p className={`${MONO} mt-1 text-[10px] uppercase tracking-[0.14em] text-white/50`}>
                                        {featured.tagline}
                                    </p>
                                </div>
                            </div>

                            <p className="text-[13.5px] leading-relaxed text-white/70 mb-4">
                                {featured.description}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5 mb-6">
                                {featured.chips.map((chip) => (
                                    <span
                                        key={chip}
                                        className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/60 border border-white/[0.14] bg-black/30 backdrop-blur-sm rounded-[4px] px-2 py-1`}
                                    >
                                        {chip}
                                    </span>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-4">
                                <Link
                                    href={DEPLOY_HREF}
                                    className={`${MONO} inline-flex h-11 items-center gap-2 px-5 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] bg-[linear-gradient(135deg,#0095FF,#0066B3)] text-white shadow-[0_8px_20px_rgba(0,149,255,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-none hover:bg-white hover:text-black`}
                                >
                                    Create server
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                                <p className={`${MONO} text-[11px] text-white/50`}>
                                    from{" "}
                                    <span style={SERIF_STYLE} className="text-[17px] font-bold text-white">
                                        ${featured.fromUSD}
                                    </span>
                                    /mo
                                </p>
                            </div>
                        </motion.div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Switcher rail — cards stretch to match the featured card height */}
                    <div className="flex h-full flex-col gap-2.5">
                        {GAMES.map((game) => {
                            const active = game.id === featuredId;
                            return (
                                <button
                                    key={game.id}
                                    type="button"
                                    onClick={() => setFeaturedId(game.id)}
                                    aria-pressed={active}
                                    className="group relative flex flex-1 items-center gap-3.5 overflow-hidden rounded-[8px] border px-4 py-3.5 text-left transition-all duration-300 ease-out"
                                    style={{
                                        borderColor: active ? "rgba(0,149,255,0.45)" : "rgba(255,255,255,0.07)",
                                        background: active ? "#111a24" : "#111216",
                                        boxShadow: active ? "0 0 0 1px rgba(0,149,255,0.25), 0 8px 24px rgba(0,0,0,0.35)" : "none",
                                    }}
                                >
                                    <span
                                        aria-hidden
                                        className="h-11 w-11 shrink-0 rounded-[6px] border border-white/[0.1] flex items-center justify-center"
                                        style={{ background: game.art }}
                                    >
                                        <span className={`${MONO} text-[11px] font-bold text-white/90`}>
                                            {game.monogram}
                                        </span>
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13.5px] font-semibold tracking-[-0.01em] text-white">
                                            {game.shortName}
                                        </span>
                                        <span className={`${MONO} block text-[9.5px] uppercase tracking-[0.1em] text-white/40 mt-0.5 truncate`}>
                                            {game.modLine}
                                        </span>
                                    </span>
                                    {/* Auto-advance progress bar — fills over the
                                        10s window, then the hero shifts to the next
                                        game. Remounts (via key) whenever the active
                                        game changes, restarting the fill. */}
                                    {active && (
                                        <motion.span
                                            key={featuredId}
                                            aria-hidden
                                            className="absolute inset-x-0 bottom-0 h-[2.5px] origin-left rounded-full"
                                            style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_BRIGHT})` }}
                                            initial={{ scaleX: 0 }}
                                            animate={{ scaleX: 1 }}
                                            transition={{ duration: AUTO_ADVANCE_MS / 1000, ease: "linear" }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Stat strip */}
                <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0d0e12]">
                    {[
                        { value: "< 60s", label: "Server online" },
                        { value: "L3/L4", label: "DDoS included" },
                        { value: "NVMe", label: "High-clock CPUs" },
                        { value: "24/7", label: "Human support" },
                    ].map((stat, i) => (
                        <div
                            key={stat.label}
                            className={`px-5 py-4 ${i > 0 ? "border-l border-white/[0.05]" : ""} ${i >= 2 ? "max-sm:border-l-0 max-sm:border-t max-sm:border-white/[0.05]" : ""} ${i === 1 ? "" : ""} ${i === 3 ? "max-sm:border-l max-sm:border-white/[0.05]" : ""}`}
                        >
                            <p style={SERIF_STYLE} className="text-[22px] font-bold tracking-[-0.02em] leading-none">
                                {stat.value}
                            </p>
                            <p className={`${MONO} mt-1.5 text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>
                                {stat.label}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── 02 · Platform features ────────────────────────────────── */}
            <section className="relative z-10 px-6 sm:px-10 py-16 max-w-[1280px] 2xl:max-w-[1600px] mx-auto border-t border-white/[0.05]">
                <SectionHead
                    num="02"
                    title={
                        <>
                            Built like game infrastructure,{" "}
                            <span style={{ color: ACCENT }}>not shared hosting</span>
                        </>
                    }
                    desc="Every server runs isolated on dedicated resources with the tooling serious communities expect."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Feature
                        icon={<Zap className="h-4 w-4" />}
                        title="Online in under a minute"
                        desc="Pick a game and a plan — provisioning, ports, and the panel account are automated end to end."
                    />
                    <Feature
                        icon={<ShieldCheck className="h-4 w-4" />}
                        title="Always-on DDoS protection"
                        desc="L3/L4 mitigation sits in front of every game port by default. Wipe-day floods stay off your tick rate."
                    />
                    <Feature
                        icon={<TerminalSquare className="h-4 w-4" />}
                        title="Full web console"
                        desc="Live console, file manager, SFTP, scheduled tasks, and sub-user access — no ticket needed to change a config."
                    />
                    <Feature
                        icon={<Puzzle className="h-4 w-4" />}
                        title="Mods and plugins, unrestricted"
                        desc="Paper plugins, Oxide/Carbon, workshop content, txAdmin recipes — upload anything your game supports."
                    />
                    <Feature
                        icon={<DatabaseBackup className="h-4 w-4" />}
                        title="Automated backups"
                        desc="Scheduled world and config backups with one-click restore. Bad plugin update? Roll back in seconds."
                    />
                    <Feature
                        icon={<Cpu className="h-4 w-4" />}
                        title="High-clock cores + NVMe"
                        desc="Game loops love single-thread speed. Your server gets high-frequency CPUs and NVMe I/O, never oversold burst."
                    />
                </div>
            </section>

            {/* ─── 03 · How it works ─────────────────────────────────────── */}
            <section className="relative z-10 px-6 sm:px-10 py-16 max-w-[1280px] 2xl:max-w-[1600px] mx-auto border-t border-white/[0.05]">
                <SectionHead
                    num="03"
                    title="From zero to invite link"
                    desc="Three steps — no Linux knowledge required."
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        {
                            step: "Step 01",
                            title: "Pick your game",
                            desc: "Minecraft, Rust, CS2, or FiveM — each preconfigured with sane defaults and the right runtime.",
                            icon: <Gauge className="h-4 w-4" />,
                        },
                        {
                            step: "Step 02",
                            title: "Choose a plan",
                            desc: "Size RAM to your player count. Upgrade any time — your world, mods, and configs move with you.",
                            icon: <Cpu className="h-4 w-4" />,
                        },
                        {
                            step: "Step 03",
                            title: "Share the IP",
                            desc: "Your server boots in under a minute with the console live. Drop the invite link and play.",
                            icon: <Timer className="h-4 w-4" />,
                        },
                    ].map((s, i) => (
                        <div
                            key={s.step}
                            className="group relative border border-white/[0.06] bg-[#111216] rounded-[8px] px-6 py-6 overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#0095FF] hover:shadow-[0_14px_34px_-16px_rgba(0,149,255,0.45)]"
                        >
                            <span
                                aria-hidden
                                style={SERIF_STYLE}
                                className="absolute -right-2 -top-6 text-[96px] font-bold leading-none text-white/[0.04] select-none"
                            >
                                {i + 1}
                            </span>
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-white/[0.1] bg-white/[0.04] text-[#33adff] mb-4">
                                {s.icon}
                            </span>
                            <p className={`${MONO} text-[9.5px] uppercase tracking-[0.16em] text-white/35 mb-1.5`}>
                                {s.step}
                            </p>
                            <h3 className="text-[15.5px] font-semibold tracking-[-0.01em] mb-2 transition-colors group-hover:text-[#0095FF]">{s.title}</h3>
                            <p className={`${MONO} text-[11px] leading-relaxed text-white/45`}>{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── 04 · Pricing ──────────────────────────────────────────── */}
            <section className="relative z-10 px-6 sm:px-10 py-16 max-w-[1280px] 2xl:max-w-[1600px] mx-auto border-t border-white/[0.05]">
                <SectionHead
                    num="04"
                    title="Simple per-month pricing"
                    desc="Every plan includes DDoS protection, the full console, backups, and unmetered game traffic. No setup fees."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {GAMES.map((game) => (
                        <div
                            key={game.id}
                            className="group relative aspect-[3/4] overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111216]"
                        >
                            {/* Gradient tint fallback, then the key-art on top */}
                            <div aria-hidden className="absolute inset-0" style={{ background: game.art }} />
                            <img
                                src={game.artSquare ?? game.artImage}
                                alt={game.name}
                                className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
                            />

                            {/* Resting label — desktop only (name + starting price,
                                fades out on hover). Hidden on touch/small screens
                                where the detail panel is shown by default. */}
                            <div className="absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-10 transition-opacity duration-300 lg:block lg:group-hover:opacity-0">
                                <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{game.shortName}</h3>
                                <p className={`${MONO} mt-0.5 text-[9.5px] uppercase tracking-[0.14em] text-white/60`}>
                                    from ${game.fromUSD}/mo
                                </p>
                            </div>

                            {/* Detail division — shown by default on touch/small
                                screens; on lg+ it hides and slides up on hover. */}
                            <div className="absolute inset-x-0 bottom-0 translate-y-0 border-t border-white/[0.08] bg-[#0b0d10]/95 p-5 backdrop-blur-sm transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:translate-y-full lg:group-hover:translate-y-0">
                                <h3 className="mb-3 text-[15px] font-semibold tracking-[-0.01em]">{game.shortName}</h3>
                                <div className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2">
                                    {Array.from(new Set([...game.chips, ...CARD_EXTRA_FEATURES])).map((feat) => (
                                        <div
                                            key={feat}
                                            className={`${MONO} flex items-start gap-1.5 text-[10px] leading-snug text-white/75`}
                                        >
                                            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                            <span>{feat}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center gap-3">
                                    <Link
                                        href={DEPLOY_HREF}
                                        className={`${MONO} inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[5px] bg-[linear-gradient(135deg,#0095FF,#0066B3)] text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_6px_16px_rgba(0,149,255,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-none hover:bg-white hover:text-black`}
                                    >
                                        Deploy {game.shortName}
                                        <ArrowRight className="h-3 w-3" />
                                    </Link>
                                    <div className="shrink-0 text-right">
                                        <p className={`${MONO} text-[8px] uppercase tracking-[0.14em] text-white/40`}>
                                            Starting
                                        </p>
                                        <p className="text-[13px] font-semibold text-white">
                                            ${game.fromUSD}
                                            <span className="text-[10px] font-normal text-white/45">/mo</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className={`${MONO} mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.12em] text-white/35`}>
                    {["DDoS protection included", "Automated backups", "Full console & SFTP", "Cancel anytime"].map((note) => (
                        <span key={note} className="inline-flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-emerald-400/80" />
                            {note}
                        </span>
                    ))}
                </div>
            </section>

            {/* ─── CTA band ──────────────────────────────────────────────── */}
            <section className="relative z-10 px-6 sm:px-10 pb-24 pt-4 max-w-[1280px] 2xl:max-w-[1600px] mx-auto">
                <div
                    className="relative overflow-hidden rounded-[10px] border border-white/[0.08] px-8 py-12 sm:px-12 text-center"
                    style={{
                        background:
                            "radial-gradient(80% 120% at 50% 0%, rgba(0,149,255,0.14), transparent 60%), #0d0e12",
                    }}
                >
                    <p className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/45 mb-3`}>
                        Ready when you are
                    </p>
                    <h2 className="text-[26px] sm:text-[32px] font-semibold tracking-[-0.02em] max-w-[560px] mx-auto leading-[1.15]">
                        Spin up your first game server{" "}
                        <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                            tonight
                        </span>
                        .
                    </h2>
                    <p className={`${MONO} mt-3 text-[11.5px] text-white/45 max-w-[420px] mx-auto leading-relaxed`}>
                        From ${Math.min(...GAMES.map((g) => g.fromUSD))}/month — online before your
                        friends finish the download.
                    </p>
                    <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                        <Link
                            href={DEPLOY_HREF}
                            className={`${MONO} inline-flex h-11 items-center gap-2 px-6 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] bg-[linear-gradient(135deg,#0095FF,#0066B3)] text-white shadow-[0_8px_20px_rgba(0,149,255,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-none hover:bg-white hover:text-black`}
                        >
                            Create server
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                            href="/contact"
                            className={`${MONO} inline-flex h-11 items-center px-6 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] border border-white/[0.14] text-white/75 hover:text-white hover:bg-white/[0.04] transition-colors`}
                        >
                            Talk to us
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function SectionHead({ num, title, desc }: { num: string; title: React.ReactNode; desc: string }) {
    return (
        <header className="mb-8 max-w-[640px]">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/35 mb-2`}>
                {num} —
            </p>
            <h2 className="text-[24px] sm:text-[30px] font-semibold tracking-[-0.02em] leading-[1.15]">
                {title}
            </h2>
            <p className={`${MONO} mt-3 text-[11.5px] leading-relaxed text-white/45`}>{desc}</p>
        </header>
    );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
    return (
        <div className="group border border-white/[0.06] bg-[#111216] rounded-[8px] px-5 py-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#0095FF] hover:shadow-[0_14px_34px_-16px_rgba(0,149,255,0.45)]">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-white/[0.1] bg-white/[0.04] text-[#33adff] mb-4">
                {icon}
            </span>
            <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] mb-1.5 transition-colors group-hover:text-[#0095FF]">{title}</h3>
            <p className={`${MONO} text-[11px] leading-relaxed text-white/45`}>{desc}</p>
        </div>
    );
}
