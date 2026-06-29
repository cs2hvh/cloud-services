'use client';

import { Badge } from '@/components/ui/badge';
import { MONO } from '@/components/dashboard/inference/chrome';
import { spanLabel } from './_helpers';

export function StatusBadge({ status }: { status: string }) {
  const label =
    status === 'error_guardrail_blocked' ? 'blocked' : status.replace('error_', '');

  const cls =
    status === 'success'                  ? 'border-emerald-500/30 text-emerald-400/80' :
    status === 'cancelled'                ? 'border-white/20 text-white/40' :
    status === 'error_guardrail_blocked'  ? 'border-orange-500/30 text-orange-400/80' :
                                            'border-red-500/30 text-red-400/80';

  return (
    <Badge variant="outline" className={`${MONO} text-[9px] uppercase tracking-[0.1em] ${cls}`}>
      {label}
    </Badge>
  );
}

export function GuardrailBadge({ action }: { action: string | null }) {
  if (!action || action === 'clean')
    return <span className={`${MONO} text-[10px] text-white/25`}>—</span>;

  const cls =
    action === 'blocked'  ? 'border-red-500/30 text-red-400/80' :
    action === 'redacted' ? 'border-blue-500/30 text-blue-400/80' :
                            'border-amber-500/30 text-amber-400/80';

  return (
    <Badge variant="outline" className={`${MONO} text-[9px] uppercase tracking-[0.1em] ${cls}`}>
      {action}
    </Badge>
  );
}

export function SpanTypeBadge({ name }: { name: string }) {
  const label = spanLabel(name);
  const cls =
    label === 'chat'       ? 'border-[#0095FF]/30 text-[#0095FF]/80' :
    label === 'embed'      ? 'border-purple-500/30 text-purple-400/80' :
    label === 'image'      ? 'border-pink-500/30 text-pink-400/80' :
    label === 'audio'      ? 'border-teal-500/30 text-teal-400/80' :
    label === 'rerank'     ? 'border-amber-500/30 text-amber-400/80' :
    label === 'moderation' ? 'border-orange-500/30 text-orange-400/80' :
    label === 'ocr'        ? 'border-cyan-500/30 text-cyan-400/80' :
    label === 'video'      ? 'border-violet-500/30 text-violet-400/80' :
    label === 'music'      ? 'border-rose-500/30 text-rose-400/80' :
                             'border-white/20 text-white/50';
  return (
    <Badge variant="outline" className={`${MONO} text-[9px] uppercase tracking-[0.1em] ${cls}`}>
      {label}
    </Badge>
  );
}
