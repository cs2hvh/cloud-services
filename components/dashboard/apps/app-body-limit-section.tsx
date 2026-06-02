'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppDetail {
  id: string;
  custom_request_body_mb?: number | null;
}

interface Props {
  app: AppDetail;
  onUpdate: (patch: { custom_request_body_mb: number | null }) => void;
  planMaxMb: number | null;
  onUpgradePlan: () => void;
}

export function AppBodyLimitSection({ app, onUpdate, planMaxMb, onUpgradePlan }: Props) {
  const [bodyLimitInput, setBodyLimitInput] = useState<string>(
    app.custom_request_body_mb != null ? String(app.custom_request_body_mb) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const lastSyncedValue = useRef<number | null | undefined>(app.custom_request_body_mb);
  const pendingSavedValue = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    setBodyLimitInput(app.custom_request_body_mb != null ? String(app.custom_request_body_mb) : '');
    setError(null);
    setSuccess(null);
    lastSyncedValue.current = app.custom_request_body_mb;
    pendingSavedValue.current = undefined;
  }, [app.id]);

  useEffect(() => {
    if (lastSyncedValue.current === app.custom_request_body_mb) return;

    setBodyLimitInput(app.custom_request_body_mb != null ? String(app.custom_request_body_mb) : '');
    setError(null);
    if (pendingSavedValue.current === app.custom_request_body_mb) {
      pendingSavedValue.current = undefined;
    } else {
      setSuccess(null);
    }
    lastSyncedValue.current = app.custom_request_body_mb;
  }, [app.custom_request_body_mb]);

  const handleSave = async (overrideInput?: string) => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const trimmed = (overrideInput ?? bodyLimitInput).trim();
      const limit_mb = trimmed === '' ? null : Number(trimmed);
      if (trimmed !== '' && (!/^[1-9]\d*$/.test(trimmed) || !Number.isSafeInteger(limit_mb))) {
        setError('Enter a whole number greater than 0, or leave blank to use plan default.');
        return;
      }
      const res = await fetch('/api/services/platform-apps/request-body-limit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: app.id, limit_mb }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Failed to save limit.');
        return;
      }
      pendingSavedValue.current = data.custom_request_body_mb;
      onUpdate({ custom_request_body_mb: data.custom_request_body_mb });
      const savedMessage =
        data.custom_request_body_mb == null
          ? `Reset to plan default (${data.effective_mb} MB).`
          : `Max upload size set to ${data.effective_mb} MB.`;
      setSuccess(
        data.ingress_synced === false
          ? `${savedMessage} Ingress sync did not apply yet; retry save or redeploy the app.`
          : savedMessage
      );
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const effectiveMb = app.custom_request_body_mb ?? planMaxMb;
  const isCustom = app.custom_request_body_mb != null;
  const inputVal = Number(bodyLimitInput);
  const inputExceedsMax = planMaxMb != null && !isNaN(inputVal) && inputVal > planMaxMb;

  return (
    <div className="border-t border-white/10 pt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-white">Max Upload Size</p>
          <p className="text-xs text-white/40 mt-0.5">
            The largest file or request body your app will accept per request.
          </p>
        </div>
        {planMaxMb != null && (
          <div className="text-right shrink-0 ml-4">
            <p className="text-xs text-white/25 mb-0.5">Plan maximum</p>
            <p className="text-sm font-mono font-medium text-white/60">{planMaxMb} MB</p>
            {planMaxMb < 100 && (
              <button
                onClick={onUpgradePlan}
                className="text-[10px] text-blue-400/70 hover:text-blue-400 transition-colors mt-0.5"
              >
                Upgrade plan for more ↑
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 flex items-center gap-2 border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Current value pill */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className={`flex items-center gap-2 border px-3 py-2 ${
            isCustom ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/[0.08] bg-white/[0.03]'
          }`}
        >
          <span className="text-xl font-mono font-semibold text-white">{effectiveMb ?? '—'}</span>
          <span className="text-xs text-white/40">MB</span>
        </div>
        <div className="text-xs text-white/30">
          {isCustom ? 'Custom limit active' : 'Using plan default'}
        </div>
      </div>

      {/* Preset buttons */}
      {planMaxMb != null && (
        <div className="mb-4">
          <p className="text-xs text-white/30 mb-2">Quick select</p>
          <div className="flex flex-wrap gap-2">
            {[1, 5, 10, 25, 50, 100, 250, 500]
              .filter((v) => v <= planMaxMb)
              .map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setBodyLimitInput(String(v));
                    setError(null);
                    setSuccess(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
                    bodyLimitInput === String(v)
                      ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                      : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/25 hover:text-white/80'
                  }`}
                >
                  {v} MB
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Custom input row */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="number"
            min={1}
            max={planMaxMb ?? undefined}
            placeholder="Custom MB"
            value={bodyLimitInput}
            onChange={(e) => {
              setBodyLimitInput(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            className={`w-32 border bg-black/20 px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none transition-colors ${
              inputExceedsMax
                ? 'border-red-500/50 focus:border-red-400'
                : 'border-white/10 focus:border-white/30'
            }`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/25 pointer-events-none">
            MB
          </span>
        </div>
        <Button
          onClick={() => handleSave()}
          disabled={saving || inputExceedsMax}
          size="sm"
          className="rounded-none bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 mr-1" />
              Save
            </>
          )}
        </Button>
        {isCustom && (
          <button
            onClick={() => {
              setBodyLimitInput('');
              handleSave('');
            }}
            disabled={saving}
            className="text-xs text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
          >
            Reset to plan default
          </button>
        )}
      </div>
      {inputExceedsMax && planMaxMb != null && (
        <p className="mt-2 text-xs text-red-400/80">
          Exceeds your plan maximum of {planMaxMb} MB. Upgrade your plan to allow larger uploads.
        </p>
      )}
    </div>
  );
}
