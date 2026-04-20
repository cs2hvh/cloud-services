'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Download, Files } from 'lucide-react';
import { toast } from 'sonner';

import {
  type EnvVar,
  type EnvVarsEditorProps,
  type IndexedEnvVar,
  normalizeEnvVar,
  normalizeEnvKey,
  parseEnvContent,
  formatEnvLine,
  isSensitiveKey,
} from './env-vars-types';
import { EnvVarsWarnings } from './env-vars-warnings';
import { EnvVarsToolbar } from './env-vars-toolbar';
import { EnvVarsUpload } from './env-vars-upload';
import { EnvVarsList } from './env-vars-list';
import { EnvVarsBulk } from './env-vars-bulk';

// Re-export EnvVar so consumers only need to import from this file
export type { EnvVar };

export function EnvVarsEditor({ value: envVars, onChange: setEnvVars }: EnvVarsEditorProps) {
  const [inputMode, setInputMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sortAsc, setSortAsc] = useState<boolean | null>(null);

  const vars = envVars.map(normalizeEnvVar);
  const hasVars = vars.length > 0;
  const allVisible = hasVars && vars.every(e => e.visible);
  const hasSensitiveVisible = vars.some(e => e.visible && isSensitiveKey(e.key));
  const hasDuplicates = (() => {
    const keys = vars.map(e => e.key).filter(Boolean);
    return keys.length !== new Set(keys).size;
  })();

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const addVar = () => {
    setEnvVars([...vars, { key: '', value: '', visible: false }]);
    setSearchQuery('');
    setSortAsc(null);
  };

  const removeVar = (idx: number) => setEnvVars(vars.filter((_, i) => i !== idx));

  const duplicateVar = (idx: number) => {
    const src = vars[idx];
    const copy = { ...src, key: src.key ? `${src.key}_COPY` : '' };
    const next = [...vars];
    next.splice(idx + 1, 0, copy);
    setEnvVars(next);
  };

  const updateVar = (idx: number, field: 'key' | 'value', val: string) =>
    setEnvVars(vars.map((env, i) => (i === idx ? { ...env, [field]: val } : env)));

  // ── VISIBILITY ────────────────────────────────────────────────────────────

  const toggleVisibility = (idx: number) =>
    setEnvVars(vars.map((env, i) => (i === idx ? { ...env, visible: !env.visible } : env)));

  const toggleAllVisibility = () =>
    setEnvVars(vars.map(env => ({ ...env, visible: !allVisible })));

  // ── PASTE ─────────────────────────────────────────────────────────────────

  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    idx: number,
    field: 'key' | 'value',
  ) => {
    const text = e.clipboardData.getData('text');

    // Multi-line paste → treat as .env content
    if (text.includes('\n') && text.includes('=')) {
      const parsed = parseEnvContent(text);
      if (parsed.length > 1) {
        e.preventDefault();
        mergeImported(parsed);
        return;
      }
    }

    // Single KEY=VALUE paste into the key field
    if (field === 'key' && text.includes('=') && !text.includes('\n')) {
      e.preventDefault();
      const eqIdx = text.indexOf('=');
      const key = normalizeEnvKey(text.substring(0, eqIdx));
      let value = text.substring(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      setEnvVars(vars.map((env, i) => (i === idx ? { ...env, key, value } : env)));
      toast.success('Parsed KEY=VALUE from paste');
    }
  };

  // ── SORT / CLEAR ──────────────────────────────────────────────────────────

  const sortAlphabetically = () => {
    const nextAsc = sortAsc !== true;
    setSortAsc(nextAsc);
    const sorted = [...vars].sort((a, b) =>
      nextAsc ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key),
    );
    setEnvVars(sorted);
    toast.success(`Sorted ${nextAsc ? 'A → Z' : 'Z → A'}`);
  };

  const clearAll = () => {
    setEnvVars([]);
    setBulkText('');
    setSearchQuery('');
    setSortAsc(null);
    setShowClearConfirm(false);
    toast.success('All environment variables cleared');
  };

  // ── DRAG & DROP ───────────────────────────────────────────────────────────

  const handleDragStart = (idx: number) => setDraggedIndex(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === idx) return;
    const next = [...vars];
    const [item] = next.splice(draggedIndex, 1);
    next.splice(idx, 0, item);
    setEnvVars(next);
    setDraggedIndex(idx);
    setSortAsc(null);
  };

  const handleDragEnd = () => setDraggedIndex(null);

  // ── CLIPBOARD ─────────────────────────────────────────────────────────────

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
      toast.success(`Copied ${label}`);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const copyAll = () => {
    const text = vars
      .filter(e => e.key)
      .map(e => formatEnvLine(e.key, e.value))
      .join('\n');
    copyToClipboard(text, 'all variables');
  };

  const copyRow = (env: IndexedEnvVar) =>
    copyToClipboard(formatEnvLine(env.key, env.value), env.key);

  // ── EXPORT ────────────────────────────────────────────────────────────────

  const exportDotEnv = () => {
    const lines = [
      `# Generated by Cloud Services — ${new Date().toISOString()}`,
      `# ${vars.filter(e => e.key).length} variable(s)`,
      '',
      ...vars.filter(e => e.key).map(e => formatEnvLine(e.key, e.value)),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.env';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded .env file');
  };

  // ── IMPORT (file / bulk) ──────────────────────────────────────────────────

  const mergeImported = (parsed: EnvVar[], filename?: string) => {
    const existingKeys = new Set(vars.map(e => e.key));
    const newVars = parsed.filter(p => !existingKeys.has(p.key));
    const updated = vars.map(existing => parsed.find(p => p.key === existing.key) ?? existing);
    setEnvVars([...updated, ...newVars]);
    const label = filename ? ` from ${filename}` : ' from paste';
    toast.success(`Imported ${parsed.length} variable${parsed.length !== 1 ? 's' : ''}${label}`);
  };

  const applyBulk = () => {
    const parsed = parseEnvContent(bulkText);
    if (parsed.length === 0) {
      toast.error('No valid variables found. Format: KEY=value');
      return;
    }
    mergeImported(parsed);
    setBulkText('');
    setInputMode('single');
  };

  const readEnvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!content) { toast.error('Could not read file'); return; }
      const parsed = parseEnvContent(content);
      if (parsed.length === 0) { toast.error('No valid env variables found in file'); return; }
      mergeImported(parsed, file.name);
    };
    reader.onerror = () => toast.error('Failed to read file');
    reader.readAsText(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readEnvFile(file);
    e.target.value = '';
  };

  // ── FILE DRAG EVENTS (outer container) ───────────────────────────────────

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.includes('.env') && !file.type.includes('text')) {
      toast.error('Please drop a .env file or plain text file');
      return;
    }
    readEnvFile(file);
  };

  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
  };

  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div
      className="space-y-4"
      onDrop={handleFileDrop}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
    >
      <EnvVarsWarnings
        hasSensitiveVisible={hasSensitiveVisible}
        hasDuplicates={hasDuplicates}
      />

      <EnvVarsToolbar
        count={vars.length}
        allVisible={allVisible}
        sortAsc={sortAsc}
        copiedAll={copiedField === 'all variables'}
        showClearConfirm={showClearConfirm}
        onToggleAllVisibility={toggleAllVisibility}
        onSort={sortAlphabetically}
        onCopyAll={copyAll}
        onExport={exportDotEnv}
        onClearRequest={() => setShowClearConfirm(true)}
        onClearConfirm={clearAll}
        onClearCancel={() => setShowClearConfirm(false)}
      />

      <EnvVarsUpload isDraggingFile={isDraggingFile} onFileInput={handleFileInput} />

      <Tabs
        value={inputMode}
        onValueChange={(v) => setInputMode(v as 'single' | 'bulk')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-white/10">
          <TabsTrigger value="single" className="data-[state=active]:bg-white data-[state=active]:text-black">
            Add One by One
          </TabsTrigger>
          <TabsTrigger value="bulk" className="data-[state=active]:bg-white data-[state=active]:text-black">
            Paste .env File
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-4">
          <EnvVarsList
            vars={vars}
            searchQuery={searchQuery}
            draggedIndex={draggedIndex}
            copiedField={copiedField}
            onSearchChange={setSearchQuery}
            onAddVar={addVar}
            onUpdate={updateVar}
            onPaste={handlePaste}
            onToggleVisible={toggleVisibility}
            onCopyRow={copyRow}
            onDuplicate={duplicateVar}
            onRemove={removeVar}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          />
        </TabsContent>

        <TabsContent value="bulk" className="mt-4">
          <EnvVarsBulk value={bulkText} onChange={setBulkText} onApply={applyBulk} />
        </TabsContent>
      </Tabs>

      {/* Status bar */}
      {hasVars && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md flex items-center justify-between">
          <p className="text-xs text-green-300">
            ✓ {vars.length} environment variable{vars.length !== 1 ? 's' : ''} configured
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={copyAll}
              className="flex items-center gap-1 text-xs text-green-400/70 hover:text-green-300 transition-colors"
            >
              {copiedField === 'all variables' ? (
                <Check className="h-3 w-3" />
              ) : (
                <Files className="h-3 w-3" />
              )}
              {copiedField === 'all variables' ? 'Copied!' : 'Copy all'}
            </button>
            <button
              type="button"
              onClick={exportDotEnv}
              className="flex items-center gap-1 text-xs text-green-400/70 hover:text-green-300 transition-colors"
            >
              <Download className="h-3 w-3" />
              Download .env
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
