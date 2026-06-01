"use client";

// 3D particle-formation tensor that morphs between four service
// shapes (GPU instances, server racks, managed databases, AI
// agents). 5,200 particles painted into formation by builder
// functions, then morphed via per-particle easing.
//
// Renders only the canvas — the parent controls the HUD (service
// title, dots, controls) so that the surrounding hero copy can
// react to state changes via the `onServiceChange` callback.

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type TensorServiceId = "gpu" | "compute" | "db" | "agents";

export type TensorService = {
    id: TensorServiceId;
    name: string;
};

export const TENSOR_SERVICES: ReadonlyArray<TensorService> = [
    { id: "gpu", name: "GPU Instances" },
    { id: "compute", name: "Servers & Bare Metal" },
    { id: "db", name: "Managed Database" },
    { id: "agents", name: "AI Agents" },
];

type Props = {
    onServiceChange?: (index: number, service: TensorService) => void;
    holdSeconds?: number;
    morphSeconds?: number;
    particleCount?: number;
    className?: string;
};

// ─── Deterministic RNG so each formation is stable ─────────────
function mulberry32(seed: number) {
    let a = seed | 0;
    return function rand() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Particle canvas helpers ──────────────────────────────────
// A "Canvas" here is a thin façade over the position + tint
// buffers that lets builder functions paint shapes by emitting
// particles into specific geometric regions.
type Vec3Buffer = Float32Array;
type TintBuffer = Float32Array;

class FormationCanvas {
    P: Vec3Buffer;
    T: TintBuffer;
    p = 0;
    cap: number;
    private rnd: () => number;

    constructor(pos: Vec3Buffer, tint: TintBuffer, rnd: () => number) {
        this.P = pos;
        this.T = tint;
        this.cap = pos.length / 3;
        this.rnd = rnd;
    }

    emit(x: number, y: number, z: number, t: number) {
        if (this.p >= this.cap) return;
        const k = this.p * 3;
        this.P[k] = x;
        this.P[k + 1] = y;
        this.P[k + 2] = z;
        this.T[this.p] = t;
        this.p += 1;
    }

    rect(
        cx: number,
        cy: number,
        w: number,
        h: number,
        zr: number,
        n: number,
        t: number
    ) {
        if (n <= 0) return;
        const cols = Math.max(
            1,
            Math.round(Math.sqrt(n * (w / Math.max(h, 0.001))))
        );
        const rows = Math.max(1, Math.ceil(n / cols));
        for (let li = 0; li < n; li += 1) {
            const c = li % cols;
            const r = Math.floor(li / cols);
            const fx = cols > 1 ? c / (cols - 1) - 0.5 : 0;
            const fy = rows > 1 ? r / (rows - 1) - 0.5 : 0;
            this.emit(
                cx + fx * w + (this.rnd() - 0.5) * 0.05,
                cy + fy * h + (this.rnd() - 0.5) * 0.05,
                (this.rnd() - 0.5) * 2 * zr,
                t
            );
        }
    }

    frame(
        cx: number,
        cy: number,
        w: number,
        h: number,
        zr: number,
        n: number,
        t: number
    ) {
        for (let li = 0; li < n; li += 1) {
            const u = (li / n) * 4;
            let x: number;
            let y: number;
            if (u < 1) {
                x = -0.5 + u;
                y = -0.5;
            } else if (u < 2) {
                x = 0.5;
                y = -0.5 + (u - 1);
            } else if (u < 3) {
                x = 0.5 - (u - 2);
                y = 0.5;
            } else {
                x = -0.5;
                y = 0.5 - (u - 3);
            }
            this.emit(
                cx + x * w + (this.rnd() - 0.5) * 0.04,
                cy + y * h + (this.rnd() - 0.5) * 0.04,
                (this.rnd() - 0.5) * 2 * zr,
                t
            );
        }
    }

    disc(
        cx: number,
        cy: number,
        R: number,
        zr: number,
        n: number,
        t: number
    ) {
        for (let li = 0; li < n; li += 1) {
            const a = li * 2.399963229;
            const rr = R * Math.sqrt((li + 0.5) / n);
            this.emit(
                cx + Math.cos(a) * rr,
                cy + Math.sin(a) * rr,
                (this.rnd() - 0.5) * 2 * zr,
                t
            );
        }
    }

    ring(
        cx: number,
        cy: number,
        rIn: number,
        rOut: number,
        zr: number,
        n: number,
        t: number
    ) {
        const rb = Math.max(2, Math.round((rOut - rIn) / 0.16));
        const ang = Math.ceil(n / rb);
        for (let li = 0; li < n; li += 1) {
            const b = li % rb;
            const s = Math.floor(li / rb);
            const rr = rIn + (rOut - rIn) * (b / (rb - 1));
            const a = (s / ang) * Math.PI * 2 + b * 0.05;
            this.emit(
                cx + Math.cos(a) * rr,
                cy + Math.sin(a) * rr,
                (this.rnd() - 0.5) * 2 * zr,
                t
            );
        }
    }

    ell(
        cx: number,
        cy: number,
        rx: number,
        ry: number,
        a0: number,
        a1: number,
        zr: number,
        n: number,
        t: number
    ) {
        for (let li = 0; li < n; li += 1) {
            const a = a0 + (a1 - a0) * (li / (n - 1 || 1));
            this.emit(
                cx + Math.cos(a) * rx,
                cy + Math.sin(a) * ry,
                (this.rnd() - 0.5) * 2 * zr,
                t
            );
        }
    }

    bar(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        thick: number,
        zr: number,
        n: number,
        t: number
    ) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L;
        const ny = dx / L;
        const al = Math.max(
            1,
            Math.round(Math.sqrt(n * (L / Math.max(thick, 0.001))))
        );
        const ac = Math.max(1, Math.ceil(n / al));
        for (let li = 0; li < n; li += 1) {
            const a = li % al;
            const b = Math.floor(li / al);
            const fa = al > 1 ? a / (al - 1) : 0;
            const fb = ac > 1 ? b / (ac - 1) - 0.5 : 0;
            this.emit(
                x0 + dx * fa + nx * fb * thick,
                y0 + dy * fa + ny * fb * thick,
                (this.rnd() - 0.5) * 2 * zr,
                t
            );
        }
    }
}

