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
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`# Paste your .env content here\nDB_HOST=localhost\nDB_PORT=5432\nAPI_KEY=your-key\nSECRET_TOKEN="my secret value"`}
        className="bg-white/10 border-white/20 text-white placeholder:text-white/40 font-mono text-sm min-h-[180px]"
        spellCheck={false}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={onApply}
          size="sm"
          className="bg-white text-black hover:bg-gray-200"
          disabled={!hasContent}
        >
          Apply Variables
        </Button>
        <Button
          type="button"
          onClick={() => onChange('')}
          size="sm"
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          disabled={!hasContent}
        >
          Clear
        </Button>
      </div>
      <p className="text-xs text-white/50">
        Comments (#) and blank lines are ignored. Quoted values are supported. Existing keys will
        be updated, new keys will be added.
      </p>
    </div>
  );
}
