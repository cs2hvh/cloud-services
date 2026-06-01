'use client';

import { useEffect, useMemo, useState } from 'react';
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import { AlertTriangle, GitCommit, Loader2, RotateCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface RollbackAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string | null;
  appName: string | null;
  currentBuildNumber?: number | null;
  targetBuildNumber?: number | null;
  targetCommitSha?: string | null;
  currentSizeLabel?: string | null;
  onRollbackSuccess?: () => Promise<void> | void;
}

export function RollbackAppModal({
  open,
  onOpenChange,
  appId,
  appName,
  currentBuildNumber = null,
  targetBuildNumber = null,
  targetCommitSha = null,
  currentSizeLabel = null,
  onRollbackSuccess,
}: RollbackAppModalProps) {
  const [isRollingBack, setIsRollingBack] = useState(false);

  useEffect(() => {
    if (open) {
      setIsRollingBack(false);
    }
  }, [open, appId]);

  const targetLabel = useMemo(() => {
    if (typeof targetBuildNumber === 'number') {
      return `Build #${targetBuildNumber}`;
    }
    return 'No rollback target available';
  }, [targetBuildNumber]);

  const currentLabel = useMemo(() => {
    if (typeof currentBuildNumber === 'number') {
      return `Build #${currentBuildNumber}`;
    }
    return 'the current serving release';
  }, [currentBuildNumber]);
  const sameTargetAsCurrent =
    typeof currentBuildNumber === 'number' &&
    typeof targetBuildNumber === 'number' &&
    currentBuildNumber === targetBuildNumber;
  // Unavailable when no valid target, or when target is the same as what's serving
  const rollbackUnavailable = targetBuildNumber === null || sameTargetAsCurrent;

  const handleRollback = async () => {
    if (!appId || !appName) return;

    setIsRollingBack(true);

    try {
      const res = await fetch('/api/services/platform-apps/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `rollback:${Date.now()}:${safeRandomUUID()}`,
        },
        body: JSON.stringify({ app_id: appId }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.error || 'Rollback failed');
      }

      const rolledBackBuild =
        typeof payload?.rolled_back_to?.build_number === 'number'
          ? payload.rolled_back_to.build_number
          : targetBuildNumber;

      toast.success(
        rolledBackBuild !== null
          ? `Rolled back to Build #${rolledBackBuild}`
          : 'Rollback completed successfully'
      );

      if (payload?.warning) {
        toast.warning('Rollback completed with warning', {
          description: payload.warning,
          duration: 7000,
        });
      }

      await onRollbackSuccess?.();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Rollback failed';
      toast.error(message);
    } finally {
      setIsRollingBack(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-zinc-900 border-white/10 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-300" />
            Roll Back Application
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-sm text-white/70">
              <p>
                Roll back <span className="font-semibold text-white">{appName}</span> from{' '}
                <span className="font-semibold text-white">{currentLabel}</span>
                {rollbackUnavailable ? (
                  <span>.</span>
                ) : (
                  <>
                    {' '}to <span className="font-semibold text-white">{targetLabel}</span>.
                  </>
                )}
              </p>
              <div className="border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/45">Current serving release</span>
                  <span className="font-mono text-white">{currentLabel}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-white/45">Rollback target</span>
                  <span className="font-mono text-white">{targetLabel}</span>
                </div>
                {targetCommitSha ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-white/45">Target commit</span>
                    <span className="inline-flex items-center gap-1 font-mono text-white">
                      <GitCommit className="w-3.5 h-3.5 text-white/45" />
                      {targetCommitSha.slice(0, 7)}
                    </span>
                  </div>
                ) : null}
                {currentSizeLabel ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-white/45">Runtime size after rollback</span>
                    <span className="font-mono text-white capitalize">{currentSizeLabel}</span>
                  </div>
                ) : null}
              </div>
              {rollbackUnavailable ? (
                <div className="flex items-start gap-2 border border-red-400/20 bg-red-500/10 p-3 text-red-200/85">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>
                    No previous release different from the current serving release is available.
                    Resize and same-image operations do not create rollback targets.
                  </span>
                </div>
              ) : null}
              <div className="flex items-start gap-2 border border-amber-400/20 bg-amber-500/10 p-3 text-amber-200/85">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  This only switches the serving release and restarts the application. It does not
                  revert runtime size, environment variables, domains, or project assignment. No
                  new build will be created.
                </span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isRollingBack}
            className="cursor-pointer bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleRollback();
            }}
            disabled={isRollingBack || rollbackUnavailable}
            className="cursor-pointer bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isRollingBack ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Rolling Back...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                Roll Back Release
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
