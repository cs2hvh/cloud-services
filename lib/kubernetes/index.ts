import { KubeConfig } from "@kubernetes/client-node";

// Initialize Kubernetes config from environment variable
const kubectl = new KubeConfig();

if (!process.env.KUBE_CONFIG_STRING) {
  console.warn("KUBE_CONFIG_STRING environment variable is not set. Kubernetes operations will fail.");
} else {
  try {
    kubectl.loadFromString(process.env.KUBE_CONFIG_STRING);
  } catch (error) {
    console.error("Failed to load Kubernetes config:", error);
    throw error;
  }
}

export default kubectl;
