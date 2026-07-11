// Per-customer Pterodactyl panel accounts. Created lazily on first order and
// cached in game_panel_users; the encrypted password powers the dashboard
// "Panel access" card (link + username + password) and can be regenerated.

import { createServiceClient } from "@/lib/supabase/server";
import { Encryption } from "@/config/functions";
import { pterodactyl } from "@/lib/pterodactyl/client";

export interface PanelAccess {
  panelUrl: string;
  username: string;
  email: string;
  pteroUserId: number;
  /** Decrypted password, when one is stored (null for pre-existing panel users). */
  password: string | null;
}

function encryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not configured");
  return key;
}

function usernameFromEmail(email: string, userId: string): string {
  const local = (email.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  return `${local}_${userId.slice(0, 6)}`;
}

function encryptPassword(plain: string): string {
  return JSON.stringify(Encryption.encrypt(plain, encryptionKey()));
}

function decryptPassword(enc: string | null): string | null {
  if (!enc) return null;
  try {
    return Encryption.decrypt(JSON.parse(enc), encryptionKey());
  } catch {
    return null;
  }
}

/**
 * Ensure the platform user has a Pterodactyl panel account. Idempotent:
 * returns the cached mapping when present, otherwise finds-or-creates the
 * panel user and stores the (encrypted) generated password.
 */
export async function ensurePanelUser(params: {
  userId: string;
  email: string;
  fullName?: string | null;
}): Promise<PanelAccess> {
  const supabase = await createServiceClient();

  const { data: existing } = await supabase
    .from("game_panel_users")
    .select("ptero_user_id, username, email, password_enc")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existing) {
    return {
      panelUrl: pterodactyl.panelUrl(),
      username: existing.username,
      email: existing.email,
      pteroUserId: existing.ptero_user_id,
      password: decryptPassword(existing.password_enc),
    };
  }

  const [firstName, ...rest] = (params.fullName || params.email.split("@")[0] || "Customer").split(" ");
  const { user, password } = await pterodactyl.ensureUser({
    email: params.email,
    username: usernameFromEmail(params.email, params.userId),
    firstName: firstName || "Customer",
    lastName: rest.join(" ") || "User",
  });

  const { error } = await supabase.from("game_panel_users").insert({
    user_id: params.userId,
    ptero_user_id: user.id,
    username: user.username,
    email: user.email,
    password_enc: password ? encryptPassword(password) : null,
  });
  if (error && error.code !== "23505") {
    throw new Error(`Failed to store panel user mapping: ${error.message}`);
  }

  return {
    panelUrl: pterodactyl.panelUrl(),
    username: user.username,
    email: user.email,
    pteroUserId: user.id,
    password,
  };
}

/** Rotate the customer's panel password (also fixes pre-existing users with no stored password). */
export async function resetPanelPassword(userId: string): Promise<PanelAccess> {
  const supabase = await createServiceClient();
  const { data: row, error } = await supabase
    .from("game_panel_users")
    .select("ptero_user_id, username, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) throw new Error("No panel account found for this user");

  const [firstName, ...rest] = row.username.split("_");
  const password = await pterodactyl.resetUserPassword(row.ptero_user_id, {
    email: row.email,
    username: row.username,
    first_name: firstName || "Customer",
    last_name: rest.join(" ") || "User",
  });

  await supabase
    .from("game_panel_users")
    .update({ password_enc: encryptPassword(password), updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return {
    panelUrl: pterodactyl.panelUrl(),
    username: row.username,
    email: row.email,
    pteroUserId: row.ptero_user_id,
    password,
  };
}

/** Read panel access for the dashboard card (null if the user has no panel account yet). */
export async function getPanelAccess(userId: string): Promise<PanelAccess | null> {
  const supabase = await createServiceClient();
  const { data: row } = await supabase
    .from("game_panel_users")
    .select("ptero_user_id, username, email, password_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;
  return {
    panelUrl: pterodactyl.panelUrl(),
    username: row.username,
    email: row.email,
    pteroUserId: row.ptero_user_id,
    password: decryptPassword(row.password_enc),
  };
}
