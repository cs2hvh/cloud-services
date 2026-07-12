// Linode ↔ servers-table reconciliation.
//
// A resold fleet drifts in two directions:
//   1. Instances on the Linode account that no servers row tracks (a create
//      crashed between POST /linode/instances and the DB insert, or a manual
//      console action). These bill the PLATFORM invisibly — reported for a
//      human decision, never auto-deleted.
//   2. servers rows whose instance is gone upstream (deleted from the Linode
//      console, or a teardown that removed the instance but died before row
//      cleanup). These bill the CUSTOMER for nothing — the row is flagged
//      status='error' and the active_compute meter is closed.
//
// Instances without the 'panel' tag are counted but NEVER touched: the account
// may host manually created machines that are not ours to manage.
//
// Intended cadence: every ~6h via /api/internal/linode/reconcile (cron) or
// on demand via /api/admin/linode/reconcile. Callers hold the Redis NX lock.

import { LinodeClient } from "@/lib/services/linode/client";
import type { LinodeInstance } from "@/lib/services/linode/types";
import { createServiceClient } from "@/lib/supabase/server";
import { closeActiveBilling } from "@/config/billing-flow";
import { BillingCredits } from "@/lib/billing/credits";

/** Tag stamped on every instance the panel creates (see providers/linode/create.ts). */
const PANEL_TAG = "panel";

/**
 * Ignore anything younger than this on BOTH sides. The instance list and the
 * rows query are two non-atomic snapshots: a create that lands between them
 * would otherwise be flagged (instance without row, or row whose instance
 * missed the earlier instances snapshot) and — for rows — get its billing
 * incorrectly closed. 15 minutes comfortably covers any in-flight create.
 */
const RECONCILE_GRACE_MS = 15 * 60_000;

export interface UntrackedLinodeInstance {
    linodeId: number;
    label: string;
    region: string;
    created: string;
}

export interface ReconcileReport {
    /** Every instance on the Linode account. */
    instancesTotal: number;
    /** Instances tagged 'panel' (ours). */
    panelInstances: number;
    /** Instances WITHOUT the 'panel' tag — counted only, never touched. */
    foreignInstances: number;
    /** servers rows with provider='linode'. */
    trackedRows: number;
    /** Panel-tagged instances older than the grace window with no servers row. */
    untracked: UntrackedLinodeInstance[];
    /** servers.id of rows flagged error because their instance is gone upstream. */
    orphanedRows: number[];
    /** Orphaned rows whose status update or billing close threw (needs a human). */
    orphanedRowErrors: number;
    durationMs: number;
}

interface LinodeServerRow {
    id: number;
    linode_id: number | null;
    owner_id: string | null;
    billing_service_id: string | null;
    status: string | null;
    created_at: string | null;
}

function olderThanGrace(iso: string | null | undefined, now: number): boolean {
    if (!iso) return true; // unparseable/missing timestamp — treat as old
    const t = new Date(iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`).getTime();
    if (!Number.isFinite(t)) return true;
    return now - t > RECONCILE_GRACE_MS;
}

/**
 * Compare the live Linode account against the servers table and report the
 * drift. Mutates only the orphaned-row side (status='error' + meter close);
 * untracked instances are reported for manual review, never deleted.
 */
export async function reconcileLinodeInstances(): Promise<ReconcileReport> {
    const startedAt = Date.now();

    // Instances FIRST, rows second — see RECONCILE_GRACE_MS for why order matters.
    const instances = await LinodeClient.getAllPages<LinodeInstance>("/linode/instances");

    const supabase = await createServiceClient();
    const { data: rowsData, error: rowsError } = await supabase
        .from("servers")
        .select("id, linode_id, owner_id, billing_service_id, status, created_at")
        .eq("provider", "linode");
    if (rowsError) {
        throw new Error(`[linode-reconcile] servers query failed: ${rowsError.message}`);
    }
    const rows = (rowsData ?? []) as LinodeServerRow[];

    const trackedLinodeIds = new Set<number>();
    for (const row of rows) {
        if (row.linode_id != null) trackedLinodeIds.add(Number(row.linode_id));
    }
    const liveInstanceIds = new Set(instances.map((i) => i.id));

    // ── 1. Untracked panel instances (platform pays, nobody is billed) ──────
    const now = Date.now();
    const panel = instances.filter((i) => (i.tags ?? []).includes(PANEL_TAG));
    const foreignInstances = instances.length - panel.length;

    const untracked: UntrackedLinodeInstance[] = panel
        .filter((i) => !trackedLinodeIds.has(i.id) && olderThanGrace(i.created, now))
        .map((i) => ({
            linodeId: i.id,
            label: i.label,
            region: i.region,
            created: i.created,
        }));

    // ── 2. Orphaned rows (customer pays for a gone instance) ────────────────
    const orphanedRows: number[] = [];
    let orphanedRowErrors = 0;

    for (const row of rows) {
        if (row.linode_id == null) continue;
        if (liveInstanceIds.has(Number(row.linode_id))) continue;
        if (!olderThanGrace(row.created_at, now)) continue; // in-flight create race

        try {
            const { error: updateError } = await supabase
                .from("servers")
                .update({ status: "error" })
                .eq("id", row.id);
            if (updateError) throw new Error(updateError.message);

            // Close the meter and prorate the final sliver. Idempotent: a
            // previously closed meter yields no active row → zero charge.
            if (row.billing_service_id && row.owner_id) {
                await closeActiveBilling({
                    userId: row.owner_id,
                    serviceId: row.billing_service_id,
                    serviceType: "compute",
                    closeActive: () =>
                        BillingCredits.closeActiveCompute({ serviceId: row.billing_service_id! }),
                });
            }

            orphanedRows.push(row.id);
        } catch (e) {
            orphanedRowErrors += 1;
            console.error(
                `[linode-reconcile] failed to reconcile orphaned server row ${row.id} (linode ${row.linode_id}):`,
                e instanceof Error ? e.message : e
            );
        }
    }

    const report: ReconcileReport = {
        instancesTotal: instances.length,
        panelInstances: panel.length,
        foreignInstances,
        trackedRows: rows.length,
        untracked,
        orphanedRows,
        orphanedRowErrors,
        durationMs: Date.now() - startedAt,
    };

    if (untracked.length > 0) {
        console.warn(
            `[linode-reconcile] ${untracked.length} untracked panel instance(s) billing the platform:`,
            untracked.map((u) => `${u.linodeId} (${u.label} @ ${u.region})`).join(", ")
        );
    }

    return report;
}
