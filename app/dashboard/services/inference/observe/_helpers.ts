export function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function spanLabel(name: string): string {
  return name.replace('gen_ai.', '');
}

export function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatCost(cents: number | null): string {
  if (cents == null) return '—';
  const d = cents / 100;
  if (d === 0) return '$0.00';
  if (d < 0.0001) return '<$0.0001';
  if (d < 0.01) return `$${d.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${d.toFixed(2)}`; // always 2 dp for ≥$0.01
}

export function formatTokens(input: number | null, output: number | null): string {
  if (input == null && output == null) return '—';
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return `${input != null ? fmt(input) : '—'} / ${output != null ? fmt(output) : '—'}`;
}
