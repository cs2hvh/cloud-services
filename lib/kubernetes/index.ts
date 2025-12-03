import { KubeConfig } from "@kubernetes/client-node";

// Initialize Kubernetes config from environment variable
const kubectl = new KubeConfig();

// KUBE_CONFIG_STRING should contain base64 encoded kubeconfig
const configString = process.env.KUBE_CONFIG_STRING;

if (!configString || configString === '<get-from-kubernetes-provider>') {
  console.warn("KUBE_CONFIG_STRING environment variable is not set. Kubernetes operations will fail.");
} else {
  try {
    // Decode Base64 config
    const decoded = Buffer.from(configString, 'base64').toString('utf-8');
    kubectl.loadFromString(decoded);
  } catch (error) {
    console.error("Failed to load Kubernetes config:", error);
    throw error;
  }
}

export default kubectl;
