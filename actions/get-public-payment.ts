'use server';

import { crgateway } from '@/lib/crypto';
import { createClient } from '@/lib/supabase/server';
import type { GetPublicPaymentActionResponse } from '@/types/database/payment';

/**
 * Gets public payment details by UUID
 * This can be called without authentication for payment pages
 *
 * @param paymentId - The UUID of the payment
 * @param apiOnly - Whether to filter by payment_method = 'api' (default: true)
 * @returns Payment details with transactions
 */
export async function getPublicPayment(
  paymentId: string,
  apiOnly: boolean = false
): Promise<GetPublicPaymentActionResponse> {
  try {
    // Call the get_public_payment RPC function
    const response = await crgateway.get('/payments/' + paymentId);
    const data = response.data

    if (response.status != 200) {
      console.error('Payment API error:', response.status, response.data);
      return {
        success: false,
        error: 'Failed to fetch payment'
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'Payment not found'
      };
    }

    return {
      success: true,
      data: { ...data.data, domain: process.env.DOMAIN || '' }
    };

  } catch (error) {
    console.error('Get public payment action error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}
