'use client';

// Shared service-detail tab nav — premium segmented pill control.
// Single source of truth so every service (compute / database / kubernetes
// / object-storage / apps / ai-agents / network) renders an identical bar:
// dark track, gradient-filled active pill with accent ring + glow, per-tab
// Lucide icon. Drive it with controlled value/onChange.

import { type LucideIcon } from 'lucide-react';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

export interface ServiceTab {
  value: string;
  label: string;
  icon?: LucideIcon;
}

export function ServiceTabBar({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: readonly ServiceTab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex max-w-full rounded-[11px] border border-white/[0.07] bg-[#0c0d10] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_8px_24px_-12px_rgba(0,0,0,0.6)] ${className}`}
    >
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = value === tab.value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={`${MONO} group relative inline-flex items-center gap-2 rounded-[7px] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.13em] transition-all duration-200 whitespace-nowrap`}
              style={{
                color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)',
                background: isActive
                  ? 'linear-gradient(180deg, rgba(0,149,255,0.20), rgba(0,149,255,0.07))'
                  : 'transparent',
                boxShadow: isActive
                  ? 'inset 0 0 0 1px rgba(0,149,255,0.4), 0 2px 12px -2px rgba(0,149,255,0.4)'
                  : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.045)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {Icon && (
                <Icon
                  className="h-3.5 w-3.5 shrink-0 transition-colors"
                  style={{
                    color: isActive ? ACCENT : 'currentColor',
                    filter: isActive ? `drop-shadow(0 0 5px ${ACCENT})` : 'none',
                  }}
                />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
