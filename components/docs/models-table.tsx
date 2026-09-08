import { createClient } from "@supabase/supabase-js";
import { C } from "./primitives";

/**
 * The live model catalog, read from the same table GET /v1/models reads, so
 * the docs never show a model the API does not serve or a price it does not
 * charge. The page that renders this revalidates every five minutes.
 */

interface Row {
  model_id: string;
  display_name: string;
  modality: string;
  serving_type: string;
  is_featured: boolean;
  pricing: Record<string, number> | null;
  capabilities: Record<string, unknown> | null;
}

function usd(cents: number | undefined): string {
  if (cents === undefined || cents === null || Number.isNaN(cents)) return "—";
  const dollars = cents / 100;
  const s = dollars >= 1 ? dollars.toFixed(2) : dollars.toFixed(3).replace(/0$/, "");
  return `$${s}`;
}

function tokens(n: unknown): string {
  if (typeof n !== "number") return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

async function loadCatalog(): Promise<Row[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .schema("inference")
    .from("models")
    .select("model_id, display_name, modality, serving_type, is_featured, pricing, capabilities")
    .eq("is_active", true)
    .is("org_id", null)
    .order("modality", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error || !data) return null;
  return data as Row[];
}

export async function ModelsTable() {
  const rows = await loadCatalog();
  if (!rows) {
    return (
      <p className="my-4 text-[14.5px] text-[var(--ah-body)]">
        The catalog could not be loaded right now. <C>GET /v1/models</C> always has the current list.
      </p>
    );
  }

  const chat = rows.filter((r) => r.modality === "chat");
  const other = rows.filter((r) => r.modality !== "chat");

  return (
    <div className="my-4 space-y-8">
      <Section title={`Chat models (${chat.length})`} rows={chat} />
      {other.length > 0 ? <Section title={`Other modalities (${other.length})`} rows={other} /> : null}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <p className="ah-lbl mb-2">{title}</p>
      <div className="overflow-x-auto border border-[var(--ah-line)]">
        <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-white/[0.03]">
              {["Model", "Context", "Max output", "Input / M", "Cached / M", "Output / M", "Capabilities"].map((h) => (
                <th key={h} className="ah-lbl border-b border-[var(--ah-line)] px-3 py-2 text-left font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const caps = r.capabilities ?? {};
              const flags = [
                caps.tools ? "tools" : null,
                caps.json_mode ? "json" : null,
                caps.streaming ? "stream" : null,
                caps.vision ? "vision" : null,
              ].filter(Boolean);
              return (
                <tr key={r.model_id} className="border-b border-[var(--ah-line)] last:border-b-0">
                  <td className="px-3 py-2 align-top">
                    <div className="text-[var(--ah-ink)]">
                      {r.display_name}
                      {r.is_featured ? <span className="ah-lbl ml-2 text-[var(--ah-blue-lt)]">featured</span> : null}
                      {r.serving_type !== "proxy" ? <span className="ah-lbl ml-2 text-[var(--ah-green)]">hosted</span> : null}
                    </div>
                    <code className="font-[family-name:var(--font-geist-mono)] text-[12px] text-[var(--ah-body)]">{r.model_id}</code>
                  </td>
                  <td className="px-3 py-2 align-top text-[var(--ah-body)]">{tokens(caps.context_window)}</td>
                  <td className="px-3 py-2 align-top text-[var(--ah-body)]">{tokens(caps.max_output)}</td>
                  <td className="px-3 py-2 align-top text-[var(--ah-ink)]">{usd(r.pricing?.input_cents_per_mtok)}</td>
                  <td className="px-3 py-2 align-top text-[var(--ah-body)]">{usd(r.pricing?.cached_cents_per_mtok)}</td>
                  <td className="px-3 py-2 align-top text-[var(--ah-ink)]">{usd(r.pricing?.output_cents_per_mtok)}</td>
                  <td className="px-3 py-2 align-top">
                    <span className="ah-lbl">{flags.join(" · ") || "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
