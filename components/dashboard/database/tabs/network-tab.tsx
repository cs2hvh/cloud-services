"use client";

import { motion } from "framer-motion";
import { Network, AlertCircle } from "lucide-react";

export const NetworkTab = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-12 text-center"
    >
      <div className="max-w-md mx-auto">
        <div className="mx-auto w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-6">
          <Network className="h-8 w-8 text-blue-400" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">
          Network Configuration
        </h3>
        <p className="text-slate-400 text-lg mb-6">
          Network settings and configurations will be available here soon.
        </p>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-300 text-left">
              Configure firewall rules, trusted sources, VPC peering, and
              private networking options for your database cluster.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
