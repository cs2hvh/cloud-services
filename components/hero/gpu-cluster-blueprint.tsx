"use client";

// GpuClusterBlueprint — engineering-style schematic of an 8-GPU NVLink
// cluster. Replaces the heavy TensorScene 3D canvas in the hero. Pure
// SVG + CSS animation — light, scalable, ties to the GPU pitch.
//
// Topology mirrors a real NVIDIA HGX baseboard: 4 GPUs above and
// 4 below a central NVLink switch bar, with vertical NVLink lines
// connecting each GPU through the switch. Small blue pulse dots
// travel along each line on a staggered cadence to suggest active
// fabric traffic.

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

// ─── SVG layout constants ──────────────────────────────────────
const VB_W = 640;
const VB_H = 720;
const FRAME_INSET = 24;

const CARD_W = 110;
const CARD_H = 68;
const CARD_RX = 4;

const TOP_ROW_Y = 132; // top edge of top cards
const BOT_ROW_Y = 520; // top edge of bottom cards

const SWITCH_Y = 286;
const SWITCH_H = 108;

// Four x-center positions for cards (4 evenly across)
const COLS = [124, 256, 388, 520];

// ─── GPU card glyph ────────────────────────────────────────────
function GpuCard({
    cx,
    y,
    label,
    index,
    delay = 0,
}: {
    cx: number;
    y: number;
    label: string;
    index: string;
    delay?: number;
}) {
    const x = cx - CARD_W / 2;
    return (
        <g transform={`translate(${x}, ${y})`}>
            {/* Outer card */}
            <rect
                width={CARD_W}
                height={CARD_H}
                rx={CARD_RX}
                fill="rgba(255,255,255,0.015)"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1}
            />

            {/* Top inset highlight */}
            <line
                x1={1}
                y1={1}
                x2={CARD_W - 1}
                y2={1}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={0.5}
            />

            {/* Two HBM stack indicators on the right */}
            <g transform={`translate(${CARD_W - 22}, 10)`}>
                <rect
                    width={5}
                    height={CARD_H - 20}
                    rx={1}
                    fill="rgba(255,255,255,0.05)"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.5}
                />
                <rect
                    x={9}
                    width={5}
                    height={CARD_H - 20}
                    rx={1}
                    fill="rgba(255,255,255,0.05)"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.5}
                />
            </g>

            {/* "GPU" eyebrow */}
            <text
                x={10}
                y={16}
                className={MONO}
                fontSize="8"
                fill="rgba(255,255,255,0.35)"
                letterSpacing="1.5"
            >
                GPU {index}
            </text>

            {/* Model label */}
            <text
                x={10}
                y={38}
                className={MONO}
                fontSize="14"
                fontWeight="600"
                fill="rgba(255,255,255,0.92)"
                letterSpacing="0.5"
            >
                {label}
            </text>

            {/* Status LED dot */}
            <g transform={`translate(10, ${CARD_H - 14})`}>
                <circle
                    r={3.5}
                    fill={ACCENT}
                    opacity={0.18}
                    className="blueprint-led-glow"
                    style={{ animationDelay: `${delay}s` }}
                />
                <circle
                    r={1.6}
                    fill={ACCENT}
                    className="blueprint-led"
                    style={{ animationDelay: `${delay}s` }}
                />
            </g>
            <text
                x={20}
                y={CARD_H - 10}
                className={MONO}
                fontSize="7.5"
                fill="rgba(255,255,255,0.45)"
                letterSpacing="1.4"
            >
                ONLINE
            </text>
        </g>
    );
}

