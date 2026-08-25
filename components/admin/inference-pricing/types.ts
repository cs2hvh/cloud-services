/** Client-side shapes for the model pricing admin. Mirrors what
 *  app/api/admin/inference/pricing returns. */
import type { CatalogSummary, ModelPricingRow } from "@/lib/admin/inference-pricing";

export type CatalogRow = ModelPricingRow & {
  margin_pct: number | null;
  cost_known: boolean;
  upstream_model_id?: string | null;
};

export type { CatalogSummary };

export interface RepriceChangeDto {
  model_id: string;
  field: string;
  from: number | null;
  to: number;
  cost: number;
}

export interface RepricePreview {
  target_margin_pct: number;
  models_affected: number;
  changes: RepriceChangeDto[];
  skipped: Array<{ model_id: string; reason: string }>;
}

/** Margin-tone quick filter, driven by the summary cards. */
export type CatalogFilter = "all" | "loss" | "thin" | "unit" | "unknown";

/** Orthogonal filter axes, driven by the filter bar. */
export type StatusFilter = "active" | "inactive" | "any";
export type BillingShape = "any" | "token" | "unit";
export type SortKey = "margin_asc" | "margin_desc" | "model_id";

/** A row's pending edits: token prices and/or per-unit rates, as typed. */
export interface RowDraft {
  token?: Partial<Record<string, string>>;
  unit?: Record<string, string>;
}
