"use client";

import { useEffect, useRef } from "react";

/**
 * HeroLattice — the drifting cube lattice behind the hero copy.
 *
 * A 3D point cloud projected per frame: wireframe cubes wired to their nearest
 * neighbours, receding to a vanishing point at 71.5%/45.5% — which is where
 * the composition is weighted, well right of centre. The camera travels forward continuously and nodes recycle
 * through the volume, so there is no loop seam to hide.
 *
 * It is the only thing on the hero's black ground, sitting below
 * .ah-hero-vignette so the vignette's left falloff does most of the work of
 * weighting it right; the canvas carries its own left-to-right mask on top.
 *
 * PAINT COST. BackgroundRippleEffect and PixelBlast were removed from this
 * page for costing paint time, so this one earns its place by not running
 * when it cannot be seen: the loop stops when the hero scrolls out of view
 * (IntersectionObserver), stops when the tab is hidden, never starts under
 * prefers-reduced-motion (one static frame instead), caps DPR at 2, and scales
 * node count to the viewport. Off-screen it costs nothing at all.
 *
 * The lattice draws no ground grid of its own: the hero ground is flat black
 * and a perspective grid competed with the copy.
 */

const Z0 = 260;
const Z1 = 2600;
const FOV = 900;
const SPAN = Z1 - Z0;

type Node = {
    x: number;
    y: number;
    z: number;
    s: number;
    rot: number;
    dir: number;
    glint: boolean;
    blue: boolean;
    spoke: boolean;
};

type Edge = { a: number; b: number; blue: boolean };

type Ray = { ang: number; len: number; a: number; blue: boolean; drift: number };

type Projected = { z: number; k: number; sx: number; sy: number; a: number; i: number };

