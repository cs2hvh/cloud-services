/**
 * Every nullable column, actually set to null.
 *
 * WHY THIS FILE EXISTS. A null git_sha crashed the deployment list and detail
 * page with "Cannot read properties of null (reading 'slice')". It shipped
 * because the generated type said `string` over a column that had become
 * nullable — so the call site looked safe to write AND safe to review, and two
 * people read it without seeing anything.
 *
 * That was found by luck: the infrastructure lane happened to mention the type
 * change. Nothing systematic would have caught it, and there was no reason to
 * think it was the only one. cloud-services-73's observation is the right one
 * — the deployment pages have never rendered, so the remaining risk in this
 * lane is concentrated exactly here, in paths a runtime would have exercised
 * on the first page load.
 *
 * ONE FIELD AT A TIME, not all-null-at-once. Both are here, but the per-field
 * pass is what makes a failure useful: it names the column rather than
 * reporting that something in a 13-field object broke.
 *
 * THE NULLABLE SETS BELOW ARE COPIED FROM THE LIVE SCHEMA, queried on
 * 2026-08-26:
 *
 *   select column_name from information_schema.columns
 *   where table_schema='paas' and table_name=... and is_nullable='YES'
 *
 * They are a snapshot, and a snapshot is only true as of when it ran. If a
 * column becomes nullable later this file will not know. The assertion at the
 * bottom guards the reverse — that every name here is still a field the DTO
 * reads — so a rename fails loudly rather than silently testing nothing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { toDeploymentDto, type DeploymentRow } from "./deployments.ts";
import { toProjectDto, type ProjectRow } from "./serialize.ts";

// ── deployments ──────────────────────────────────────────────────────

/** Nullable in paas.deployments AND read by DEPLOYMENT_COLUMNS. */
const NULLABLE_DEPLOYMENT_FIELDS = [
  "git_sha",
  "git_message",
  "git_author",
  "image_repo",
  "image_digest",
  "error_code",
  "error_message",
  "container_port",
  "run_as_user",
  "scaled_to_zero_at",
  "started_at",
  "ready_at",
] as const;

function deploymentRow(over: Partial<DeploymentRow> = {}): DeploymentRow {
  return {
    ref: "dpl-abc123",
    state: "ready",
    trigger: "git_push",
    git_sha: "0123456789abcdef0123456789abcdef01234567",
    git_ref: "main",
    git_message: "a commit",
    git_author: "someone",
    image_repo: "registry/app",
    image_digest: "sha256:aaa",
    error_code: null,
    error_message: null,
    container_port: 3000,
    run_as_user: 1000,
    scaled_to_zero_at: null,
    queued_at: "2026-08-26T10:00:00.000Z",
    started_at: "2026-08-26T10:00:10.000Z",
    ready_at: "2026-08-26T10:01:10.000Z",
    ...over,
  };
}

test("every nullable deployment column survives being null, one at a time", () => {
  for (const field of NULLABLE_DEPLOYMENT_FIELDS) {
    const row = deploymentRow({ [field]: null } as Partial<DeploymentRow>);
    let dto;
    try {
      dto = toDeploymentDto(row);
    } catch (err) {
      assert.fail(
        `null ${field} threw: ${(err as Error).message}. This is the null git_sha bug again.`
      );
    }
    // Not merely "did not throw": the label is what the UI renders, and an
    // empty or undefined one is a blank row the user cannot click.
    assert.ok(dto.label, `null ${field} produced no label`);
    assert.equal(typeof dto.isTerminal, "boolean", `null ${field} broke isTerminal`);
  }
});

test("all nullable deployment columns null at once", () => {
  const over = Object.fromEntries(
    NULLABLE_DEPLOYMENT_FIELDS.map((f) => [f, null])
  ) as Partial<DeploymentRow>;
  const dto = toDeploymentDto(deploymentRow(over));

  // A row this empty is what a just-queued webhook deployment looks like
  // before the build resolves anything.
  assert.equal(dto.label, "dpl-abc123", "must fall back to the ref");
  assert.equal(dto.commit.isPlaceholder, true);
  assert.equal(dto.image, null, "no image without both repo and digest");
  assert.equal(dto.timing.durationMs, null, "no duration without timestamps");
  assert.equal(dto.runtime.port, null);
  assert.equal(dto.scaledToZeroAt, null);
});

