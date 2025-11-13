#!/usr/bin/env node

/**
 * Script to make a GitHub OAuth user an admin
 * GitHub OAuth users have different profile structure
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

console.log("\n🔐 Add Admin Role to GitHub OAuth User\n");
console.log("=".repeat(80));

// Note: SQL examples provided below


console.log("\n🔗 Your Supabase Project: " + projectRef);
console.log("\n📝 Steps for GitHub OAuth user:\n");

console.log("1️⃣  Open your Supabase dashboard:");
console.log(`   https://app.supabase.com/project/${projectRef}/sql/new\n`);

console.log("2️⃣  First, find your User ID by running this query:");
console.log("-".repeat(80));
console.log("   SELECT id, email FROM auth.users LIMIT 10;");
console.log("-".repeat(80));
console.log("   → Copy your user ID (the UUID)\n");

console.log("3️⃣  Then run this query (replace YOUR_USER_ID_HERE with your actual ID):");
console.log("-".repeat(80));
console.log("   UPDATE user_profiles");
console.log("   SET roles = array_append(COALESCE(roles, '{}'), 'admin')");
console.log("   WHERE id = 'YOUR_USER_ID_HERE'");
console.log("   AND NOT ('admin' = ANY(roles));");
console.log("-".repeat(80));
console.log("   → This adds the 'admin' role\n");

console.log("4️⃣  Verify it worked:");
console.log("-".repeat(80));
console.log("   SELECT id, roles FROM user_profiles WHERE id = 'YOUR_USER_ID_HERE';");
console.log("-".repeat(80));
console.log("   → You should see roles=['admin']\n");

console.log("5️⃣  Now try saving in the admin panel!\n");

console.log("=".repeat(80));
console.log("✨ After this, you'll have full admin access!\n");
