'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface DomainAppOption {
  id: string;
  name: string;
  status: string;
}

interface DomainAttachActionProps {
  domain: string;
  appOptions: DomainAppOption[];
  defaultAppId?: string;
  buttonLabel?: string;
  onAttached?: (appId: string) => void;
  /** When true, disables the form while a parent operation is in progress. */
  disabled?: boolean;
}

export function DomainAttachAction({
  domain,
  appOptions,
  defaultAppId,
  buttonLabel = 'Add Domain',
  onAttached,
  disabled = false,
}: DomainAttachActionProps) {
  const validDefault = useMemo(
    () => (defaultAppId && appOptions.some((app) => app.id === defaultAppId) ? defaultAppId : ''),
    [appOptions, defaultAppId]
  );
  const [selectedAppId, setSelectedAppId] = useState(validDefault);
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    // Keep selection valid when options/default change after initial render.
    if (selectedAppId && appOptions.some((app) => app.id === selectedAppId)) {
      return;
    }

    if (validDefault) {
      setSelectedAppId(validDefault);
      return;
    }

    if (appOptions.length === 1) {
      setSelectedAppId(appOptions[0].id);
      return;
    }

    setSelectedAppId('');
  }, [appOptions, selectedAppId, validDefault]);

  const handleAttach = async () => {
    if (!selectedAppId) {
      toast.error('Choose an app first');
      return;
    }

    setAttaching(true);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: selectedAppId,
          domain,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        const appName = appOptions.find((item) => item.id === selectedAppId)?.name || 'app';
        toast.success(`${domain} added to ${appName}.`);
        onAttached?.(selectedAppId);
        return;
      }

      const message = data?.message || data?.error || 'Failed to attach domain';
      if (res.status === 409 && /already/i.test(String(message))) {
        toast.info(`${domain} is already added.`);
        onAttached?.(selectedAppId);
        return;
      }

      toast.error(message);
    } catch (error) {
      console.error('Failed to attach domain:', error);
      toast.error('Failed to attach domain');
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
      <Select value={selectedAppId} onValueChange={setSelectedAppId} disabled={attaching || disabled}>
        <SelectTrigger className="bg-black/30 border-white/10">
          <SelectValue placeholder="Choose target app" />
        </SelectTrigger>
        <SelectContent>
          {appOptions.map((app) => (
            <SelectItem key={app.id} value={app.id}>
              {app.name} ({app.status})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button onClick={() => void handleAttach()} disabled={!selectedAppId || attaching || disabled}>
        {attaching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        {buttonLabel}
      </Button>
    </div>
  );
}
