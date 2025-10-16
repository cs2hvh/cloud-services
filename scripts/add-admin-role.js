#!/usr/bin/env node

/**
 * Script to make the current user an admin
 * This needs to be run from Supabase SQL editor since it uses auth context
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

console.log("\n🔐 Add Admin Role to User\n");
console.log("=".repeat(80));

const adminSql = `
-- Add admin role to a user by email
-- Replace 'your-email@example.com' with your actual email

UPDATE user_profiles
SET roles = array_append(COALESCE(roles, '{}'), 'admin')
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com')
AND NOT ('admin' = ANY(roles));

-- Verify the update
SELECT id, email, roles FROM user_profiles 
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
`;

console.log("\n🔗 Your Supabase Project: " + projectRef);
console.log("\n📝 Steps to add yourself as admin:\n");

console.log("1️⃣  Open your Supabase dashboard:");
console.log(`   https://app.supabase.com/project/${projectRef}/sql/new\n`);

console.log("2️⃣  Copy this SQL and paste it into the SQL editor:");
console.log("   (Replace 'your-email@example.com' with your actual email)\n");
console.log("-".repeat(80));
console.log(adminSql);
console.log("-".repeat(80));

console.log("\n3️⃣  Click 'Run' to execute\n");
console.log("4️⃣  You should see a row returned with roles=['admin']\n");
console.log("5️⃣  Now try saving in the admin panel!\n");

console.log("=".repeat(80));
console.log("✨ After this, you'll have full admin access!\n");
