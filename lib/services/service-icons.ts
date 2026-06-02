import { assetUrl } from "@/lib/asset-url";
/**
 * Single source of truth for the product service icons shared by the marketing
 * homepage ("Our Core Services") and the dashboard.
 *
 * The asset filenames under /public/services-icon/ contain spaces and a couple
 * of typos (e.g. "KUUBERNETS", "FINE TUNNING"); centralizing them here means a
 * rename only has to happen in one place, and the dashboard/homepage can't
 * drift apart.
 */
export interface ServiceIcon {
  src: string;
  label: string;
}

export const SERVICE_ICONS = {
  compute: { src: assetUrl("/services-icon/COMPUTE .png"), label: "Compute" },
  gpu: { src: assetUrl("/services-icon/GPU INSTANCES .png"), label: "GPU Instances" },
  inference: { src: assetUrl("/services-icon/iNFERENCE .png"), label: "Inference" },
  fineTuning: { src: assetUrl("/services-icon/FINE TUNNING .png"), label: "Fine-Tuning" },
  embeddings: { src: assetUrl("/services-icon/EMBEDDINGS AND VECTOR .png"), label: "Embeddings & Vector" },
  modelHosting: { src: assetUrl("/services-icon/MODEL HOSTING .png"), label: "Model Hosting" },
  database: { src: assetUrl("/services-icon/MANAGED DATABASE .png"), label: "Managed Database" },
  appDeployment: { src: assetUrl("/services-icon/APPLICATION DEPLOYMENT.png"), label: "App Deployment" },
  kubernetes: { src: assetUrl("/services-icon/KUUBERNETS .png"), label: "Kubernetes" },
  objectStorage: { src: assetUrl("/services-icon/OBJECT STORAGE .png"), label: "Object Storage" },
  domain: { src: assetUrl("/services-icon/DOMAIN .png"), label: "Domain" },
} as const satisfies Record<string, ServiceIcon>;

export type ServiceKey = keyof typeof SERVICE_ICONS;
