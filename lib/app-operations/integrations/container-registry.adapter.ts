type RegistryLookupResult =
  | { exists: true }
  | { exists: false; reason: string };

function splitImageRef(imageRef: string) {
  const trimmed = imageRef.trim();
  if (!trimmed) {
    return null;
  }

  const digestIndex = trimmed.indexOf("@");
  if (digestIndex >= 0) {
    return {
      repository: trimmed.slice(0, digestIndex),
      reference: trimmed.slice(digestIndex + 1),
    };
  }

  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > trimmed.lastIndexOf("/")) {
    return {
      repository: trimmed.slice(0, lastColon),
      reference: trimmed.slice(lastColon + 1),
    };
  }

  return {
    repository: trimmed,
    reference: "latest",
  };
}

export class ContainerRegistryAdapter {
  private async getDockerHubToken(repository: string): Promise<string> {
    const response = await fetch(
      `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Docker Hub token request failed (${response.status})`);
    }

    const data = (await response.json()) as { token?: string };
    if (!data.token) {
      throw new Error("Docker Hub token response missing token");
    }

    return data.token;
  }

  async verifyImageExists(imageRef: string): Promise<RegistryLookupResult> {
    const parsed = splitImageRef(imageRef);
    if (!parsed) {
      return { exists: false, reason: "Image reference is empty" };
    }

    const { repository, reference } = parsed;

    const registryNamespace = process.env.CONTAINER_REGISTRY_NAMESPACE ?? "hav0ky";
    if (!repository.startsWith(`${registryNamespace}/`)) {
      return {
        exists: false,
        reason: `Unsupported registry for image preflight: ${repository}`,
      };
    }

    try {
      const token = await this.getDockerHubToken(repository);
      const response = await fetch(
        `https://registry-1.docker.io/v2/${repository}/manifests/${reference}`,
        {
          method: "HEAD",
          headers: {
            Accept:
              "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        return { exists: true };
      }

      if (response.status === 404) {
        return {
          exists: false,
          reason: `Image not found in registry for ${repository}@${reference}`,
        };
      }

      return {
        exists: false,
        reason: `Registry preflight failed with status ${response.status}`,
      };
    } catch (error) {
      return {
        exists: false,
        reason: error instanceof Error ? error.message : "Registry preflight failed",
      };
    }
  }
}
