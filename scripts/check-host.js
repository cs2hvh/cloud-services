process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { createClient } = require("@supabase/supabase-js");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: hosts } = await sb.from("proxmox_hosts").select("id,host_url,node,storage,bridge,username").eq("is_active", true);
  console.log("HOSTS:", JSON.stringify(hosts, null, 2));

  const { data: templates } = await sb.from("proxmox_templates").select("vmid,name,os_type,os_display_name,is_active").order("vmid");
  console.log("TEMPLATES:", JSON.stringify(templates, null, 2));

  process.exit(0);
}
main();
