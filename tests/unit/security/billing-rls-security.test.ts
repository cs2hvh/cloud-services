import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

function readSql(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

describe("Security: Billing RLS policies", () => {
  it("TC-BILL-SEC-002: should enforce RLS policies on billing.user_credits", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20260323_billing_rls_hardening.sql"
    );
    const sql = readSql(migrationPath);

    expect(sql).toMatch(/ALTER TABLE billing\.user_credits ENABLE ROW LEVEL SECURITY;/i);
    expect(sql).toMatch(
      /CREATE POLICY "Users can view their own credits"[\s\S]*ON billing\.user_credits[\s\S]*FOR SELECT[\s\S]*USING \(auth\.uid\(\) = user_id\);/i
    );
    expect(sql).toMatch(
      /CREATE POLICY "Service role can manage user credits"[\s\S]*ON billing\.user_credits[\s\S]*FOR ALL[\s\S]*USING \(auth\.role\(\) = 'service_role'\)[\s\S]*WITH CHECK \(auth\.role\(\) = 'service_role'\);/i
    );
    expect(sql).toMatch(/REVOKE ALL ON billing\.user_credits FROM authenticated;/i);
    expect(sql).toMatch(/GRANT SELECT ON billing\.user_credits TO authenticated;/i);
  });

  it("TC-BILL-SEC-002: should restrict billing.transactions writes to service_role only", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20260323_billing_rls_hardening.sql"
    );
    const sql = readSql(migrationPath);

    expect(sql).toMatch(/ALTER TABLE billing\.transactions ENABLE ROW LEVEL SECURITY;/i);
    expect(sql).toMatch(
      /CREATE POLICY "Users can view their own transactions"[\s\S]*ON billing\.transactions[\s\S]*FOR SELECT[\s\S]*USING \(auth\.uid\(\) = user_id\);/i
    );
    expect(sql).toMatch(
      /CREATE POLICY "Service role can manage transactions"[\s\S]*ON billing\.transactions[\s\S]*FOR ALL[\s\S]*USING \(auth\.role\(\) = 'service_role'\)[\s\S]*WITH CHECK \(auth\.role\(\) = 'service_role'\);/i
    );
    expect(sql).toMatch(/REVOKE ALL ON billing\.transactions FROM authenticated;/i);
    expect(sql).toMatch(/GRANT SELECT ON billing\.transactions TO authenticated;/i);
  });
});
