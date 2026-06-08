"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/axios/axios";

type GpuPricingRow = {
  gpu_catalog_id: string;
  cloud_type: "SECURE" | "COMMUNITY";
  interruptible: boolean;
  markup_pct: number;
  floor_per_hour_usd: number;
  gpu_catalog: { name: string; display_name: string | null } | null;
};

type Draft = GpuPricingRow & { _dirty?: boolean };

export default function GpuTab() {
  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const rowKey = (r: GpuPricingRow) =>
    `${r.gpu_catalog_id}:${r.cloud_type}:${r.interruptible}`;

  useEffect(() => {
    api.get("/admin/pricing/gpu")
      .then((res) => setRows(res.data.rows ?? []))
      .catch(() => toast.error("Failed to load GPU pricing"))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: string, field: "markup_pct" | "floor_per_hour_usd", raw: string) => {
    setRows((prev) =>
      prev.map((r) =>
        rowKey(r) === key ? { ...r, [field]: Number(raw) || 0, _dirty: true } : r
      )
    );
  };

  const save = async (row: Draft) => {
    const key = rowKey(row);
    setSaving(key);
    try {
      await api.put("/admin/pricing/gpu", {
        gpu_catalog_id: row.gpu_catalog_id,
        cloud_type: row.cloud_type,
        interruptible: row.interruptible,
        markup_pct: row.markup_pct,
        floor_per_hour_usd: row.floor_per_hour_usd,
      });
      setRows((prev) => prev.map((r) => rowKey(r) === key ? { ...r, _dirty: false } : r));
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Markup is a multiplier on RunPod&apos;s market rate (1.25 = 25% markup).
        Floor is the minimum $/hr regardless of market rate.
        Changes take effect on the next GPU pod provisioning.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">GPU</th>
              <th className="px-4 py-3">Cloud</th>
              <th className="px-4 py-3">Spot</th>
              <th className="px-4 py-3 w-36">Markup (×)</th>
              <th className="px-4 py-3 w-36">Floor ($/hr)</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((row) => {
              const key = rowKey(row);
              const gpuName = row.gpu_catalog?.display_name || row.gpu_catalog?.name || row.gpu_catalog_id;
              return (
                <tr key={key} className="bg-neutral-950 hover:bg-neutral-900 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{gpuName}</td>
                  <td className="px-4 py-3 text-neutral-300">{row.cloud_type}</td>
                  <td className="px-4 py-3 text-neutral-300">{row.interruptible ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      step="0.001"
                      min="1"
                      value={row.markup_pct}
                      onChange={(e) => update(key, "markup_pct", e.target.value)}
                      className="bg-neutral-800 border-neutral-700 text-white h-8 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={row.floor_per_hour_usd}
                      onChange={(e) => update(key, "floor_per_hour_usd", e.target.value)}
                      className="bg-neutral-800 border-neutral-700 text-white h-8 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      disabled={!row._dirty || saving === key}
                      onClick={() => save(row)}
                      className="cursor-pointer h-8 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
                    >
                      {saving === key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-center text-neutral-500 py-8 text-sm">
            No GPU pricing rows. Run the GPU catalog sync first.
          </p>
        )}
      </div>
    </div>
  );
}