function split(total: number, w: number[]): number[] {
    const s = w.reduce((a, b) => a + b, 0);
    const o = w.map((x) => Math.floor((x / s) * total));
    o[0] += total - o.reduce((a, b) => a + b, 0);
    return o;
}

// ─── Formation builders ───────────────────────────────────────
function buildGPU(C: FormationCanvas, N: number) {
    const cards = 3;
    const per = Math.floor(N / cards);
    const W = 3.0;
    const H = 7.4;
    const gap = 0.7;
    for (let ci = 0; ci < cards; ci += 1) {
        const n = ci === cards - 1 ? N - per * (cards - 1) : per;
        const cx = (ci - 1) * (W + gap);
        const q = split(n, [12, 32, 20, 18, 10, 8]);
        C.frame(cx, 0, W, H, 0.1, q[0], 0.55);
        C.rect(cx, 1.0, 1.7, 1.7, 0.16, q[1], 1.0);
        const hb = split(q[2], [1, 1, 1, 1]);
        C.rect(cx - 1.25, 1.0, 0.55, 1.5, 0.12, hb[0], 0.78);
        C.rect(cx + 1.25, 1.0, 0.55, 1.5, 0.12, hb[1], 0.78);
        C.rect(cx, 2.25, 1.5, 0.5, 0.12, hb[2], 0.78);
        C.rect(cx, -0.25, 1.5, 0.5, 0.12, hb[3], 0.78);
        const fins = 7;
        const fn = split(q[3], new Array(fins).fill(1));
        for (let f = 0; f < fins; f += 1) {
            const fx = cx - 1.1 + f * (2.2 / (fins - 1));
            C.bar(fx, -1.0, fx, -3.0, 0.05, 0.06, fn[f], 0.5);
        }
        C.rect(cx, -3.45, 2.4, 0.4, 0.1, q[4], 0.7);
        C.rect(cx, 3.45, 1.0, 0.4, 0.1, q[5], 0.6);
    }
}

