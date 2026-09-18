/**
 * The customer-facing shape of media, and the pieces of it that decide money
 * or hide the partner.
 */
import { describe, expect, it } from "vitest";
import { imageTierFor, publicVideoJob, relayMediaError, rowIdFromPublic, publicVideoId, toPublicStatus, toStoredStatus, type JobRow } from "./media.ts";

describe("status vocabularies", () => {
  it("stores only what the table's check constraint allows", () => {
    for (const s of ["in_progress", "processing", "anything-else", null, undefined]) expect(toStoredStatus(s)).toBe("running");
    expect(toStoredStatus("queued")).toBe("queued");
    expect(toStoredStatus("completed")).toBe("completed");
    expect(toStoredStatus("failed")).toBe("failed");
    expect(toStoredStatus("cancelled")).toBe("canceled");
  });
  it("shows customers the OpenAI-style spellings", () => {
    expect(toPublicStatus("running")).toBe("in_progress");
    expect(toPublicStatus("canceled")).toBe("cancelled");
    expect(toPublicStatus("queued")).toBe("queued");
    expect(toPublicStatus("completed")).toBe("completed");
  });
});

const caps = { size_tiers: { "1K": ["1024x1024"], "2K": ["2048x2048", "1536x1024"] } };

describe("imageTierFor", () => {
  it("maps a size to its price tier", () => {
    expect(imageTierFor(caps, "1024x1024")).toBe("1K");
    expect(imageTierFor(caps, "1536x1024")).toBe("2K");
  });
  it("is null for an unknown size, no size, or no tiers", () => {
    expect(imageTierFor(caps, "640x480")).toBeNull();
    expect(imageTierFor(caps, undefined)).toBeNull();
    expect(imageTierFor(null, "1024x1024")).toBeNull();
  });
});

describe("relayMediaError", () => {
  it("keeps the partner's clean validation code and message", () => {
    const r = relayMediaError(400, JSON.stringify({ error: { code: "video_duration_invalid", message: "Duration must be a whole number within the selected model and price tier range." } }), "req");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("video_duration_invalid");
    expect(r.body.error.message).toContain("Duration must be");
    expect(r.body.error.request_id).toBe("req");
  });
  it("drops a message that names a provider or a URL", () => {
    const r = relayMediaError(400, JSON.stringify({ error: { code: "x", message: "See https://wokey.ai/docs for details" } }), "req");
    expect(r.body.error.message).not.toMatch(/wokey|http/i);
  });
  it("hides 5xx and auth failures behind one generic 503", () => {
    expect(relayMediaError(502, "bad gateway", "req").status).toBe(503);
    expect(relayMediaError(401, "unauthorized", "req").body.error.code).toBe("media_unavailable");
  });
  it("survives a non-JSON body", () => {
    const r = relayMediaError(400, "<html>", "req");
    expect(r.body.error.code).toBe("upstream_400");
  });
});

describe("video job ids", () => {
  it("round-trips our uuid behind a video_ prefix and rejects anything else", () => {
    const id = "3be098cc-0311-42cd-aec6-849c107d0c76";
    expect(rowIdFromPublic(publicVideoId(id))).toBe(id);
    expect(rowIdFromPublic("video_notauuid")).toBeNull();
    expect(rowIdFromPublic(id)).toBeNull();
  });
});

const row: JobRow = {
  id: "3be098cc-0311-42cd-aec6-849c107d0c76",
  org_id: "org",
  api_key_id: "key",
  model_id: "x-ai/grok-imagine-video-1.5",
  status: "running",
  request_params: { prompt: "a boat", mode: "text_to_video", duration_seconds: 1, ratio: "16:9", resolution: "480p" },
  num_units: 1,
  unit_label: "second",
  cost_cents: 0,
  upstream_job_id: "video_partner-side-id",
  error_code: null,
  error_message: null,
  created_at: "2026-09-18T15:09:58.184Z",
  updated_at: "2026-09-18T15:09:58.184Z",
  deadline_at: null,
};

describe("publicVideoJob", () => {
  it("never exposes the partner's id, price or name", () => {
    const j = publicVideoJob(row, {
      id: "video_partner-side-id",
      status: "completed",
      model: "grok-imagine-video-1.5",
      price_usd: 0.0056,
      completed_at: "2026-09-18T15:10:26.330Z",
      duration_seconds: 1,
      resolution: "480p",
      ratio: "16:9",
      mode: "text_to_video",
    } as never);
    const s = JSON.stringify(j);
    expect(s).not.toContain("partner-side-id");
    expect(s).not.toContain("price_usd");
    expect(s).not.toMatch(/wokey/i);
    expect(j.id).toBe("video_3be098cc-0311-42cd-aec6-849c107d0c76");
    expect(j.model).toBe("x-ai/grok-imagine-video-1.5");
  });
  it("offers content only once completed, with our URL and an expiry", () => {
    const pending = publicVideoJob(row, { id: "p", status: "in_progress" });
    expect(pending.status).toBe("in_progress");
    expect(pending.content_url).toBeNull();
    expect(pending.content_expires_at).toBeNull();
    expect(publicVideoJob({ ...row, status: "queued" }, null).status).toBe("queued");
    const done = publicVideoJob({ ...row, status: "completed" }, null);
    expect(done.content_url).toBe("/v1/videos/video_3be098cc-0311-42cd-aec6-849c107d0c76/content");
    expect(done.content_expires_at).toBe("2026-09-25T15:09:58.184Z");
  });
  it("carries a recorded failure", () => {
    const failed = publicVideoJob({ ...row, status: "failed", error_code: "watchdog_timeout", error_message: "The job did not finish in time." }, null);
    expect(failed.error).toEqual({ code: "watchdog_timeout", message: "The job did not finish in time." });
  });
});
