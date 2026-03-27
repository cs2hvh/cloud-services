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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MAX_TLDS, TLD_CATEGORIES, TLD_PRESETS, type TldCategory } from './tld-data';

// Map iconKey strings to Lucide components (avoids dynamic imports / eval).
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
      className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-[11px] text-white/60 hover:border-cyan-400/50 hover:text-cyan-200 hover:bg-cyan-500/10 transition-colors"
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
      className="flex items-center gap-1 rounded-full border border-cyan-400/50 bg-cyan-500/20 px-2 py-0.5 text-[11px] text-cyan-200 hover:bg-red-500/20 hover:border-red-400/50 hover:text-red-300 transition-colors"
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
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
        active
          ? 'border-cyan-400/60 bg-cyan-500/25 text-cyan-200'
          : 'border-white/15 bg-black/20 text-white/55 hover:border-white/30 hover:text-white'
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
    <div className="rounded-lg border border-white/10 overflow-hidden">
      {/* Header row: two sibling buttons — avoids nested <button> hydration error */}
      <div className="flex items-center bg-black/20 hover:bg-black/30 transition-colors">
        {/* Left: toggle open/close */}
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex flex-1 items-center gap-2 px-3 py-2 text-left"
        >
          <Icon className="w-3.5 h-3.5 text-white/50 shrink-0" />
          <span className="text-xs font-medium text-white/80">{category.label}</span>
          {selectedCount > 0 && (
            <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-500/30 text-[9px] px-1 py-0">
              {selectedCount}
            </Badge>
          )}
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-white/40 ml-auto" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-white/40 ml-auto" />
          )}
        </button>

        {/* Right: select/deselect all */}
        <button
          type="button"
          onClick={() => onToggleAll(category)}
          className={`shrink-0 flex items-center gap-0.5 pr-3 text-[10px] transition-colors ${
            allSelected ? 'text-cyan-300 hover:text-white' : 'text-white/40 hover:text-cyan-200'
          }`}
        >
          <CheckCheck className="w-3 h-3" />
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-black/10">
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

// ─── TldSelector ──────────────────────────────────────────────────────────────

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

      {/* Header: count + clear */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/70">TLD Selection</span>
          <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-500/30 text-[10px] px-1.5 py-0">
            {selected.length} / {MAX_TLDS}
          </Badge>
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Preset packs */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-white/40">Quick presets</p>
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
        <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Selected</p>
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

      {/* Filter input */}
      <Input
        value={filterQuery}
        onChange={(e) => setFilterQuery(e.target.value)}
        placeholder="Filter extensions (e.g. shop, ai, cloud)"
        className="bg-black/30 border-white/10 h-8 text-xs"
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
