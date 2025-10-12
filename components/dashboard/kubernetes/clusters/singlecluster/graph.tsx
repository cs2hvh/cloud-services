"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Label } from "recharts";

type GraphProps = {
  open?: boolean;
  setGraphOpen: (open: boolean) => void;
  data: [number, string][];
};

export default function Graph({ open, setGraphOpen, data }: GraphProps) {
  // Transform to recharts-friendly objects: { timeLabel, value }
  const points = React.useMemo(
    () =>
      (data ?? []).map(([ts, v]) => ({
        timeLabel: new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        value: Number(v),
      })),
    [data]
  );

  return (
    <Dialog open={open} onOpenChange={setGraphOpen}>
      <DialogContent className="bg-slate-50">
        <DialogHeader>
          <DialogTitle>Droplet Metric</DialogTitle>
        </DialogHeader>

        <div className="h-[360px] w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {/* Standard layout: time (category) on X-axis, numeric value on Y-axis */}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

              {/* X = time labels */}
              <XAxis
                dataKey="timeLabel"
                type="category"
                tick={{ fill: "#475569", fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={20}
              >
                <Label value="Time" offset={-5} position="insideBottom" fill="#475569" />
              </XAxis>

              {/* Y = numeric values */}
              <YAxis
                type="number"
                domain={["auto", "auto"]}
                tick={{ fill: "#475569", fontSize: 12 }}
                width={60}
              >
                <Label value="Value" angle={-90} position="insideLeft" fill="#475569" />
              </YAxis>

              <Tooltip
                labelFormatter={(lab) => `Time: ${lab}`}
                formatter={(v) => [String(v), "Value"]}
                contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 8 }}
              />

              <Line
                type="monotone"
                dataKey="value"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="text-xs text-slate-500">
          Time on X-axis, metric value on Y-axis.
        </div>
      </DialogContent>
    </Dialog>
  );
}
