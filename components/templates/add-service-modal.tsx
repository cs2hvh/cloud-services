'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X, Database, Zap, Layers, ChevronLeft,
  Loader2, Check, AlertCircle, BarChart3, Leaf, Plus,
} from 'lucide-react';

type EngineInfo = {
  engine: string;
  label: string;
  category: 'database' | 'cache' | 'queue';
  description: string;
  defaultImage: string;
  defaultPort: number;
  mountPath: string | null;
  defaultSizeGb: number;
  colorBase: string;
  colorHover: string;
  colorText: string;
};

const ENGINES: EngineInfo[] = [
  {
    engine: 'postgres', label: 'PostgreSQL', category: 'database',
    description: 'Relational SQL database',
    defaultImage: 'postgres:16-alpine', defaultPort: 5432,
    mountPath: '/var/lib/postgresql/data', defaultSizeGb: 10,
    colorBase: 'bg-indigo-500/10 border-indigo-500/20',
    colorHover: 'hover:bg-indigo-500/20 hover:border-indigo-500/40',
    colorText: 'text-indigo-300',
  },
  {
    engine: 'mysql', label: 'MySQL', category: 'database',
    description: 'Popular open-source SQL DB',
    defaultImage: 'mysql:8.0', defaultPort: 3306,
    mountPath: '/var/lib/mysql', defaultSizeGb: 10,
    colorBase: 'bg-orange-500/10 border-orange-500/20',
    colorHover: 'hover:bg-orange-500/20 hover:border-orange-500/40',
    colorText: 'text-orange-300',
  },
  {
    engine: 'mongodb', label: 'MongoDB', category: 'database',
    description: 'Flexible document store',
    defaultImage: 'mongo:7', defaultPort: 27017,
    mountPath: '/data/db', defaultSizeGb: 10,
    colorBase: 'bg-green-500/10 border-green-500/20',
    colorHover: 'hover:bg-green-500/20 hover:border-green-500/40',
    colorText: 'text-green-300',
  },
  {
    engine: 'clickhouse', label: 'ClickHouse', category: 'database',
    description: 'Columnar analytics database',
    defaultImage: 'clickhouse/clickhouse-server:latest', defaultPort: 9000,
    mountPath: '/var/lib/clickhouse', defaultSizeGb: 20,
    colorBase: 'bg-yellow-500/10 border-yellow-500/20',
    colorHover: 'hover:bg-yellow-500/20 hover:border-yellow-500/40',
    colorText: 'text-yellow-300',
  },
  {
    engine: 'redis', label: 'Redis', category: 'cache',
    description: 'In-memory cache & sessions',
    defaultImage: 'redis:7-alpine', defaultPort: 6379,
    mountPath: '/data', defaultSizeGb: 2,
    colorBase: 'bg-red-500/10 border-red-500/20',
    colorHover: 'hover:bg-red-500/20 hover:border-red-500/40',
    colorText: 'text-red-300',
  },
  {
    engine: 'valkey', label: 'Valkey', category: 'cache',
    description: 'Redis-compatible open cache',
    defaultImage: 'valkey/valkey:latest', defaultPort: 6379,
    mountPath: '/data', defaultSizeGb: 2,
    colorBase: 'bg-purple-500/10 border-purple-500/20',
    colorHover: 'hover:bg-purple-500/20 hover:border-purple-500/40',
    colorText: 'text-purple-300',
  },
  {
    engine: 'rabbitmq', label: 'RabbitMQ', category: 'queue',
    description: 'Message broker & task queues',
    defaultImage: 'rabbitmq:3-management-alpine', defaultPort: 5672,
    mountPath: '/var/lib/rabbitmq', defaultSizeGb: 5,
    colorBase: 'bg-orange-500/10 border-orange-500/20',
    colorHover: 'hover:bg-orange-500/20 hover:border-orange-500/40',
    colorText: 'text-orange-300',
  },
];

const ICON_MAP: Record<string, React.ReactNode> = {
  postgres:   <Database className="w-5 h-5" />,
  mysql:      <Database className="w-5 h-5" />,
  mongodb:    <Leaf className="w-5 h-5" />,
  clickhouse: <BarChart3 className="w-5 h-5" />,
  redis:      <Zap className="w-5 h-5" />,
  valkey:     <Zap className="w-5 h-5" />,
  rabbitmq:   <Layers className="w-5 h-5" />,
};

type Category = 'database' | 'cache' | 'queue';
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'database', label: 'Database' },
  { key: 'cache', label: 'Cache' },
  { key: 'queue', label: 'Queue' },
];

type Props = {
  open: boolean;
  instanceId: string;
  existingEngines?: string[];
  preselectedEngine?: string | null;
  onClose: () => void;
  onAdded: () => void;
};

