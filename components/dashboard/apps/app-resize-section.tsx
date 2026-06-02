'use client';

import {
  Zap,
  ArrowUpCircle,
  CheckCircle2,
  Loader2,
  Cpu,
  HardDrive,
  Layers,
  Activity,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type SizeKey = 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';

export type PlatformAppRates = {
  initialCost: number;
  hourlyRate: number;
  price: number;
  quota?: {
    totalBytes: number | null;
    maxRequestBodyBytes: number | null;
  };
};

export const PLATFORM_APP_SIZE_ORDER: SizeKey[] = ['small', 'medium', 'large', 'xlarge', 'xxlarge'];

export const PLATFORM_APP_SIZE_SPECS: Record<
  SizeKey,
  { cpu: string; memory: string; replicas: number }
> = {
  small:     { cpu: '0.25 CPU', memory: '256 MB', replicas: 1 },
  medium:    { cpu: '0.5 CPU',  memory: '512 MB', replicas: 2 },
  large:     { cpu: '1 CPU',    memory: '1 GB',   replicas: 3 },
  xlarge:    { cpu: '2 CPU',    memory: '2 GB',   replicas: 4 },
  'xxlarge': { cpu: '4 CPU',    memory: '4 GB',   replicas: 6 },
};

export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined) return '—';
  if (bytes === null) return 'Unlimited';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit <= 1 ? 0 : 1)} ${units[unit]}`;
}

interface Props {
  appSize: string | null;
  platformPricing: Partial<Record<SizeKey, PlatformAppRates>>;
  resizeInProgress: boolean;
  pendingResizeSize: SizeKey | null;
  deploymentMutationBlocked: boolean;
  selectedSize: SizeKey | null;
  setSelectedSize: (s: SizeKey | null) => void;
  resizing: boolean;
  resizeError: string | null;
  resizeSuccess: string | null;
  handleResize: () => void;
}

export function AppResizeSection({
  appSize,
  platformPricing,
  resizeInProgress,
  pendingResizeSize,
  deploymentMutationBlocked,
  selectedSize,
  setSelectedSize,
  resizing,
  resizeError,
  resizeSuccess,
  handleResize,
}: Props) {
  const currentSize = (PLATFORM_APP_SIZE_ORDER.includes((appSize ?? '') as SizeKey)
    ? appSize
    : 'small') as SizeKey;

  return (
    <div className="border-t border-white/10 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-yellow-400" />
        <p className="text-sm font-medium text-white">Instance Size</p>
      </div>

      {/* Resize Messages */}
      {resizeError && (
        <div className="mb-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {resizeError}
        </div>
      )}
      {resizeSuccess && (
        <div className="mb-3 flex items-center gap-2 border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          <CheckCircle2 className="w-4 h-4" />
          {resizeSuccess}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {PLATFORM_APP_SIZE_ORDER.map((size) => {
          const specs = PLATFORM_APP_SIZE_SPECS[size];
          const monthlyPrice = platformPricing[size]?.price ?? 0;
          const quota = platformPricing[size]?.quota;
          const isPendingUpgrade = resizeInProgress && size === pendingResizeSize;
          const isCurrent = size === currentSize && !resizeInProgress;
          const isUpgrade =
            PLATFORM_APP_SIZE_ORDER.indexOf(size) >
            PLATFORM_APP_SIZE_ORDER.indexOf(
              resizeInProgress && pendingResizeSize ? pendingResizeSize : currentSize
            );
          const isSelected = selectedSize === size;
          const isDisabled = !isUpgrade || deploymentMutationBlocked;

          return (
            <div
              key={size}
              onClick={() => !isDisabled && setSelectedSize(isSelected ? null : size)}
              className={`relative border px-4 py-4 transition-all cursor-pointer ${
                isPendingUpgrade
                  ? 'border-amber-500/40 bg-white/[0.05]'
                  : isCurrent
                  ? 'border-blue-500/40 bg-white/[0.05]'
                  : isSelected
                  ? 'border-green-500/40 bg-white/[0.05]'
                  : isUpgrade
                  ? 'border-white/20 bg-white/[0.03] hover:border-white/40'
                  : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
              }`}
            >
              {isPendingUpgrade && (
                <Badge className="absolute -top-2 -right-2 rounded-none bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
                  Upgrading…
                </Badge>
              )}
              {isCurrent && (
                <Badge className="absolute -top-2 -right-2 rounded-none bg-blue-500 text-white text-xs">
                  Current
                </Badge>
              )}
              {isUpgrade && !isCurrent && !isPendingUpgrade && (
                <Badge className="absolute -top-2 -right-2 rounded-none bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                  <ArrowUpCircle className="w-3 h-3 mr-1" />
                  Upgrade
                </Badge>
              )}

              <h4 className="text-lg font-semibold text-white capitalize mb-2">{size}</h4>

              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2 text-white/70">
                  <Cpu className="w-3 h-3" />
                  <span>{specs.cpu}</span>
                </div>
                <div className="flex items-center gap-2 text-white/70">
                  <HardDrive className="w-3 h-3" />
                  <span>{specs.memory}</span>
                </div>
                <div className="flex items-center gap-2 text-white/70">
                  <Layers className="w-3 h-3" />
                  <span>
                    {specs.replicas} instance{specs.replicas > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/70">
                  <Activity className="w-3 h-3" />
                  <span>{formatBytes(quota?.totalBytes)} transfer</span>
                </div>
                <div className="flex items-center gap-2 text-white/70">
                  <Upload className="w-3 h-3" />
                  <span>{formatBytes(quota?.maxRequestBodyBytes)} request body</span>
                </div>
              </div>

              <p className="mt-3 text-sm font-medium text-white/90">
                {monthlyPrice > 0 ? `$${monthlyPrice.toFixed(2)}/mo` : 'Free'}
              </p>
            </div>
          );
        })}
      </div>

      {selectedSize && (
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={handleResize}
            disabled={resizing || deploymentMutationBlocked}
            className="rounded-none bg-green-600 hover:bg-green-700 text-white"
          >
            {resizing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resizing...
              </>
            ) : (
              <>
                <ArrowUpCircle className="w-4 h-4 mr-2" />
                Resize &amp; Redeploy
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => setSelectedSize(null)}
            className="rounded-none border-white/20 text-white hover:bg-white/10"
          >
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <span className="text-xs text-white/50">
            Your app will be redeployed with new resources.
          </span>
        </div>
      )}
    </div>
  );
}
