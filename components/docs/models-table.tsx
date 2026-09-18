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
  const images = rows.filter((r) => r.modality === "image");
  const videos = rows.filter((r) => r.modality === "video");
  const other = rows.filter((r) => !["chat", "image", "video"].includes(r.modality));

  return (
    <div className="my-4 space-y-8">
      <Section title={`Chat models (${chat.length})`} rows={chat} />
      {images.length > 0 ? <MediaSection title={`Image models (${images.length})`} rows={images} unit="image" /> : null}
      {videos.length > 0 ? <MediaSection title={`Video models (${videos.length})`} rows={videos} unit="second" /> : null}
      {other.length > 0 ? <Section title={`Other modalities (${other.length})`} rows={other} /> : null}
    </div>
  );
}

/**
 * Media models price per image or per second of output, by size tier or
 * resolution, so they get their own columns rather than blanks in the token
 * table. Same source and cadence as the chat table.
 */
function MediaSection({ title, rows, unit }: { title: string; rows: Row[]; unit: "image" | "second" }) {
  const flatKey = unit === "image" ? "cents_per_image" : "cents_per_media_second";
  return (
    <div>
      <p className="ah-lbl mb-2">{title}</p>
      <div className="ah-scroll overflow-x-auto border border-[var(--ah-line)]">
        <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-white/[0.03]">
              {["Model", `Price / ${unit}`, "By tier", unit === "image" ? "Sizes" : "Duration · Resolutions"].map((h) => (
                <th key={h} className="ah-lbl border-b border-[var(--ah-line)] px-3 py-2 text-left font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const caps = (r.capabilities ?? {}) as Record<string, unknown>;
              const tiers = (r.pricing as Record<string, unknown> | null)?.tiers as Record<string, number> | undefined;
              const sizes = caps.sizes as string[] | undefined;
              const resolutions = caps.resolutions as string[] | undefined;
              const dur = caps.duration_seconds as { min?: number; max?: number } | undefined;
              const detail =
                unit === "image"
                  ? sizes?.length
                    ? `${sizes.length} sizes, ${sizes[0]} to ${sizes[sizes.length - 1]}`
                    : "—"
                  : `${dur?.min ?? "?"}–${dur?.max ?? "?"} s · ${resolutions?.join(", ") ?? "—"}`;
              return (
                <tr key={r.model_id} className="border-b border-[var(--ah-line)] last:border-b-0">
                  <td className="px-3 py-2 align-top">
                    <div className="text-[var(--ah-ink)]">{r.display_name}</div>
                    <code className="font-[family-name:var(--font-geist-mono)] text-[12px] text-[var(--ah-body)]">{r.model_id}</code>
                  </td>
                  <td className="px-3 py-2 align-top text-[var(--ah-ink)]">{usd(r.pricing?.[flatKey])}</td>
                  <td className="px-3 py-2 align-top text-[var(--ah-body)]">
                    {tiers ? Object.entries(tiers).map(([k, v]) => `${k} ${usd(v)}`).join(" · ") : "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-[var(--ah-body)]">{detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The compact form for the overview: every public chat model as name, id and
 * price, so a reader sees what is on offer before reading a word about
 * parameters. Same source and cadence as the full table.
 */
export async function ModelsList() {
  const rows = await loadCatalog();
  if (!rows) {
    return (
      <p className="my-4 text-[14.5px] text-[var(--ah-body)]">
        The catalog could not be loaded right now. <C>GET /v1/models</C> always has the current list.
      </p>
    );
  }
  const chat = rows.filter((r) => r.modality === "chat");
  return (
    <div className="my-4 grid gap-px overflow-hidden border border-[var(--ah-line)] bg-[var(--ah-line)] sm:grid-cols-2">
      {chat.map((r) => (
        <div key={r.model_id} className="flex items-start justify-between gap-3 bg-[#0E0F0F] px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[14px] text-[var(--ah-ink)]">
              {r.display_name}
              {r.serving_type !== "proxy" ? <span className="ah-lbl ml-2 text-[var(--ah-green)]">hosted</span> : null}
            </p>
            <code className="block truncate font-[family-name:var(--font-geist-mono)] text-[11.5px] text-[var(--ah-body)]">
              {r.model_id}
            </code>
          </div>
          <p className="ah-lbl shrink-0 pt-0.5 text-right normal-case">
            {usd(r.pricing?.input_cents_per_mtok)} / {usd(r.pricing?.output_cents_per_mtok)}
          </p>
        </div>
      ))}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <p className="ah-lbl mb-2">{title}</p>
      <div className="ah-scroll overflow-x-auto border border-[var(--ah-line)]">
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
