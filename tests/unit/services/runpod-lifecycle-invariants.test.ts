import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildRunPodPodName } from "@/lib/services/runpod/operations/pod-lifecycle-operations";
import { buildRunPodVolumeName } from "@/lib/services/runpod/operations/volume-operations";

describe("GPU lifecycle invariants", () => {
    it("uses deterministic provider names for timeout recovery", () => {
        expect(buildRunPodPodName(42, "Training Run")).toBe(
            "samatva-42-training-run",
        );
        expect(buildRunPodVolumeName(7, "Training Data")).toBe(
            "samatva-7-Training Data",
        );
        expect(buildRunPodPodName(42, "x".repeat(300))).toHaveLength(191);
        expect(buildRunPodVolumeName(7, "x".repeat(300))).toHaveLength(191);
    });

    it("enforces the five-pod limit with a partial unique database index", () => {
        const migration = fs.readFileSync(
            path.join(
                process.cwd(),
                "supabase/migrations/20260615000013_gpu_volume_billing_and_lifecycle.sql",
            ),
            "utf8",
        );

        expect(migration).toContain(
            "ADD COLUMN IF NOT EXISTS active_slot SMALLINT",
        );
        expect(migration).toContain("idx_gpu_pods_owner_active_slot");
        expect(migration).toContain("active_slot BETWEEN 1 AND 5");
        expect(migration).toContain(
            "status IN ('provisioning','running','stopped','restarting','interrupted')",
        );
    });
});