// ─── NVLink Switch bar (the central hub) ───────────────────────
function NVLinkSwitch() {
    const x = FRAME_INSET + 16;
    const w = VB_W - 2 * FRAME_INSET - 32;
    return (
        <g transform={`translate(${x}, ${SWITCH_Y})`}>
            {/* Outer switch chassis */}
            <rect
                width={w}
                height={SWITCH_H}
                rx={6}
                fill="rgba(0,149,255,0.04)"
                stroke="rgba(0,149,255,0.45)"
                strokeWidth={1}
            />

            {/* Inset top highlight */}
            <line
                x1={1}
                y1={1}
                x2={w - 1}
                y2={1}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={0.5}
            />

            {/* Eyebrow */}
            <text
                x={18}
                y={22}
                className={MONO}
                fontSize="9"
                fill="rgba(0,149,255,0.85)"
                letterSpacing="2"
            >
                NVLINK SWITCH
            </text>

            {/* Bandwidth headline */}
            <text
                x={18}
                y={50}
                className={MONO}
                fontSize="22"
                fontWeight="700"
                fill="rgba(255,255,255,0.95)"
                letterSpacing="0.5"
            >
                900
                <tspan
                    fontSize="11"
                    fontWeight="500"
                    fill="rgba(255,255,255,0.55)"
                    dx="4"
                >
                    GB/s
                </tspan>
                <tspan
                    fontSize="11"
                    fontWeight="500"
                    fill="rgba(255,255,255,0.35)"
                    dx="8"
                >
                    GPU↔GPU
                </tspan>
            </text>

            {/* Sub-line */}
            <text
                x={18}
                y={70}
                className={MONO}
                fontSize="8.5"
                fill="rgba(255,255,255,0.45)"
                letterSpacing="1.6"
            >
                4TH-GEN FABRIC · ALL-TO-ALL · NON-BLOCKING
            </text>

            {/* Activity meter — 8 segments matching 8 GPUs, each pulsing */}
            <g transform={`translate(18, ${SWITCH_H - 20})`}>
                {Array.from({ length: 24 }).map((_, i) => (
                    <rect
                        key={i}
                        x={i * 9}
                        width={6}
                        height={4}
                        rx={0.5}
                        fill={ACCENT}
                        className="blueprint-meter-bar"
                        style={{ animationDelay: `${(i * 0.08) % 1.6}s` }}
                    />
                ))}
            </g>

            {/* Right-side chip glyph */}
            <g transform={`translate(${w - 80}, 18)`}>
                <rect
                    width={62}
                    height={SWITCH_H - 36}
                    rx={3}
                    fill="rgba(255,255,255,0.025)"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.5}
                />
                <text
                    x={31}
                    y={20}
                    textAnchor="middle"
                    className={MONO}
                    fontSize="8"
                    fill="rgba(255,255,255,0.45)"
                    letterSpacing="1.5"
                >
                    NVSwitch
                </text>
                <text
                    x={31}
                    y={40}
                    textAnchor="middle"
                    className={MONO}
                    fontSize="16"
                    fontWeight="700"
                    fill={ACCENT}
                    letterSpacing="0.5"
                    opacity={0.85}
                >
                    01
                </text>
            </g>
        </g>
    );
}

// ─── Pulse dot traveling along a vertical line ─────────────────
// Direction: 1 = downward (top→bottom), -1 = upward
function PulseDot({
    cx,
    y1,
    y2,
    delay = 0,
    duration = 3.6,
}: {
    cx: number;
    y1: number;
    y2: number;
    delay?: number;
    duration?: number;
}) {
    return (
        <g>
            <circle r={2.4} fill={ACCENT} opacity={0.95}>
                <animateMotion
                    dur={`${duration}s`}
                    repeatCount="indefinite"
                    begin={`${delay}s`}
                    path={`M ${cx} ${y1} V ${y2}`}
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="linear"
                />
                <animate
                    attributeName="opacity"
                    values="0; 1; 1; 0"
                    keyTimes="0; 0.15; 0.85; 1"
                    dur={`${duration}s`}
                    repeatCount="indefinite"
                    begin={`${delay}s`}
                />
            </circle>
            {/* Trail glow — slightly larger and dimmer */}
            <circle r={5} fill={ACCENT} opacity={0.18}>
                <animateMotion
                    dur={`${duration}s`}
                    repeatCount="indefinite"
                    begin={`${delay}s`}
                    path={`M ${cx} ${y1} V ${y2}`}
                />
                <animate
                    attributeName="opacity"
                    values="0; 0.25; 0.25; 0"
                    keyTimes="0; 0.15; 0.85; 1"
                    dur={`${duration}s`}
                    repeatCount="indefinite"
                    begin={`${delay}s`}
                />
            </circle>
        </g>
    );
}

// ─── Corner ticks for blueprint frame ──────────────────────────
function CornerTick({
    x,
    y,
    flipX = false,
    flipY = false,
}: {
    x: number;
    y: number;
    flipX?: boolean;
    flipY?: boolean;
}) {
    const len = 14;
    const dx = flipX ? -1 : 1;
    const dy = flipY ? -1 : 1;
    return (
        <g stroke="rgba(255,255,255,0.45)" strokeWidth={1.2}>
            <line x1={x} y1={y} x2={x + len * dx} y2={y} />
            <line x1={x} y1={y} x2={x} y2={y + len * dy} />
        </g>
    );
}

