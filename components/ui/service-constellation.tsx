"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import {
  Cpu,
  Brain,
  Database,
  Cloud,
  Rocket,
  Shield,
  Box,
  Layers,
} from "lucide-react";

/* ── Node & connection definitions ── */

interface NodeDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  x: number; // % of container width
  y: number; // % of container height
}

const NODES: NodeDef[] = [
  { id: "hub", label: "Platform", icon: Layers, x: 50, y: 48 },
  { id: "security", label: "Security", icon: Shield, x: 50, y: 8 },
  { id: "gpu", label: "GPU Compute", icon: Cpu, x: 12, y: 28 },
  { id: "ai", label: "AI / ML", icon: Brain, x: 88, y: 24 },
  { id: "k8s", label: "Kubernetes", icon: Box, x: 8, y: 70 },
  { id: "deploy", label: "App Deploy", icon: Rocket, x: 92, y: 66 },
  { id: "db", label: "Database", icon: Database, x: 28, y: 92 },
  { id: "storage", label: "Storage", icon: Cloud, x: 72, y: 90 },
];

const CONNECTIONS = [
  // Hub ↔ every service (star topology)
  ["hub", "security"],
  ["hub", "gpu"],
  ["hub", "ai"],
  ["hub", "k8s"],
  ["hub", "deploy"],
  ["hub", "db"],
  ["hub", "storage"],
  // Cross-connections (mesh)
  ["gpu", "ai"],
  ["gpu", "k8s"],
  ["k8s", "deploy"],
  ["db", "storage"],
  ["security", "ai"],
  ["k8s", "db"],
  ["deploy", "storage"],
];

/* ── Helpers ── */

function nodePos(id: string, w: number, h: number): [number, number] {
  const n = NODES.find((n) => n.id === id);
  if (!n) return [0, 0];
  return [(n.x / 100) * w, (n.y / 100) * h];
}

/* ── Component ── */

export function ServiceConstellation({
  className = "",
}: {
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const boot = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return () => {};
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0,
      h = 0,
      animId = 0;

    /* pulse state per connection */
    const pulses = CONNECTIONS.map(() => ({
      progress: Math.random(), // stagger initial positions
      speed: 0.002 + Math.random() * 0.003,
      forward: Math.random() > 0.5,
      rest: 0, // seconds to rest at destination
    }));

    function resize() {
      const rect = container!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    let prev = 0;
    function frame(ts: number) {
      const dt = prev ? (ts - prev) / 1000 : 0.016;
      prev = ts;
      ctx!.clearRect(0, 0, w, h);

      /* draw static connection lines */
      for (const [fromId, toId] of CONNECTIONS) {
        const [x1, y1] = nodePos(fromId, w, h);
        const [x2, y2] = nodePos(toId, w, h);
        ctx!.beginPath();
        ctx!.moveTo(x1, y1);
        ctx!.lineTo(x2, y2);
        ctx!.strokeStyle = "rgba(255,255,255,0.055)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      /* animate pulses */
      for (let i = 0; i < pulses.length; i++) {
        const p = pulses[i];

        // rest timer at endpoints
        if (p.rest > 0) {
          p.rest -= dt;
          continue;
        }

        p.progress += p.speed;

        if (p.progress >= 1) {
          p.progress = 0;
          p.forward = !p.forward; // reverse
          p.rest = 0.6 + Math.random() * 1.5;
          p.speed = 0.002 + Math.random() * 0.003;
          continue;
        }

        const [fromId, toId] = CONNECTIONS[i];
        const [x1, y1] = nodePos(
          p.forward ? fromId : toId,
          w,
          h
        );
        const [x2, y2] = nodePos(
          p.forward ? toId : fromId,
          w,
          h
        );

        const px = x1 + (x2 - x1) * p.progress;
        const py = y1 + (y2 - y1) * p.progress;

        // outer glow
        const glow = ctx!.createRadialGradient(px, py, 0, px, py, 14);
        glow.addColorStop(0, "rgba(0,149,255,0.5)");
        glow.addColorStop(0.5, "rgba(0,149,255,0.1)");
        glow.addColorStop(1, "rgba(0,149,255,0)");
        ctx!.beginPath();
        ctx!.arc(px, py, 14, 0, Math.PI * 2);
        ctx!.fillStyle = glow;
        ctx!.fill();

        // core dot
        ctx!.beginPath();
        ctx!.arc(px, py, 2, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(0,149,255,0.9)";
        ctx!.fill();

        // trail
        const trailT = Math.max(0, p.progress - 0.1);
        const tx = x1 + (x2 - x1) * trailT;
        const ty = y1 + (y2 - y1) * trailT;
        const trail = ctx!.createLinearGradient(tx, ty, px, py);
        trail.addColorStop(0, "rgba(0,149,255,0)");
        trail.addColorStop(1, "rgba(0,149,255,0.25)");
        ctx!.beginPath();
        ctx!.moveTo(tx, ty);
        ctx!.lineTo(px, py);
        ctx!.strokeStyle = trail;
        ctx!.lineWidth = 1.5;
        ctx!.stroke();
      }

      /* node highlight ring on hub */
      const [hx, hy] = nodePos("hub", w, h);
      const hubGlow = ctx!.createRadialGradient(hx, hy, 18, hx, hy, 40);
      hubGlow.addColorStop(0, "rgba(0,149,255,0.08)");
      hubGlow.addColorStop(1, "rgba(0,149,255,0)");
      ctx!.beginPath();
      ctx!.arc(hx, hy, 40, 0, Math.PI * 2);
      ctx!.fillStyle = hubGlow;
      ctx!.fill();

      animId = requestAnimationFrame(frame);
    }

    resize();
    animId = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const cleanup = boot();
    return cleanup;
  }, [boot]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className}`}
    >
      {/* Animated lines + pulses */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Service nodes */}
      {NODES.map((node, i) => {
        const isHub = node.id === "hub";
        const Icon = node.icon;

        return (
          <motion.div
            key={node.id}
            className="absolute pointer-events-none"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            animate={{
              y: isHub ? [0, -4, 0] : [0, i % 2 === 0 ? -7 : 7, 0],
            }}
            transition={{
              duration: isHub ? 4 : 3 + i * 0.4,
              repeat: Infinity,
              ease: "easeInOut" as const,
            }}
          >
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex items-center justify-center rounded-lg border backdrop-blur-sm ${
                  isHub
                    ? "w-12 h-12 bg-[#0095FF]/15 border-[#0095FF]/25 shadow-[0_0_24px_rgba(0,149,255,0.15)]"
                    : "w-10 h-10 bg-white/[0.04] border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.4)]"
                }`}
              >
                <Icon
                  size={isHub ? 22 : 18}
                  className={
                    isHub ? "text-[#0095FF]" : "text-white/60"
                  }
                />
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap tracking-wide ${
                  isHub ? "text-[#0095FF]/70" : "text-white/35"
                }`}
              >
                {node.label}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
