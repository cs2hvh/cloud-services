'use client';

import { useState, useEffect } from 'react';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
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

  // Reset isDeleting when appId changes (new app selected) or modal opens
  useEffect(() => {
    if (open) {
      setIsDeleting(false);
    }
  }, [open, appId]);

  const handleDelete = async () => {
    if (!appId || !appName) return;

    // Close modal immediately for better UX
    onOpenChange(false);
    
    // Show toast that deletion started
    toast.info(`Deleting ${appName}...`, {
      description: 'This may take a moment. The app will show as "Deleting" until complete.',
    });

    setIsDeleting(true);
    onDeleteStart(appId);

    try {
      const res = await fetch('/api/services/platform-apps/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ app_id: appId }),
      });

      if (res.ok) {
        toast.success(`${appName} deleted successfully`, {
          description: 'All resources have been cleaned up including DNS, Kubernetes, and certificates.',
        });
        onDeleteSuccess(appId);
      } else {
        const errorData = await res.json();
        toast.error(`Failed to delete ${appName}`, {
          description: errorData.error || 'An unexpected error occurred',
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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-zinc-900 border-white/10">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            Delete Application
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-white/70 text-sm">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-white">{appName}</span>?
              <br />
              <br />
              This action will permanently remove:
              <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
                <li>Kubernetes deployment, service, and ingress</li>
                <li>SSL certificate and TLS secret</li>
                <li>DNS record</li>
                <li>Jenkins build job</li>
              </ul>
              <p className="text-red-400 font-medium mt-4">This action cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isDeleting}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // Prevent default close behavior
              handleDelete();
            }}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Application
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
