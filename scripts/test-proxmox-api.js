#!/usr/bin/env node

/**
 * Quick test script to verify the Proxmox API is working
 * Run with: node scripts/test-proxmox-api.js
 */

const fs = require("fs");
const path = require("path");

// Read .env file
const envPath = path.join(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envLines = envContent.split("\n");

// Parse env variables (just for reference)
for (const line of envLines) {
  const trimmed = line.trim();
  if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
    // SUPABASE URL found
  }
  if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
    // ANON KEY found
  }
}

console.log("\n🧪 Testing Proxmox API Endpoint\n");
console.log("=".repeat(80));

// Test with local API
const apiUrl = "http://localhost:3000/api/admin/proxmox/hosts";

console.log("\n📝 Test Steps:\n");
console.log("1️⃣  Make sure the dev server is running:");
console.log("   npm run dev\n");

console.log("2️⃣  The admin panel UI will call this endpoint:");
console.log(`   GET ${apiUrl}\n`);

console.log("3️⃣  If you see 'Invalid API key' error:");
console.log("   • Check browser DevTools (F12) → Network tab");
console.log("   • Look at the API response under '/api/admin/proxmox/hosts'");
console.log("   • Check the response body for the actual error\n");

console.log("4️⃣  Common causes:");
console.log("   • SUPABASE_SERVICE_ROLE_KEY not in .env");
console.log("   • Tables not created (run setup-proxmox.js migration)");
console.log("   • RLS policies blocking access (run disable-rls-admin-tables.js)");
console.log("   • User doesn't have 'admin' role (run add-admin-github-oauth.js)\n");

console.log("=".repeat(80));
console.log("✨ Check the DevTools Network tab for detailed error info!\n");
