/** Client shapes for the orgs admin — mirrors /api/admin/inference/orgs. */
import type {
  ApiKeyRow,
  ByokKeyRow,
  KeyState,
  OrgMemberRow,
  OrgRow,
  OrgSummary,
  OrgsOverview,
} from "@/lib/admin/inference-orgs";

export type KeyView = ApiKeyRow & { state: KeyState; idle_days: number | null; risks: string[] };
export type MemberView = OrgMemberRow & { username: string | null };

export type OrgView = OrgRow & {
  summary: OrgSummary;
  members: MemberView[];
  keys: KeyView[];
  byok_keys: ByokKeyRow[];
};

export interface OrgsPayload {
  overview: OrgsOverview;
  usage_window: { rows: number; limit: number };
  orgs: OrgView[];
}

export type { ByokKeyRow, OrgsOverview };
