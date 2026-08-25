export type Period = '24h' | '7d' | '30d';
export type StreamPeriod = 'live' | '24h' | '7d' | '30d';
export type AnalyticsGroupBy = 'model' | 'prompt_version' | 'name' | 'key';

export interface AnalyticsGroup {
  key: string;
  label: string;
  name: string;
  requests: number;
  cost_cents: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  error_rate: number;
  block_rate: number;
}

export interface AnalyticsDay {
  date: string;
  requests: number;
  cost_cents: number;
  blocked: number;
}

export interface Analytics {
  period: Period;
  group_by: AnalyticsGroupBy;
  sampled: number;
  capped: boolean;
  totals: {
    requests: number;
    cost_cents: number;
    blocked: number;
    errors: number;
    avg_latency_ms: number | null;
  };
  by_group: AnalyticsGroup[];
  by_day: AnalyticsDay[];
}

export interface TraceRow {
  id: string;
  trace_id: string;
  request_id: string;
  name: string;
  model_id: string | null;
  prompt_id: string | null;
  prompt_version: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  cost_cents: number | null;
  guardrail_action: string | null;
  status: string;
  attributes: Record<string, unknown>;
  created_at: string;
}

export interface TracesResponse {
  data: TraceRow[];
  next_before: string | null;
}

export interface SpanCounts {
  byType: Record<string, number>;
  blocked: number;
  errors: number;
}

export interface TraceSpanItem {
  id: string;
  name: string;
  model_id: string | null;
  latency_ms: number | null;
  cost_cents: number | null;
  status: string;
  guardrail_action: string | null;
  created_at: string;
}

export interface TraceDetail {
  trace_id: string;
  span_count: number;
  totals: {
    cost_cents: number;
    total_latency_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
  };
  spans: TraceSpanItem[];
}
