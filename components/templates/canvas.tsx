'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2, XCircle, Loader2, Clock,
  ExternalLink, HardDrive, Plus, Minus, Maximize2, Settings,
} from 'lucide-react';
import { getServiceDefinition } from '@/lib/services/registry';
import { resolveServiceIcon } from '@/lib/ui/service-icons';

// ── Public types ──────────────────────────────────────────────────────────────

export type CanvasService = {
  service_name: string;
  service_type: string;   // DB category: 'web' | 'worker' | 'database' | 'cache' | 'queue'
  engine: string;         // 'postgres' | 'redis' | 'mysql' | 'generic' | …
  status: 'pending' | 'deploying' | 'healthy' | 'failed';
  public_domain: string | null;
  private_domain: string | null;
  image: string;
  dependsOn?: string[];
  volumes?: { name: string; mountPath: string; sizeGb: number }[];
};

type Props = {
  services: CanvasService[];
  selectedService: string | null;
  onSelect: (name: string) => void;
  onAddService?: () => void;
};

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W     = 264;
const NODE_H     = 96;
const NODE_H_VOL = 128;  // extra height when a volume footer is shown
const NODE_GAP_X = 56;
const NODE_GAP_Y = 72;
const PADDING    = 48;

function nodeHeight(svc: CanvasService) {
  const def = getServiceDefinition(svc.engine);
  return def.mountPath !== null ? NODE_H_VOL : NODE_H;
}

// ── Status metadata ───────────────────────────────────────────────────────────

const STATUS_META = {
  healthy:   { Icon: CheckCircle2, color: 'text-green-400',  dot: 'bg-green-400',              label: 'Healthy'   },
  failed:    { Icon: XCircle,      color: 'text-red-400',    dot: 'bg-red-400',                label: 'Failed'    },
  deploying: { Icon: Loader2,      color: 'text-blue-400',   dot: 'bg-blue-400 animate-pulse', label: 'Deploying' },
  pending:   { Icon: Clock,        color: 'text-white/30',   dot: 'bg-white/20',               label: 'Pending'   },
} as const;

// ── DAG layering ──────────────────────────────────────────────────────────────

function buildLayers(services: CanvasService[]): { layers: CanvasService[][]; cycleDetected: boolean } {
  const byName = new Map(services.map(s => [s.service_name, s]));
  const layers: CanvasService[][] = [];
  const placed = new Set<string>();
  const remaining = new Set(services.map(s => s.service_name));

  while (remaining.size > 0) {
    const layer: CanvasService[] = [];
    for (const name of remaining) {
      const svc = byName.get(name)!;
      if ((svc.dependsOn ?? []).every(d => placed.has(d))) layer.push(svc);
    }
    if (layer.length === 0) {
      for (const name of remaining) layer.push(byName.get(name)!);
      layers.push(layer);
      return { layers, cycleDetected: true };
    }
    layer.forEach(s => { remaining.delete(s.service_name); placed.add(s.service_name); });
    layers.push(layer);
  }
  return { layers, cycleDetected: false };
}

// ── Layout ────────────────────────────────────────────────────────────────────

type NodePos = { x: number; y: number; name: string };

function computeLayout(layers: CanvasService[][]): {
  positions: Map<string, NodePos>; width: number; height: number;
} {
  const maxPerLayer = Math.max(...layers.map(l => l.length), 1);
  const width = Math.max(
    maxPerLayer * (NODE_W + NODE_GAP_X) - NODE_GAP_X + PADDING * 2,
    560
  );
  const positions = new Map<string, NodePos>();
  let currentY = PADDING;

  layers.forEach((layer, li) => {
    const layerH = Math.max(...layer.map(nodeHeight));
    const totalW = layer.length * NODE_W + (layer.length - 1) * NODE_GAP_X;
    const startX = (width - totalW) / 2;
    layer.forEach((svc, si) => {
      positions.set(svc.service_name, {
        name: svc.service_name,
        x: startX + si * (NODE_W + NODE_GAP_X),
        y: currentY,
      });
    });
    currentY += layerH + (li < layers.length - 1 ? NODE_GAP_Y : 0);
  });

  return { positions, width, height: currentY + PADDING };
}

// ── Connection lines ──────────────────────────────────────────────────────────

