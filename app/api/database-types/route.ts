import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateEngineVersion } from "@/lib/validation/database";

/**
 * `database_types.versions` is edited straight in SQL — there is no admin UI —
 * while the create endpoints validate against the VALID_*_VERSIONS allowlists
 * in lib/validation/constants. The two drifted: the table advertised MySQL 8.4,
 * PostgreSQL 18 and MongoDB 8.0, none of which the allowlist accepts, so the
 * wizard let customers pick a version and configure a whole cluster before the
 * create call answered "Version 8.4 isn't available for the selected engine."
 *
 * Reconcile at read time so the picker can only ever offer versions that will
 * actually provision. An engine with nothing left is marked unavailable rather
 * than deleted from the response: the wizard already renders an unavailable
 * engine as a greyed, unclickable card, which tells the customer the engine
 * exists and is not orderable right now — strictly more informative than having
 * it vanish, and a visible signal to us that the row needs fixing. Drift is
 * logged either way so the table still gets corrected at the source.
 */
function withPurchasableVersions<T extends { code: string; versions: unknown; available?: boolean }>(
  rows: T[]
): Array<T & { versions: string[]; available: boolean }> {
  // Generic so the engine's other columns — name, description, icon_url — keep
  // their types on the way through; the wizard renders all of them.
  return rows.map((row) => {
    const declared = Array.isArray(row.versions) ? row.versions.map(String) : [];
    const supported = declared.filter((v) => validateEngineVersion(row.code, v));

    const rejected = declared.filter((v) => !supported.includes(v));
    if (rejected.length > 0) {
      console.warn(
        `[database-types] ${row.code}: database_types.versions offers ${rejected.join(", ")}, ` +
          `which the create endpoint rejects. Hiding those until the row is corrected.`
      );
    }

    if (supported.length === 0) {
      console.error(
        `[database-types] ${row.code} has no purchasable version ` +
          `(offers ${declared.join(", ") || "nothing"}) — marking it unavailable.`
      );
      // Keep the declared versions for the card's label so it still reads as
      // the engine the customer expects; `available: false` is what stops it
      // being selected, and the version dropdown never renders for a card that
      // cannot be clicked.
      return { ...row, versions: declared, available: false };
    }

    return { ...row, versions: supported, available: row.available ?? true };
  });
}

export async function GET() {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const supabase = await createClient();

    // Fetch all available database types with their versions
    const { data: databaseTypes, error } = await supabase
      .from("database_types")
      .select("*")
      .eq("available", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching database types:", error);
      return NextResponse.json(
        { error: "Failed to fetch database types" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: withPurchasableVersions(databaseTypes ?? []),
    });
  } catch (error) {
    console.error("Error in database-types API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
