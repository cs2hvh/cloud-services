import { createServiceClient } from '@/lib/supabase/server';
import { Billing } from '@/lib/supabase/queries/billing';
import { resolveGraceForUserAfterTopup } from '@/lib/billing/grace/recovery';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Matches the ZX Gateway webhook payload. Amounts are decimal STRINGS; the
// credited_* fields are null until the payment reaches `completed`.
const callbackSchema = z.object({
    event: z.string().optional(),
    payment_id: z.string().uuid(),
    merchant_order_id: z.string().nullable().optional(),
    status: z.string(),
    pay_asset_id: z.string().optional(),
    pay_amount: z.string().optional(),
    received_amount: z.string().optional(),
    credited_amount: z.string().nullable().optional(),
    credited_asset_id: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    txids: z.array(z.string()).default([]),
    timestamp: z.string().optional(),
});

// Only a `completed` status credits the wallet. These terminal-failure statuses
// just mark the pending deposit failed; everything else is acked unchanged.
const FAILED_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled']);

function verifySignature(rawBody: string, request: Request): boolean {
    const secretKey = process.env.ZXGATEWAY_API_SECRET;
    if (!secretKey) {
        // Fail CLOSED: without the shared secret we cannot authenticate the
        // gateway, so we must never credit an unverified deposit.
        console.error('[CryptoCallback] ZXGATEWAY_API_SECRET not configured — rejecting callback');
        return false;
    }

    // Header `x-zx-signature: sha256=<hex>` where <hex> = HMAC-SHA256(secret, rawBody).
    const provided = (
        request.headers.get('x-zx-signature') ??
        request.headers.get('x-ungateway-signature') ??
        ''
    ).replace(/^sha256=/, '');

    const expected = crypto.createHmac('sha256', secretKey).update(rawBody).digest('hex');

    try {
        const a = Buffer.from(provided, 'hex');
        const b = Buffer.from(expected, 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

export async function POST(request: Request) {
    // Read the RAW body once: the HMAC is computed over these exact bytes, and
    // we parse JSON from the same string (re-serializing would change the bytes).
    const rawBody = await request.text();

    if (!verifySignature(rawBody, request)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let raw: unknown;
    try {
        raw = JSON.parse(rawBody);
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

    const { payment_id, status, credited_amount } = parsed.data;
    const normalizedStatus = status.toLowerCase();
    const service = await createServiceClient();

    // The deposit was recorded under this idempotency key by the create action.
    const key = `zx_${payment_id}`;

    const { data: tx, error: findErr } = await service
        .schema('billing')
        .from('transactions')
        .select('id, user_id, amount, status')
        .eq('stripe_session_id', key)
        .maybeSingle();

    if (findErr) {
        console.error('[CryptoCallback] Lookup error:', findErr);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
    if (!tx) {
        // Unknown payment — ack so the gateway stops retrying, but log it.
        console.warn('[CryptoCallback] No matching deposit for payment', payment_id);
        return NextResponse.json({ success: true });
    }

    // Terminal failure → mark the pending deposit failed (idempotent).
    if (FAILED_STATUSES.has(normalizedStatus)) {
        if (tx.status === 'pending') {
            await service
                .schema('billing')
                .from('transactions')
                .update({ status: 'failed', description: `Crypto deposit ${normalizedStatus}` })
                .eq('id', tx.id)
                .eq('status', 'pending');
        }
        return NextResponse.json({ success: true });
    }

    // Only `completed` credits the wallet; anything else (pending/confirming/…)
    // is acknowledged with no balance change.
    if (normalizedStatus !== 'completed') {
        return NextResponse.json({ success: true });
    }

    // Already credited by a prior webhook → idempotent ack.
    if (tx.status === 'completed') {
        return NextResponse.json({ success: true });
    }

    // Credit the amount the gateway settled (credited_amount is USD-pegged, in
    // the credited asset). The completed webhook always carries it.
    const creditAmount = Number(credited_amount);
    if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        console.error('[CryptoCallback] Missing/invalid credited_amount for payment', payment_id, credited_amount);
        return NextResponse.json({ success: false, message: 'Invalid credited amount' }, { status: 400 });
    }

    // Atomically claim the row (pending → completed) so concurrent/duplicate
    // webhooks can't double-credit: only the update that flips `pending` wins.
    // Record the actually-credited amount on the row.
    const { data: claimed, error: claimErr } = await service
        .schema('billing')
        .from('transactions')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            amount: creditAmount,
        })
        .eq('id', tx.id)
        .eq('status', 'pending')
        .select('id, user_id')
        .maybeSingle();

    if (claimErr) {
        console.error('[CryptoCallback] Claim error:', claimErr);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
    if (!claimed) {
        // Lost the race — another webhook already completed it.
        return NextResponse.json({ success: true });
    }

    // Credit the wallet atomically and stamp the running balance.
    try {
        const { credit_balance } = await Billing.topup(claimed.user_id, creditAmount);
        await service
            .schema('billing')
            .from('transactions')
            .update({ balance_after: credit_balance })
            .eq('id', claimed.id);
    } catch (creditErr) {
        // The row is already marked completed; surface loudly for reconciliation
        // rather than letting the gateway retry into the (now-closed) claim guard.
        console.error('[CryptoCallback] Credit failed AFTER claiming deposit', claimed.id, creditErr);
        return NextResponse.json({ success: true });
    }

    try {
        await resolveGraceForUserAfterTopup({ userId: claimed.user_id });
    } catch (graceErr) {
        console.warn('[CryptoCallback] Grace recovery hook failed:', graceErr);
    }

    console.log(`[CryptoCallback] Credited $${creditAmount} to user ${claimed.user_id} (payment ${payment_id})`);
    return NextResponse.json({ success: true });
}
