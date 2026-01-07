/**
 * Issue Translator
 * 
 * Translates raw Kubernetes events into customer-friendly issue messages.
 * Hides infrastructure details (pod names, nodes, exit codes).
 * 
 * This is what Vercel does internally - they collect K8s events but 
 * surface only platform-level messages to users.
 */

export type IssueSeverity = 'critical' | 'warning' | 'info';

export interface PlatformIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  possibleCauses: string[];
  suggestedActions: string[];
  lastDetected: string;
  count: number;
}

export interface IssuesSummary {
  hasIssues: boolean;
  hasCriticalIssues: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

// Internal K8s event structure (from RuntimeLogsService)
interface K8sEvent {
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  count: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  source: string;
}

/**
 * Mapping table: K8s event reason → user-friendly issue
 */
const ISSUE_MAPPINGS: Record<string, {
  title: string;
  description: string;
  possibleCauses: string[];
  suggestedActions: string[];
  severity: IssueSeverity;
}> = {
  // Critical issues
  'CrashLoopBackOff': {
    title: 'Application crashed on startup',
    description: 'Your application keeps crashing and the platform is repeatedly trying to restart it.',
    possibleCauses: [
      'Application threw an uncaught exception during startup',
      'Server is not listening on the configured port',
      'Missing environment variables or configuration',
      'Dependency initialization failed',
    ],
    suggestedActions: [
      'Check Runtime Logs for error messages',
      'Verify your app listens on the correct port',
      'Review environment variables in Settings',
      'Test your app locally with the same configuration',
    ],
    severity: 'critical',
  },
  
  'OOMKilled': {
    title: 'Application exceeded memory limit',
    description: 'Your application used more memory than allocated and was terminated.',
    possibleCauses: [
      'Memory leak in your application',
      'Processing large files or datasets in memory',
      'Too many concurrent connections or requests',
      'Instance size too small for your workload',
    ],
    suggestedActions: [
      'Upgrade to a larger instance size',
      'Profile your app for memory leaks',
      'Implement streaming for large data operations',
      'Add memory limits to your application code',
    ],
    severity: 'critical',
  },
  
  'ImagePullBackOff': {
    title: 'Deployment failed to start',
    description: 'The platform could not retrieve your application package. This usually means the build failed.',
    possibleCauses: [
      'Build step failed with errors',
      'Network issue during deployment',
      'Internal platform error',
    ],
    suggestedActions: [
      'Check Build Logs for errors',
      'Trigger a new deployment',
      'Contact support if the issue persists',
    ],
    severity: 'critical',
  },

  'FailedScheduling': {
    title: 'Deployment temporarily delayed',
    description: 'The platform is experiencing high demand and your deployment is queued.',
    possibleCauses: [
      'High platform load in your region',
      'Requested instance size temporarily unavailable',
    ],
    suggestedActions: [
      'Wait a few minutes and check again',
      'Try a different instance size',
      'Contact support if this persists for more than 10 minutes',
    ],
    severity: 'warning',
  },
  
  'BackOff': {
    title: 'Application failed to start',
    description: 'Your application is having trouble starting up.',
    possibleCauses: [
      'Application crashed during initialization',
      'Required services not available',
      'Configuration error',
    ],
    suggestedActions: [
      'Check Runtime Logs for error details',
      'Verify environment variables are correct',
      'Test locally with the same configuration',
    ],
    severity: 'critical',
  },
  
  'Failed': {
    title: 'Operation failed',
    description: 'An operation on your application did not complete successfully.',
    possibleCauses: [
      'Temporary platform issue',
      'Application configuration problem',
    ],
    suggestedActions: [
      'Trigger a new deployment',
      'Check logs for more details',
    ],
    severity: 'warning',
  },
  
  'Unhealthy': {
    title: 'Health check failed',
    description: 'Your application is not responding to health checks.',
    possibleCauses: [
      'Application is overloaded and slow to respond',
      'Application crashed but hasn\'t been restarted yet',
      'Health endpoint is not implemented correctly',
    ],
    suggestedActions: [
      'Check if your app handles GET requests on / or /health',
      'Review Runtime Logs for errors',
      'Consider upgrading to a larger instance',
    ],
    severity: 'warning',
  },

  // Info-level (normal operations)
  'Pulling': {
    title: 'Deploying your application',
    description: 'Your application is being deployed to the platform.',
    possibleCauses: [],
    suggestedActions: [],
    severity: 'info',
  },
  
  'Pulled': {
    title: 'Deployment prepared',
    description: 'Your application package was successfully retrieved.',
    possibleCauses: [],
    suggestedActions: [],
    severity: 'info',
  },
  
  'Created': {
    title: 'Application instance created',
    description: 'A new instance of your application was created.',
    possibleCauses: [],
    suggestedActions: [],
    severity: 'info',
  },
  
  'Started': {
    title: 'Application started successfully',
    description: 'Your application instance has started and is running.',
    possibleCauses: [],
    suggestedActions: [],
    severity: 'info',
  },
  
  'Killing': {
    title: 'Stopping old instance',
    description: 'An old application instance is being stopped as part of a new deployment.',
    possibleCauses: [],
    suggestedActions: [],
    severity: 'info',
  },
};

/**
 * Translate K8s events into customer-friendly issues
 */
export function translateToIssues(events: K8sEvent[]): PlatformIssue[] {
  const issueMap = new Map<string, PlatformIssue>();

  for (const event of events) {
    // Find the matching issue template
    const matchedReason = Object.keys(ISSUE_MAPPINGS).find(key => 
      event.reason.includes(key)
    );

    if (!matchedReason) {
      // Skip events we don't have translations for (hides internal noise)
      continue;
    }

    const template = ISSUE_MAPPINGS[matchedReason];
    const issueId = matchedReason; // Group by issue type

    if (issueMap.has(issueId)) {
      // Update existing issue with latest data
      const existing = issueMap.get(issueId)!;
      existing.count += event.count;
      if (event.lastTimestamp && (!existing.lastDetected || event.lastTimestamp > existing.lastDetected)) {
        existing.lastDetected = event.lastTimestamp;
      }
    } else {
      // Create new issue
      issueMap.set(issueId, {
        id: issueId,
        severity: template.severity,
        title: template.title,
        description: template.description,
        possibleCauses: template.possibleCauses,
        suggestedActions: template.suggestedActions,
        lastDetected: event.lastTimestamp || new Date().toISOString(),
        count: event.count,
      });
    }
  }

  // Sort by severity (critical first, then warning, then info)
  const severityOrder: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 };
  
  return Array.from(issueMap.values()).sort((a, b) => {
    const orderDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (orderDiff !== 0) return orderDiff;
    // Within same severity, sort by most recent
    return new Date(b.lastDetected).getTime() - new Date(a.lastDetected).getTime();
  });
}

/**
 * Calculate issues summary
 */
export function calculateSummary(issues: PlatformIssue[]): IssuesSummary {
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  return {
    hasIssues: criticalCount > 0 || warningCount > 0,
    hasCriticalIssues: criticalCount > 0,
    criticalCount,
    warningCount,
    infoCount,
  };
}

/**
 * Get issues that should be highlighted (critical + warnings only)
 */
export function getActionableIssues(issues: PlatformIssue[]): PlatformIssue[] {
  return issues.filter(i => i.severity === 'critical' || i.severity === 'warning');
}
