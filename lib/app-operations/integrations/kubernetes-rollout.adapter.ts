import { KubernetesInfoService } from "@/lib/services/kubernetes-info";

export class KubernetesRolloutAdapter {
  async patchDeploymentImage(appName: string, imageRef: string) {
    return KubernetesInfoService.patchAppDeploymentImage(appName, imageRef, "default");
  }

  async verifyAppRollout(appName: string): Promise<{
    desiredReplicas?: number;
    readyReplicas?: number;
    observedImage?: string;
    degraded: boolean;
    message: string;
  }> {
    const [deployment, imageSnapshot] = await Promise.all([
      KubernetesInfoService.getDeploymentInfo(appName),
      KubernetesInfoService.getAppImageSnapshot(appName),
    ]);

    if (!deployment) {
      return {
        degraded: true,
        message: "Deployment details were unavailable during verification.",
      };
    }

    const observedImage = imageSnapshot.deploymentImages[0]?.image || imageSnapshot.podImages[0]?.image;
    const desiredReplicas = deployment.replicas;
    const readyReplicas = deployment.readyReplicas;

    if (desiredReplicas > 0 && readyReplicas >= desiredReplicas) {
      return {
        desiredReplicas,
        readyReplicas,
        observedImage,
        degraded: false,
        message: "Deployment reported all replicas ready.",
      };
    }

    return {
      desiredReplicas,
      readyReplicas,
      observedImage,
      degraded: true,
      message: `Deployment is still converging (${readyReplicas ?? 0}/${desiredReplicas ?? 0} ready).`,
    };
  }
}