function buildCompute(C: FormationCanvas, N: number) {
    const units = 7;
    const W = 6.4;
    const H = 9.2;
    const uH = (H / units) * 0.86;
    const fN = Math.round(N * 0.12);
    C.frame(0, 0, W, H, 0.1, fN, 0.5);
    const rest = N - fN;
    const per = Math.floor(rest / units);
    for (let u = 0; u < units; u += 1) {
        const n = u === units - 1 ? rest - per * (units - 1) : per;
        const y = (u - (units - 1) / 2) * (H / units);
        const q = split(n, [16, 16, 42, 16]);
        C.frame(0, y, W * 0.94, uH, 0.08, q[0], 0.6);
        const leds = split(q[1], [1, 1, 1]);
        C.disc(-W * 0.4, y + uH * 0.18, 0.11, 0.05, leds[0], 1.0);
        C.disc(-W * 0.4, y, 0.11, 0.05, leds[1], 1.0);
        C.disc(-W * 0.4, y - uH * 0.18, 0.11, 0.05, leds[2], 0.8);
        const bays = 6;
        const bn = split(q[2], new Array(bays).fill(1));
        for (let b = 0; b < bays; b += 1) {
            C.rect(
                -W * 0.2 + b * (W * 0.085),
                y,
                W * 0.07,
                uH * 0.62,
                0.06,
                bn[b],
                b % 2 ? 0.95 : 0.78
            );
        }
        C.rect(W * 0.34, y, W * 0.16, uH * 0.7, 0.05, q[3], 0.5);
    }
}

function buildDB(C: FormationCanvas, N: number) {
    const q = split(N, [52, 20, 20, 8]);
    dbIcon(C, 0, 0.4, 2.0, 5.0, 1.0, split(q[0], [20, 14, 14, 12, 12, 16, 12]));
    dbIcon(
        C,
        -4.6,
        -1.7,
        1.05,
        2.6,
        0.8,
        split(q[1], [20, 14, 14, 12, 12, 16, 12])
    );
    dbIcon(
        C,
        4.6,
        -1.7,
        1.05,
        2.6,
        0.8,
        split(q[2], [20, 14, 14, 12, 12, 16, 12])
    );
    const st = split(q[3], [1, 1, 1, 1]);
    C.bar(-1.7, -1.4, -3.4, -1.6, 0.1, 0.07, st[0], 0.85);
    C.bar(1.7, -1.4, 3.4, -1.6, 0.1, 0.07, st[1], 0.85);
    C.bar(-3.4, -1.6, -3.0, -1.2, 0.05, 0.05, st[2] >> 1, 0.95);
    C.bar(3.4, -1.6, 3.0, -1.2, 0.05, 0.05, st[3] >> 1, 0.95);
}

function dbIcon(
    C: FormationCanvas,
    cx: number,
    cy: number,
    R: number,
    Hh: number,
    br: number,
    counts: number[]
) {
    const ry = R * 0.34;
    C.ell(cx, cy + Hh / 2, R, ry, 0, Math.PI * 2, 0.12, counts[0], 0.95 * br);
    C.bar(cx - R, cy + Hh / 2, cx - R, cy - Hh / 2, 0.07, 0.1, counts[1], 0.9 * br);
    C.bar(cx + R, cy + Hh / 2, cx + R, cy - Hh / 2, 0.07, 0.1, counts[2], 0.9 * br);
    C.ell(cx, cy + Hh * 0.16, R, ry, Math.PI, 2 * Math.PI, 0.1, counts[3], 0.7 * br);
    C.ell(cx, cy - Hh * 0.18, R, ry, Math.PI, 2 * Math.PI, 0.1, counts[4], 0.7 * br);
    C.ell(cx, cy - Hh / 2, R, ry, Math.PI, 2 * Math.PI, 0.12, counts[5], 0.9 * br);
    C.rect(cx, cy, R * 1.5, Hh * 0.78, 0.1, counts[6], 0.3 * br);
}

