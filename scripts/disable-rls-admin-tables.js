#!/usr/bin/env node

/**
 * Script to disable RLS on admin infrastructure tables
 * This allows the service role key to work without policy restrictions
 * Run with: node scripts/disable-rls-admin-tables.js
 */

const fs = require("fs");
const path = require("path");

// Read .env file manually
const envPath = path.join(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envLines = envContent.split("\n");

let supabaseUrl = "";
let serviceRoleKey = "";

for (const line of envLines) {
  const trimmed = line.trim();
  if (trimmed.startsWith("SUPABASE_URL=") && !trimmed.startsWith("NEXT_PUBLIC")) {
    const value = trimmed.substring("SUPABASE_URL=".length).trim();
    supabaseUrl = value.replace(/^["']|["']$/g, "");
  }
  if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
    const value = trimmed.substring("SUPABASE_SERVICE_ROLE_KEY=".length).trim();
    serviceRoleKey = value.replace(/^["']|["']$/g, "");
  }
}

const projectRef = supabaseUrl 
  ? supabaseUrl.split("/")[2].split(".")[0]
  : "YOUR_PROJECT_REF";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

console.log("\n📋 Disable RLS on Admin Infrastructure Tables\n");
console.log("=".repeat(80));

const disableRlsSql = `
-- Disable RLS on admin infrastructure tables (service role can still access)
-- This allows the admin API to work without complex RLS policies

ALTER TABLE proxmox_hosts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public_ip_pools DISABLE ROW LEVEL SECURITY;
ALTER TABLE public_ip_pool_ips DISABLE ROW LEVEL SECURITY;
ALTER TABLE proxmox_templates DISABLE ROW LEVEL SECURITY;

-- Note: 'servers' table keeps RLS enabled for user data protection
-- Only admin infrastructure management tables have RLS disabled
`;

console.log("\n🔗 Your Supabase Project: " + projectRef);
console.log("\n📝 Follow these steps:\n");

console.log("1️⃣  Open your Supabase dashboard:");
console.log(`   https://app.supabase.com/project/${projectRef}/sql/new\n`);

console.log("2️⃣  Copy this SQL and paste it into the SQL editor:\n");
console.log("-".repeat(80));
console.log(disableRlsSql);
console.log("-".repeat(80));

console.log("\n3️⃣  Click 'Run' to execute\n");
console.log("4️⃣  Now your admin panel will work!\n");

console.log("=".repeat(80));
console.log("✨ This will allow the admin API to save Proxmox host configuration!\n");
