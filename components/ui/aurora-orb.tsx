"use client";

import { motion } from "motion/react";

const morphA = [
  "60% 40% 30% 70% / 60% 30% 70% 40%",
  "30% 60% 70% 40% / 50% 60% 30% 60%",
  "40% 60% 70% 30% / 40% 40% 60% 50%",
  "60% 40% 30% 70% / 60% 30% 70% 40%",
];

const morphB = [
  "40% 60% 70% 30% / 40% 40% 60% 50%",
  "60% 40% 30% 70% / 60% 30% 70% 40%",
  "30% 60% 70% 40% / 50% 60% 30% 60%",
  "40% 60% 70% 30% / 40% 40% 60% 50%",
];

const morphC = [
  "50% 50% 40% 60% / 60% 40% 60% 40%",
  "40% 60% 50% 50% / 50% 50% 50% 50%",
  "60% 40% 60% 40% / 40% 60% 40% 60%",
  "50% 50% 40% 60% / 60% 40% 60% 40%",
];

export function AuroraOrb({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Outer glow */}
      <div className="absolute inset-[-15%] rounded-full bg-[#0095FF]/[0.07] blur-[100px]" />

      {/* Blob 1 — primary */}
      <motion.div
        className="absolute inset-[5%] bg-gradient-to-br from-[#0095FF] via-[#0060DD] to-[#003399] opacity-80 blur-[60px]"
        animate={{ borderRadius: morphA }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" as const }}
      />

      {/* Blob 2 — accent cyan-purple */}
      <motion.div
        className="absolute inset-[12%] bg-gradient-to-tr from-[#00C8FF] via-[#0095FF] to-[#6366F1] opacity-50 blur-[50px]"
        animate={{ borderRadius: morphB }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" as const }}
      />

      {/* Blob 3 — highlight */}
      <motion.div
        className="absolute inset-[22%] bg-gradient-to-b from-white/25 via-[#00D4FF]/30 to-transparent opacity-70 blur-[40px]"
        animate={{ borderRadius: morphC }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" as const }}
      />

      {/* Core bright spot */}
      <div className="absolute inset-[32%] rounded-full bg-white/[0.08] blur-[30px]" />
    </div>
  );
}
