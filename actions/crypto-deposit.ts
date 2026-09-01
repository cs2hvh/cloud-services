'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { zxgateway } from '@/lib/zxgateway';
import { findCurrency } from '@/config/currencies';
import { FormState, paymentSchema } from './create-payment-schema';
import { BILLING_TOPUP_ENABLED, TOPUP_DISABLED_MESSAGE } from '@/lib/billing/topup-flag';

// Gateway-hosted checkout page the buyer is redirected to after a payment is
// created. Override with ZXGATEWAY_PAYMENT_URL.
const ZX_PAYMENT_BASE = (process.env.ZXGATEWAY_PAYMENT_URL || 'https://payment.zx.xyz').replace(/\/+$/, '');

// ZX Gateway POST /payments request. Amounts are decimal STRINGS; fees,
// settlement asset and auto-exchange are configured merchant-side, so the
// request only carries the pay asset, the USD amount and the URLs.
interface CreatePaymentRequest {
    pay_asset_id: string;
    amount_usd: string;
    /** Where the gateway POSTs status webhooks (see /api/billing/crypto-callback). */
    callback_url: string;
    /** Merchant URL the buyer can return to once the payment completes. */
    fallback_url?: string;
}

// ZX Gateway PaymentResponse. All amounts are decimal STRINGS.
interface ZxPaymentResponse {
    id: string;
    status: string;
    pay_asset_id: string;
    pay_amount: string;
    address: string | null;
    tag: string | null;
    expires_at: string | null;
    price: { amount: string; currency: string; total: string; rate: string };
    fees: { base: string; platform_fee: string; merchant_commission: string; network_fee: string };
    created_at: string;
}

/**
 * Server action for creating a deposit payment.
 * Accepts FormData and returns FormState for use with useActionState.
 */
export async function createDepositPayment(
    _prevState: FormState,
    formData: FormData
): Promise<FormState> {
    const values = {
        amount_usd: Number(formData.get('amount_usd')),
        currency: formData.get('currency') as string,
    };

    if (!BILLING_TOPUP_ENABLED) {
        return { values, success: false, errors: { amount_usd: [TOPUP_DISABLED_MESSAGE] } };
    }

    // Validate with Zod schema
    const result = paymentSchema.safeParse(values);
    if (!result.success) {
        return {
            values,
            success: false,
            errors: result.error.flatten().fieldErrors,
        };
    }

    const validatedAmount = result.data.amount_usd;
    // The dialog submits the ZX pay_asset_id (e.g. "usdt-trc20") as `currency`.
    const payAssetId = result.data.currency;
    // The currency list is sourced live from the gateway, so we don't reject
    // unknown ids here — the gateway is the source of truth and will 4xx an
    // unsupported asset. We only use the static catalog for a friendly name.
    const asset = findCurrency(payAssetId);
    const assetName = asset?.name ?? payAssetId;

    try {
        // Get Supabase client and verify user is authenticated
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return {
                values,
                success: false,
                errors: { currency: ['User not authenticated'] },
            };
        }

        // Create payment via ZX Gateway. amount_usd must be a string (the API
        // accepts a string or integer, never a float).
        const payload: CreatePaymentRequest = {
            pay_asset_id: payAssetId,
            amount_usd: String(validatedAmount),
            callback_url: `${process.env.DOMAIN}/api/billing/crypto-callback`,
            fallback_url: `${process.env.DOMAIN}/dashboard/billing`,
        };

        const response = await zxgateway.post<ZxPaymentResponse>('/payments', payload);
        const payment = response.data;

        if (!payment?.id) {
            return {
                values,
                success: false,
                errors: { currency: ['Failed to create payment'] },
            };
        }

        // Record a PENDING top-up transaction keyed by the gateway payment id.
        // We use the service client to bypass RLS (users can't write billing
        // rows directly) and reuse `stripe_session_id` as the unique idempotency
        // key (`zx_<payment_id>`) the webhook looks up to credit the balance.
        const service = await createServiceClient();
        const { error: txError } = await service
            .schema('billing')
            .from('transactions')
            .insert({
                user_id: user.id,
                amount: validatedAmount,
                currency: 'usd',
                status: 'pending',
                type: 'topup',
                description: `Crypto deposit (${assetName})`,
                stripe_session_id: `zx_${payment.id}`,
                metadata: {
                    gateway: 'zx',
                    payment_id: payment.id,
                    pay_asset_id: payAssetId,
                },
            });

        if (txError) {
            console.error('Error creating deposit transaction:', txError);
            return {
                values,
                success: false,
                errors: { currency: ['Failed to create transaction record'] },
            };
        }

        return {
            values: {
                amount_usd: 20,
                currency: payAssetId,
            },
            success: true,
            errors: null,
            payment_url: `${ZX_PAYMENT_BASE}/payments/${payment.id}`,
        };
    } catch (error) {
        console.error('Error creating deposit payment:', error);
        return {
            values,
            success: false,
            errors: { currency: [error instanceof Error ? error.message : 'An unexpected error occurred'] },
        };
    }
}
