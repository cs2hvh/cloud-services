import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "@ahura/runner-core";
import { scanRuns } from "../scan.js";

// Doc: nextstespsAI/12-agent-execution-stages.md (T1.3b)

const logger = { error: vi.fn(), info: vi.fn(), child: () => logger } as unknown as Logger;

/** Minimal stub of the supabase query builder chain scanRuns uses. */
function stubSupabase(result: { data: unknown; error: unknown }): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve(result),
  };
  return { schema: () => ({ from: () => builder }) } as unknown as SupabaseClient;
}

describe("scanRuns", () => {
  it("maps a queued row to a deduped EnqueueRequest (jobId = run id)", async () => {
    const supabase = stubSupabase({
      data: [{ id: "run_1", org_id: "org_1" }],
      error: null,
    });
    const jobs = await scanRuns(supabase, logger);
    expect(jobs).toEqual([
      { name: "agent-job", jobId: "run_1", data: { runId: "run_1", orgId: "org_1" } },
    ]);
  });

  it("returns [] and logs on a query error", async () => {
    const supabase = stubSupabase({ data: null, error: { message: "boom" } });
    const jobs = await scanRuns(supabase, logger);
    expect(jobs).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns [] when nothing is queued", async () => {
    const supabase = stubSupabase({ data: [], error: null });
    expect(await scanRuns(supabase, logger)).toEqual([]);
  });
});