function buildAgents(C: FormationCanvas, N: number) {
    const R = 4.0;
    const agents = 6;
    const q = split(N, [18, 8, 30, 16, 16, 12]);
    C.disc(0, 0, 1.15, 0.18, q[0], 1.0);
    C.ring(0, 0, 1.5, 1.75, 0.1, q[1], 0.6);
    const ag = split(q[2], new Array(agents).fill(1));
    const an: Array<[number, number]> = [];
    for (let i = 0; i < agents; i += 1) {
        const a = (i / agents) * Math.PI * 2 - Math.PI / 2;
        const ax = Math.cos(a) * R;
        const ay = Math.sin(a) * R;
        an.push([ax, ay]);
        C.disc(ax, ay, 0.72, 0.14, ag[i], 0.92);
        C.ring(ax, ay, 0.92, 1.04, 0.07, Math.max(8, ag[i] >> 3), 0.4);
    }
    const sp = split(q[3], new Array(agents).fill(1));
    for (let s = 0; s < agents; s += 1) {
        C.bar(0, 0, an[s][0], an[s][1], 0.06, 0.05, sp[s], 0.5);
        const tk = 3;
        for (let tkn = 0; tkn < tk; tkn += 1) {
            const f = 0.3 + tkn * 0.22;
            C.disc(an[s][0] * f, an[s][1] * f, 0.16, 0.05, 4, 0.95);
        }
    }
    const ms = split(q[4], new Array(agents).fill(1));
    for (let m = 0; m < agents; m += 1) {
        const a2 = an[m];
        const b2 = an[(m + 1) % agents];
        C.bar(a2[0], a2[1], b2[0], b2[1], 0.05, 0.05, ms[m], 0.35);
    }
    const tl = split(q[5], new Array(agents).fill(1));
    for (let g = 0; g < agents; g += 1) {
        const na = Math.atan2(an[g][1], an[g][0]);
        const tn = split(tl[g], [1, 1]);
        C.disc(
            an[g][0] + Math.cos(na) * 1.25,
            an[g][1] + Math.sin(na) * 1.25,
            0.26,
            0.06,
            tn[0],
            0.7
        );
        C.disc(
            an[g][0] + Math.cos(na + 1.4) * 1.1,
            an[g][1] + Math.sin(na + 1.4) * 1.1,
            0.22,
            0.06,
            tn[1],
            0.6
        );
    }
}

const BUILDERS: Record<
    TensorServiceId,
    (C: FormationCanvas, N: number) => void
> = {
    gpu: buildGPU,
    compute: buildCompute,
    db: buildDB,
    agents: buildAgents,
};

