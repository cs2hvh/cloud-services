import { Products } from "@/lib/supabase/queries/products";
import { UUID } from "crypto";

type Rates = { initialCost: number; hourlyRate: number };

const HOURS_IN_MONTH = 24 * 30;

function monthlyToHourly(priceMonthly?: number | null): number {
  const p = typeof priceMonthly === "number" ? priceMonthly : 0;
  if (!p || p <= 0) return 0;
  return Number((p / HOURS_IN_MONTH).toFixed(6));
}

function ratesFromProduct(product?: { price?: number | null; fixed_price?: number | null } | null): Rates {
  const initialCost = (product?.fixed_price ?? 0) || 0;
  const hourlyRate = monthlyToHourly(product?.price ?? 0);
  return { initialCost, hourlyRate };
}

export async function getRatesForDatabase(planId:string): Promise<Rates> {
  const products = await Products.get_by_id(planId);
  //const byEngine = products.filter((p: any) => p.sub === params.engine);
  //const match = byEngine.find((p: any) => (p as any).slug === params.sizeSlug) ?? byEngine[0] ?? products[0];
  return ratesFromProduct(products);
}

export async function getRatesForKubernetes(plan_id:string): Promise<Rates> {
    console.log("Fetching rates for Kubernetes plan ID:", plan_id);
  const products = await Products.get_by_id(plan_id);
  return ratesFromProduct(products);
}

export async function getRatesForKubernetesExisting(plan_id:string): Promise<Rates> {
    console.log("Fetching rates for Kubernetes plan ID:", plan_id);
  const products = await Products.get_by_id(plan_id);
  return ratesFromProduct(products);
}

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

export async function getRatesForPlatformApp(size: "small" | "medium" | "large"): Promise<Rates> {
  // Platform apps pricing stored under product type 'platform-apps' with sub = size
  const products = await Products.get_by_type_and_subtype("platform-apps", size);
  const pick = products[0] ?? null;
  return ratesFromProduct(pick as any);
}

export async function getAllPlatformAppRates(): Promise<Record<string, Rates & { price: number }>> {
  // Get all platform app pricing for UI display
  const products = await Products.get_by_type("platform-apps");
  const rates: Record<string, Rates & { price: number }> = {};
  
  for (const size of ["small", "medium", "large"]) {
    const product = products.find((p: any) => p.sub === size);
    const { initialCost, hourlyRate } = ratesFromProduct(product as any);
    rates[size] = {
      initialCost,
      hourlyRate,
      price: (product as any)?.price ?? 0,
    };
  }
  
  return rates;
}
