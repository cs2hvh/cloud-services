function getBuildNumber(value: Record<string, unknown> | null | undefined): number | null {
  return typeof value?.build_number === "number" && Number.isFinite(value.build_number)
    ? value.build_number
    : null;
}

function getTrigger(value: Record<string, unknown> | null | undefined): string | null {
  return typeof value?.trigger === "string" ? value.trigger : null;
}

function getDeploymentId(value: Record<string, unknown> | null | undefined): string | null {
  return typeof value?.id === "string" ? value.id : null;
}

function getImageTag(value: Record<string, unknown> | null | undefined): string | null {
  return typeof value?.image_tag === "string" ? value.image_tag : null;
}

function getImageDigest(value: Record<string, unknown> | null | undefined): string | null {
  return typeof value?.image_digest === "string" ? value.image_digest : null;
}

function hasDifferentImageIdentity(params: {
  currentDeployment: Record<string, unknown> | null;
  candidateDeployment: Record<string, unknown> | null | undefined;
}): boolean {
  const currentImageDigest = getImageDigest(params.currentDeployment);
  const currentImageTag = getImageTag(params.currentDeployment);
  const candidateDigest = getImageDigest(params.candidateDeployment);
  const candidateTag = getImageTag(params.candidateDeployment);

  if (currentImageDigest && candidateDigest) {
    return candidateDigest !== currentImageDigest;
  }

  if (currentImageTag && candidateTag) {
    return candidateTag !== currentImageTag;
  }

  return true;
}

export function isReleaseBuildTrigger(trigger?: string | null): boolean {
  return trigger === "manual" || trigger === "webhook";
}

export function isReleaseBuildRecord(
  value: Record<string, unknown> | null | undefined
): value is Record<string, unknown> {
  return value != null && isReleaseBuildTrigger(getTrigger(value)) && getBuildNumber(value) !== null;
}

export function findServingRelease(params: {
  currentDeployment: Record<string, unknown> | null;
  successfulReleases: Array<Record<string, unknown>>;
}): Record<string, unknown> | null {
  const { currentDeployment, successfulReleases } = params;
  if (!currentDeployment) return null;

  // If the active deployment IS a real build, it's the serving release.
  if (isReleaseBuildRecord(currentDeployment)) {
    return currentDeployment;
  }

  // For non-release records (resize, rollback), find the matching release
  // by image identity first, then fall back to the most recent successful
  // release created before the current operation.
  const currentDeploymentId = getDeploymentId(currentDeployment);
  const currentImageDigest = getImageDigest(currentDeployment);
  const currentImageTag = getImageTag(currentDeployment);

  // Strategy 1: exact image identity match
  const imageMatch = successfulReleases.find((deployment) => {
    if (!isReleaseBuildRecord(deployment)) return false;
    if (getDeploymentId(deployment) === currentDeploymentId) return true;

    const candidateDigest = getImageDigest(deployment);
    if (currentImageDigest && candidateDigest) {
      return candidateDigest === currentImageDigest;
    }

    const candidateTag = getImageTag(deployment);
    if (currentImageTag && candidateTag) {
      return candidateTag === currentImageTag;
    }

    return false;
  });

  if (imageMatch) return imageMatch;

  // Strategy 2: fallback to the most recent successful release build.
  // After a resize or rollback, the image metadata on the operation record
  // may not match any release due to normalization differences (docker.io/
  // prefix, digest format, etc.). The most recent successful release is the
  // best approximation of what's currently serving.
  return successfulReleases.find((d) => isReleaseBuildRecord(d)) ?? null;
}

export function findRollbackTarget(params: {
  currentDeployment: Record<string, unknown> | null;
  servingRelease: Record<string, unknown> | null;
  successfulReleases: Array<Record<string, unknown>>;
}): Record<string, unknown> | null {
  const { servingRelease, successfulReleases } = params;
  const servingBuildNumber = getBuildNumber(servingRelease);
  const servingDeploymentId = getDeploymentId(servingRelease);

  if (!servingRelease || servingBuildNumber === null) {
    return null;
  }

  // Find the most recent successful release build with a different image
  // than the one currently serving. Compare against servingRelease (not
  // currentDeployment) — after a rollback, currentDeployment may point at
  // the rollback operation record whose image matches an earlier build,
  // causing incorrect skips.
  return (
    successfulReleases.find((deployment) => {
      const buildNumber = getBuildNumber(deployment);
      if (!isReleaseBuildRecord(deployment) || buildNumber === null) return false;
      if (getDeploymentId(deployment) === servingDeploymentId) return false;
      if (buildNumber >= servingBuildNumber) return false;

      return hasDifferentImageIdentity({
        currentDeployment: servingRelease,
        candidateDeployment: deployment,
      });
    }) ?? null
  );
}
