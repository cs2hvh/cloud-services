"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Label } from "recharts";

type GraphProps = {
  open?: boolean;
  setGraphOpen: (open: boolean) => void;
};

// Your raw data: [unixSeconds, "numberAsString"]
const data: [number, string][] = [
  [1760127240, "1191772160"],
  [1760127360, "1192235008"],
  [1760127480, "1191968768"],
  [1760127600, "1192132608"],
  [1760127720, "1192230912"],
  [1760127840, "1192558592"],
  [1760127960, "1192583168"],
  [1760128080, "1193054208"],
  [1760128200, "1192722432"],
  [1760128320, "1193009152"],
  [1760128440, "1193107456"],
  [1760128560, "1193107456"],
];

export default function Graph({ open, setGraphOpen }: GraphProps) {
  // Transform to recharts-friendly objects: { timeLabel, value }
  const points = React.useMemo(
    () =>
      data.map(([ts, v]) => ({
        // format as hh:mm or whatever you prefer:
        timeLabel: new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        value: Number(v),
      })),
    []
  );

  return (
    <Dialog open={open} onOpenChange={setGraphOpen}>
      <DialogContent className="bg-slate-50">
        <DialogHeader>
          <DialogTitle>Droplet Metric</DialogTitle>
        </DialogHeader>

        <div className="h-[360px] w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {/* Vertical layout: time on Y-axis, value on X-axis */}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              {/* X = numeric value axis */}
              <XAxis
                type="number"
                domain={["auto", "auto"]}
                tick={{ fill: "#475569", fontSize: 12 }}
                tickFormatter={(n) => String(n)}
              >
                <Label value="Value" offset={-5} position="insideBottom" fill="#475569" />
              </XAxis>

              {/* Y = time labels */}
              <YAxis
                dataKey="timeLabel"
                type="category"
                tick={{ fill: "#475569", fontSize: 12 }}
                width={70}
              />

              <Tooltip
                labelFormatter={(lab) => `Time: ${lab}`}
                formatter={(v) => [String(v), "Value"]}
                contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 8 }}
              />

              {/* Green line */}
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
          Time on Y-axis, metric value on X-axis. Background kept light.
        </div>
      </DialogContent>
    </Dialog>
  );
}
