import { Tables } from "@/lib/supabase/types";

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  language: string;
  updatedAt: string;
  provider: "github" | "gitlab" | "bitbucket";
}

export interface Branch {
  name: string;
  commitSha: string;
  protected: boolean;
}

export interface GitProvider {
  id: "github" | "gitlab" | "bitbucket";
  name: string;
  icon: string;
  connected: boolean;
  username?: string | null;
}

export interface ProviderConnection {
  provider: string;
  status: boolean;
  integration_connected: boolean;
  integration_username: string | null;
}

export interface PricingRates {
  initialCost: number;
  hourlyRate: number;
  price: number;
}

export interface PageProps {
  projects: Tables<"projects">[];
  pricing?: Record<string, PricingRates>;
}

export const frameworkConfigs: Record<string, { buildCommand: string; outputDir: string; installCommand: string; description: string }> = {
  "simple-test": { buildCommand: "", outputDir: ".", installCommand: "", description: "Test pipeline - no deployment" },
  Dockerfile: { buildCommand: "docker build", outputDir: "", installCommand: "", description: "Uses your existing Dockerfile - supports any language/runtime" },
  Java: { buildCommand: "mvn package", outputDir: "target", installCommand: "mvn install", description: "Auto-generates Dockerfile with Maven multi-stage build" },
  "Next.js": { buildCommand: "npm run build", outputDir: ".next", installCommand: "npm install", description: "Auto-generates Dockerfile" },
  "Nuxt.js": { buildCommand: "npm run build", outputDir: ".output", installCommand: "npm install", description: "Auto-generates Dockerfile" },
  "Vite-React": { buildCommand: "npm run build", outputDir: "dist", installCommand: "npm install", description: "Auto-generates Dockerfile (Vite)" },
  React: { buildCommand: "npm run build", outputDir: "build", installCommand: "npm install", description: "Auto-generates Dockerfile (CRA)" },
  "Vue.js": { buildCommand: "npm run build", outputDir: "dist", installCommand: "npm install", description: "Auto-generates Dockerfile (Vite)" },
  Angular: { buildCommand: "npm run build", outputDir: "dist", installCommand: "npm install", description: "Auto-generates Dockerfile (Angular CLI)" },
  SvelteKit: { buildCommand: "npm run build", outputDir: "build", installCommand: "npm install", description: "Auto-generates Dockerfile (Node adapter)" },
  Svelte: { buildCommand: "npm run build", outputDir: "public/build", installCommand: "npm install", description: "Auto-generates Dockerfile" },
  "Node.js": { buildCommand: "npm run build", outputDir: ".", installCommand: "npm install", description: "Auto-generates Dockerfile" },
  express: { buildCommand: "", outputDir: ".", installCommand: "npm ci --only=production", description: "Auto-generates Dockerfile" },
  python: { buildCommand: "", outputDir: ".", installCommand: "pip install -r requirements.txt", description: "Auto-generates Dockerfile" },
  django: { buildCommand: "", outputDir: ".", installCommand: "pip install -r requirements.txt", description: "Auto-generates Dockerfile" },
  flask: { buildCommand: "", outputDir: ".", installCommand: "pip install -r requirements.txt", description: "Auto-generates Dockerfile" },
  fastapi: { buildCommand: "", outputDir: ".", installCommand: "pip install -r requirements.txt", description: "Auto-generates Dockerfile" },
  Static: { buildCommand: "", outputDir: ".", installCommand: "", description: "Static files only" },
};

export const instanceSizeConfigs = {
  small:   { cpu: "0.25", ram: "256 MB", replicas: 1 },
  medium:  { cpu: "0.5",  ram: "512 MB", replicas: 2 },
  large:   { cpu: "1",    ram: "1 GB",   replicas: 3 },
  xlarge:  { cpu: "2",    ram: "2 GB",   replicas: 4 },
  "xxlarge": { cpu: "4", ram: "4 GB",   replicas: 6 },
};

export const STEP_META = [
  { id: 1, name: "Provider", title: "Select source control provider", description: "Connect an approved Git provider and choose the account you want to deploy from.", iconSrc: "/dashboard-icons/provider.png" },
  { id: 2, name: "Repository", title: "Choose repository and branch", description: "Select the repository, review available branches, and confirm the code source for deployment.", iconSrc: "/dashboard-icons/repository.png" },
  { id: 3, name: "Configure", title: "Define runtime and capacity", description: "Set the application name, framework profile, environment variables, and resource sizing.", iconSrc: "/dashboard-icons/configure.png" },
  { id: 4, name: "Deploy", title: "Review and launch", description: "Confirm deployment settings, billing impact, and rollout preferences before provisioning begins.", iconSrc: "/dashboard-icons/deploy.png" },
] as const;

export const FRAMEWORK_MAP: Record<string, string> = {
  "Next.js": "Next.js", "Nuxt.js": "Nuxt.js", "Vite-React": "Vite-React",
  React: "React", "Vue.js": "Vue.js", Angular: "Angular", SvelteKit: "SvelteKit",
  Svelte: "Svelte", Express: "express", "Node.js": "Node.js",
  Django: "django", Flask: "flask", FastAPI: "fastapi",
  Dockerfile: "Dockerfile", Python: "python", python: "python",
  Java: "Java", java: "Java", Maven: "Java", maven: "Java", mvn: "Java", Mvn: "Java",
  Laravel: "Dockerfile", Symfony: "Dockerfile", "Ruby on Rails": "Dockerfile",
  PHP: "Dockerfile", Ruby: "Dockerfile", Sinatra: "Dockerfile",
};
