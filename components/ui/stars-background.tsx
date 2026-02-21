"use client";
import { useEffect, useRef, useCallback } from "react";

export function StarsBackground({
  starCount = 180,
  className = "",
}: {
  starCount?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const boot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return () => {};
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};

    let animId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    interface Star {
      x: number;
      y: number;
      r: number;
      alpha: number;
      speed: number;
    }
    interface Shooting {
      x: number;
      y: number;
      vx: number;
      vy: number;
      len: number;
      life: number;
      maxLife: number;
    }

    let stars: Star[] = [];
    const shootings: Shooting[] = [];
    let w = 0,
      h = 0,
      t = 0;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      stars = [];
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.1 + 0.2,
          alpha: Math.random() * 0.4 + 0.15,
          speed: Math.random() * 0.015 + 0.004,
        });
      }
    }

    function maybeShoot() {
      if (shootings.length < 3 && Math.random() < 0.003) {
        const angle = Math.PI / 5 + Math.random() * 0.4;
        const spd = 3 + Math.random() * 4;
        shootings.push({
          x: Math.random() * w * 0.8,
          y: Math.random() * h * 0.3,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          len: 40 + Math.random() * 60,
          life: 0,
          maxLife: 60 + Math.random() * 40,
        });
      }
    }

    function frame() {
      ctx!.clearRect(0, 0, w, h);
      t++;

      /* twinkling stars */
      for (const s of stars) {
        const a = s.alpha * (0.6 + 0.4 * Math.sin(t * s.speed));
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${a})`;
        ctx!.fill();
      }

      /* shooting stars */
      maybeShoot();
      for (let i = shootings.length - 1; i >= 0; i--) {
        const ss = shootings[i];
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life++;

        if (ss.life > ss.maxLife || ss.x > w + 50 || ss.y > h + 50) {
          shootings.splice(i, 1);
          continue;
        }

        const progress = ss.life / ss.maxLife;
        const fade =
          progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
        const norm = Math.sqrt(ss.vx * ss.vx + ss.vy * ss.vy);
        const tailX = ss.x - (ss.vx / norm) * ss.len;
        const tailY = ss.y - (ss.vy / norm) * ss.len;

        const grad = ctx!.createLinearGradient(tailX, tailY, ss.x, ss.y);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(1, `rgba(255,255,255,${0.5 * fade})`);

        ctx!.beginPath();
        ctx!.moveTo(tailX, tailY);
        ctx!.lineTo(ss.x, ss.y);
        ctx!.strokeStyle = grad;
        ctx!.lineWidth = 1.2;
        ctx!.stroke();

        ctx!.beginPath();
        ctx!.arc(ss.x, ss.y, 1.5, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${0.7 * fade})`;
        ctx!.fill();
      }

      animId = requestAnimationFrame(frame);
    }

    resize();
    seed();
    frame();

    const onResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, [starCount]);

  useEffect(() => {
    const cleanup = boot();
    return cleanup;
  }, [boot]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
    />
  );
}