function ConnectionLines({
  services, positions,
}: {
  services: CanvasService[];
  positions: Map<string, NodePos>;
}) {
  const byName = new Map(services.map(s => [s.service_name, s]));

  return (
    <>
      {services.flatMap(svc => {
        if (!svc.dependsOn?.length) return [];
        const child = positions.get(svc.service_name);
        if (!child) return [];
        return svc.dependsOn.map(depName => {
          const parent = positions.get(depName);
          const parentSvc = byName.get(depName);
          if (!parent || !parentSvc) return null;
          const x1 = parent.x + NODE_W / 2;
          const y1 = parent.y + nodeHeight(parentSvc);
          const x2 = child.x + NODE_W / 2;
          const y2 = child.y;
          const cy = (y1 + y2) / 2;
          return (
            <path
              key={`${depName}->${svc.service_name}`}
              d={`M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          );
        });
      })}
    </>
  );
}

// ── Service node ──────────────────────────────────────────────────────────────

function ServiceNode({
  svc, pos, selected, onSelect,
}: {
  svc: CanvasService; pos: NodePos; selected: boolean; onSelect: () => void;
}) {
  const def = getServiceDefinition(svc.engine);
  const Icon = resolveServiceIcon(def.icon);
  const sm = STATUS_META[svc.status] ?? STATUS_META.pending;
  const volumePath = svc.volumes?.[0]?.mountPath ?? def.mountPath;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      style={{ left: pos.x, top: pos.y, width: NODE_W }}
      className={`absolute cursor-pointer rounded-xl border transition-all duration-150 select-none overflow-hidden ${
        selected
          ? `bg-[#1a1a24] border-white/25 shadow-xl shadow-black/50 ring-1 ${def.color.ring}`
          : 'bg-[#13131a] border-white/[0.08] hover:border-white/20 hover:bg-[#1a1a24]'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${def.color.bg} ${def.color.border}`}>
          <Icon className={`w-[18px] h-[18px] ${def.color.text}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[13px] font-semibold text-white truncate leading-snug">
              {svc.service_name}
            </span>
            {svc.public_domain && (
              <a
                href={svc.public_domain}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-white/20 hover:text-blue-400 transition-colors flex-shrink-0 ml-1"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="text-[10px] text-white/25 font-mono truncate mb-2 leading-none">
            {svc.image || def.defaultImage || def.label}
          </p>
          <div className={`flex items-center gap-1 text-[11px] font-medium ${sm.color}`}>
            <sm.Icon className={`w-3 h-3 flex-shrink-0 ${svc.status === 'deploying' ? 'animate-spin' : ''}`} />
            {sm.label}
          </div>
        </div>
      </div>

      {volumePath && (
        <>
          <div className="border-t border-white/[0.06]" />
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <HardDrive className="w-3 h-3 text-white/20 flex-shrink-0" />
            <span className="text-[10px] text-white/25 font-mono truncate">{volumePath}</span>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── Zoom controls ─────────────────────────────────────────────────────────────

function ZoomControls({ zoom, onZoom }: { zoom: number; onZoom: (z: number) => void }) {
  return (
    <div className="absolute bottom-4 left-4 flex flex-col bg-[#13131a]/90 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm z-10">
      {[
        { Icon: Plus,      title: 'Zoom in',    action: () => onZoom(Math.min(2,   +(zoom + 0.15).toFixed(2))) },
        { Icon: Minus,     title: 'Zoom out',   action: () => onZoom(Math.max(0.4, +(zoom - 0.15).toFixed(2))) },
        { Icon: Maximize2, title: 'Reset zoom', action: () => onZoom(1) },
      ].map(({ Icon, title, action }, i) => (
        <button
          key={i}
          onClick={action}
          title={title}
          className="w-8 h-8 flex items-center justify-center text-white/35 hover:text-white hover:bg-white/8 transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

// ── Canvas background ─────────────────────────────────────────────────────────

const DOT_GRID: React.CSSProperties = {
  backgroundColor: '#0A0A0F',
  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
};

// ── Main export ───────────────────────────────────────────────────────────────

export function ProjectCanvas({ services, selectedService, onSelect, onAddService }: Props) {
  const [zoom, setZoom] = useState(1);
  const { layers, cycleDetected } = useMemo(() => buildLayers(services), [services]);
  const { positions, width, height } = useMemo(() => computeLayout(layers), [layers]);

  return (
    <div className="flex-1 relative overflow-hidden" style={DOT_GRID}>
      {services.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 select-none">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
            <Settings className="w-6 h-6 text-white/20" />
          </div>
          <p className="text-sm text-white/25">No services yet</p>
          {onAddService && (
            <button
              onClick={onAddService}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/8 border border-white/15 text-white/60 hover:text-white hover:bg-white/12 transition-all"
            >
              <Plus className="w-3 h-3" /> Add Service
            </button>
          )}
        </div>
      ) : (
        <>
          {cycleDetected && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs backdrop-blur-sm pointer-events-none">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Dependency cycle detected — layout may be incorrect
            </div>
          )}
          <div className="absolute inset-0 overflow-auto">
            <div style={{ minWidth: '100%', width: width * zoom, minHeight: '100%', height: height * zoom, position: 'relative' }}>
              <div style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                width,
                height,
                position: 'absolute',
                top: 0,
                left: 0,
              }}>
                <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height }}>
                  <ConnectionLines services={services} positions={positions} />
                </svg>
                {services.map(svc => {
                  const pos = positions.get(svc.service_name);
                  if (!pos) return null;
                  return (
                    <ServiceNode
                      key={svc.service_name}
                      svc={svc}
                      pos={pos}
                      selected={selectedService === svc.service_name}
                      onSelect={() => onSelect(svc.service_name)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <ZoomControls zoom={zoom} onZoom={setZoom} />

          {onAddService && (
            <button
              onClick={onAddService}
              className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white/8 hover:bg-white/12 border border-white/12 rounded-lg px-3 py-1.5 text-xs text-white/60 hover:text-white transition-all backdrop-blur-sm"
            >
              <Plus className="w-3 h-3" /> Add Service
            </button>
          )}
        </>
      )}
    </div>
  );
}
