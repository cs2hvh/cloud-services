process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://xafjjpgazdxhktpfeuri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmpqcGdhemR4aGt0cGZldXJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjA1ODU3MiwiZXhwIjoyMDY3NjM0NTcyfQ.lWrNK4jO0xM0j9Hcb-0i8rhojswcCuh_-Qbg80RoKqE"
);

async function main() {
  const { data: hosts } = await sb.from("proxmox_hosts").select("id,host_url,node,storage,bridge,username").eq("is_active", true);
  console.log("HOSTS:", JSON.stringify(hosts, null, 2));

  const { data: templates } = await sb.from("proxmox_templates").select("vmid,name,os_type,os_display_name,is_active").order("vmid");
  console.log("TEMPLATES:", JSON.stringify(templates, null, 2));

  process.exit(0);
}
main();
