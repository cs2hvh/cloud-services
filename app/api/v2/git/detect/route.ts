/**
 * POST /api/v2/git/detect
 *
 * Fetch a repo's marker files and report what framework it looks like, so the
 * connect flow can show the user what will be built before they commit to it.
 *
 * Detection itself is not reimplemented here: detectFramework() in
 * lib/paas/build/detect.ts is the same function the build VM runs, and
 * DETECTION_FILES is the same list. If this route derived its own answer the
 * UI would confidently promise a build that the builder then does differently.
 */

import { getFileContents } from "@/lib/paas/github/client.ts";
import {
  detectFramework,
  detectPackageManager,
  DETECTION_FILES,
  type RepoFiles,
} from "@/lib/paas/build/detect.ts";
import { getCaller } from "../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  apiError,
} from "../../_lib/http";
import { callerMayUseInstallation, parseInstallationId } from "../_lib/scope";

export const dynamic = "force-dynamic";

const SEGMENT = /^[A-Za-z0-9._-]+$/;
/** Branch names reach a GitHub query string; reject anything path-like. */
const REF = /^[A-Za-z0-9._\-\/]{1,255}$/;

interface DetectBody {
  installationId?: unknown;
  repoFullName?: unknown;
  ref?: unknown;
}

export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  let body: DetectBody;
  try {
    body = (await request.json()) as DetectBody;
  } catch {
    return invalid("Request body must be JSON.");
  }

  const installationId = parseInstallationId(
    typeof body.installationId === "number"
      ? String(body.installationId)
      : typeof body.installationId === "string"
        ? body.installationId
        : null
  );
  if (installationId === null) {
    return invalid("An installation id is required.", { installationId: "required" });
  }

  const fullName =
    typeof body.repoFullName === "string" ? body.repoFullName.trim() : "";
  const [owner, repo, ...rest] = fullName.split("/");
  if (rest.length > 0 || !owner || !repo || !SEGMENT.test(owner) || !SEGMENT.test(repo)) {
    return invalid("repoFullName must be owner/repo.", { repoFullName: "malformed" });
  }

  let ref: string | undefined;
  if (typeof body.ref === "string" && body.ref.trim()) {
    ref = body.ref.trim();
    // ".." would let a crafted ref address a different tree; v1 shipped a
    // traversal of this shape.
    if (!REF.test(ref) || ref.includes("..")) {
      return invalid("Malformed git ref.", { ref: "malformed" });
    }
  }

  if (!(await callerMayUseInstallation(caller, installationId))) {
    return notFound("Installation");
  }

  // Marker files only — never the whole tree. Each miss is a null, which is
  // exactly what RepoFiles means by "not present".
  const files: RepoFiles = { paths: [], contents: {} };
  try {
    const fetched = await Promise.all(
      DETECTION_FILES.map(async (path) => ({
        path,
        content: await getFileContents(installationId, fullName, path, ref),
      }))
    );
    for (const { path, content } of fetched) {
      if (content !== null) {
        files.paths.push(path);
        files.contents[path] = content;
      }
    }
  } catch (err) {
    console.error("[v2/git/detect] fetch failed:", err);
    return apiError(
      "upstream_error",
      "Could not read the repository from GitHub. Try again shortly.",
      502
    );
  }

  const detection = detectFramework(files);

  return json({
    repo: fullName,
    ref: ref ?? null,
    /** Which markers were actually found — lets the UI explain the verdict. */
    markersFound: files.paths,
    detection: {
      framework: detection.framework,
      runtime: detection.runtime,
      buildCommand: detection.buildCommand,
      startCommand: detection.startCommand,
      outputDirectory: detection.outputDirectory,
      port: detection.port,
      confidence: detection.confidence,
      reason: detection.reason,
      packageManager:
        detection.runtime === "node" ? detectPackageManager(files) : null,
    },
  });
}
