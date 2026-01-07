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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
        container: 'bg-red-500/10 border-red-500/30',
        icon: <AlertCircle className="w-5 h-5 text-red-400" />,
        badge: 'bg-red-500/20 text-red-400',
        text: 'text-red-400',
      };
    case 'warning':
      return {
        container: 'bg-yellow-500/10 border-yellow-500/30',
        icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
        badge: 'bg-yellow-500/20 text-yellow-400',
        text: 'text-yellow-400',
      };
    case 'info':
      return {
        container: 'bg-blue-500/10 border-blue-500/30',
        icon: <Info className="w-5 h-5 text-blue-400" />,
        badge: 'bg-blue-500/20 text-blue-400',
        text: 'text-blue-400',
      };
  }
}

function IssueCard({ issue, defaultExpanded = false }: { issue: PlatformIssue; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const styles = getSeverityStyles(issue.severity);
  
  const hasDetails = issue.possibleCauses.length > 0 || issue.suggestedActions.length > 0;

  return (
    <div className={`p-4 rounded-lg border ${styles.container}`}>
      <div 
        className={`flex items-start gap-3 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {styles.icon}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-white">{issue.title}</h4>
            {issue.count > 1 && (
              <Badge variant="outline" className="text-xs">
                Occurred {issue.count}×
              </Badge>
            )}
          </div>
          
          <p className="text-sm text-white/60 mt-1">
            {issue.description}
          </p>
          
          <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
            <Clock className="w-3 h-3" />
            Last detected: {formatTimestamp(issue.lastDetected)}
          </div>
        </div>

        {hasDetails && (
          <Button variant="ghost" size="sm" className="text-white/40 hover:text-white">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
          {issue.possibleCauses.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Possible Causes
              </h5>
              <ul className="space-y-1">
                {issue.possibleCauses.map((cause, idx) => (
                  <li key={idx} className="text-sm text-white/50 flex items-start gap-2">
                    <span className="text-white/30">•</span>
                    {cause}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {issue.suggestedActions.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                What to Do
              </h5>
              <ul className="space-y-1">
                {issue.suggestedActions.map((action, idx) => (
                  <li key={idx} className="text-sm text-white/50 flex items-start gap-2">
                    <span className={styles.text}>{idx + 1}.</span>
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
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Issues
            {summary?.hasCriticalIssues && (
              <Badge className="bg-red-500/20 text-red-400">
                <AlertCircle className="w-3 h-3 mr-1" />
                {summary.criticalCount} Critical
              </Badge>
            )}
            {summary?.hasIssues && !summary.hasCriticalIssues && (
              <Badge className="bg-yellow-500/20 text-yellow-400">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {summary.warningCount} Warning{summary.warningCount > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchIssues}
            disabled={loading}
            className="border-white/20"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        ) : criticalAndWarnings.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400/50" />
            <p className="font-medium text-green-400/70">No issues detected</p>
            <p className="text-sm mt-1">Your application is running smoothly</p>
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
          <div className="mt-6 pt-4 border-t border-white/10">
            <button 
              onClick={() => setShowInfo(!showInfo)}
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors"
            >
              {showInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Recent Activity ({infoIssues.length})
            </button>
            
            {showInfo && (
              <div className="mt-3 space-y-2">
                {infoIssues.map((issue) => (
                  <div 
                    key={issue.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-white/5 text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-400/50" />
                    <span className="text-white/60">{issue.title}</span>
                    <span className="text-white/30 text-xs ml-auto">
                      {formatTimestamp(issue.lastDetected)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
