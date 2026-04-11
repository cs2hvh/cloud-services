import { createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const callbackSchema = z.object({
    payment_id: z.string().uuid(),
    status: z.string(),
    amount_received_usd: z.number().positive(),
    amount_received: z.number().positive(),
    currency: z.string(),
    address: z.string(),
    txids: z.array(z.string()),
    timestamp: z.string(),
    signature: z.string(),
});

export async function POST(request: Request) {
    let raw: unknown;

    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = callbackSchema.safeParse(raw);

    if (!parsed.success) {
        return NextResponse.json(
            { success: false, message: 'Invalid payload', errors: parsed.error.flatten().fieldErrors },
            { status: 400 }
        );
    }

    const secretKey = process.env.CRGATEWAY_API_SECRET;
    const headerSignature = request.headers.get('x-ungateway-signature');
    const receivedSignature = headerSignature || parsed.data.signature;

    if (secretKey) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { signature, ...dataWithoutSignature } = parsed.data;
        const computedSignature = crypto
            .createHmac('sha256', secretKey)
            .update(JSON.stringify(dataWithoutSignature))
            .digest('hex');

        if (computedSignature !== receivedSignature) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
    }

    const { payment_id, status, amount_received_usd } = parsed.data;

    const supabase = await createServiceClient();

    const { data, error } = await supabase.rpc('process_deposit_callback', {
        p_payment_id: payment_id,
        p_amount: amount_received_usd,
        p_status: status,
    });

    if (error) {
        console.error('[CryptoCallback] RPC error:', error);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }

    const result = data?.[0];

    if (!result?.success) {
        console.error('[CryptoCallback] Not processed:', result?.message ?? 'Unknown error');
    }

    return NextResponse.json({ success: true });
}
