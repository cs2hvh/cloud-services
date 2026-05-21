'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface EnvVarsBulkProps {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
}

export function EnvVarsBulk({ value, onChange, onApply }: EnvVarsBulkProps) {
  const hasContent = value.trim().length > 0;

  return (
    <div className="space-y-2.5">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`# Paste your .env content\nDB_HOST=localhost\nAPI_KEY=your-key`}
        className="bg-[#0d0e11] border-white/[0.08] text-white placeholder:text-white/30 font-mono text-[12px] min-h-[110px] rounded-none focus-visible:border-white/25 focus-visible:ring-0"
        spellCheck={false}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={onApply}
          size="sm"
          className="h-8 px-3 bg-[#0095FF] hover:bg-[#33adff] text-white text-[11px] uppercase tracking-[0.12em] font-semibold rounded-none"
          disabled={!hasContent}
        >
          Apply
        </Button>
        <Button
          type="button"
          onClick={() => onChange('')}
          size="sm"
          variant="outline"
          className="h-8 px-3 border-white/[0.1] bg-transparent text-white/65 hover:bg-white/[0.04] hover:text-white text-[11px] uppercase tracking-[0.12em] font-semibold rounded-none"
          disabled={!hasContent}
        >
          Clear
        </Button>
        <p className="ml-auto text-[10.5px] text-white/40 font-mono">
          # comments + quoted values OK
        </p>
      </div>
    </div>
  );
}
