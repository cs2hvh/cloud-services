'use server';

import { createClient } from '@/lib/supabase/server';
import { crgateway } from '@/lib/crypto';
import { FormState, paymentSchema } from './create-payment-schema';
import { BILLING_TOPUP_ENABLED, TOPUP_DISABLED_MESSAGE } from '@/lib/billing/topup-flag';

const CURRENCIES = {
    BTC: {
        id: 'ad1558a3-c9ac-4405-8002-eb8f2e00bb1d',
        symbol: 'BTC',
        name: 'Bitcoin',
        blockchain: 'BTC',
        network: null,
        minConfirmations: 3,
        estimatedMinutes: 90,
        decimals: 6,
        conversion: true,
        enabled: true,
        processingFee: 0,
    },
    USDT_TRC20: {
        id: '9a538ffb-6f80-4068-88b6-7c18dae92f61',
        symbol: 'USDT_TRC20',
        name: 'USDT (TRC-20)',
        blockchain: 'TRX', // Same blockchain as TRX
        network: 'TRC20',
        minConfirmations: 19,
        estimatedMinutes: 15,
        decimals: 2,
        conversion: false,
        enabled: true,
        processingFee: 0,
    },
} as const;

// Types
interface DepositPaymentRequest {
    amount_usd: number;
    currency: string;
    payment_method: string;
    callback_url: string;
}

interface AmountToPay {
    crypto: number;
    usd: number;
}

interface AmountRequested {
    usd: number;
}

interface FeeBreakdown {
    percentage: number;
    fee_amount_usd: number;
    fee_amount_crypto: number;
    network_fee_usd: number;
    network_fee_crypto: number;
}

interface DepositPaymentData {
    payment_id: string;
    address: string;
    currency: string;
    amount_to_pay: AmountToPay;
    amount_requested: AmountRequested;
    fees: FeeBreakdown;
    crypto_price_usd: number;
    status: string;
    expires_at: string;
    created_at: string;
}

interface DepositPaymentResponse {
    success: boolean;
    data: DepositPaymentData;
}

/**
 * Server action for creating a deposit payment
 * Accepts FormData and returns FormState for use with useActionState
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

        const validatedAmount = result.data.amount_usd;
        const validatedCurrency = result.data.currency;

        const currencyConfig = CURRENCIES[validatedCurrency as keyof typeof CURRENCIES];
        const processingFee = currencyConfig?.processingFee ?? 0;

        // Prepare request payload
        const payload: DepositPaymentRequest = {
            amount_usd: validatedAmount + processingFee,
            currency: validatedCurrency,
            payment_method: 'api',
            callback_url: `${process.env.DOMAIN}/api/billing/crypto-callback`
        };

        // Create payment via API
        const response = await crgateway.post<DepositPaymentResponse>('/payments', payload);

        if (!response.data.success) {
            return {
                values,
                success: false,
                errors: { currency: ['Failed to create payment'] },
            };
        }

        const paymentData = response.data.data;

        // Create wallet transaction in Supabase
        const { data: transactionResult, error: rpcError } = await supabase.rpc(
            'create_deposit_transaction',
            {
                p_amount: validatedAmount,
                p_payment_id: paymentData.payment_id,
                p_description: `Deposit (${validatedCurrency})`,
            }
        );

        if (rpcError) {
            console.error('RPC Error creating transaction:', rpcError);
            return {
                values,
                success: false,
                errors: { currency: ['Failed to create transaction record'] },
            };
        }

        return {
            values: {
                amount_usd: 20,
                currency: '',
            },
            success: true,
            errors: null,
            payment_url: `${process.env.DOMAIN}/payments/${paymentData.payment_id}`
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
