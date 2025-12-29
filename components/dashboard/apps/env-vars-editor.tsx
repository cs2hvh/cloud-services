'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Eye,
  EyeOff,
  GripVertical,
  Search,
  AlertCircle,
  Trash2,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

export interface EnvVar {
  key: string;
  value: string;
  visible?: boolean;
}

interface EnvVarsEditorProps {
  value: EnvVar[];
  onChange: (vars: EnvVar[]) => void;
}

// Common environment variable suggestions
const ENV_SUGGESTIONS = [
  'DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD',
  'API_KEY', 'API_SECRET', 'API_URL',
  'JWT_SECRET', 'JWT_EXPIRES_IN',
  'NODE_ENV', 'PORT',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_API_URL', 'VITE_API_URL',
];

export function EnvVarsEditor({ value: envVars, onChange: setEnvVars }: EnvVarsEditorProps) {
  const [inputMode, setInputMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // CRUD operations
  const addVar = () => setEnvVars([...envVars, { key: '', value: '', visible: false }]);
  const removeVar = (index: number) => setEnvVars(envVars.filter((_, i) => i !== index));
  const updateVar = (index: number, field: 'key' | 'value', val: string) => {
    setEnvVars(envVars.map((env, i) => i === index ? { ...env, [field]: val } : env));
  };
  const toggleVisibility = (index: number) => {
    setEnvVars(envVars.map((env, i) => i === index ? { ...env, visible: !env.visible } : env));
  };
  const clearAll = () => {
    setEnvVars([]);
    setBulkText('');
    toast.success('All environment variables cleared');
  };

  // Validation
  const validateKey = (key: string): { valid: boolean; error?: string } => {
    if (!key) return { valid: true };
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return { valid: false, error: 'Invalid format' };
    }
    if (envVars.filter(e => e.key === key).length > 1) {
      return { valid: false, error: 'Duplicate' };
    }
    return { valid: true };
  };

  // Suggestions
  const getSuggestions = (current: string): string[] => {
    const existing = new Set(envVars.map(e => e.key));
    return ENV_SUGGESTIONS
      .filter(s => s.toLowerCase().includes(current.toLowerCase()) && !existing.has(s))
      .slice(0, 5);
  };

  // Drag & drop
  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newVars = [...envVars];
    const item = newVars[draggedIndex];
    newVars.splice(draggedIndex, 1);
    newVars.splice(index, 0, item);
    setEnvVars(newVars);
    setDraggedIndex(index);
  };
  const handleDragEnd = () => setDraggedIndex(null);

  // Filter
  const filtered = searchQuery
    ? envVars.map((env, idx) => ({ ...env, idx })).filter(env =>
        env.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        env.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : envVars.map((env, idx) => ({ ...env, idx }));

  // Parse .env content
  const parseEnvContent = (content: string): EnvVar[] => {
    const lines = content.split('\n');
    const result: EnvVar[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      if (key) {
        result.push({ key, value, visible: false });
      }
    }
    
    return result;
  };

  const applyBulk = () => {
    const parsed = parseEnvContent(bulkText);
    if (parsed.length === 0) {
      toast.error('No valid variables found. Format: KEY=value');
      return;
    }
    const existingKeys = new Set(envVars.map(e => e.key));
    const newVars = parsed.filter(p => !existingKeys.has(p.key));
    const updated = envVars.map(existing => parsed.find(p => p.key === existing.key) || existing);
    setEnvVars([...updated, ...newVars]);
    setBulkText('');
    setInputMode('single');
    toast.success(`Added ${parsed.length} variable${parsed.length > 1 ? 's' : ''}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Label className="text-white">Environment Variables</Label>
        {envVars.length > 0 && (
          <Button onClick={clearAll} size="sm" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10">
            <Trash2 className="h-3 w-3 mr-1" /> Clear All ({envVars.length})
          </Button>
        )}
      </div>

      <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'single' | 'bulk')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-white/10">
          <TabsTrigger value="single" className="data-[state=active]:bg-white data-[state=active]:text-black">
            Add One by One
          </TabsTrigger>
          <TabsTrigger value="bulk" className="data-[state=active]:bg-white data-[state=active]:text-black">
            Paste .env File
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-3 mt-4">
          {/* Search */}
          {envVars.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search variables..."
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 pl-10"
              />
            </div>
          )}

          {/* Variable list */}
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {filtered.map((env) => {
              const validation = validateKey(env.key);
              return (
                <div
                  key={env.idx}
                  className={`flex gap-2 items-start p-2 rounded-md transition-colors ${
                    draggedIndex === env.idx ? 'bg-white/20' : 'hover:bg-white/5'
                  }`}
                  draggable
                  onDragStart={() => handleDragStart(env.idx)}
                  onDragOver={(e) => handleDragOver(e, env.idx)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="cursor-grab active:cursor-grabbing pt-2">
                    <GripVertical className="h-5 w-5 text-white/30 hover:text-white/60" />
                  </div>

                  <div className="flex-1">
                    <Input
                      value={env.key}
                      onChange={(e) => updateVar(env.idx, 'key', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                      placeholder="VARIABLE_NAME"
                      className={`bg-white/10 border-white/20 text-white placeholder:text-white/50 font-mono text-sm ${
                        !validation.valid ? 'border-red-500' : ''
                      }`}
                      list={`suggestions-${env.idx}`}
                    />
                    <datalist id={`suggestions-${env.idx}`}>
                      {getSuggestions(env.key).map(s => <option key={s} value={s} />)}
                    </datalist>
                    {!validation.valid && (
                      <div className="flex items-center gap-1 mt-1 text-red-400 text-xs">
                        <AlertCircle className="h-3 w-3" /> {validation.error}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 relative">
                    <Input
                      value={env.value}
                      onChange={(e) => updateVar(env.idx, 'value', e.target.value)}
                      placeholder="value"
                      type={env.visible ? 'text' : 'password'}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50 pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(env.idx)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                    >
                      {env.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <Button
                    onClick={() => removeVar(env.idx)}
                    size="icon"
                    variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-10 w-10 shrink-0"
                  >
                    ×
                  </Button>
                </div>
              );
            })}

            {searchQuery && filtered.length === 0 && (
              <p className="text-white/50 text-sm text-center py-4">No match for &quot;{searchQuery}&quot;</p>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <Button onClick={addVar} size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10">
              <Plus className="h-3 w-3 mr-1" /> Add Variable
            </Button>
            {envVars.length > 0 && (
              <span className="text-xs text-white/40">Drag to reorder • Click eye to show/hide</span>
            )}
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-3 mt-4">
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`# Paste your .env content
DB_HOST=localhost
DB_PORT=5432
API_KEY=your-key`}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40 font-mono text-sm min-h-[180px]"
          />
          <div className="flex gap-2">
            <Button onClick={applyBulk} size="sm" className="bg-white text-black hover:bg-gray-200" disabled={!bulkText.trim()}>
              Apply Variables
            </Button>
            <Button onClick={() => setBulkText('')} size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10" disabled={!bulkText.trim()}>
              Clear
            </Button>
          </div>
          <p className="text-xs text-white/50">
            Comments (#) and empty lines are ignored. Existing keys will be updated.
          </p>
        </TabsContent>
      </Tabs>

      {envVars.length > 0 && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md">
          <p className="text-xs text-green-300">
            ✓ {envVars.length} environment variable{envVars.length > 1 ? 's' : ''} configured
          </p>
        </div>
      )}
    </div>
  );
}