export function AddServiceModal({
  open, instanceId, existingEngines = [], preselectedEngine, onClose, onAdded,
}: Props) {
  const [category, setCategory] = useState<Category>('database');
  const [selected, setSelected] = useState<EngineInfo | null>(null);
  const [name, setName] = useState('');
  const [sizeGb, setSizeGb] = useState(10);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAdding(false);
    setDone(false);
    if (preselectedEngine) {
      const eng = ENGINES.find(e => e.engine === preselectedEngine);
      if (eng) {
        setSelected(eng);
        setName(eng.engine);
        setSizeGb(eng.defaultSizeGb);
        setCategory(eng.category);
        return;
      }
    }
    setSelected(null);
    setName('');
    setSizeGb(10);
  }, [open, preselectedEngine]);

  function handleSelect(eng: EngineInfo) {
    setSelected(eng);
    setName(eng.engine);
    setSizeGb(eng.defaultSizeGb);
    setError(null);
    setDone(false);
  }

  async function handleAdd() {
    if (!selected || !name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        engine: selected.engine,
        image: selected.defaultImage,
        port: selected.defaultPort,
        isPublic: false,
      };
      if (selected.mountPath) {
        body.volumes = [{ mountPath: selected.mountPath, sizeGb }];
      }
      const res = await fetch(`/api/instances/${instanceId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to add service');
      }
      setDone(true);
      setTimeout(() => { onAdded(); onClose(); }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add service');
      setAdding(false);
    }
  }

  const visible = ENGINES.filter(e => e.category === category);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                {selected ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelected(null); setError(null); }}
                      className="text-white/40 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-white">Configure {selected.label}</span>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-white">Add Service</span>
                )}
                <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {!selected ? (
                  <motion.div
                    key="pick"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.13 }}
                    className="p-5"
                  >
                    {/* Category tabs */}
                    <div className="flex gap-1 mb-4 p-1 bg-white/5 rounded-lg">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat.key}
                          onClick={() => setCategory(cat.key)}
                          className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                            category === cat.key
                              ? 'bg-white/10 text-white'
                              : 'text-white/40 hover:text-white/70'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    {/* Engine grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {visible.map(eng => {
                        const already = existingEngines.includes(eng.engine);
                        return (
                          <button
                            key={eng.engine}
                            onClick={() => !already && handleSelect(eng)}
                            disabled={already}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                              already
                                ? 'opacity-40 cursor-not-allowed border-white/8 bg-white/[0.02]'
                                : `${eng.colorBase} ${eng.colorHover} cursor-pointer`
                            }`}
                          >
                            <span className={`flex-shrink-0 mt-0.5 ${eng.colorText}`}>
                              {ICON_MAP[eng.engine]}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium text-white truncate">{eng.label}</span>
                                {already && <span className="text-[9px] text-white/30 flex-shrink-0">added</span>}
                              </div>
                              <p className="text-[11px] text-white/40 mt-0.5 leading-snug">{eng.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="configure"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.13 }}
                    className="p-5 space-y-4"
                  >
                    {/* Name */}
                    <div>
                      <label className="text-xs text-white/50 mb-1.5 block">Service name</label>
                      <input
                        value={name}
                        onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 font-mono"
                        placeholder={selected.engine}
                        maxLength={32}
                        autoFocus
                      />
                      <p className="text-[10px] text-white/25 mt-1">Lowercase letters, numbers, hyphens only</p>
                    </div>

                    {/* Storage size */}
                    {selected.mountPath && (
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">
                          Storage — <span className="text-white/70 font-mono">{sizeGb} GB</span>
                        </label>
                        <input
                          type="range" min={1} max={100} value={sizeGb}
                          onChange={e => setSizeGb(Number(e.target.value))}
                          className="w-full accent-white h-1.5"
                        />
                        <div className="flex justify-between text-[10px] text-white/25 mt-0.5">
                          <span>1 GB</span><span>100 GB</span>
                        </div>
                      </div>
                    )}

                    {/* Image info */}
                    <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/8">
                      <span className="text-xs text-white/40">Image</span>
                      <span className="text-xs text-white/60 font-mono truncate max-w-[260px]">{selected.defaultImage}</span>
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {error}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setSelected(null); setError(null); }}
                        className="flex-1 py-2 text-sm text-white/50 hover:text-white border border-white/10 rounded-lg transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleAdd}
                        disabled={adding || done || !name.trim()}
                        className="flex-1 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 bg-white text-black hover:bg-white/90 disabled:cursor-not-allowed"
                      >
                        {done ? (
                          <><Check className="w-4 h-4 text-green-600" /> Added</>
                        ) : adding ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</>
                        ) : (
                          <><Plus className="w-4 h-4" /> Add {selected.label}</>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
