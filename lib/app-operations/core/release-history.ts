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
  if (isReleaseBuildRecord(currentDeployment)) {
    return currentDeployment;
  }

  const currentDeploymentId = getDeploymentId(currentDeployment);
  const currentImageDigest = getImageDigest(currentDeployment);
  const currentImageTag = getImageTag(currentDeployment);

  return (
    successfulReleases.find((deployment) => {
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
    }) ?? null
  );
}

export function findRollbackTarget(params: {
  currentDeployment: Record<string, unknown> | null;
  servingRelease: Record<string, unknown> | null;
  successfulReleases: Array<Record<string, unknown>>;
}): Record<string, unknown> | null {
  const { currentDeployment, servingRelease, successfulReleases } = params;
  const currentDeploymentId = getDeploymentId(currentDeployment);
  const servingBuildNumber = getBuildNumber(servingRelease);

  if (!servingRelease || servingBuildNumber === null) {
    return null;
  }

  return (
    successfulReleases.find((deployment) => {
      const buildNumber = getBuildNumber(deployment);
      if (!isReleaseBuildRecord(deployment) || buildNumber === null) return false;
      if (getDeploymentId(deployment) === currentDeploymentId) return false;
      if (buildNumber >= servingBuildNumber) return false;

      return hasDifferentImageIdentity({
        currentDeployment,
        candidateDeployment: deployment,
      });
    }) ?? null
  );
}
