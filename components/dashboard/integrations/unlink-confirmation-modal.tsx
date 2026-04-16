'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, Unlink } from 'lucide-react';

interface UnlinkConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isUnlinking: boolean;
  resourceType: 'database' | 'bucket';
  resourceName: string;
  injectedVars?: string[];
}

/**
 * Reusable confirmation modal for unlinking integrations
 * Shows warning about environment variable removal
 */
export function UnlinkConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isUnlinking,
  resourceType,
  resourceName,
  injectedVars = [],
}: UnlinkConfirmationModalProps) {
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-neutral-900 border-neutral-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Unlink {resourceType === 'database' ? 'Database' : 'Bucket'}?
          </DialogTitle>
          <DialogDescription className="text-white/60">
            This action will remove the integration and all associated environment variables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resource Info */}
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-400">
                  You&apos;re about to unlink: <span className="font-bold">{resourceName}</span>
                </p>
                <p className="text-xs text-amber-400/80">
                  Your app will be restarted to apply the changes.
                </p>
              </div>
            </div>
          </div>

          {/* Environment Variables to be Removed */}
          {injectedVars.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-white/70">
                {injectedVars.length} environment variable{injectedVars.length !== 1 ? 's' : ''} will be removed:
              </p>
              <div className="max-h-[120px] overflow-y-auto p-3 rounded-lg bg-black/30 space-y-1">
                {injectedVars.map((varName) => (
                  <div key={varName} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-red-400" />
                    <code className="text-xs text-red-400">{varName}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="text-xs text-white/50 bg-black/20 p-3 rounded border border-white/5">
            <p>
              Ensure your application does not rely on these credentials before proceeding.
              This action cannot be undone.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="flex-1 text-white/60 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {isUnlinking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Unlinking...
                </>
              ) : (
                <>
                  <Unlink className="w-4 h-4 mr-2" />
                  Unlink
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
