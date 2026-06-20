'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, HardDrive, Loader2, Plus, Trash2 } from 'lucide-react';
import { getAllServiceDefinitions, getServiceDefinition } from '@/lib/services/registry';
import { resolveServiceIcon } from '@/lib/ui/service-icons';
import type { EnvValue, TemplateServiceSpec, TemplateSpec } from '@/lib/templates/domain/spec-schema';

export const TEMPLATE_CATEGORIES = ['AI/ML', 'Analytics', 'Automation', 'Blogs', 'Bots', 'CMS', 'Observability', 'Other', 'Starters', 'Storage'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type BuilderData = {
  slug: string;
  name: string;
  description: string;
  readme: string;
  category: TemplateCategory;
  tags: string[];
  spec: TemplateSpec;
};

type Props = {
  mode: 'create' | 'edit';
  initialData?: Partial<BuilderData>;
  onSave: (data: BuilderData & { publish: boolean }) => Promise<void>;
  onCancel: () => void;
};

type EnvRow = { key: string; value: string; kind: EnvValue['kind'] };

// ── Category add-buttons (drives both the toolbar and the type <select>) ──────

const ADD_CATEGORIES = [
  { type: 'web'      as const, label: 'Web'      },
  { type: 'worker'   as const, label: 'Worker'   },
  { type: 'database' as const, label: 'Database' },
  { type: 'cache'    as const, label: 'Cache'    },
  { type: 'queue'    as const, label: 'Queue'    },
] satisfies { type: TemplateServiceSpec['type']; label: string }[];

// Default engine chosen when a category button is clicked
const CATEGORY_ENGINE: Record<string, string> = {
  web:      'generic',
  worker:   'generic',
  database: 'postgres',
  cache:    'redis',
  queue:    'rabbitmq',
};

const EMPTY_SPEC: TemplateSpec = {
  schemaVersion: 1,
  kind: 'single',
  services: [],
  inputs: {},
};

function toSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function toServiceId(value: string) {
  return toSlug(value).slice(0, 64);
}

function defaultService(type: TemplateServiceSpec['type']): TemplateServiceSpec {
  const engineName = CATEGORY_ENGINE[type] ?? 'generic';
  const def = getServiceDefinition(engineName);
  const isPublic = type === 'web';
  const port = type === 'worker' ? 8080 : def.defaultPort;
  const id = toServiceId(engineName === 'generic' ? type : engineName);

  return {
    id,
    name: id,
    type,
    engine: engineName as TemplateServiceSpec['engine'],
    source: { kind: 'image', image: def.defaultImage, pinDigest: true },
    dependsOn: [],
    env: def.defaultEnv as TemplateServiceSpec['env'],
    ports: [{ name: isPublic ? 'http' : 'private', internal: port, public: isPublic, protocol: isPublic ? 'http' : 'tcp' }],
    volumes: def.mountPath ? [{
      name: 'data',
      mountPath: def.mountPath,
      sizeGb: def.defaultVolumeSizeGb,
      backupPolicy: def.category === 'database' ? 'daily' : 'none',
    }] : [],
    healthCheck: { type: isPublic ? 'http' : 'tcp', path: isPublic ? '/' : undefined, port },
    resources: {},
  };
}

function envToRows(env: TemplateServiceSpec['env']): EnvRow[] {
  return Object.entries(env).map(([key, value]) => ({
    key,
    value: envValueToString(value),
    kind: value.kind,
  }));
}

function envRowsToSpec(rows: EnvRow[]): TemplateServiceSpec['env'] {
  return Object.fromEntries(
    rows
      .filter(row => row.key.trim())
      .map(row => [row.key.trim(), envRowToValue(row)] satisfies [string, EnvValue])
  );
}

function envRowToValue(row: EnvRow): EnvValue {
  if (row.kind === 'generatedSecret') return { kind: 'generatedSecret', length: Number(row.value) || 32 };
  if (row.kind === 'computed') return { kind: 'computed', template: row.value };
  if (row.kind === 'input') return { kind: 'input', inputKey: row.value.replace(/^input:/, '') };
  if (row.kind === 'serviceRef') {
    const [, serviceId = '', field = 'privateHost'] = row.value.match(/^service:([^.]+)\.(privateHost|publicUrl)$/) ?? [];
    return { kind: 'serviceRef', serviceId, field: field as 'privateHost' | 'publicUrl' };
  }
  if (row.kind === 'secretRef') {
    const [, serviceId = '', key = ''] = row.value.match(/^secret:([^.]+)\.(.+)$/) ?? [];
    return { kind: 'secretRef', serviceId, key };
  }
  return { kind: 'literal', value: row.value };
}

function envValueToString(value: EnvValue) {
  if (value.kind === 'literal') return value.value;
  if (value.kind === 'generatedSecret') return String(value.length);
  if (value.kind === 'input') return `input:${value.inputKey}`;
  if (value.kind === 'serviceRef') return `service:${value.serviceId}.${value.field}`;
  if (value.kind === 'secretRef') return `secret:${value.serviceId}.${value.key}`;
  return value.template;
}

function sourceImage(service: TemplateServiceSpec) {
  return service.source.kind === 'image' ? service.source.image : service.source.repoUrl;
}

function withSource(service: TemplateServiceSpec, value: string): TemplateServiceSpec {
  if (service.source.kind === 'github') return { ...service, source: { ...service.source, repoUrl: value } };
  return { ...service, source: { ...service.source, image: value } };
}

function withSourceKind(service: TemplateServiceSpec, kind: 'image' | 'github'): TemplateServiceSpec {
  if (kind === service.source.kind) return service;
  if (kind === 'github') {
    return {
      ...service,
      source: { kind: 'github', repoUrl: '', branch: 'main', rootDir: '.', buildStrategy: 'dockerfile' },
    };
  }
  return {
    ...service,
    source: { kind: 'image', image: '', pinDigest: true },
  };
}

function collectInputs(spec: TemplateSpec): NonNullable<TemplateSpec['inputs']> {
  const inputs: NonNullable<TemplateSpec['inputs']> = { ...(spec.inputs ?? {}) };
  for (const service of spec.services) {
    for (const [envKey, value] of Object.entries(service.env)) {
      if (value.kind !== 'input') continue;
      inputs[value.inputKey] = inputs[value.inputKey] ?? {
        label: envKey,
        required: value.defaultValue === undefined,
        defaultValue: value.defaultValue,
        secret: /SECRET|PASSWORD|TOKEN|KEY/i.test(envKey),
      };
    }
  }
  return inputs;
}

function ServiceEditor({
  service,
  services,
  onChange,
  onRemove,
}: {
  service: TemplateServiceSpec;
  services: TemplateServiceSpec[];
  onChange: (service: TemplateServiceSpec) => void;
  onRemove: () => void;
}) {
  const def = getServiceDefinition(service.engine);
  const ServiceIcon = resolveServiceIcon(def.icon);
  const [envRows, setEnvRows] = useState(() => envToRows(service.env));
  const dependencyOptions = services.filter(candidate => candidate.id !== service.id);

  // Sync local envRows when the parent's service.env changes externally
  // (e.g. user switches service type and env is reset from outside)
  const prevEnvRef = useRef(service.env);
  useEffect(() => {
    if (service.env !== prevEnvRef.current) {
      prevEnvRef.current = service.env;
      setEnvRows(envToRows(service.env));
    }
  }, [service.env]);

  function commitEnv(rows: EnvRow[]) {
    prevEnvRef.current = envRowsToSpec(rows); // keep ref in sync with local edits
    setEnvRows(rows);
    onChange({ ...service, env: envRowsToSpec(rows) });
  }

  function updateGithubSource(patch: Partial<Extract<TemplateServiceSpec['source'], { kind: 'github' }>>) {
    if (service.source.kind !== 'github') return;
    onChange({ ...service, source: { ...service.source, ...patch } });
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md border border-white/10 bg-white/[0.04] flex items-center justify-center">
          <ServiceIcon className="h-4 w-4 text-white/55" />
        </div>
        <div className="grid grid-cols-2 gap-3 flex-1">
          <input
            value={service.name}
            onChange={event => {
              const name = event.target.value;
              onChange({ ...service, name, id: toServiceId(name) || service.id });
            }}
            placeholder="service-name"
            className="bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-white/25"
          />
          <select
            value={service.type}
            onChange={event => onChange({ ...defaultService(event.target.value as TemplateServiceSpec['type']), name: service.name, id: service.id })}
            className="bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-white/25"
          >
            {ADD_CATEGORIES.map(({ type, label }) => <option key={type} value={type}>{label}</option>)}
          </select>
        </div>
        <button onClick={onRemove} className="p-2 text-white/30 hover:text-red-400">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] uppercase text-white/35">Source</label>
            <select
              value={service.source.kind}
              onChange={event => onChange(withSourceKind(service, event.target.value as 'image' | 'github'))}
              className="bg-black/30 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white/60 outline-none"
            >
              <option value="image">Image</option>
              <option value="github">GitHub</option>
            </select>
          </div>
          <input
            value={sourceImage(service)}
            onChange={event => onChange(withSource(service, event.target.value))}
            placeholder={service.source.kind === 'github' ? 'https://github.com/org/repo' : 'image:tag'}
            className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white/75 outline-none focus:border-white/25"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase text-white/35 mb-1.5">Engine</label>
          <select
            value={service.engine}
            onChange={event => onChange({ ...service, engine: event.target.value as TemplateServiceSpec['engine'] })}
            className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-xs text-white/75 outline-none focus:border-white/25"
          >
            {getAllServiceDefinitions().map(d => (
              <option key={d.engine} value={d.engine}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      {service.source.kind === 'github' && (
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] uppercase text-white/35 mb-1.5">Branch</label>
            <input
              value={service.source.branch}
              onChange={event => updateGithubSource({ branch: event.target.value })}
              placeholder="main"
              className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white/75 outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-white/35 mb-1.5">Root</label>
            <input
              value={service.source.rootDir}
              onChange={event => updateGithubSource({ rootDir: event.target.value || '.' })}
              placeholder="."
              className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white/75 outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-white/35 mb-1.5">Builder</label>
            <select
              value={service.source.buildStrategy}
              onChange={event => updateGithubSource({ buildStrategy: event.target.value as 'dockerfile' | 'nixpacks' | 'buildpack' })}
              className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-xs text-white/75 outline-none focus:border-white/25"
            >
              <option value="dockerfile">Dockerfile</option>
              <option value="nixpacks">Nixpacks</option>
              <option value="buildpack">Buildpack</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-white/35 mb-1.5">Dockerfile</label>
            <input
              value={service.source.dockerfilePath ?? ''}
              onChange={event => updateGithubSource({ dockerfilePath: event.target.value || undefined })}
              placeholder="Dockerfile"
              className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white/75 outline-none focus:border-white/25"
            />
          </div>
          <div className="col-span-4">
            <label className="block text-[10px] uppercase text-white/35 mb-1.5">Start command</label>
            <input
              value={service.source.startCommand ?? ''}
              onChange={event => updateGithubSource({ startCommand: event.target.value || undefined })}
              placeholder="optional command used to start the container"
              className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white/75 outline-none focus:border-white/25"
            />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] uppercase text-white/35">Environment</label>
          <button onClick={() => commitEnv([...envRows, { key: '', value: '', kind: 'literal' }])} className="text-xs text-white/45 hover:text-white">
            <Plus className="h-3 w-3 inline mr-1" /> Add
          </button>
        </div>
        <div className="space-y-1.5">
          {envRows.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-center">
              <input
                value={row.key}
                onChange={event => commitEnv(envRows.map((item, i) => i === index ? { ...item, key: event.target.value } : item))}
                placeholder="KEY"
                className="bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono text-white/70 outline-none"
              />
              <input
                value={row.value}
                onChange={event => commitEnv(envRows.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}
                placeholder={row.kind === 'generatedSecret' ? '32' : 'value'}
                className="bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono text-white/70 outline-none"
              />
              <select
                value={row.kind}
                onChange={event => commitEnv(envRows.map((item, i) => i === index ? { ...item, kind: event.target.value as EnvValue['kind'] } : item))}
                className="bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/60 outline-none"
              >
                <option value="literal">Literal</option>
                <option value="generatedSecret">Secret</option>
                <option value="computed">Computed</option>
                <option value="input">Input</option>
                <option value="serviceRef">Service Ref</option>
                <option value="secretRef">Secret Ref</option>
              </select>
              <button onClick={() => commitEnv(envRows.filter((_, i) => i !== index))} className="text-white/25 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase text-white/35">Ports</label>
            <button
              onClick={() => onChange({ ...service, ports: [...service.ports, { name: 'http', internal: 8080, public: false, protocol: 'tcp' }] })}
              className="text-xs text-white/45 hover:text-white"
            >
              <Plus className="h-3 w-3 inline mr-1" /> Add
            </button>
          </div>
          <div className="space-y-1.5">
            {service.ports.map((port, index) => (
              <div key={index} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                <input
                  type="number"
                  value={port.internal}
                  onChange={event => onChange({ ...service, ports: service.ports.map((item, i) => i === index ? { ...item, internal: Number(event.target.value) } : item) })}
                  className="bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/70 outline-none"
                />
                <label className="flex items-center gap-1 text-[11px] text-white/40">
                  <input
                    type="checkbox"
                    checked={port.public ?? false}
                    onChange={event => onChange({ ...service, ports: service.ports.map((item, i) => i === index ? { ...item, public: event.target.checked } : item) })}
                  />
                  Public
                </label>
                <button onClick={() => onChange({ ...service, ports: service.ports.filter((_, i) => i !== index) })} className="text-white/25 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase text-white/35">
              <HardDrive className="h-3 w-3 inline mr-1" /> Volumes
            </label>
            <button
              onClick={() => onChange({ ...service, volumes: [...service.volumes, { name: 'data', mountPath: '/data', sizeGb: 5, backupPolicy: 'none' }] })}
              className="text-xs text-white/45 hover:text-white"
            >
              <Plus className="h-3 w-3 inline mr-1" /> Add
            </button>
          </div>
          <div className="space-y-1.5">
            {service.volumes.map((volume, index) => (
              <div key={index} className="grid grid-cols-[1fr_64px_auto] gap-2 items-center">
                <input
                  value={volume.mountPath}
                  onChange={event => onChange({ ...service, volumes: service.volumes.map((item, i) => i === index ? { ...item, mountPath: event.target.value } : item) })}
                  className="bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono text-white/70 outline-none"
                />
                <input
                  type="number"
                  value={volume.sizeGb}
                  onChange={event => onChange({ ...service, volumes: service.volumes.map((item, i) => i === index ? { ...item, sizeGb: Number(event.target.value) } : item) })}
                  className="bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/70 outline-none"
                />
                <button onClick={() => onChange({ ...service, volumes: service.volumes.filter((_, i) => i !== index) })} className="text-white/25 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {dependencyOptions.length > 0 && (
        <div>
          <label className="block text-[10px] uppercase text-white/35 mb-1.5">Dependencies</label>
          <div className="flex flex-wrap gap-2">
            {dependencyOptions.map(option => (
              <label key={option.id} className="flex items-center gap-1.5 text-xs text-white/45 border border-white/10 rounded-md px-2 py-1">
                <input
                  type="checkbox"
                  checked={service.dependsOn.includes(option.id)}
                  onChange={event => {
                    const dependsOn = event.target.checked
                      ? [...service.dependsOn, option.id]
                      : service.dependsOn.filter(id => id !== option.id);
                    onChange({ ...service, dependsOn });
                  }}
                />
                {option.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-white/10 bg-black/30 px-2 py-1.5">
      {tags.map(tag => (
        <button key={tag} onClick={() => onChange(tags.filter(item => item !== tag))} className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/60">
          {tag} x
        </button>
      ))}
      <input
        value={value}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if ((event.key === 'Enter' || event.key === ',') && value.trim()) {
            event.preventDefault();
            const tag = value.trim().toLowerCase();
            if (!tags.includes(tag)) onChange([...tags, tag]);
            setValue('');
          }
        }}
        placeholder="tag"
        className="min-w-20 flex-1 bg-transparent text-xs text-white/70 outline-none"
      />
    </div>
  );
}

export function TemplateBuilder({ mode, initialData, onSave, onCancel }: Props) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [slug, setSlug] = useState(initialData?.slug ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [readme, setReadme] = useState(initialData?.readme ?? '');
  const [category, setCategory] = useState<TemplateCategory>(initialData?.category ?? 'Other');
  const [tags, setTags] = useState(initialData?.tags ?? []);
  const [spec, setSpec] = useState<TemplateSpec>(initialData?.spec ?? EMPTY_SPEC);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedSpec = useMemo<TemplateSpec>(() => ({
    ...spec,
    schemaVersion: 1,
    kind: spec.services.length > 1 ? 'multi' : 'single',
    inputs: collectInputs(spec),
  }), [spec]);

  function updateService(index: number, service: TemplateServiceSpec) {
    setSpec(current => ({
      ...current,
      services: current.services.map((item, i) => i === index ? service : item),
    }));
  }

  function addService(type: TemplateServiceSpec['type']) {
    setSpec(current => ({ ...current, services: [...current.services, defaultService(type)] }));
  }

  async function handleSave(publish: boolean) {
    setError(null);
    if (!name.trim()) return setError('Template name is required');
    if (!slug.trim()) return setError('Slug is required');
    if (!description.trim()) return setError('Description is required');
    if (normalizedSpec.services.length === 0) return setError('Add at least one service');
    if (normalizedSpec.services.some(service => !service.name.trim() || !service.id.trim())) return setError('Every service needs a name');
    if (new Set(normalizedSpec.services.map(service => service.id)).size !== normalizedSpec.services.length) return setError('Service IDs must be unique');
    if (normalizedSpec.services.some(service => !sourceImage(service).trim())) return setError('Every service needs an image or GitHub source');

    setSaving(true);
    try {
      await onSave({
        slug,
        name,
        description,
        readme,
        category,
        tags,
        spec: normalizedSpec,
        publish,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-black/85 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <button onClick={onCancel} className="p-1.5 text-white/45 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-semibold flex-1">{mode === 'create' ? 'New Template' : 'Edit Template'}</h1>
          <button onClick={() => handleSave(false)} disabled={saving} className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/65 hover:text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Draft'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving} className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === 'create' ? 'Save & Publish' : 'Update & Publish'}
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-[10px] uppercase text-white/35">Name</span>
              <input
                value={name}
                onChange={event => {
                  setName(event.target.value);
                  if (mode === 'create') setSlug(toSlug(event.target.value));
                }}
                className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] uppercase text-white/35">Slug</span>
              <input
                value={slug}
                readOnly={mode === 'edit'}
                onChange={event => setSlug(toSlug(event.target.value))}
                className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono text-white outline-none read-only:opacity-50 focus:border-white/25"
              />
            </label>
          </div>
          <label className="space-y-1.5 block">
            <span className="text-[10px] uppercase text-white/35">Description</span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none resize-none focus:border-white/25"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1.5 block">
              <span className="text-[10px] uppercase text-white/35">Tags</span>
              <TagInput tags={tags} onChange={setTags} />
            </label>
            <label className="space-y-1.5 block">
              <span className="text-[10px] uppercase text-white/35">Category</span>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as TemplateCategory)}
                className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
              >
                {TEMPLATE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-1.5 block">
            <span className="text-[10px] uppercase text-white/35">README (markdown)</span>
            <textarea
              value={readme}
              onChange={e => setReadme(e.target.value)}
              rows={8}
              placeholder={`## About\n\nDescribe what this template does, use cases, and setup notes.\n\n## Dependencies\n\n- Service A connects to Service B via DATABASE_URL`}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none resize-y font-mono focus:border-white/25 placeholder:text-white/20"
            />
            <span className="text-[10px] text-white/25">Shown on the public template page. Supports markdown.</span>
          </label>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-wide text-white/35">Services ({normalizedSpec.services.length})</h2>
            <div className="flex gap-2">
              {ADD_CATEGORIES.map(({ type, label }) => (
                <button key={type} onClick={() => addService(type)} className="rounded-md border border-white/12 bg-white/5 px-2.5 py-1.5 text-xs text-white/60 hover:text-white">
                  <Plus className="h-3 w-3 inline mr-1" /> {label}
                </button>
              ))}
            </div>
          </div>

          {normalizedSpec.services.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 py-12 text-center text-sm text-white/35">
              Add a service to define the deployable template spec.
            </div>
          ) : (
            normalizedSpec.services.map((service, index) => (
              <ServiceEditor
                key={`${service.id}-${index}`}
                service={service}
                services={normalizedSpec.services}
                onChange={next => updateService(index, next)}
                onRemove={() => setSpec(current => ({ ...current, services: current.services.filter((_, i) => i !== index) }))}
              />
            ))
          )}
        </section>
      </main>
    </div>
  );
}
