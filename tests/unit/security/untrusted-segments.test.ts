import { describe, expect, it } from "vitest";

import { isProviderSegment, providerSegment, ProviderPathError } from "@/lib/services/database/operations/provider-path";
import { assertPipelineInputs, isValidBranch, isValidGitUrl, PipelineInputError } from "@/lib/jenkins/pipelines/inputs";

describe("provider URL path segments (database names, usernames)", () => {
  it("accepts what DigitalOcean accepts", () => {
    for (const ok of ["defaultdb", "app_user", "my-db.v2", "A1", "x".repeat(63)]) {
      expect(isProviderSegment(ok)).toBe(true);
      expect(providerSegment(ok, "database name")).toBe(encodeURIComponent(ok));
    }
  });

  it("refuses anything that could change the shape of the URL", () => {
    for (const bad of ["..", ".", "../other", "a/b", "a%2Fb", "a?x=1", "a#f", "a b", "", "-x", "x".repeat(64), "a\nb"]) {
      expect(isProviderSegment(bad)).toBe(false);
      expect(() => providerSegment(bad, "username")).toThrow(ProviderPathError);
    }
    expect(isProviderSegment(undefined)).toBe(false);
    expect(isProviderSegment(42)).toBe(false);
  });
});

describe("pipeline inputs pasted into a shell block", () => {
  it("accepts ordinary branches and repository URLs", () => {
    for (const b of ["main", "feature/login-v2", "release-1.2.3", "hotfix_2026"]) expect(isValidBranch(b)).toBe(true);
    for (const u of [
      "https://github.com/acme/app",
      "https://github.com/acme/app.git",
      "https://gitlab.example.com:8443/group/sub/app.git",
      "git@github.com:acme/app.git",
    ]) {
      expect(isValidGitUrl(u)).toBe(true);
    }
    expect(() => assertPipelineInputs("https://github.com/acme/app.git", "main")).not.toThrow();
  });

  it("refuses shell metacharacters, traversal and credentialed URLs", () => {
    for (const b of ["main; curl x | sh", "$(id)", "`id`", "a..b", "a//b", "-flag", "main.lock", "x/", "", "a b", "a@{1}"]) {
      expect(isValidBranch(b)).toBe(false);
    }
    for (const u of [
      "http://github.com/acme/app",
      "https://user:token@github.com/acme/app",
      "https://github.com/acme/app?x=1",
      "https://github.com/acme/app; id",
      "file:///etc/passwd",
      "https://github.com/../x",
      "",
    ]) {
      expect(isValidGitUrl(u)).toBe(false);
    }
    expect(() => assertPipelineInputs("https://github.com/acme/app", "main; id")).toThrow(PipelineInputError);
    expect(() => assertPipelineInputs("https://x@github.com/acme/app", "main")).toThrow(PipelineInputError);
  });
});
