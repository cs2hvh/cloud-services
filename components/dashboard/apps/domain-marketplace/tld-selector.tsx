'use client';

import { useState } from 'react';
import {
  Briefcase,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gamepad2,
  Globe,
  Palette,
  ShoppingBag,
  Star,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_TLDS, TLD_CATEGORIES, TLD_PRESETS, type TldCategory } from './tld-data';

const ICON_MAP: Record<string, LucideIcon> = {
  Briefcase,
  Cpu,
  Gamepad2,
  Globe,
  Palette,
  ShoppingBag,
  Star,
  Users,
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function PresetButton({
  label,
  iconKey,
  onClick,
}: {
  label: string;
  iconKey: string;
  onClick: () => void;
}) {
  const Icon = ICON_MAP[iconKey] ?? Globe;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded border border-white/[0.1] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/55 hover:border-white/[0.2] hover:text-white/80 hover:bg-white/[0.06] transition-colors"
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function SelectedTldChip({
  tld,
  onRemove,
}: {
  tld: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="flex items-center gap-1 rounded border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white/65 hover:bg-red-500/10 hover:border-red-500/25 hover:text-red-300/80 transition-colors"
    >
      .{tld}
      <X className="w-2.5 h-2.5" />
    </button>
  );
}

function TldChip({
  tld,
  active,
  onToggle,
}: {
  tld: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
        active
          ? 'border-white/[0.2] bg-white/[0.08] text-white/80'
          : 'border-white/[0.08] bg-transparent text-white/40 hover:border-white/[0.15] hover:text-white/65'
      }`}
    >
      .{tld}
    </button>
  );
}

function CategoryRow({
  category,
  selected,
  open,
  onToggleOpen,
  onToggleTld,
  onToggleAll,
}: {
  category: TldCategory;
  selected: string[];
  open: boolean;
  onToggleOpen: () => void;
  onToggleTld: (tld: string) => void;
  onToggleAll: (cat: TldCategory) => void;
}) {
  const Icon = ICON_MAP[category.iconKey] ?? Globe;
  const allSelected = category.tlds.every((t) => selected.includes(t));
  const selectedCount = category.tlds.filter((t) => selected.includes(t)).length;

  return (
    <div className="rounded border border-white/[0.07] overflow-hidden">
      <div className="flex items-center bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex flex-1 items-center gap-2 px-3 py-2 text-left"
        >
          <Icon className="w-3.5 h-3.5 text-white/40 shrink-0" />
          <span className="text-xs font-medium text-white/70">{category.label}</span>
          {selectedCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[18px] rounded-full bg-white/[0.1] text-white/60 border border-white/[0.1] text-[9px] px-1 tabular-nums">
              {selectedCount}
            </span>
          )}
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-white/30 ml-auto" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-white/30 ml-auto" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleAll(category)}
          className={`shrink-0 flex items-center gap-1 pr-3 text-[10px] transition-colors ${
            allSelected ? 'text-white/50 hover:text-white/30' : 'text-white/30 hover:text-white/60'
          }`}
        >
          <CheckCheck className="w-3 h-3" />
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap gap-1.5 p-2.5 border-t border-white/[0.05] bg-white/[0.01]">
          {category.tlds.map((tld) => (
            <TldChip
              key={tld}
              tld={tld}
              active={selected.includes(tld)}
              onToggle={() => onToggleTld(tld)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TldSelector ───────────────────────────────────────────────────────────────

interface TldSelectorProps {
  selected: string[];
  onChange: (tlds: string[]) => void;
}

export function TldSelector({ selected, onChange }: TldSelectorProps) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(['popular', 'tech'])
  );
  const [filterQuery, setFilterQuery] = useState('');

  const handleToggleTld = (tld: string) => {
    const next = new Set(selected);
    if (next.has(tld)) {
      next.delete(tld);
    } else {
      if (next.size >= MAX_TLDS) {
        toast.error(`You can select up to ${MAX_TLDS} TLDs`);
        return;
      }
      next.add(tld);
    }
    onChange(Array.from(next));
  };

  const handleToggleAll = (cat: TldCategory) => {
    const catSet = new Set(cat.tlds);
    const allSelected = cat.tlds.every((t) => selected.includes(t));
    if (allSelected) {
      onChange(selected.filter((t) => !catSet.has(t)));
    } else {
      const toAdd = cat.tlds.filter((t) => !selected.includes(t));
      const merged = [...selected, ...toAdd].slice(0, MAX_TLDS);
      if (merged.length < selected.length + toAdd.length) {
        toast.warning(`Selection capped at ${MAX_TLDS} TLDs`);
      }
      onChange(merged);
    }
  };

  const handleApplyPreset = (tlds: string[]) => {
    onChange(tlds.slice(0, MAX_TLDS));
  };

  const handleToggleCategory = (id: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const normalizedFilter = filterQuery.trim().toLowerCase().replace(/^\./, '');
  const visibleCategories = normalizedFilter
    ? TLD_CATEGORIES.map((cat) => ({
        ...cat,
        tlds: cat.tlds.filter((t) => t.includes(normalizedFilter)),
      })).filter((cat) => cat.tlds.length > 0)
    : TLD_CATEGORIES;

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/60">Extensions</span>
          <span className="text-[10px] text-white/35 tabular-nums">{selected.length}/{MAX_TLDS} selected</span>
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/65 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Quick presets */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-white/30">Quick presets</p>
        <div className="flex flex-wrap gap-1.5">
          {TLD_PRESETS.map((preset) => (
            <PresetButton
              key={preset.id}
              label={preset.label}
              iconKey={preset.iconKey}
              onClick={() => handleApplyPreset(preset.tlds)}
            />
          ))}
        </div>
      </div>

      {/* Active chip strip */}
      {selected.length > 0 && (
        <div className="rounded border border-white/[0.07] bg-white/[0.02] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">Selected</p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((tld) => (
              <SelectedTldChip
                key={tld}
                tld={tld}
                onRemove={() => handleToggleTld(tld)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <input
        value={filterQuery}
        onChange={(e) => setFilterQuery(e.target.value)}
        placeholder="Filter extensions (e.g. shop, ai, cloud)"
        className="h-8 w-full rounded border border-white/[0.08] bg-white/[0.02] px-3 text-xs text-white placeholder:text-white/30 focus:border-white/[0.18] focus:bg-white/[0.04] focus:outline-none transition-colors"
      />

      {/* Category accordion */}
      <div className="space-y-1.5">
        {visibleCategories.map((cat) => (
          <CategoryRow
            key={cat.id}
            category={cat}
            selected={selected}
            open={normalizedFilter ? true : openCategories.has(cat.id)}
            onToggleOpen={() => handleToggleCategory(cat.id)}
            onToggleTld={handleToggleTld}
            onToggleAll={handleToggleAll}
          />
        ))}
      </div>

    </div>
  );
}
