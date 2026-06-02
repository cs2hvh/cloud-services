'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Loader2, Unlink } from 'lucide-react';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface UnlinkConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isUnlinking: boolean;
  resourceType: 'database' | 'bucket';
  resourceName: string;
  injectedVars?: string[];
}

export function UnlinkConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isUnlinking,
  resourceType,
  resourceName,
  injectedVars = [],
}: UnlinkConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0c0d11] border border-white/[0.08] rounded-[10px] text-white p-0 gap-0 overflow-hidden max-w-[420px] max-h-[90svh] flex flex-col [&_[data-slot=dialog-close]]:text-white/35 [&_[data-slot=dialog-close]]:hover:text-white/75 [&_[data-slot=dialog-close]]:hover:bg-white/[0.06]">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-white/[0.06] pr-14 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-7 w-7 rounded-[6px] bg-rose-500/[0.12] border border-rose-500/20 flex items-center justify-center flex-shrink-0">
              <Unlink className="h-3.5 w-3.5 text-rose-400" />
            </div>
            <DialogTitle className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              Unlink {resourceType === 'database' ? 'Database' : 'Bucket'}?
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-white/45 leading-relaxed pl-[38px]">
            This will remove the integration and all associated environment variables.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {/* Resource warning */}
          <div className="border border-amber-400/20 bg-amber-500/[0.05] rounded-[7px] px-4 py-3.5 space-y-1">
            <p className={`${MONO} text-[12px] font-semibold text-amber-200`}>
              You&apos;re about to unlink:{' '}
              <span className="text-amber-100">{resourceName}</span>
            </p>
            <p className={`${MONO} text-[11.5px] text-amber-200/60`}>
              Your app will be restarted to apply the changes.
            </p>
          </div>

          {/* Env vars list */}
          {injectedVars.length > 0 && (
            <div className="space-y-2">
              <p className={`${MONO} text-[11px] uppercase tracking-[0.10em] text-white/40`}>
                {injectedVars.length} variable{injectedVars.length !== 1 ? 's' : ''} will be removed
              </p>
              <div className="max-h-[120px] overflow-y-auto border border-white/[0.06] bg-[#111216] rounded-[5px] divide-y divide-white/[0.04] overflow-hidden">
                {injectedVars.map((varName) => (
                  <div key={varName} className={`${MONO} flex items-center gap-2 px-3 py-1.5`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400/70 flex-shrink-0" />
                    <span className="text-[11px] text-rose-300">{varName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom warning */}
          <div className={`${MONO} flex items-start gap-2 border border-white/[0.06] bg-white/[0.02] rounded-[5px] px-3 py-2.5 text-[11px] text-white/35`}>
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-white/25" />
            <span>
              Ensure your application does not rely on these credentials before proceeding.
              This action cannot be undone.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-white/[0.06] flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isUnlinking}
            className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isUnlinking}
            className="inline-flex h-9 min-w-[104px] items-center justify-center gap-2 rounded-[5px] border border-rose-500/25 bg-[#0d0e11] px-4 text-[13px] font-medium text-rose-200 transition-colors hover:bg-rose-500/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isUnlinking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unlink className="h-3.5 w-3.5" />
            )}
            {isUnlinking ? 'Unlinking…' : 'Unlink'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
