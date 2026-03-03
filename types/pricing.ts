export interface Plan {
  name: string;
  description: string;
  monthly: number;
  yearly: number;
  cta: string;
  featured: boolean;
  highlighted: boolean;
  features: string[];
  isCustom?: boolean;
}
