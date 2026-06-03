'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';

// ─── Design tokens (match app-overview-tab / app-bandwidth-card) ────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const ACCENT = '#0095FF';

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const TONE: Record<Tone, { color: string; bg: string; border: string }> = {
  green: { color: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.25)' },
  amber: { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)' },
  red: { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
  blue: { color: ACCENT, bg: 'rgba(0,149,255,0.10)', border: 'rgba(0,149,255,0.30)' },
  neutral: { color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)' },
};

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] w-fit`}
      style={{ color: t.color, background: t.bg, borderColor: t.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color, boxShadow: `0 0 5px ${t.color}` }} />
      {children}
    </span>
  );
}

type IssueSeverity = 'critical' | 'warning' | 'info';

interface PlatformIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  possibleCauses: string[];
  suggestedActions: string[];
  lastDetected: string;
  count: number;
}

interface IssuesSummary {
  hasIssues: boolean;
  hasCriticalIssues: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

interface AppIssuesProps {
  appId: string;
  appName: string;
  appStatus: string;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  return date.toLocaleString();
}

function getSeverityStyles(severity: IssueSeverity) {
  switch (severity) {
    case 'critical':
      return {
        tone: 'red' as Tone,
        container: 'border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.06)]',
        icon: <AlertCircle className="h-4 w-4 text-[#f87171]" />,
        text: 'text-[#f87171]',
      };
    case 'warning':
      return {
        tone: 'amber' as Tone,
        container: 'border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.05)]',
        icon: <AlertTriangle className="h-4 w-4 text-[#fbbf24]" />,
        text: 'text-[#fbbf24]',
      };
    case 'info':
      return {
        tone: 'blue' as Tone,
        container: 'border-[rgba(0,149,255,0.25)] bg-[rgba(0,149,255,0.05)]',
        icon: <Info className="h-4 w-4 text-[#0095FF]" />,
        text: 'text-[#0095FF]',
      };
  }
}

function IssueCard({ issue, defaultExpanded = false }: { issue: PlatformIssue; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const styles = getSeverityStyles(issue.severity);

  const hasDetails = issue.possibleCauses.length > 0 || issue.suggestedActions.length > 0;

  return (
    <div className={`rounded-[6px] border px-4 py-3.5 ${styles.container}`}>
      <div
        className={`flex items-start gap-3 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <span className="mt-0.5 shrink-0">{styles.icon}</span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[13px] font-semibold tracking-[-0.01em] text-white">{issue.title}</h4>
            {issue.count > 1 && (
              <StatusPill tone="neutral">Occurred {issue.count}×</StatusPill>
            )}
          </div>

          <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
            {issue.description}
          </p>

          <div className={`${MONO} mt-2.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/35`}>
            <Clock className="h-3 w-3" />
            Last detected: {formatTimestamp(issue.lastDetected)}
          </div>
        </div>

        {hasDetails && (
          <button className="shrink-0 text-white/30 transition-colors hover:text-white/70">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="mt-4 space-y-4 border-t border-white/[0.08] pt-4">
          {issue.possibleCauses.length > 0 && (
            <div>
              <h5 className={`${MONO} mb-2.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55`}>
                <Lightbulb className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                Possible Causes
              </h5>
              <ul className="space-y-1.5">
                {issue.possibleCauses.map((cause, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[12px] text-white/55">
                    <span className="text-white/25">•</span>
                    {cause}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {issue.suggestedActions.length > 0 && (
            <div>
              <h5 className={`${MONO} mb-2.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55`}>
                <ArrowRight className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                What to Do
              </h5>
              <ul className="space-y-1.5">
                {issue.suggestedActions.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[12px] text-white/55">
                    <span className={`${MONO} shrink-0 font-semibold ${styles.text}`}>{idx + 1}.</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AppIssues({ appId, appName: _appName, appStatus: _appStatus }: AppIssuesProps) {
  // _appName and _appStatus reserved for future use (e.g., filtering, display)
  void _appName;
  void _appStatus;
  const [issues, setIssues] = useState<PlatformIssue[]>([]);
  const [summary, setSummary] = useState<IssuesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/services/platform-apps/events?app_id=${appId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch issues');
      }

      const data = await res.json();
      setIssues(data.issues || []);
      // actionableIssues available in data.actionableIssues if needed
      setSummary(data.summary || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch issues';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchIssues();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchIssues, 30000);
    return () => clearInterval(interval);
  }, [fetchIssues]);

  // Filter issues for display
  const criticalAndWarnings = issues.filter(i => i.severity === 'critical' || i.severity === 'warning');
  const infoIssues = issues.filter(i => i.severity === 'info');

  return (
    <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white truncate">Issues</h3>
          {summary?.hasCriticalIssues && (
            <StatusPill tone="red">
              {summary.criticalCount} Critical
            </StatusPill>
          )}
          {summary?.hasIssues && !summary.hasCriticalIssues && (
            <StatusPill tone="amber">
              {summary.warningCount} Warning{summary.warningCount > 1 ? 's' : ''}
            </StatusPill>
          )}
        </div>

        <button
          onClick={fetchIssues}
          disabled={loading}
          className="shrink-0 text-white/25 transition-colors hover:text-white/70 disabled:opacity-40"
          title="Refresh issues"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="p-5">
        {error && (
          <div className="mb-4 rounded-[6px] border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.06)] px-4 py-3 text-[12px] text-[#f87171]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        ) : criticalAndWarnings.length === 0 ? (
          <div className="py-10 text-center">
            <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.06)]">
              <CheckCircle2 className="h-6 w-6 text-[#4ade80]" />
            </span>
            <p className="text-[15px] font-semibold text-white">No issues detected</p>
            <p className={`${MONO} mt-1.5 text-[11px] uppercase tracking-[0.12em] text-white/35`}>Your application is running smoothly</p>
          </div>
        ) : (
          <div className="space-y-3">
            {criticalAndWarnings.map((issue, idx) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                defaultExpanded={idx === 0 && issue.severity === 'critical'}
              />
            ))}
          </div>
        )}

        {/* Activity Log (info events) - collapsed by default */}
        {infoIssues.length > 0 && (
          <div className="mt-6 border-t border-white/[0.06] pt-4">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className={`${MONO} flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-white/45 transition-colors hover:text-white/70`}
            >
              {showInfo ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Recent Activity ({infoIssues.length})
            </button>

            {showInfo && (
              <div className="mt-3 space-y-2">
                {infoIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center gap-3 rounded-[6px] border border-white/[0.06] bg-[#0d0e11] px-4 py-2.5 text-[12px]"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4ade80]" />
                    <span className="text-white/65">{issue.title}</span>
                    <span className={`${MONO} ml-auto shrink-0 text-[10px] uppercase tracking-[0.1em] text-white/30`}>
                      {formatTimestamp(issue.lastDetected)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
