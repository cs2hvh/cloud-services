import { createServiceClient } from '@/lib/supabase/server';
import { resolveGraceForUserAfterTopup } from '@/lib/billing/grace/recovery';
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
    if (!secretKey) {
        // Fail CLOSED (H5): without the shared secret we cannot authenticate the
        // gateway, so we must never forward an unverified deposit to the crediting
        // RPC. The previous `if (secretKey)` guard let an anonymous, well-formed
        // POST through whenever the secret was unset.
        console.error('[CryptoCallback] CRGATEWAY_API_SECRET not configured — rejecting callback');
        return NextResponse.json({ success: false, message: 'Callback not configured' }, { status: 503 });
    }

    const headerSignature = request.headers.get('x-ungateway-signature');
    const receivedSignature = headerSignature || parsed.data.signature;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signature, ...dataWithoutSignature } = parsed.data;
    const computedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(JSON.stringify(dataWithoutSignature))
        .digest('hex');

    // Constant-time comparison to avoid leaking the HMAC byte-by-byte via timing.
    const signaturesMatch = (() => {
        try {
            const a = Buffer.from(computedSignature, 'hex');
            const b = Buffer.from(receivedSignature, 'hex');
            return a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch {
            return false;
        }
    })();

    if (!signaturesMatch) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
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

    const resolvedUserId =
        typeof result?.user_id === 'string' && result.user_id.length > 0
            ? result.user_id
            : null;

    if (resolvedUserId) {
        try {
            await resolveGraceForUserAfterTopup({ userId: resolvedUserId });
        } catch (graceErr) {
            console.warn('[CryptoCallback] Grace recovery hook failed:', graceErr);
        }
    }

    return NextResponse.json({ success: true });
}
