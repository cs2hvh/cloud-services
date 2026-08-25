'use client';

/**
 * Saved-servers picker for the MCP tool section (M3, doc 14 §4/§12b) — pick a
 * registered server by slug instead of typing a URL each time. Additive,
 * alongside the inline "MCP servers" rows (not a replacement — §2b: a later
 * stage extends the UI, it never forces the earlier stage's UI to be redone).
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { MONO } from '@/components/dashboard/inference/chrome';
import { fetchMcpServers, type McpServerSummary } from './_constants';

const SEL = `w-full h-9 rounded-xl bg-[#0c0d10] border border-white/[0.1] px-3 text-sm text-white/90 ${MONO}`;
const LABEL = `${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`;

export function McpServerPicker({ value, onChange }: { value: string[]; onChange: (slugs: string[]) => void }) {
  const [servers, setServers] = useState<McpServerSummary[]>([]);

  useEffect(() => {
    void fetchMcpServers().then(setServers);
  }, []);

  const available = servers.filter((s) => !value.includes(s.slug));
  const needsConnect = (s: McpServerSummary) => s.auth_type === 'oauth' && s.oauth_status !== 'connected';

  return (
    <div className="space-y-2">
      <span className={LABEL}>Saved servers</span>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((slug) => {
            const s = servers.find((x) => x.slug === slug);
            return (
              <span
                key={slug}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] ${
                  s && needsConnect(s)
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                    : 'border-[#0095FF]/40 bg-[#0095FF]/10 text-white/85'
                }`}
              >
                {s?.display_name ?? slug}
                {s && needsConnect(s) && (
                  <span title="This OAuth server isn't connected yet — the agent will run with no tools from it until you connect it on the MCP Servers page.">
                    ⚠
                  </span>
                )}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== slug))} className="text-white/40 hover:text-red-400" aria-label={`Remove ${slug}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {value.some((slug) => { const s = servers.find((x) => x.slug === slug); return s && needsConnect(s); }) && (
        <div className="text-[11px] text-amber-300/80">
          ⚠ One or more attached servers still need OAuth connection — visit the MCP Servers page and click &quot;Connect&quot;, or the agent will run with no tools from them.
        </div>
      )}
      {available.length === 0 ? (
        <div className="text-[11px] text-white/35">
          {servers.length === 0 ? 'No registered servers yet — register one via the API, or add a URL below.' : 'All registered servers are attached.'}
        </div>
      ) : (
        <select
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
          className={SEL}
        >
          <option value="">Attach a saved server…</option>
          {available.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.display_name} {s.visibility === 'curated' ? '· curated' : ''} {s.status !== 'active' ? `· ${s.status}` : ''} {needsConnect(s) ? '· oauth not connected' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