// ─── Sprite generator (radial gradient point) ─────────────────
function makeSprite(soft: boolean): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (!g) return new THREE.CanvasTexture(c);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (soft) {
        gr.addColorStop(0, "rgba(255,255,255,.8)");
        gr.addColorStop(0.4, "rgba(255,255,255,.22)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
    } else {
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(0.25, "rgba(255,255,255,.92)");
        gr.addColorStop(0.55, "rgba(255,255,255,.32)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
    }
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

// ─── Component ────────────────────────────────────────────────
export function TensorScene({
    onServiceChange,
    holdSeconds = 4.6,
    morphSeconds = 2.3,
    particleCount = 5200,
    className = "",
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const onServiceChangeRef = useRef(onServiceChange);
    useEffect(() => {
        onServiceChangeRef.current = onServiceChange;
    }, [onServiceChange]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const N = particleCount;
        const rnd = mulberry32(20260519);

        // Build all formations up front
        type Shape = { pos: Float32Array; col: Float32Array };
        const SHAPES: Shape[] = TENSOR_SERVICES.map((st) => {
            const pos = new Float32Array(N * 3);
            const tnt = new Float32Array(N);
            const C = new FormationCanvas(pos, tnt, rnd);
            BUILDERS[st.id](C, N);
            while (C.p < C.cap) C.emit((rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, 0, 0);
            const col = new Float32Array(N * 3);
            const c = new THREE.Color();
            for (let i = 0; i < N; i += 1) {
                const t = tnt[i];
                const h = 0.575 - t * 0.04; // azure → cyan-blue
                const s = 0.92 - t * 0.42;
                const l = 0.2 + t * 0.74 + rnd() * 0.05;
                c.setHSL(h, Math.max(0, s), Math.min(0.97, l));
                col[i * 3] = c.r;
                col[i * 3 + 1] = c.g;
                col[i * 3 + 2] = c.b;
            }
            return { pos, col };
        });

        // Three.js setup
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const initialWidth = canvas.clientWidth || 600;
        const initialHeight = canvas.clientHeight || 600;
        renderer.setSize(initialWidth, initialHeight, false);

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x02040a, 0.02);

        const camera = new THREE.PerspectiveCamera(
            50,
            initialWidth / initialHeight,
            0.1,
            200
        );
        camera.position.set(0, 0, 22);

        const world = new THREE.Group();
        scene.add(world);

        // Particle buffers
        const cur = new Float32Array(N * 3);
        const frm = new Float32Array(N * 3);
        const home = new Float32Array(N * 3);
        const curC = new Float32Array(N * 3);
        const frmC = new Float32Array(N * 3);
        const delay = new Float32Array(N);
        const seed = new Float32Array(N);
        // Particles START in the first formation positions —
        // we fade in material opacity instead of spatially
        // converging from a random sphere shell. Avoids the
        // "many dots joining" intro the user disliked.
        cur.set(SHAPES[0].pos);
        curC.set(SHAPES[0].col);
        for (let i = 0; i < N; i += 1) {
            delay[i] = rnd() * 0.32;
            seed[i] = rnd() * 6.28;
        }
        home.set(SHAPES[0].pos);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(cur, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(curC, 3));

        const softSprite = makeSprite(true);
        const crispSprite = makeSprite(false);

        const glow = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
                size: 0.42,
                map: softSprite,
                vertexColors: true,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.5,
                sizeAttenuation: true,
            })
        );
        const core = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
                size: 0.115,
                map: crispSprite,
                vertexColors: true,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 1.0,
                sizeAttenuation: true,
            })
        );
        world.add(glow);
        world.add(core);

        // Ambient dust shell
        const dustGeo = new THREE.BufferGeometry();
        const dustCount = 500;
        const dustPositions = new Float32Array(dustCount * 3);
        for (let k = 0; k < dustCount; k += 1) {
            const a = rnd() * Math.PI * 2;
            const b = Math.acos(2 * rnd() - 1);
            const R = 30 + rnd() * 40;
            dustPositions[k * 3] = Math.sin(b) * Math.cos(a) * R;
            dustPositions[k * 3 + 1] = Math.sin(b) * Math.sin(a) * R;
            dustPositions[k * 3 + 2] = Math.cos(b) * R;
        }
        dustGeo.setAttribute(
            "position",
            new THREE.BufferAttribute(dustPositions, 3)
        );
        const dust = new THREE.Points(
            dustGeo,
            new THREE.PointsMaterial({
                size: 0.07,
                color: 0x2f4a7a,
                transparent: true,
                opacity: 0.32,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        scene.add(dust);

        // ─── Animation state ────────────────────────────────────
        // We're already painted in the first formation (cur was
        // initialised from SHAPES[0].pos), so start in HOLD mode
        // instead of MORPH mode. Intro = material opacity fade-in.
        let idx = 0;
        let displayIdx = 0;
        let morphing = false;
        let mEl = 0;
        let holdT = 0;
        const M_DUR = morphSeconds;
        const HOLD = holdSeconds;

        // Material opacity fade-in (replaces the spatial converge intro)
        const glowMat = glow.material as THREE.PointsMaterial;
        const coreMat = core.material as THREE.PointsMaterial;
        const dustMat = dust.material as THREE.PointsMaterial;
        const targetGlowOpacity = 0.5;
        const targetCoreOpacity = 1.0;
        const targetDustOpacity = 0.32;
        glowMat.opacity = 0;
        coreMat.opacity = 0;
        dustMat.opacity = 0;
        const INTRO_DURATION = 1.4;
        let introT = 0;

        const ease = (t: number) =>
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Tell the parent which service is initially showing so
        // the left copy doesn't read empty before the first morph.
        onServiceChangeRef.current?.(0, TENSOR_SERVICES[0]);

        function snap() {
            frm.set(cur);
            frmC.set(curC);
        }
        snap();

        // ─── Drag (subtle camera tilt) ──────────────────────────
        let drag = false;
        let px = 0;
        let py = 0;
        let tX = 0;
        let tY = 0;
        let vX = 0;
        let vY = 0;
        function onDown(x: number, y: number) {
            drag = true;
            px = x;
            py = y;
        }
        function onMove(x: number, y: number) {
            if (!drag) return;
            vY += (x - px) * 0.0016;
            vX += (y - py) * 0.0012;
            px = x;
            py = y;
        }
        function onUp() {
            drag = false;
        }
        const mouseDown = (e: MouseEvent) => onDown(e.clientX, e.clientY);
        const mouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
        const mouseUp = () => onUp();
        const touchStart = (e: TouchEvent) =>
            onDown(e.touches[0].clientX, e.touches[0].clientY);
        const touchMove = (e: TouchEvent) =>
            onMove(e.touches[0].clientX, e.touches[0].clientY);
        const touchEnd = () => onUp();
        canvas.addEventListener("mousedown", mouseDown);
        window.addEventListener("mousemove", mouseMove);
        window.addEventListener("mouseup", mouseUp);
        canvas.addEventListener("touchstart", touchStart, { passive: true });
        window.addEventListener("touchmove", touchMove, { passive: true });
        window.addEventListener("touchend", touchEnd);

        // ─── Resize handling ────────────────────────────────────
        const canvasEl: HTMLCanvasElement = canvas;
        function resize() {
            const w = canvasEl.clientWidth || 1;
            const h = canvasEl.clientHeight || 1;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        }
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvasEl);

        // Visibility — pause when offscreen
        let visible = true;
        const intersectionObserver = new IntersectionObserver(
            ([entry]) => {
                visible = entry?.isIntersecting ?? true;
            },
            { threshold: 0.01 }
        );
        intersectionObserver.observe(canvas);

        const posAttr = geo.attributes.position as THREE.BufferAttribute;
        const colAttr = geo.attributes.color as THREE.BufferAttribute;
        const clock = new THREE.Clock();

        let raf = 0;
        function frame() {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(clock.getDelta(), 0.05);
            const tN = clock.elapsedTime;
            if (!visible) return;

            // Intro: ramp material opacity from 0 → target so the
            // formation gracefully fades in instead of converging
            // from a sphere shell.
            if (introT < 1) {
                introT = Math.min(1, introT + dt / INTRO_DURATION);
                const e = ease(introT);
                glowMat.opacity = targetGlowOpacity * e;
                coreMat.opacity = targetCoreOpacity * e;
                dustMat.opacity = targetDustOpacity * e;
            }

            if (morphing) {
                mEl += dt;
                const tg = SHAPES[idx];
                const sp = M_DUR - 0.32;
                for (let i = 0; i < N; i += 1) {
                    let lp = (mEl - delay[i]) / sp;
                    if (lp < 0) lp = 0;
                    if (lp > 1) lp = 1;
                    const e = ease(lp);
                    const j = i * 3;
                    cur[j] = frm[j] + (tg.pos[j] - frm[j]) * e;
                    cur[j + 1] = frm[j + 1] + (tg.pos[j + 1] - frm[j + 1]) * e;
                    cur[j + 2] = frm[j + 2] + (tg.pos[j + 2] - frm[j + 2]) * e;
                    curC[j] = frmC[j] + (tg.col[j] - frmC[j]) * e;
                    curC[j + 1] = frmC[j + 1] + (tg.col[j + 1] - frmC[j + 1]) * e;
                    curC[j + 2] = frmC[j + 2] + (tg.col[j + 2] - frmC[j + 2]) * e;
                }
                posAttr.needsUpdate = true;
                colAttr.needsUpdate = true;
                if (displayIdx !== idx && mEl / M_DUR > 0.45) {
                    displayIdx = idx;
                    onServiceChangeRef.current?.(idx, TENSOR_SERVICES[idx]);
                }
                if (mEl >= M_DUR) {
                    morphing = false;
                    mEl = 0;
                    home.set(tg.pos);
                    if (displayIdx !== idx) {
                        displayIdx = idx;
                        onServiceChangeRef.current?.(idx, TENSOR_SERVICES[idx]);
                    }
                }
            } else {
                const w = tN * 1.1;
                for (let i2 = 0; i2 < N; i2 += 1) {
                    const k2 = i2 * 3;
                    const ph = seed[i2];
                    cur[k2] = home[k2] + Math.sin(w + ph) * 0.018;
                    cur[k2 + 1] = home[k2 + 1] + Math.cos(w * 0.9 + ph) * 0.018;
                    cur[k2 + 2] = home[k2 + 2] + Math.sin(w * 0.7 + ph) * 0.05;
                }
                posAttr.needsUpdate = true;
                holdT += dt;
                if (holdT >= HOLD) {
                    snap();
                    idx = (idx + 1) % SHAPES.length;
                    morphing = true;
                    mEl = 0;
                    holdT = 0;
                }
            }

            vX *= 0.9;
            vY *= 0.9;
            tX += vX;
            tY += vY;
            tX += (0 - tX) * Math.min(1, dt * 1.4);
            tY += (0 - tY) * Math.min(1, dt * 1.4);
            tX = Math.max(-0.32, Math.min(0.32, tX));
            tY = Math.max(-0.5, Math.min(0.5, tY));
            world.rotation.x = tX + Math.sin(tN * 0.22) * 0.02;
            world.rotation.y = tY + Math.sin(tN * 0.27) * 0.03;
            world.position.y = Math.sin(tN * 0.5) * 0.15;

            renderer.render(scene, camera);
        }
        frame();

        // Cleanup
        return () => {
            cancelAnimationFrame(raf);
            resizeObserver.disconnect();
            intersectionObserver.disconnect();
            canvas.removeEventListener("mousedown", mouseDown);
            window.removeEventListener("mousemove", mouseMove);
            window.removeEventListener("mouseup", mouseUp);
            canvas.removeEventListener("touchstart", touchStart);
            window.removeEventListener("touchmove", touchMove);
            window.removeEventListener("touchend", touchEnd);
            softSprite.dispose();
            crispSprite.dispose();
            geo.dispose();
            dustGeo.dispose();
            glow.material.dispose();
            core.material.dispose();
            (dust.material as THREE.PointsMaterial).dispose();
            renderer.dispose();
        };
    }, [holdSeconds, morphSeconds, particleCount]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={`block h-full w-full ${className}`}
            style={{ touchAction: "none" }}
        />
    );
}
