import { Products } from "@/lib/supabase/queries/products";

type Rates = { initialCost: number; hourlyRate: number };

const HOURS_IN_MONTH = 24 * 30;

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function toFiniteNumber(value?: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clampCurrencyAmount(value?: number | null): number {
  const amount = toFiniteNumber(value);
  if (amount <= 0) return 0;
  return roundToTwoDecimals(amount);
}

function normalizeMonthlyMultiplier(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(Math.trunc(value), 1);
}

function monthlyToHourly(priceMonthly?: number | null): number {
  const p = toFiniteNumber(priceMonthly);
  if (!p || p <= 0) return 0;
  // 6 decimal places so low-rate services (vector $8/mo → $0.011111/hr) accumulate
  // correctly over a billing month. The cron rounds individual charges to 2 decimals,
  // but the stored rate must be precise enough that monthly sum ≈ monthly price.
  return Math.round((p / HOURS_IN_MONTH) * 1_000_000) / 1_000_000;
}

function ratesFromProduct(
  product?: { price?: number | null; fixed_price?: number | null } | null,
  options?: { monthlyMultiplier?: number }
): Rates {
  const monthlyMultiplier = normalizeMonthlyMultiplier(options?.monthlyMultiplier);
  const rawFixed = toFiniteNumber(product?.fixed_price);
  const rawPrice = toFiniteNumber(product?.price);
  // Guard: negative prices would cause deduct(-X) to ADD credits to the user
  if (rawFixed < 0 || rawPrice < 0) {
    throw new Error(
      `Invalid product pricing: price=${rawPrice}, fixed_price=${rawFixed}. Negative prices are not allowed.`
    );
  }
  const initialCost = clampCurrencyAmount(rawFixed);
  const hourlyRate = monthlyToHourly(rawPrice * monthlyMultiplier);
  return { initialCost, hourlyRate };
}

export async function getRatesForDatabase(planId:string): Promise<Rates> {
  const products = await Products.get_by_id(planId);
  //const byEngine = products.filter((p: any) => p.sub === params.engine);
  //const match = byEngine.find((p: any) => (p as any).slug === params.sizeSlug) ?? byEngine[0] ?? products[0];
  return ratesFromProduct(products);
}

export async function getRatesForDatabaseBySlug(sizeSlug: string): Promise<Rates> {
  const product = await Products.get_by_type_and_slug("database", sizeSlug);
  return ratesFromProduct(product);
}

export async function getRatesForKubernetes(plan_id:string, totalNodes = 1): Promise<Rates> {
    console.log("Fetching rates for Kubernetes plan ID:", plan_id);
  const products = await Products.get_by_id(plan_id);
  return ratesFromProduct(products, { monthlyMultiplier: totalNodes });
}

export const getRatesForKubernetesExisting = getRatesForKubernetes;

export async function getRatesForObjectStorage(): Promise<Rates> {
  const products = await Products.get_by_type("object-storage");
  const pick = products[0] ?? null;
  return ratesFromProduct(pick as any);
}

export async function getRatesForSpectrum(): Promise<Rates> {
  // Spectrum pricing stored under product type 'network-ddos'
  const products = await Products.get_by_type("network-ddos");
  const pick = products[0] ?? null;
  return ratesFromProduct(pick as any);
}

export async function getRatesForPlatformApp(size: "small" | "medium" | "large" | "xlarge" | "xxlarge"): Promise<Rates> {
  // Platform apps pricing stored under product type 'platform-apps' with sub = size
  const products = await Products.get_by_type_and_subtype("platform-apps", size);
  const pick = products[0] ?? null;
  return ratesFromProduct(pick as any);
}

// Fallback constants — used when no product row exists in the DB yet.
// Create a product with type="inference_vector" to override via admin UI.
const INFERENCE_VECTOR_MONTHLY_USD_FALLBACK = 8;
// Create a product with type="custom_image" to override; price = $/GB/month.
const CUSTOM_IMAGE_USD_PER_GB_MONTH_FALLBACK = 0.05;

export async function getRatesForInferenceVector(): Promise<Rates> {
  const products = await Products.get_by_type("inference_vector");
  const pick = products[0] ?? null;
  if (!pick) {
    return { initialCost: 0, hourlyRate: monthlyToHourly(INFERENCE_VECTOR_MONTHLY_USD_FALLBACK) };
  }
  return ratesFromProduct(pick as any);
}

// Returns the $/GB/month rate for custom OS image storage.
// Callers compute hourlyRate = (sizeGb * rate) / HOURS_IN_MONTH themselves
// because the GB count is only known at provision time.
export async function getRatePerGbForCustomImage(): Promise<number> {
  const products = await Products.get_by_type("custom_image");
  const pick = products[0] ?? null;
  const rate = pick?.price != null && Number.isFinite(Number(pick.price)) && Number(pick.price) > 0
    ? Number(pick.price)
    : CUSTOM_IMAGE_USD_PER_GB_MONTH_FALLBACK;
  return rate;
}

export async function getAllPlatformAppRates(): Promise<Record<string, Rates & { price: number }>> {
  // Get all platform app pricing for UI display
  const products = await Products.get_by_type("platform-apps");
  const rates: Record<string, Rates & { price: number }> = {};
  
  for (const size of ["small", "medium", "large", "xlarge", "xxlarge"]) {
    const product = products.find((p: any) => p.sub === size);
    const { initialCost, hourlyRate } = ratesFromProduct(product as any);
    rates[size] = {
      initialCost,
      hourlyRate,
      price: clampCurrencyAmount((product as any)?.price),
    };
  }
  
  return rates;
}
