"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function GpuAvailabilityToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const set = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/gpu/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to update");
      setEnabled(data.enabled);
      toast.success(
        data.enabled
          ? "GPU deployments enabled — customers can deploy again."
          : "GPU deployments disabled — marked out of stock.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-[#0d0e11] p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: enabled ? "#4ade80" : "#f87171",
                boxShadow: `0 0 8px ${enabled ? "#4ade80" : "#f87171"}`,
              }}
            />
            <span className="text-[15px] font-semibold text-white">
              GPU deployments are{" "}
              <span style={{ color: enabled ? "#4ade80" : "#f87171" }}>
                {enabled ? "available" : "out of stock"}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-white/45">
            {enabled
              ? "Customers can deploy GPU pods normally."
              : "All GPUs show out of stock; new pods are blocked (UI + API)."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => set(!enabled)}
          disabled={saving}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[7px] px-5 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-60"
          style={
            enabled
              ? {
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.3)",
                  color: "#fca5a5",
                }
              : {
                  background: "rgba(74,222,128,0.12)",
                  border: "1px solid rgba(74,222,128,0.3)",
                  color: "#86efac",
                }
          }
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {enabled ? "Mark out of stock" : "Mark available"}
        </button>
      </div>
    </div>
  );
}
