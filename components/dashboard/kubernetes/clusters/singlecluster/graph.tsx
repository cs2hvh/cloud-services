"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Label,
  Legend,
  TooltipProps 
} from "recharts";
import { X } from "lucide-react";

interface GraphData {
  labels: string[]; // Timestamps for X-axis
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}

interface GraphMetadata {
  title?: string;
  nodeIp?: string;
  nodeId?: string;
  timeRange?: number;
}

interface TooltipPayloadEntry {
  name: string;
  value: number | string;
  color: string;
  dataKey: string;
}

type CustomTooltipProps = TooltipProps<number, string> & {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
};

type GraphProps = {
  open?: boolean;
  setGraphOpenAction: (open: boolean) => void;
  data: GraphData;
  metadata?: GraphMetadata;
};

export default function Graph({ open, setGraphOpenAction, data, metadata }: GraphProps) {
  // Transform data to recharts format
  const chartData = React.useMemo(() => {
    if (!data || !data.labels || !data.datasets) {
      return [];
    }

    // Create array of objects where each object represents one time point
    return data.labels.map((label, index) => {
      const point: Record<string, string | number> = {
        time: label, // X-axis label
      };

      // Add each dataset's value for this time point
      data.datasets.forEach((dataset) => {
        point[dataset.label] = dataset.data[index] || 0;
      });

      return point;
    });
  }, [data]);

  // Generate unique colors for each dataset
  const datasetColors = React.useMemo(() => {
    const colors = [
      '#3b82f6', // Blue
      '#22c55e', // Green
      '#f97316', // Orange
      '#a855f7', // Purple
      '#ec4899', // Pink
      '#14b8a6', // Teal
      '#f59e0b', // Amber
      '#ef4444', // Red
    ];

    return data?.datasets?.map((dataset, index) => ({
      label: dataset.label,
      color: dataset.borderColor || colors[index % colors.length],
    })) || [];
  }, [data]);

  // Calculate statistics for tooltip
  const getStats = (datasetLabel: string) => {
    const dataset = data?.datasets?.find(d => d.label === datasetLabel);
    if (!dataset || !dataset.data.length) return null;

    const values = dataset.data;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const latest = values[values.length - 1];

    return { min, max, avg: avg.toFixed(2), latest };
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[200px]">
        <p className="text-sm font-semibold text-slate-700 mb-2">
          Time: {label}
        </p>
        <div className="space-y-1">
          {payload.map((entry: TooltipPayloadEntry, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-slate-600">{entry.name}:</span>
              </div>
              <span className="text-xs font-semibold text-slate-900">
                {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
                {entry.name.includes('%') ? '%' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setGraphOpenAction}>
      <DialogContent className="bg-slate-50 max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                {metadata?.title || "Monitoring Metrics"}
              </DialogTitle>
              {metadata?.nodeIp && (
                <p className="text-sm text-slate-500 mt-1">
                  Node: {metadata.nodeIp} • Last {metadata.timeRange || 1} hour(s)
                </p>
              )}
            </div>
            <button
              onClick={() => setGraphOpenAction(false)}
              className="rounded-lg p-2 hover:bg-slate-200 transition-colors"
            >
              <X className="h-5 w-5 text-slate-600" />
            </button>
          </div>
        </DialogHeader>

        {/* Statistics Cards */}
        {data?.datasets && data.datasets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {data.datasets.slice(0, 3).map((dataset, index) => {
              const stats = getStats(dataset.label);
              if (!stats) return null;

              return (
                <div 
                  key={index}
                  className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: datasetColors[index]?.color }}
                    />
                    <h3 className="text-sm font-semibold text-slate-700">
                      {dataset.label}
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Current</p>
                      <p className="font-bold text-slate-900">{stats.latest.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Average</p>
                      <p className="font-bold text-slate-900">{stats.avg}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Min</p>
                      <p className="font-bold text-green-600">{stats.min.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Max</p>
                      <p className="font-bold text-red-600">{stats.max.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Main Chart */}
        <div className="h-[400px] w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={chartData} 
                margin={{ top: 10, right: 30, bottom: 30, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                {/* X-axis: Time labels */}
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#475569", fontSize: 11 }}
                  interval="preserveStartEnd"
                  minTickGap={30}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                >
                  <Label 
                    value="Time" 
                    offset={0} 
                    position="insideBottom" 
                    fill="#475569"
                    style={{ fontSize: 12, fontWeight: 500 }}
                  />
                </XAxis>

                {/* Y-axis: Metric values */}
                <YAxis
                  tick={{ fill: "#475569", fontSize: 11 }}
                  width={60}
                  domain={['auto', 'auto']}
                >
                  <Label 
                    value="Value" 
                    angle={-90} 
                    position="insideLeft" 
                    fill="#475569"
                    style={{ fontSize: 12, fontWeight: 500 }}
                  />
                </YAxis>

                {/* Tooltip */}
                <Tooltip content={<CustomTooltip />} />

                {/* Legend */}
                <Legend 
                  verticalAlign="top" 
                  height={36}
                  iconType="line"
                  wrapperStyle={{ paddingBottom: 10 }}
                />

                {/* Lines for each dataset */}
                {data.datasets.map((dataset, index) => (
                  <Line
                    key={dataset.label}
                    type="monotone"
                    dataKey={dataset.label}
                    stroke={datasetColors[index]?.color || '#3b82f6'}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                    isAnimationActive={true}
                    animationDuration={800}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-slate-500 font-medium">No data available</p>
                <p className="text-slate-400 text-sm mt-1">
                  Try selecting a different time range
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between text-xs text-slate-500 bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Live monitoring data</span>
          </div>
          <div>
            {chartData.length} data points • Updated every 2 minutes
          </div>
        </div>

        {/* Export/Actions (Optional) */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              // Add export to CSV functionality
              console.log('Export data:', chartData);
            }}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => {
              // Add refresh functionality
              window.location.reload();
            }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh Data
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}