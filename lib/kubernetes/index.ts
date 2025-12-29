import { KubeConfig } from "@kubernetes/client-node";

// Initialize Kubernetes config from environment variable
const kubectl = new KubeConfig();

// KUBE_CONFIG_STRING should contain base64 encoded kubeconfig
const configString = process.env.KUBE_CONFIG_STRING;
console.log(configString?.length);

let loadedFrom: 'KUBE_CONFIG_STRING' | 'DEFAULT' | 'NONE' = 'NONE';

if (configString && configString !== '<get-from-kubernetes-provider>') {
  try {
    const decoded = Buffer.from(configString, 'base64').toString('utf-8');
    kubectl.loadFromString(decoded);
    loadedFrom = 'KUBE_CONFIG_STRING';
  } catch (error) {
    console.error("Failed to load Kubernetes config from KUBE_CONFIG_STRING:", error);
  }
}

// Fallback: local kubeconfig (~/.kube/config), KUBECONFIG, or in-cluster service account
if (loadedFrom === 'NONE') {
  try {
    kubectl.loadFromDefault();
    loadedFrom = 'DEFAULT';
  } catch (error) {
    console.warn("Failed to load Kubernetes config from defaults (KUBECONFIG/~/.kube/config/in-cluster). Kubernetes operations will fail.");
  }
}

// Helpful diagnostics: @kubernetes/client-node throws "No active cluster!" when no current cluster is selected.
try {
  const currentCluster = kubectl.getCurrentCluster();
  const currentContext = kubectl.getCurrentContext();

  if (!currentCluster) {
    const contexts = kubectl.getContexts?.() || [];
    console.warn(
      `[Kubernetes] No active cluster (loadedFrom=${loadedFrom}, currentContext=${currentContext || 'none'}). ` +
        `Set KUBE_CONFIG_STRING (base64 kubeconfig) or ensure a valid current context in your kubeconfig. ` +
        `Available contexts: ${contexts.map((c) => c.name).filter(Boolean).join(', ') || '(none)'}.`
    );
  }
} catch {
  // Ignore diagnostics failures
}

export default kubectl;
