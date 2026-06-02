'use client';

import { useEffect, useMemo, useState } from 'react';
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import { AlertTriangle, GitCommit, Loader2, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

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
          : 'Rollback completed successfully',
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0c0d11] border border-white/[0.08] rounded-[10px] text-white p-0 gap-0 overflow-hidden max-w-[440px] flex flex-col max-h-[90svh] [&_[data-slot=dialog-close]]:text-white/35 [&_[data-slot=dialog-close]]:hover:text-white/75 [&_[data-slot=dialog-close]]:hover:bg-white/[0.06]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-white/[0.06] flex-shrink-0 pr-14">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-7 w-7 rounded-[6px] bg-amber-500/[0.12] border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <DialogTitle className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              Roll Back Application?
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-white/45 leading-relaxed pl-[38px]">
            {rollbackUnavailable ? (
              <>No previous release available for <span className="text-white/70 font-medium">{appName}</span>.</>
            ) : (
              <>Switch <span className="text-white/70 font-medium">{appName}</span> from{' '}
              <span className="text-white/70">{currentLabel}</span> to{' '}
              <span className="text-white/70">{targetLabel}</span>.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-4">
          {/* Details table */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden divide-y divide-white/[0.04]">
            <div className="flex items-center justify-between px-4 py-2.5 gap-3">
              <span className={`${MONO} text-[10.5px] uppercase tracking-[0.10em] text-white/40`}>
                Current serving release
              </span>
              <span className={`${MONO} text-[12px] text-white`}>{currentLabel}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 gap-3">
              <span className={`${MONO} text-[10.5px] uppercase tracking-[0.10em] text-white/40`}>
                Rollback target
              </span>
              <span className={`${MONO} text-[12px] ${rollbackUnavailable ? 'text-white/35' : 'text-white'}`}>
                {targetLabel}
              </span>
            </div>
            {targetCommitSha ? (
              <div className="flex items-center justify-between px-4 py-2.5 gap-3">
                <span className={`${MONO} text-[10.5px] uppercase tracking-[0.10em] text-white/40`}>
                  Target commit
                </span>
                <span className={`${MONO} text-[12px] text-white inline-flex items-center gap-1`}>
                  <GitCommit className="h-3 w-3 text-white/35" />
                  {targetCommitSha.slice(0, 7)}
                </span>
              </div>
            ) : null}
            {currentSizeLabel ? (
              <div className="flex items-center justify-between px-4 py-2.5 gap-3">
                <span className={`${MONO} text-[10.5px] uppercase tracking-[0.10em] text-white/40`}>
                  Runtime size after rollback
                </span>
                <span className={`${MONO} text-[12px] text-white capitalize`}>{currentSizeLabel}</span>
              </div>
            ) : null}
          </div>

          {rollbackUnavailable ? (
            <div className={`${MONO} flex items-start gap-2 border border-rose-500/20 bg-rose-500/[0.05] rounded-[5px] px-3 py-3 text-[11px] text-rose-200/85`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                No previous release different from the current serving release is available.
                Resize and same-image operations do not create rollback targets.
              </span>
            </div>
          ) : null}

          <div className={`${MONO} flex items-start gap-2 border border-amber-400/20 bg-amber-500/[0.05] rounded-[5px] px-3 py-3 text-[11px] text-amber-200/85`}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              This only switches the serving release and restarts the application. It does not
              revert runtime size, environment variables, domains, or project assignment. No new
              build will be created.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-white/[0.06] flex-shrink-0 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isRollingBack}
            className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRollback}
            disabled={isRollingBack || rollbackUnavailable}
            className="inline-flex h-9 min-w-[152px] items-center justify-center gap-2 rounded-[5px] border border-amber-400/25 bg-[#0d0e11] px-4 text-[13px] font-medium text-amber-300 transition-colors hover:bg-amber-500/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRollingBack ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {isRollingBack ? 'Rolling Back…' : 'Roll Back Release'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
