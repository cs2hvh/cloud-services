// Customer-facing label for a billable service type. Keeps internal codenames
// (spectrum / objectspace / gpu_pod) and upstream-provider hints out of the
// transaction descriptions customers see in their billing history.

const SERVICE_LABEL: Record<string, string> = {
  database: "Database",
  kubernetes: "Kubernetes",
  objectspace: "Object Storage",
  spectrum: "DDoS Protection",
  platform_apps: "App",
  gpu_pod: "GPU pod",
  compute: "Virtual server",
  custom_image: "Custom image",
  inference_vector: "Vector store",
  inference_finetune: "Fine-tuning",
  inference_serving: "Model serving",
  inference_deployment: "Deployment",
};

export function serviceLabel(type: string): string {
  return SERVICE_LABEL[type] ?? type.replace(/_/g, " ");
}
