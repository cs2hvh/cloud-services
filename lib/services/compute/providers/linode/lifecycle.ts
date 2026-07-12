// Linode instance lifecycle primitives shared by the create pipeline,
// destroyServer, and the day-2 op routes.

import { LinodeClient } from "@/lib/services/linode/client";
import type { LinodeError, LinodeInstance } from "@/lib/services/linode/types";

/** Delete a Linode instance; a 404 means it is already gone (success). */
export async function deleteLinodeInstance(linodeId: number): Promise<void> {
    try {
        await LinodeClient.delete(`/linode/instances/${linodeId}`);
    } catch (e) {
        const le = e as LinodeError;
        if (le.code === "NOT_FOUND") return;
        throw le;
    }
}

export async function getLinodeInstance(linodeId: number): Promise<LinodeInstance> {
    return LinodeClient.get<LinodeInstance>(`/linode/instances/${linodeId}`);
}

export interface PollOptions {
    /** Statuses that resolve the poll. */
    until: ReadonlySet<string>;
    /** Overall deadline. */
    timeoutMs: number;
    /** Poll every `fastIntervalMs` for the first `fastWindowMs`, then `slowIntervalMs`. */
    fastIntervalMs?: number;
    fastWindowMs?: number;
    slowIntervalMs?: number;
    /** Called on every observation (status may repeat). */
    onTick?: (instance: LinodeInstance) => Promise<void> | void;
}

export interface PollResult {
    ok: boolean;
    timedOut: boolean;
    instance: LinodeInstance | null;
    /** Set when the instance disappeared (404) mid-poll. */
    gone?: boolean;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll an instance until it reaches one of the target statuses. Transient API
 * errors are tolerated (the poll continues until the deadline); a 404 resolves
 * immediately with `gone: true`.
 */
export async function pollLinodeInstance(
    linodeId: number,
    opts: PollOptions
): Promise<PollResult> {
    const fastInterval = opts.fastIntervalMs ?? 5_000;
    const fastWindow = opts.fastWindowMs ?? 60_000;
    const slowInterval = opts.slowIntervalMs ?? 10_000;
    const startedAt = Date.now();
    let last: LinodeInstance | null = null;

    while (Date.now() - startedAt < opts.timeoutMs) {
        try {
            const instance = await getLinodeInstance(linodeId);
            last = instance;
            await opts.onTick?.(instance);
            if (opts.until.has(instance.status)) {
                return { ok: true, timedOut: false, instance };
            }
        } catch (e) {
            const le = e as LinodeError;
            if (le.code === "NOT_FOUND") {
                return { ok: false, timedOut: false, instance: last, gone: true };
            }
            // AUTH failures won't heal — bail instead of burning the deadline.
            if (le.code === "AUTH") {
                return { ok: false, timedOut: false, instance: last };
            }
            // Otherwise transient — keep polling.
        }
        const elapsed = Date.now() - startedAt;
        await sleep(elapsed < fastWindow ? fastInterval : slowInterval);
    }
    return { ok: false, timedOut: true, instance: last };
}
