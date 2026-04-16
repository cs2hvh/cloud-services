import { parseImageRef } from "@/lib/container-image/image-ref";

type RegistryLookupResult =
  | { exists: true }
  | { exists: false; confirmed: boolean; reason: string };

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
    const parsed = parseImageRef(imageRef);
    if (!parsed) {
      return { exists: false, confirmed: false, reason: "Image reference is empty" };
    }

    const { repository: rawRepository, reference } = parsed;

    // parseImageRef already strips the docker.io/ prefix from the repository.
    // Alias for clarity.
    const repository = rawRepository;

    const registryNamespace = process.env.CONTAINER_REGISTRY_NAMESPACE ?? "hav0ky";
    if (!repository.startsWith(`${registryNamespace}/`)) {
      return {
        exists: false,
        confirmed: false,
        reason: `Unsupported registry for image preflight: ${rawRepository}`,
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
          confirmed: true,
          reason: `Image not found in registry for ${repository}:${reference}`,
        };
      }

      // Non-404 failure (auth, rate-limit, server error) — cannot confirm non-existence
      return {
        exists: false,
        confirmed: false,
        reason: `Registry preflight failed with status ${response.status}`,
      };
    } catch (error) {
      // Network or token error — cannot confirm non-existence
      return {
        exists: false,
        confirmed: false,
        reason: error instanceof Error ? error.message : "Registry preflight failed",
      };
    }
  }
}
