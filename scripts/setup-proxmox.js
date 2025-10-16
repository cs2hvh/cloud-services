#!/usr/bin/env node

/**
 * Script to display instructions for applying the Proxmox migration
 * Run with: node scripts/setup-proxmox.js
 */

const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = supabaseUrl ? supabaseUrl.split("/")[3] : "YOUR_PROJECT_REF";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

console.log("\n📋 Proxmox Migration Setup\n");
console.log("=".repeat(80));

try {
  const migrationPath = path.join(__dirname, "../supabase/migrations/20240115_add_proxmox_tables.sql");

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  console.log("\n🔗 Your Supabase Project: " + projectRef);
  console.log("\n📝 Follow these steps to apply the migration:\n");

  console.log("1️⃣  Open your Supabase dashboard:");
  console.log(`   https://app.supabase.com/project/${projectRef}/sql/new\n`);

  console.log("2️⃣  Copy the SQL below and paste it into the SQL editor:\n");
  console.log("-".repeat(80));
  console.log(migrationSQL);
  console.log("-".repeat(80));

  console.log("\n3️⃣  Click 'Run' to execute the migration\n");
  console.log("4️⃣  After execution, your admin panel will work correctly!\n");

  console.log("=".repeat(80));
  console.log("✨ Migration ready to apply!\n");
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}
