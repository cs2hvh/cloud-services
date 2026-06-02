'use client';

import { AlertCircle, Check, ChevronDown, Copy, Globe, Loader2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import type { AddDomainMode, DomainInventoryItem, VerificationInstructions } from './types';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

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
  disabled?: boolean;
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
  disabled = false,
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
        <button
          disabled={disabled}
          className="inline-flex h-9 items-center gap-2 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-3.5 text-[13px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Domain
        </button>
      </DialogTrigger>

      <DialogContent className="bg-[#0c0d11] border border-white/[0.08] rounded-[10px] text-white p-0 gap-0 overflow-hidden max-w-[440px] max-h-[90svh] flex flex-col [&_[data-slot=dialog-close]]:text-white/35 [&_[data-slot=dialog-close]]:hover:text-white/75 [&_[data-slot=dialog-close]]:hover:bg-white/[0.06]">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-white/[0.06] pr-14 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-7 w-7 rounded-[6px] bg-[#0095FF]/[0.12] border border-[#0095FF]/20 flex items-center justify-center flex-shrink-0">
              <Globe className="h-3.5 w-3.5 text-[#0095FF]" />
            </div>
            <DialogTitle className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              Add Custom Domain
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-white/45 leading-relaxed pl-[38px]">
            Connect a domain from your account or add an external one.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
          {/* Mode tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.03] rounded-[8px] border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setAddMode('existing')}
              className={`h-9 rounded-[6px] text-[13px] font-medium transition-all ${
                addMode === 'existing'
                  ? 'bg-[#0d0e11] text-white border border-white/[0.08] shadow-[0_1px_4px_rgba(0,0,0,0.5)]'
                  : 'text-white/40 hover:text-white/65'
              }`}
            >
              Account Domain
            </button>
            <button
              type="button"
              onClick={() => setAddMode('external')}
              className={`h-9 rounded-[6px] text-[13px] font-medium transition-all ${
                addMode === 'external'
                  ? 'bg-[#0d0e11] text-white border border-white/[0.08] shadow-[0_1px_4px_rgba(0,0,0,0.5)]'
                  : 'text-white/40 hover:text-white/65'
              }`}
            >
              External Domain
            </button>
          </div>

          {/* Existing domain mode */}
          {addMode === 'existing' && (
            <div className="space-y-4">
              {inventoryLoading ? (
                <div className="flex items-center gap-2.5 py-3 text-[13px] text-white/45">
                  <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                  Loading your domains…
                </div>
              ) : existingDomainOptions.length === 0 ? (
                <div className="flex gap-3 border border-amber-400/20 bg-amber-500/[0.06] rounded-[7px] px-4 py-3.5">
                  <AlertCircle className="h-4 w-4 text-amber-300 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-medium text-amber-200 leading-snug">
                      No account domains yet
                    </p>
                    <p className="text-[12px] text-white/45 mt-1 leading-relaxed">
                      Buy a domain in Marketplace or switch to External Domain.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[12px] font-medium text-white/55">Base domain</label>
                    <div className="relative">
                      <select
                        value={selectedExistingDomain}
                        onChange={(e) => setSelectedExistingDomain(e.target.value)}
                        className={`${MONO} w-full bg-[#0d0e11] border border-white/[0.08] text-white text-[13px] pl-3 pr-9 h-11 rounded-[7px] focus:outline-none focus:border-[#0095FF]/50 transition-colors appearance-none cursor-pointer`}
                      >
                        {existingDomainOptions.map((item) => (
                          <option key={item.domain} value={item.domain} className="bg-[#0d0e11]">
                            {item.domain} ({item.source})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[12px] font-medium text-white/55">
                      Subdomain{' '}
                      <span className="text-white/30 font-normal">(optional)</span>
                    </label>
                    <input
                      value={subdomainLabel}
                      onChange={(e) => setSubdomainLabel(e.target.value)}
                      placeholder="api"
                      className={`${MONO} w-full bg-[#0d0e11] border border-white/[0.08] text-white text-[13px] px-3 h-11 rounded-[7px] placeholder:text-white/20 focus:outline-none focus:border-[#0095FF]/50 transition-colors`}
                    />
                    <p className="text-[12px] text-white/35 leading-relaxed">
                      Leave empty to use the root domain (e.g.{' '}
                      <span className={MONO}>example.com</span>).
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* External domain mode */}
          {addMode === 'external' && (
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-white/55">Domain name</label>
              <input
                value={externalDomain}
                onChange={(e) => setExternalDomain(e.target.value)}
                placeholder="example.com or app.example.com"
                className={`${MONO} w-full bg-[#0d0e11] border border-white/[0.08] text-white text-[13px] px-3 h-11 rounded-[7px] placeholder:text-white/20 focus:outline-none focus:border-[#0095FF]/50 transition-colors`}
              />
              <p className="text-[12px] text-white/35 leading-relaxed">
                You&apos;ll need to add a TXT record to verify ownership.
              </p>
            </div>
          )}

          {/* Target domain preview — inline hint */}
          {selectedTargetDomain && (
            <div className="flex min-w-0 items-center gap-2 px-3 py-2.5 bg-white/[0.03] rounded-[6px] border border-white/[0.05]">
              <span className="text-[12px] text-white/35 flex-shrink-0">Connects as</span>
              <span className={`${MONO} min-w-0 text-[12px] text-white/75 truncate`}>
                {selectedTargetDomain}
              </span>
            </div>
          )}

          {/* Verification instructions */}
          {verificationInstructions && (
            <div className="space-y-3 border border-[#0095FF]/20 bg-[#0095FF]/[0.05] rounded-[8px] px-4 py-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[#0095FF] flex-shrink-0" />
                <p className="text-[13px] font-semibold text-[#33adff]">
                  One more step — verify ownership
                </p>
              </div>
              <p className="text-[12.5px] text-white/55 leading-relaxed">
                Add this TXT record at your DNS provider, then click Verify in the domain card below.
              </p>
              <div className="bg-[#0c0d11] border border-white/[0.06] rounded-[6px] divide-y divide-white/[0.05] overflow-hidden">
                <div className="flex flex-col gap-1.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="text-[11.5px] text-white/40">Record type</span>
                  <span className={`${MONO} text-[12px] text-white`}>
                    {verificationInstructions.record_type}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="text-[11.5px] text-white/40 flex-shrink-0">Record name</span>
                  <button
                    type="button"
                    onClick={() => onCopy(verificationInstructions.record_name, 'verification-name')}
                    className={`${MONO} flex min-w-0 items-center gap-1.5 text-left text-[12px] text-white hover:text-[#0095FF] transition-colors`}
                  >
                    <span className="max-w-full break-all sm:max-w-[200px] sm:truncate">
                      {verificationInstructions.record_name}
                    </span>
                    {copiedField === 'verification-name' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-white/30 flex-shrink-0" />
                    )}
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="text-[11.5px] text-white/40 flex-shrink-0">Record value</span>
                  <button
                    type="button"
                    onClick={() => onCopy(verificationInstructions.record_value, 'verification-value')}
                    className={`${MONO} flex min-w-0 items-center gap-1.5 text-left text-[12px] text-white hover:text-[#0095FF] transition-colors`}
                  >
                    <span className="max-w-full break-all sm:max-w-[200px] sm:truncate">
                      {verificationInstructions.record_value}
                    </span>
                    {copiedField === 'verification-value' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-white/30 flex-shrink-0" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-[11.5px] text-white/35">
                DNS propagation can take a few minutes to a few hours.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-white/[0.06] flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            {verificationInstructions ? 'Close' : 'Cancel'}
          </button>
          {!verificationInstructions && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={adding || !selectedTargetDomain}
              className="inline-flex h-9 min-w-[112px] items-center justify-center gap-2 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-4 text-[13px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add Domain
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
