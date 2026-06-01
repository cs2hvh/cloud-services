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
  compute: { src: "/services-icon/COMPUTE .png", label: "Compute" },
  gpu: { src: "/services-icon/GPU INSTANCES .png", label: "GPU Instances" },
  inference: { src: "/services-icon/iNFERENCE .png", label: "Inference" },
  fineTuning: { src: "/services-icon/FINE TUNNING .png", label: "Fine-Tuning" },
  embeddings: { src: "/services-icon/EMBEDDINGS AND VECTOR .png", label: "Embeddings & Vector" },
  modelHosting: { src: "/services-icon/MODEL HOSTING .png", label: "Model Hosting" },
  database: { src: "/services-icon/MANAGED DATABASE .png", label: "Managed Database" },
  appDeployment: { src: "/services-icon/APPLICATION DEPLOYMENT.png", label: "App Deployment" },
  kubernetes: { src: "/services-icon/KUUBERNETS .png", label: "Kubernetes" },
  objectStorage: { src: "/services-icon/OBJECT STORAGE .png", label: "Object Storage" },
  domain: { src: "/services-icon/DOMAIN .png", label: "Domain" },
} as const satisfies Record<string, ServiceIcon>;

export type ServiceKey = keyof typeof SERVICE_ICONS;
