'use server';

import { zxgateway } from '@/lib/zxgateway';
import type { Currency } from '@/config/currencies';

// The ZX Gateway /currencies response is intentionally read loosely: field
// names vary across deployments, so we normalize the few we rely on and skip
// anything we can't identify (missing id or symbol).
interface RawCurrency {
    id?: string;
    pay_asset_id?: string;
    asset_id?: string;
    symbol?: string;
    name?: string;
    chain?: string;
    blockchain?: string;
    network?: string;
    decimals?: number;
    min_confirmations?: number;
    minConfirmations?: number;
    enabled?: boolean;
}

function normalize(raw: RawCurrency): Currency | null {
    const id = raw.id ?? raw.pay_asset_id ?? raw.asset_id;
    const symbol = raw.symbol;
    if (!id || !symbol) return null;
    if (raw.enabled === false) return null;

    return {
        id,
        symbol,
        name: raw.name ?? symbol,
        chain: raw.chain ?? raw.blockchain ?? raw.network ?? '',
        decimals: raw.decimals ?? 2,
        min_confirmations: raw.min_confirmations ?? raw.minConfirmations ?? 0,
    };
}

interface GetCurrenciesResponse {
    success: boolean;
    data?: Currency[];
    error?: string;
}

/**
 * Fetches the list of supported pay assets from the ZX Gateway (GET /currencies).
 * Returns a normalized, flat Currency[] for the deposit dialog to group.
 */
export async function getCurrencies(): Promise<GetCurrenciesResponse> {
    try {
        const response = await zxgateway.get('/currencies');
        // Accept either a bare array or a { data: [...] } envelope.
        const list = Array.isArray(response.data)
            ? response.data
            : (response.data?.data ?? []);

        const currencies = (list as RawCurrency[])
            .map(normalize)
            .filter((c): c is Currency => c !== null);

        return { success: true, data: currencies };
    } catch (error) {
        console.error('Error fetching currencies:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to load currencies',
        };
    }
}
