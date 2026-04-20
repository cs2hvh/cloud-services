/**
 * One-off fix: mark stale `building` deployment rows as `failed` when a
 * newer successful deployment already exists for the same app.
 *
 * Run with:
 *   npx tsx scripts/fix-stale-building-deployments.ts [app_id]
 *
 * Passing an app_id limits the fix to that app. Omit it to scan all apps.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" }); // fallback

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const targetAppId = process.argv[2] ?? null;

  // 1. Find all stale `building` rows (building rows where a newer success exists)
  let buildingQuery = supabase
    .from("platform_app_deployments")
    .select("id, app_id, build_number, created_at")
    .eq("status", "building")
    .order("created_at", { ascending: false });

  if (targetAppId) {
    buildingQuery = buildingQuery.eq("app_id", targetAppId);
  }

  const { data: buildingRows, error: fetchErr } = await buildingQuery;
  if (fetchErr) {
    console.error("Failed to fetch building deployments:", fetchErr.message);
    process.exit(1);
  }

  if (!buildingRows || buildingRows.length === 0) {
    console.log("No building deployments found. Nothing to fix.");
    return;
  }

  console.log(`Found ${buildingRows.length} building deployment(s). Checking for stale rows...`);

  let fixed = 0;
  let skipped = 0;

  for (const row of buildingRows) {
    // Check if a newer successful deployment exists for this app
    const { data: newerSuccess, error: checkErr } = await supabase
      .from("platform_app_deployments")
      .select("id, build_number, created_at")
      .eq("app_id", row.app_id)
      .eq("status", "success")
      .gt("created_at", row.created_at)
      .limit(1)
      .maybeSingle();

    if (checkErr) {
      console.warn(`  [app ${row.app_id}] Failed to check newer success: ${checkErr.message}`);
      skipped++;
      continue;
    }

    if (!newerSuccess) {
      console.log(
        `  [app ${row.app_id}] Build #${row.build_number} (id: ${row.id}) — no newer success found, skipping (may be genuinely in-progress).`
      );
      skipped++;
      continue;
    }

    // Stale — mark as failed
    const { error: updateErr } = await supabase
      .from("platform_app_deployments")
      .update({ status: "failed" })
      .eq("id", row.id);

    if (updateErr) {
      console.error(
        `  [app ${row.app_id}] Failed to update build #${row.build_number}: ${updateErr.message}`
      );
      skipped++;
    } else {
      console.log(
        `  [app ${row.app_id}] ✓ Build #${row.build_number} marked as failed` +
        ` (newer success: build #${newerSuccess.build_number})`
      );
      fixed++;
    }
  }

  console.log(`\nDone. Fixed: ${fixed}, skipped: ${skipped}.`);
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
