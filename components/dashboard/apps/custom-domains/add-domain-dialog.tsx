'use client';

import { AlertCircle, Check, Copy, Loader2, Plus } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { AddDomainMode, DomainInventoryItem, VerificationInstructions } from './types';

interface AddDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addMode: AddDomainMode;
  setAddMode: (mode: AddDomainMode) => void;
  selectedExistingDomain: string;
  setSelectedExistingDomain: (domain: string) => void;
  subdomainLabel: string;
  setSubdomainLabel: (label: string) => void;
  externalDomain: string;
  setExternalDomain: (domain: string) => void;
  adding: boolean;
  verificationInstructions: VerificationInstructions | null;
  inventoryLoading: boolean;
  existingDomainOptions: DomainInventoryItem[];
  selectedTargetDomain: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function AddDomainDialog({
  open,
  onOpenChange,
  addMode,
  setAddMode,
  selectedExistingDomain,
  setSelectedExistingDomain,
  subdomainLabel,
  setSubdomainLabel,
  externalDomain,
  setExternalDomain,
  adding,
  verificationInstructions,
  inventoryLoading,
  existingDomainOptions,
  selectedTargetDomain,
  copiedField,
  onCopy,
  onSubmit,
  onClose,
}: AddDomainDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="bg-white text-black hover:bg-white/95 rounded-md px-3 py-1.5">
          <Plus className="mr-1 h-4 w-4" />
          Add Domain
        </Button>
      </DialogTrigger>

      <DialogContent className="border-white/10 bg-zinc-900 text-white">
        <DialogHeader>
          <DialogTitle>Add Domain to App</DialogTitle>
          <DialogDescription className="text-white/60">
            Choose an existing account domain or add an external domain.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={addMode}
          onValueChange={(value) => setAddMode(value as AddDomainMode)}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2 bg-black/30 border border-white/10">
            <TabsTrigger value="existing" className="data-[state=active]:bg-white/10">
              Existing Domain
            </TabsTrigger>
            <TabsTrigger value="external" className="data-[state=active]:bg-white/10">
              External Domain
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-3">
            {inventoryLoading ? (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading account domains...
              </div>
            ) : existingDomainOptions.length === 0 ? (
              <Alert className="border-yellow-500/30 bg-yellow-500/10">
                <AlertCircle className="h-4 w-4 text-yellow-300" />
                <AlertTitle className="text-yellow-200">No account domains yet</AlertTitle>
                <AlertDescription className="text-yellow-100/90">
                  Buy a domain in Marketplace or add an external domain in the next tab.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-white/70">Base domain</Label>
                  <Select value={selectedExistingDomain} onValueChange={setSelectedExistingDomain}>
                    <SelectTrigger className="border-white/20 bg-black/30 text-white">
                      <SelectValue placeholder="Select domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingDomainOptions.map((item) => (
                        <SelectItem key={item.domain} value={item.domain}>
                          {item.domain} ({item.source})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-white/70">Subdomain (optional)</Label>
                  <Input
                    value={subdomainLabel}
                    onChange={(e) => setSubdomainLabel(e.target.value)}
                    placeholder="api"
                    className="border-white/20 bg-black/30 text-white"
                  />
                  <p className="text-xs text-white/55">
                    Leave empty to use the root domain (e.g. example.com).
                  </p>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="external" className="space-y-3">
            <div className="space-y-2">
              <Label className="text-white/70">Domain</Label>
              <Input
                value={externalDomain}
                onChange={(e) => setExternalDomain(e.target.value)}
                placeholder="example.com or app.example.com"
                className="border-white/20 bg-black/30 text-white"
              />
              <p className="text-xs text-white/55">
                You&apos;ll need to add a short TXT record to prove you own this domain.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
          Target domain:{' '}
          <span className="font-mono text-white">{selectedTargetDomain || '-'}</span>
        </div>

        {verificationInstructions && (
          <Alert className="border-cyan-500/30 bg-cyan-500/10">
            <AlertCircle className="h-4 w-4 text-cyan-300" />
            <AlertTitle className="text-cyan-200">One more step — verify ownership</AlertTitle>
            <AlertDescription className="space-y-2 text-white/75">
              <p>
                Add the following TXT record at your DNS provider, then click Verify in the domain
                card below.
              </p>
              <div className="space-y-2 rounded bg-black/30 p-3 font-mono text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/50">Record type</span>
                  <span className="text-white">{verificationInstructions.record_type}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/50">Record name</span>
                  <button
                    type="button"
                    onClick={() =>
                      onCopy(verificationInstructions.record_name, 'verification-name')
                    }
                    className="flex items-center gap-1 text-white hover:text-cyan-200"
                  >
                    <span className="truncate max-w-[220px]">
                      {verificationInstructions.record_name}
                    </span>
                    {copiedField === 'verification-name' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/50">Record value</span>
                  <button
                    type="button"
                    onClick={() =>
                      onCopy(verificationInstructions.record_value, 'verification-value')
                    }
                    className="flex items-center gap-1 text-white hover:text-cyan-200"
                  >
                    <span className="truncate max-w-[220px]">
                      {verificationInstructions.record_value}
                    </span>
                    {copiedField === 'verification-value' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-white/50">
                DNS changes can take a few minutes to a few hours to take effect.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-white/20 text-white hover:bg-white/10"
          >
            {verificationInstructions ? 'Close' : 'Cancel'}
          </Button>
          {!verificationInstructions && (
            <Button
              onClick={onSubmit}
              disabled={adding || !selectedTargetDomain}
              className="bg-white text-black hover:bg-white/90"
            >
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Domain
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
