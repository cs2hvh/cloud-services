export interface ServerSpecs {
  cpuCores: number;
  memoryGB: number;
  diskGB: number;
  location?: string;
}

export interface PricingTier {
  cpu_per_core: number;
  memory_per_gb: number;
  disk_per_gb: number;
  base_cost: number;
}

// Base pricing per hour (in USD)
const DEFAULT_PRICING: PricingTier = {
  cpu_per_core: 0.02,    // $0.02 per vCPU core per hour
  memory_per_gb: 0.01,   // $0.01 per GB RAM per hour
  disk_per_gb: 0.0005,   // $0.0005 per GB storage per hour
  base_cost: 0.005       // $0.005 base cost per hour
};

// Location-based pricing multipliers
const LOCATION_MULTIPLIERS: Record<string, number> = {
  'us_east': 1.0,      // Base price
  'us_west': 1.1,      // 10% more expensive
  'canada': 1.05,      // 5% more expensive
  'uk': 1.2,           // 20% more expensive
  'germany': 1.15,     // 15% more expensive
  'france': 1.18,      // 18% more expensive
  'poland': 1.08,      // 8% more expensive
  'singapore': 1.25,   // 25% more expensive
  'india': 0.8,        // 20% cheaper
  'sydney': 1.3,       // 30% more expensive
};

/**
 * Calculate hourly cost for server specs
 * @returns Cost per hour in USD, rounded to 4 decimal places
 */
export function calculateHourlyCost(
  specs: ServerSpecs,
  pricing: PricingTier = DEFAULT_PRICING
): number {
  const { cpuCores, memoryGB, diskGB, location } = specs;

  // Base calculation
  let cost = pricing.base_cost;
  cost += cpuCores * pricing.cpu_per_core;
  cost += memoryGB * pricing.memory_per_gb;
  cost += diskGB * pricing.disk_per_gb;

  // Apply location multiplier
  if (location && LOCATION_MULTIPLIERS[location]) {
    cost *= LOCATION_MULTIPLIERS[location];
  }

  return Math.round(cost * 10000) / 10000; // Round to 4 decimal places
}

/**
 * Calculate estimated monthly cost
 * Assumes 30 days * 24 hours
 */
export function calculateMonthlyCost(
  specs: ServerSpecs,
  pricing?: PricingTier
): number {
  const hourlyCost = calculateHourlyCost(specs, pricing);
  return Math.round(hourlyCost * 24 * 30 * 100) / 100;
}

/**
 * Calculate cost for specific duration
 */
export function calculateCostForDuration(
  specs: ServerSpecs,
  hours: number,
  pricing?: PricingTier
): number {
  const hourlyCost = calculateHourlyCost(specs, pricing);
  return Math.round(hourlyCost * hours * 100) / 100;
}

/**
 * Format amount as USD currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(amount);
}

/**
 * Get custom pricing tier
 * Use this to customize pricing per location or plan
 */
export function getCustomPricingTier(): PricingTier {
  // Could be fetched from database in future
  return { ...DEFAULT_PRICING };
}
