export type PaymentStatus =
    | 'pending'
    | 'completed'
    | 'partially_paid'
    | 'confirming'
    | 'failed'
    | 'expired';

export type PaymentMethod = 'api' | 'payment_url';

export interface Payment {
    id: string;
    status: PaymentStatus;
    created_at: string;
    amount_usd: number;
    amount_received: number;
    amount_received_usd: number;
    fee_amount: number;
    fee_amount_usd: number;
    txid: string | null;
    currency_symbol: string;
    currency_decimals: number;
}

export interface GetPaymentsActionResponse {
    success: boolean;
    data?: Payment[];
    error?: string;
}

export interface PaymentTransaction {
    txid: string;
    confirmations: number;
}

export interface PublicPaymentData {
    payment_id: string;
    address: string | null;
    currency: string;
    amount_to_pay: {
        crypto: number;
        usd: number;
    };
    status: PaymentStatus;
    transactions: PaymentTransaction[];
    expires_at: string;
    created_at: string;
    updated_at: string;
    domain: string;
}

export interface GetPublicPaymentActionResponse {
    success: boolean;
    data?: PublicPaymentData;
    error?: string;
}
