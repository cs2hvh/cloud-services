'use client';

import { useState, useEffect } from 'react';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const DELETED_RESOURCES = [
  'Application deployment and network routing',
  'SSL certificate',
  'DNS record',
  'Build pipeline',
];

interface DeleteAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string | null;
  appName: string | null;
  onDeleteStart: (appId: string) => void;
  onDeleteSuccess: (appId: string) => void;
  onDeleteError: (appId: string) => void;
}

export function DeleteAppModal({
  open,
  onOpenChange,
  appId,
  appName,
  onDeleteStart,
  onDeleteSuccess,
  onDeleteError,
}: DeleteAppModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setIsDeleting(false);
    }
  }, [open, appId]);

  const handleDelete = async () => {
    if (!appId || !appName) return;

    onOpenChange(false);

    toast.info(`Deleting ${appName}...`, {
      description: 'This may take a moment. The app will show as "Deleting" until complete.',
    });

    setIsDeleting(true);
    onDeleteStart(appId);

    try {
      const res = await fetch('/api/services/platform-apps/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId }),
      });
      const payload = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(`${appName} deleted successfully`, {
          description: payload?.warning
            ? 'The app was removed, but some cleanup steps may still need attention.'
            : 'The app and its related resources were cleaned up successfully.',
        });
        if (payload?.warning) {
          toast.warning('Deletion completed with warnings', {
            description: payload.warning,
            duration: 7000,
          });
        }
        onDeleteSuccess(appId);
      } else {
        toast.error(`Failed to delete ${appName}`, {
          description: payload?.error || 'An unexpected error occurred',
        });
        onDeleteError(appId);
      }
    } catch (error) {
      console.error('Error deleting app:', error);
      toast.error(`Error deleting ${appName}`, {
        description: 'Network error or server unavailable',
      });
      onDeleteError(appId);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0c0d11] border border-white/[0.08] rounded-[10px] text-white p-0 gap-0 overflow-hidden max-w-[440px] max-h-[90svh] flex flex-col [&_[data-slot=dialog-close]]:text-white/35 [&_[data-slot=dialog-close]]:hover:text-white/75 [&_[data-slot=dialog-close]]:hover:bg-white/[0.06]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-white/[0.06] pr-14 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-7 w-7 rounded-[6px] bg-rose-500/[0.12] border border-rose-500/20 flex items-center justify-center flex-shrink-0">
              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
            </div>
            <DialogTitle className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              Delete Application?
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-white/45 leading-relaxed pl-[38px]">
            <span className="text-white/70 font-medium">{appName}</span> and all associated resources will be permanently removed.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] divide-y divide-white/[0.04] overflow-hidden">
            {DELETED_RESOURCES.map((item) => (
              <div
                key={item}
                className={`${MONO} px-4 py-2.5 text-[11px] text-white/50 flex items-center gap-2.5`}
              >
                <span className="h-1 w-1 rounded-full bg-white/20 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <div className={`${MONO} flex items-center gap-2 border border-rose-500/20 bg-rose-500/[0.05] rounded-[5px] px-3 py-2.5 text-[11px] text-rose-300`}>
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            This action cannot be undone.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-white/[0.06] flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex h-9 min-w-[168px] items-center justify-center gap-2 rounded-[5px] border border-rose-500/25 bg-[#0d0e11] px-4 text-[13px] font-medium text-rose-200 transition-colors hover:bg-rose-500/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Application
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