// ─── Main component ────────────────────────────────────────────
export function GpuClusterBlueprint({
    className = "",
}: {
    className?: string;
}) {
    // Card bottom Y (where the line starts going down to the switch)
    const topCardBottomY = TOP_ROW_Y + CARD_H;
    const switchTopY = SWITCH_Y;
    const switchBottomY = SWITCH_Y + SWITCH_H;
    const botCardTopY = BOT_ROW_Y;

    // Footer Y
    const footerY = VB_H - FRAME_INSET - 26;

    return (
        <div className={`relative h-full w-full ${className}`}>
            <style jsx>{`
                @keyframes blueprintDash {
                    to {
                        stroke-dashoffset: -16;
                    }
                }
                @keyframes blueprintLed {
                    0%,
                    100% {
                        opacity: 0.4;
                    }
                    50% {
                        opacity: 1;
                    }
                }
                @keyframes blueprintLedGlow {
                    0%,
                    100% {
                        opacity: 0.1;
                    }
                    50% {
                        opacity: 0.35;
                    }
                }
                @keyframes blueprintMeterBar {
                    0%,
                    100% {
                        opacity: 0.12;
                    }
                    20%,
                    60% {
                        opacity: 0.95;
                    }
                }
                @keyframes blueprintSwitchBreathe {
                    0%,
                    100% {
                        filter: drop-shadow(0 0 8px rgba(0, 149, 255, 0.18));
                    }
                    50% {
                        filter: drop-shadow(0 0 14px rgba(0, 149, 255, 0.32));
                    }
                }
                @keyframes blueprintScan {
                    0% {
                        transform: translateX(-100%);
                    }
                    100% {
                        transform: translateX(100%);
                    }
                }
                :global(.blueprint-dash) {
                    stroke-dasharray: 4 4;
                    animation: blueprintDash 1.6s linear infinite;
                }
                :global(.blueprint-led) {
                    animation: blueprintLed 2.2s ease-in-out infinite;
                }
                :global(.blueprint-led-glow) {
                    animation: blueprintLedGlow 2.2s ease-in-out infinite;
                }
                :global(.blueprint-meter-bar) {
                    animation: blueprintMeterBar 1.8s ease-in-out infinite;
                }
                :global(.blueprint-switch-breathe) {
                    animation: blueprintSwitchBreathe 4s ease-in-out infinite;
                }
                .scan-line {
                    animation: blueprintScan 6s linear infinite;
                }
            `}</style>

            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMid meet"
            >
                {/* Background subtle vignette */}
                <defs>
                    <radialGradient id="bp-vignette" cx="50%" cy="50%" r="65%">
                        <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                        <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
                    </radialGradient>
                </defs>
                <rect
                    width={VB_W}
                    height={VB_H}
                    fill="url(#bp-vignette)"
                    opacity={0.35}
                />

                {/* Frame border */}
                <rect
                    x={FRAME_INSET}
                    y={FRAME_INSET}
                    width={VB_W - 2 * FRAME_INSET}
                    height={VB_H - 2 * FRAME_INSET}
                    rx={2}
                    fill="none"
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth={1}
                />

                {/* Corner ticks */}
                <CornerTick x={FRAME_INSET} y={FRAME_INSET} />
                <CornerTick x={VB_W - FRAME_INSET} y={FRAME_INSET} flipX />
                <CornerTick x={FRAME_INSET} y={VB_H - FRAME_INSET} flipY />
                <CornerTick
                    x={VB_W - FRAME_INSET}
                    y={VB_H - FRAME_INSET}
                    flipX
                    flipY
                />

                {/* Title bar with hairline */}
                <g>
                    <text
                        x={FRAME_INSET + 12}
                        y={FRAME_INSET + 36}
                        className={MONO}
                        fontSize="10"
                        fontWeight="600"
                        fill="rgba(255,255,255,0.55)"
                        letterSpacing="2.5"
                    >
                        NVLINK CLUSTER · TOPOLOGY
                    </text>
                    <text
                        x={VB_W - FRAME_INSET - 12}
                        y={FRAME_INSET + 36}
                        textAnchor="end"
                        className={MONO}
                        fontSize="10"
                        fontWeight="600"
                        fill="rgba(0,149,255,0.85)"
                        letterSpacing="2.5"
                    >
                        8 × H200 SXM
                    </text>
                    <line
                        x1={FRAME_INSET + 12}
                        y1={FRAME_INSET + 56}
                        x2={VB_W - FRAME_INSET - 12}
                        y2={FRAME_INSET + 56}
                        stroke="rgba(255,255,255,0.10)"
                        strokeWidth={0.5}
                    />
                </g>

                {/* Connecting lines — drawn before cards so cards overlap line ends */}
                {COLS.map((cx, i) => (
                    <g key={`conn-${i}`}>
                        {/* Top GPU → switch top */}
                        <line
                            x1={cx}
                            y1={topCardBottomY}
                            x2={cx}
                            y2={switchTopY}
                            stroke="rgba(255,255,255,0.22)"
                            strokeWidth={1}
                            className="blueprint-dash"
                            style={{ animationDelay: `${i * 0.2}s` }}
                        />
                        {/* Switch bottom → bottom GPU top */}
                        <line
                            x1={cx}
                            y1={switchBottomY}
                            x2={cx}
                            y2={botCardTopY}
                            stroke="rgba(255,255,255,0.22)"
                            strokeWidth={1}
                            className="blueprint-dash"
                            style={{
                                animationDelay: `${0.4 + i * 0.2}s`,
                                animationDirection: "reverse",
                            }}
                        />
                        {/* Tiny port markers where lines meet cards */}
                        <rect
                            x={cx - 5}
                            y={topCardBottomY - 1}
                            width={10}
                            height={2}
                            fill="rgba(255,255,255,0.45)"
                        />
                        <rect
                            x={cx - 5}
                            y={botCardTopY - 1}
                            width={10}
                            height={2}
                            fill="rgba(255,255,255,0.45)"
                        />
                        {/* Switch ports */}
                        <rect
                            x={cx - 6}
                            y={switchTopY - 1}
                            width={12}
                            height={2}
                            fill={ACCENT}
                            opacity={0.85}
                        />
                        <rect
                            x={cx - 6}
                            y={switchBottomY - 1}
                            width={12}
                            height={2}
                            fill={ACCENT}
                            opacity={0.85}
                        />
                    </g>
                ))}

                {/* Pulse dots — staggered, alternating direction columns */}
                {COLS.map((cx, i) => (
                    <g key={`pulse-${i}`}>
                        {/* Top → switch (data ingress) */}
                        <PulseDot
                            cx={cx}
                            y1={topCardBottomY}
                            y2={switchTopY}
                            delay={i * 0.45}
                            duration={1.8}
                        />
                        {/* Switch → bottom (data egress) */}
                        <PulseDot
                            cx={cx}
                            y1={switchBottomY}
                            y2={botCardTopY}
                            delay={1 + i * 0.45}
                            duration={1.8}
                        />
                    </g>
                ))}

                {/* Switch (above lines but below cards in z-order doesn't matter — separated by space) */}
                <g className="blueprint-switch-breathe">
                    <NVLinkSwitch />
                </g>

                {/* Top row cards */}
                {COLS.map((cx, i) => (
                    <GpuCard
                        key={`top-${i}`}
                        cx={cx}
                        y={TOP_ROW_Y}
                        label="H200"
                        index={`0${i + 1}`}
                        delay={i * 0.18}
                    />
                ))}

                {/* Bottom row cards */}
                {COLS.map((cx, i) => (
                    <GpuCard
                        key={`bot-${i}`}
                        cx={cx}
                        y={BOT_ROW_Y}
                        label="H200"
                        index={`0${i + 5}`}
                        delay={0.4 + i * 0.18}
                    />
                ))}

                {/* Footer stats row */}
                <line
                    x1={FRAME_INSET + 12}
                    y1={footerY - 16}
                    x2={VB_W - FRAME_INSET - 12}
                    y2={footerY - 16}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={0.5}
                />
                <g>
                    <text
                        x={FRAME_INSET + 12}
                        y={footerY}
                        className={MONO}
                        fontSize="9"
                        fill="rgba(255,255,255,0.45)"
                        letterSpacing="1.8"
                    >
                        FABRIC · ACTIVE
                    </text>
                    <text
                        x={VB_W / 2}
                        y={footerY}
                        textAnchor="middle"
                        className={MONO}
                        fontSize="9"
                        fill="rgba(255,255,255,0.55)"
                        letterSpacing="1.8"
                    >
                        7.2 TB/s AGGREGATE · NON-BLOCKING
                    </text>
                    <text
                        x={VB_W - FRAME_INSET - 12}
                        y={footerY}
                        textAnchor="end"
                        className={MONO}
                        fontSize="9"
                        fill="rgba(0,149,255,0.85)"
                        letterSpacing="1.8"
                    >
                        ● LIVE
                    </text>
                </g>
            </svg>

            {/* Subtle horizontal scan line sweeping over the whole panel */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div
                    className="scan-line absolute top-0 h-full w-[40%]"
                    style={{
                        background:
                            "linear-gradient(90deg, transparent, rgba(0,149,255,0.04), transparent)",
                    }}
                />
            </div>
        </div>
    );
}

export default GpuClusterBlueprint;
