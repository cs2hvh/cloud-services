export type Currency = {
  /** ZX Gateway pay_asset_id, e.g. "usdt-trc20". */
  id: string;
  /** Currency symbol, e.g. "USDT". */
  symbol: string;
  /** Display name, e.g. "Tether (TRC-20)". */
  name: string;
  /** Settlement chain, e.g. "tron". */
  chain: string;
  decimals: number;
  min_confirmations: number;
};

export const CURRENCIES: Currency[] = [
];

/** Look up an asset by its pay_asset_id. */
export function findCurrency(id: string): Currency | undefined {
  return CURRENCIES.find((c) => c.id === id);
}

/** Strip a trailing "(...)" qualifier, e.g. "Tether (TRC-20)" → "Tether". */
function baseName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

const CHAIN_NAMES: Record<string, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  tron: "Tron",
  solana: "Solana",
  litecoin: "Litecoin",
  monero: "Monero",
};

/**
 * Human network label for an asset, e.g. "Ethereum (ERC-20)", "Tron (TRC-20)",
 * "Solana (SPL)", or just "Arbitrum" when the token-standard adds nothing.
 */
export function networkLabel(c: Currency): string {
  const chainName = CHAIN_NAMES[c.chain] ?? c.chain.charAt(0).toUpperCase() + c.chain.slice(1);
  const net = c.name.match(/\(([^)]+)\)/)?.[1];
  if (net && net.toLowerCase() !== chainName.toLowerCase()) {
    return `${chainName} (${net})`;
  }
  return chainName;
}

export type CurrencyGroup = {
  /** Symbol shared by every asset in the group, e.g. "USDT". */
  symbol: string;
  /** Friendly base name, e.g. "Tether". */
  name: string;
  /** The selectable per-network assets for this symbol. */
  assets: Currency[];
};

/** Group a flat currency list by symbol, preserving input order. */
export function groupCurrencies(currencies: Currency[]): CurrencyGroup[] {
  const groups = new Map<string, CurrencyGroup>();
  for (const c of currencies) {
    const existing = groups.get(c.symbol);
    if (existing) existing.assets.push(c);
    else groups.set(c.symbol, { symbol: c.symbol, name: baseName(c.name), assets: [c] });
  }
  return Array.from(groups.values());
}

/** Static fallback: CURRENCIES grouped by symbol. */
export const CURRENCY_GROUPS: CurrencyGroup[] = groupCurrencies(CURRENCIES);

/**
 * Base URL for currency glyphs, e.g. `${ICON_BASE}/currencies/usdt.svg`.
 * Override with NEXT_PUBLIC_ZXGATEWAY_STORAGE_URL to point at the ZX asset CDN.
 */
export const CURRENCY_ICON_BASE = (
  process.env.NEXT_PUBLIC_ZXGATEWAY_STORAGE_URL || "https://storage.zxgateway.cc"
).replace(/\/+$/, "");

/** Glyph URL for a currency symbol, e.g. "USDT" → ".../currencies/usdt.svg". */
export function currencyIconUrl(symbol: string): string {
  return `${CURRENCY_ICON_BASE}/currencies/${symbol.toLowerCase()}.svg`;
}
