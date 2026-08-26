/**
 * Our wholesale cost never reaches a customer.
 *
 * WHY THIS IS A TEST AND NOT A CODE REVIEW NOTE.
 *
 * lib/paas/tiers.ts holds priceUsd AND costUsd on the same `Tier` object,
 * correctly — the deploy path prices, the drift checks cost, and splitting
 * them into two tables that must be kept in step would be worse. But it means
 * the object a developer naturally reaches for carries our margin, and React
 * Server Components serialise whatever crosses to a client component into the
 * HTML. `<SizingPicker tiers={TIERS} />` reads like the obvious thing to
 * write, compiles, renders correctly, and publishes our cost basis in
 * view-source.
 *
 * THAT IS NOT HYPOTHETICAL. The GPU deploy wizard in cloud-services shipped
 * exactly this: two render sites showed the raw RunPod wholesale rate under a
 * "/GPU·hr" label. It was found by eye, late, and only because someone
 * happened to compare the number to the supplier's price list. Nothing would
 * have caught it.
 *
 * So there are two defences and this file is the second:
 *
 *   1. SizingDto and TierOption are named types with no cost field, so the
 *      safe path is also the convenient one.
 *   2. This scan, which fails if a cost-bearing field name appears in a file
 *      that ships to the browser.
 *
 * IT REPORTS WHAT IT EXAMINED. A scan that matches nothing looks identical to
 * a clean lane, which is the failure this project found eight variations of in
 * one day. filesExamined and mentionsExamined are asserted non-trivial.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** app/api/v2/_lib -> repo root */
const ROOT = join(HERE, "..", "..", "..", "..");

/**
 * Field names that carry our cost basis rather than the customer's price.
 * Taken from lib/paas/tiers.ts — if that module gains another, add it here.
 */
const COST_FIELDS = ["costUsd", "costFor", "marginPct", "costInr"];

/** A file that ships to the browser. Everything under it runs client-side. */
function isClientFile(path: string, text: string): boolean {
  if (path.includes("components")) return true;
  return text.slice(0, 400).includes('"use client"');
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.includes(".test.")
    ) {
      out.push(full);
    }
  }
  return out;
}

export interface LeakScan {
  filesExamined: number;
  clientFilesExamined: number;
  /** Every cost-field mention seen, client or not. Zero means inert. */
  mentionsExamined: number;
  offenders: string[];
}

export function scanForCostLeaks(
  files: Array<{ path: string; text: string }>
): LeakScan {
  let clientFilesExamined = 0;
  let mentionsExamined = 0;
  const offenders: string[] = [];

  for (const file of files) {
    const client = isClientFile(file.path, file.text);
    if (client) clientFilesExamined++;

    const lines = file.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // A comment discussing the rule is not a leak. This file and the
      // component header both name costUsd precisely to explain the omission.
      const code = line.trimStart();
      const isComment =
        code.startsWith("//") || code.startsWith("*") || code.startsWith("/*");

      for (const field of COST_FIELDS) {
        if (!line.includes(field)) continue;
        mentionsExamined++;
        if (client && !isComment) {
          offenders.push(`${file.path}:${i + 1}  ${line.trim()}`);
        }
      }
    }
  }

  return {
    filesExamined: files.length,
    clientFilesExamined,
    mentionsExamined,
    offenders,
  };
}

function loadLane(): Array<{ path: string; text: string }> {
  const roots = [
    join(ROOT, "app", "api", "v2"),
    join(ROOT, "app", "dashboard", "v2"),
    join(ROOT, "components", "v2"),
  ];
  const files: Array<{ path: string; text: string }> = [];
  for (const root of roots) {
    for (const path of walk(root)) {
      files.push({
        path: path.slice(ROOT.length + 1),
        text: readFileSync(path, "utf8"),
      });
    }
  }
  return files;
}

test("the scan reaches both the lane and its client files", () => {
  // The input-side counter. A broken walk, or an isClientFile that stopped
  // recognising anything, would otherwise read as a clean lane.
  const scan = scanForCostLeaks(loadLane());
  assert.ok(scan.filesExamined >= 20, `only opened ${scan.filesExamined} files`);
  assert.ok(
    scan.clientFilesExamined >= 5,
    `identified only ${scan.clientFilesExamined} client files — the detector has stopped working`
  );
  assert.ok(
    scan.mentionsExamined >= 1,
    "found no cost-field mention anywhere, including the comments that explain the rule — the pattern is inert"
  );
});

test("no client file references our cost basis", () => {
  const scan = scanForCostLeaks(loadLane());
  assert.deepEqual(
    scan.offenders,
    [],
    `wholesale cost reachable from the browser:\n${scan.offenders.join("\n")}`
  );
});

test("the customer-facing sizing shape has no cost field", async () => {
  // Belt and braces: the structural scan above is a string match, this is the
  // actual object. If toSizingDto ever spreads a Tier, this catches it even
  // though the field name never appears in a client file.
  const { toSizingDto } = await import("./serialize.ts");
  // Via unknown: SizingDto has no index signature, which is exactly the
  // property being relied on. The cast is to inspect it at runtime, not to
  // claim the two types overlap.
  const dto = toSizingDto("standard", 3) as unknown as Record<string, unknown>;

  for (const field of COST_FIELDS) {
    assert.ok(!(field in dto), `SizingDto leaked ${field}`);
  }
  // And it is genuinely populated, so the absence above is not vacuous.
  assert.equal(dto.tier, "standard");
  assert.equal(dto.instanceCount, 3);
  assert.equal(dto.priceUsd, 57, "19 x 3 — linear, no volume discount");
});

test("bundled transfer is not multiplied by instance count", async () => {
  const { toSizingDto } = await import("./serialize.ts");
  const one = toSizingDto("standard", 1);
  const three = toSizingDto("standard", 3);
  assert.equal(
    three.transferGb,
    one.transferGb,
    "transfer is bundled per APP — tripling it for 3 replicas would be a false allowance"
  );
  assert.equal(three.priceUsd, one.priceUsd * 3, "price IS linear in instances");
});

// ── the scan must be able to fail ────────────────────────────────────

test("it catches the obvious mistake", () => {
  const scan = scanForCostLeaks([
    {
      path: "components/v2/fixture.tsx",
      text: '"use client";\nexport const x = tier.costUsd;',
    },
  ]);
  assert.equal(scan.mentionsExamined, 1, "the fixture must reach the counter");
  assert.deepEqual(scan.offenders.length, 1, "a client-side costUsd must be flagged");
});

test("it does not flag a server file or a comment", () => {
  const scan = scanForCostLeaks([
    { path: "app/api/v2/fixture.ts", text: "const c = tier.costUsd;" },
    { path: "components/v2/fixture.tsx", text: '"use client";\n// never send costUsd' },
  ]);
  assert.deepEqual(scan.offenders, [], "server use and comments are both fine");
  assert.equal(scan.mentionsExamined, 2, "both must still be examined");
});