/** Deterministic RNG — the lattice is identical on every load and across SSR. */
function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function rgba(hex: string, a: number): string {
    let s = hex.trim().replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = Number.parseInt(s, 16);
    if (!Number.isFinite(v)) return `rgba(0,149,255,${a.toFixed(3)})`;
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a.toFixed(3)})`;
}

/** Node count scaled to the surface — a phone does not need 380 cubes. */
function densityFor(w: number, h: number) {
    return Math.round(clamp((w * h) / 2600, 130, 380));
}

function buildScene(n: number) {
    const r = rng(20260825);
    const W = 190;
    const H = 118;
    const nodes: Node[] = [];
    let guard = 0;
    while (nodes.length < n && guard++ < n * 40) {
        const x = (r() * 2 - 1) * W;
        const y = (r() * 2 - 1) * H;
        const z = Z0 + r() * SPAN;
        // dense along the sight line to the core, thinning toward the edges
        const d = Math.hypot(x / W, y / H);
        if (r() > Math.exp(-d * d * 1.55)) continue;
        nodes.push({
            x,
            y,
            z,
            s: 7 + r() * 15,
            rot: r() * Math.PI * 2,
            dir: r() < 0.5 ? -1 : 1,
            glint: r() < 0.14,
            blue: r() < 0.07,
            spoke: r() < 0.13,
        });
    }

    // each node wired to its two nearest neighbours inside a radius
    const edges: Edge[] = [];
    const LIM = 210;
    for (let i = 0; i < nodes.length; i++) {
        const best: Array<[number, number]> = [];
        for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;
            const a = nodes[i];
            const b = nodes[j];
            const dd = Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.42);
            if (dd > LIM) continue;
            best.push([dd, j]);
        }
        best.sort((p, q) => p[0] - q[0]);
        for (let k = 0; k < Math.min(2, best.length); k++) {
            if (best[k][1] > i) edges.push({ a: i, b: best[k][1], blue: r() < 0.06 });
        }
    }

    const rays: Ray[] = [];
    for (let q = 0; q < 54; q++) {
        rays.push({
            ang: r() * Math.PI * 2,
            len: 40 + Math.pow(r(), 2.1) * 470,
            a: 0.06 + r() * 0.4,
            blue: r() < 0.22,
            drift: (r() * 2 - 1) * 0.05,
        });
    }

    return { nodes, edges, rays };
}

export function HeroLattice() {
    const ref = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const cv = ref.current;
        if (!cv) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;

        const reduced =
            typeof matchMedia === "function" &&
            matchMedia("(prefers-reduced-motion: reduce)").matches;

        // tie the accent to the token rather than restating the hex here
        const accent =
            getComputedStyle(document.documentElement).getPropertyValue("--ah-blue").trim() ||
            "#0095ff";
        const INK = "232,236,244";
        // dimmer than the standalone piece — this sits behind headline copy
        const LEVEL = 0.72;

        let w = 0;
        let h = 0;
        let cx = 0;
        let cy = 0;
        let dpr = 1;
        let scene = buildScene(130);
        let built = false;
        let raf = 0;
        let t0: number | null = null;
        let elapsed = 0;
        let visible = true;

        function measure() {
            const rect = cv!.getBoundingClientRect();
            w = Math.max(1, Math.round(rect.width));
            h = Math.max(1, Math.round(rect.height));
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            cv!.width = Math.round(w * dpr);
            cv!.height = Math.round(h * dpr);
            cx = w * 0.715;
            cy = h * 0.455;
            if (!built) {
                scene = buildScene(densityFor(w, h));
                built = true;
            }
        }

        const wrap = (z: number) => {
            let v = (z - Z0) % SPAN;
            if (v < 0) v += SPAN;
            return v + Z0;
        };
        const dof = (z: number) =>
            clamp((Z1 - z) / 1150, 0, 1) * clamp((z - Z0) / 300, 0, 1);
        const vig = (sx: number, sy: number) =>
            clamp(1.16 - (Math.hypot(sx - cx, sy - cy) / (w * 0.66)) * 0.98, 0.04, 1);

        function cube(nd: Node, p: Projected, spin: number) {
            const half = nd.s * 0.5;
            const ang = nd.rot + spin * nd.dir;
            const cos = Math.cos(ang);
            const sin = Math.sin(ang);
            // apply the camera pan once, at the node's centre, not per corner
            const ox = p.sx - (cx + nd.x * p.k);
            const oy = p.sy - (cy + nd.y * p.k);
            const pts: Array<[number, number]> = [];
            for (let i = 0; i < 8; i++) {
                const dx = i & 1 ? half : -half;
                const dy = i & 2 ? half : -half;
                const dz = i & 4 ? half : -half;
                const kk = FOV / Math.max(40, p.z + (dx * sin + dz * cos));
                pts.push([cx + (nd.x + (dx * cos - dz * sin)) * kk + ox, cy + (nd.y + dy) * kk + oy]);
            }

            ctx!.beginPath();
            ctx!.moveTo(pts[0][0], pts[0][1]);
            ctx!.lineTo(pts[1][0], pts[1][1]);
            ctx!.lineTo(pts[3][0], pts[3][1]);
            ctx!.lineTo(pts[2][0], pts[2][1]);
            ctx!.closePath();
            ctx!.fillStyle = nd.blue
                ? rgba(accent, p.a * 0.14 * LEVEL)
                : `rgba(${INK},${(p.a * 0.055 * LEVEL).toFixed(3)})`;
            ctx!.fill();

            ctx!.beginPath();
            for (let i = 0; i < 8; i++) {
                for (const b of [1, 2, 4]) {
                    if (i & b) continue;
                    const j = i | b;
                    ctx!.moveTo(pts[i][0], pts[i][1]);
                    ctx!.lineTo(pts[j][0], pts[j][1]);
                }
            }
            ctx!.strokeStyle = nd.blue
                ? rgba(accent, p.a * 0.9 * LEVEL)
                : `rgba(${INK},${(p.a * 0.72 * LEVEL).toFixed(3)})`;
            ctx!.lineWidth = Math.min(1.3, 0.5 + p.k * 0.35);
            ctx!.stroke();

            if (nd.glint) {
                ctx!.beginPath();
                ctx!.arc(pts[5][0], pts[5][1], Math.max(1.5, nd.s * p.k * 0.09), 0, Math.PI * 2);
                ctx!.fillStyle = `rgba(255,255,255,${(p.a * 0.95 * LEVEL).toFixed(3)})`;
                ctx!.fill();
            }
        }

        function flare(t: number, camZ: number) {
            const breathe = 0.86 + Math.sin(t * 0.3) * 0.14;
            const R = 96 * breathe;
            ctx!.save();
            ctx!.globalCompositeOperation = "lighter";

            for (let i = 0; i < scene.rays.length; i++) {
                const ry = scene.rays[i];
                const ang = ry.ang + t * ry.drift;
                const len = ry.len * (0.9 + Math.sin(t * 0.22 + i) * 0.1);
                const gx = cx + Math.cos(ang) * len;
                const gy = cy + Math.sin(ang) * len;
                const g = ctx!.createLinearGradient(cx, cy, gx, gy);
                g.addColorStop(
                    0,
                    ry.blue
                        ? rgba(accent, ry.a * breathe * LEVEL)
                        : `rgba(214,228,255,${(ry.a * breathe * LEVEL).toFixed(3)})`,
                );
                g.addColorStop(1, "rgba(0,0,0,0)");
                ctx!.beginPath();
                ctx!.moveTo(cx, cy);
                ctx!.lineTo(gx, gy);
                ctx!.strokeStyle = g;
                ctx!.lineWidth = 0.85;
                ctx!.stroke();
            }

            const st = ctx!.createLinearGradient(cx - R * 3.4, cy, cx + R * 3.4, cy);
            st.addColorStop(0, "rgba(0,0,0,0)");
            st.addColorStop(0.5, rgba(accent, 0.2 * breathe * LEVEL));
            st.addColorStop(1, "rgba(0,0,0,0)");
            ctx!.fillStyle = st;
            ctx!.fillRect(cx - R * 3.4, cy - 1.1, R * 6.8, 2.2);

            const core = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R);
            core.addColorStop(0, `rgba(255,255,255,${(0.98 * breathe * LEVEL).toFixed(3)})`);
            core.addColorStop(0.06, `rgba(255,255,255,${(0.82 * breathe * LEVEL).toFixed(3)})`);
            core.addColorStop(0.22, rgba(accent, 0.34 * breathe * LEVEL));
            core.addColorStop(1, "rgba(0,0,0,0)");
            ctx!.beginPath();
            ctx!.arc(cx, cy, R, 0, Math.PI * 2);
            ctx!.fillStyle = core;
            ctx!.fill();

            ctx!.restore();
        }

        function draw(t: number) {
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx!.clearRect(0, 0, w, h); // transparent ground — never filled
            ctx!.lineCap = "round";

            // continuous forward travel with a lateral sway; nodes recycle
            const camZ = (t / 62) * SPAN;
            const camX = Math.sin(t / 23) * 74;
            const camY = Math.sin(t / 32) * 30;
            const spin = t * 0.025;

            const P: Projected[] = [];
            for (let i = 0; i < scene.nodes.length; i++) {
                const n = scene.nodes[i];
                const z = wrap(n.z - camZ);
                const k = FOV / z;
                const sx = cx + (n.x - camX) * k;
                const sy = cy + (n.y - camY) * k;
                P.push({ z, k, sx, sy, a: dof(z) * vig(sx, sy), i });
            }

            // network edges, bucketed by alpha so this is a handful of strokes
            const buckets: Record<string, { blue: boolean; a: number; seg: number[] }> = {};
            for (const ed of scene.edges) {
                const pa = P[ed.a];
                const pb = P[ed.b];
                if (!pa || !pb) continue;
                // a wrapped pair sits on opposite walls — skip rather than streak the frame
                if (Math.abs(pa.z - pb.z) > SPAN * 0.5) continue;
                const al = Math.min(pa.a, pb.a) * 0.5;
                if (al < 0.015) continue;
                const key = (ed.blue ? "b" : "w") + Math.round(al * 14);
                if (!buckets[key]) buckets[key] = { blue: ed.blue, a: al, seg: [] };
                buckets[key].seg.push(pa.sx, pa.sy, pb.sx, pb.sy);
            }
            for (const key of Object.keys(buckets)) {
                const B = buckets[key];
                ctx!.beginPath();
                for (let s = 0; s < B.seg.length; s += 4) {
                    ctx!.moveTo(B.seg[s], B.seg[s + 1]);
                    ctx!.lineTo(B.seg[s + 2], B.seg[s + 3]);
                }
                ctx!.strokeStyle = B.blue
                    ? rgba(accent, B.a * 0.85 * LEVEL)
                    : `rgba(${INK},${(B.a * 0.5 * LEVEL).toFixed(3)})`;
                ctx!.lineWidth = 0.7;
                ctx!.stroke();
            }

            // the long lines running back into the flare
            ctx!.beginPath();
            let spokes = 0;
            for (const ps of P) {
                if (!scene.nodes[ps.i].spoke || ps.a < 0.05) continue;
                ctx!.moveTo(cx, cy);
                ctx!.lineTo(ps.sx, ps.sy);
                spokes++;
            }
            if (spokes) {
                ctx!.strokeStyle = `rgba(${INK},${(0.1 * LEVEL).toFixed(3)})`;
                ctx!.lineWidth = 0.6;
                ctx!.stroke();
            }

            // cubes, far to near
            P.sort((p, q) => q.z - p.z);
            const small: Projected[] = [];
            for (const p of P) {
                if (p.a < 0.02) continue;
                const nd = scene.nodes[p.i];
                if (nd.s * p.k < 9) {
                    small.push(p);
                    continue;
                }
                cube(nd, p, spin);
            }
            const sb: Record<string, { blue: boolean; a: number; r: number[] }> = {};
            for (const q of small) {
                const nd = scene.nodes[q.i];
                const kk = Math.max(1, nd.s * q.k);
                const key = (nd.blue ? "b" : "w") + Math.round(q.a * 12);
                if (!sb[key]) sb[key] = { blue: nd.blue, a: q.a, r: [] };
                sb[key].r.push(q.sx - kk / 2, q.sy - kk / 2, kk, kk);
            }
            for (const key of Object.keys(sb)) {
                const S = sb[key];
                ctx!.fillStyle = S.blue
                    ? rgba(accent, S.a * 0.9 * LEVEL)
                    : `rgba(${INK},${(S.a * 0.62 * LEVEL).toFixed(3)})`;
                for (let v = 0; v < S.r.length; v += 4) {
                    ctx!.fillRect(S.r[v], S.r[v + 1], S.r[v + 2], S.r[v + 3]);
                }
            }

            flare(t, camZ);
        }

        function frame(ts: number) {
            raf = requestAnimationFrame(frame);
            if (t0 === null) t0 = ts;
            elapsed = (ts - t0) / 1000;
            draw(elapsed);
        }

        function start() {
            if (raf || reduced) return;
            t0 = null; // resume where we paused rather than jumping
            const resumeAt = elapsed;
            raf = requestAnimationFrame((ts) => {
                t0 = ts - resumeAt * 1000;
                frame(ts);
            });
        }
        function stop() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        }

        // Paint synchronously, before any observer has had a chance to fire.
        // IntersectionObserver delivers its first record asynchronously, so
        // starting the loop from that callback made the lattice fade up a beat
        // after the rest of the hero — it has to be there on the first frame.
        measure();
        draw(reduced ? 6.5 : 0);
        if (!reduced) start();

        const ro = new ResizeObserver(() => {
            measure();
            draw(reduced ? 6.5 : elapsed);
        });
        ro.observe(cv);

        // from here the observer only pauses and resumes an already-running loop
        const io = new IntersectionObserver(
            (entries) => {
                visible = entries[0]?.isIntersecting ?? true;
                if (visible && !document.hidden) start();
                else stop();
            },
            { threshold: 0 },
        );
        io.observe(cv);

        const onVis = () => {
            if (document.hidden) stop();
            else if (visible) start();
        };
        document.addEventListener("visibilitychange", onVis);

        return () => {
            stop();
            ro.disconnect();
            io.disconnect();
            document.removeEventListener("visibilitychange", onVis);
        };
    }, []);

    return (
        <canvas
            ref={ref}
            aria-hidden="true"
            className="ah-hero-lattice pointer-events-none absolute inset-0 h-full w-full"
        />
    );
}

export default HeroLattice;
