"use client";

import { motion } from "framer-motion";
import { Settings, AlertCircle } from "lucide-react";

export const SettingsTab = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-12 text-center"
    >
      <div className="max-w-md mx-auto">
        <div className="mx-auto w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-6">
          <Settings className="h-8 w-8 text-purple-400" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">
          Database Settings
        </h3>
        <p className="text-slate-400 text-lg mb-6">
          Advanced settings and configurations will be available here soon.
        </p>
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-300 text-left">
              Manage database cluster settings, maintenance windows, backup
              schedules, and performance tuning options.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