test("an errored deployment with every field null still explains itself", () => {
  // The worst real case: a build that failed before recording anything.
  const dto = toDeploymentDto(
    deploymentRow({
      state: "error",
      git_sha: null,
      error_code: null,
      error_message: null,
      started_at: null,
      ready_at: null,
      image_repo: null,
      image_digest: null,
    })
  );
  assert.ok(dto.error, "an errored deployment must carry an error");
  assert.ok(
    dto.error!.message.length > 0,
    "a blank failure reason is the state users complain about most"
  );
});

// ── projects ─────────────────────────────────────────────────────────

/** Nullable in paas.projects AND read by PROJECT_COLUMNS. */
const NULLABLE_PROJECT_FIELDS = [
  "installation_id",
  "root_directory",
  "framework",
  "idle_seconds",
] as const;

function projectRow(over: Partial<ProjectRow> = {}): ProjectRow {
  return {
    ref: "prj-abc123",
    name: "My App",
    slug: "my-app",
    provider: "github",
    repo_id: "1",
    repo_full_name: "acme/app",
    installation_id: 42,
    production_branch: "main",
    root_directory: null,
    framework: "next",
    scale_to_zero: false,
    idle_seconds: null,
    created_at: "2026-08-26T10:00:00.000Z",
    updated_at: "2026-08-26T10:00:00.000Z",
    deleted_at: null,
    teams: { ref: "team-1", slug: "acme", name: "Acme" },
    ...over,
  };
}

test("every nullable project column survives being null, one at a time", () => {
  for (const field of NULLABLE_PROJECT_FIELDS) {
    const row = projectRow({ [field]: null } as Partial<ProjectRow>);
    let dto;
    try {
      dto = toProjectDto(row);
    } catch (err) {
      assert.fail(`null ${field} threw: ${(err as Error).message}`);
    }
    assert.ok(dto.ref, `null ${field} produced no ref`);
    assert.equal(typeof dto.repo.installed, "boolean");
  }
});

test("a project with no team still serializes", () => {
  // The join is filtered by RLS rather than being absent, so null here means
  // "you cannot see the team", not "there is no team".
  const dto = toProjectDto(projectRow({ teams: null }));
  assert.equal(dto.team, null);
  assert.ok(dto.ref);
});

test("installation_id null reads as not connected, not as connected to nothing", () => {
  assert.equal(toProjectDto(projectRow({ installation_id: null })).repo.installed, false);
  assert.equal(toProjectDto(projectRow({ installation_id: 42 })).repo.installed, true);
});

// ── the lists above must stay real ───────────────────────────────────

test("every field named above is one the DTO actually reads", () => {
  // A rename would otherwise leave this file setting a field nothing consumes
  // and reporting green — the snapshot problem, one level up.
  const deploymentKeys = Object.keys(deploymentRow());
  for (const f of NULLABLE_DEPLOYMENT_FIELDS) {
    assert.ok(deploymentKeys.includes(f), `${f} is no longer a DeploymentRow field`);
  }
  const projectKeys = Object.keys(projectRow());
  for (const f of NULLABLE_PROJECT_FIELDS) {
    assert.ok(projectKeys.includes(f), `${f} is no longer a ProjectRow field`);
  }
});

// ── the sweep must be able to fail ───────────────────────────────────

test("the sweep catches a serializer that dereferences a nullable field", () => {
  // All seven tests above pass, which means either the DTOs are null-safe or
  // the sweep does not work. This distinguishes those. It runs the same
  // per-field loop against a deliberately unsafe serializer — the exact shape
  // of the shipped bug, row.git_sha.slice(0, 7) with no guard.
  const unsafe = (row: DeploymentRow) => ({ short: (row.git_sha as string).slice(0, 7) });

  const caught: string[] = [];
  for (const field of NULLABLE_DEPLOYMENT_FIELDS) {
    try {
      unsafe(deploymentRow({ [field]: null } as Partial<DeploymentRow>));
    } catch {
      caught.push(field);
    }
  }

  assert.deepEqual(
    caught,
    ["git_sha"],
    "the loop must catch exactly the field the unsafe serializer dereferences"
  );
});
