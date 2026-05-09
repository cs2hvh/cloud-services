process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("ssh2");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const vmid = process.argv[2] || "104";
function ssh(host, cmd, t = 30000) {
  return new Promise((res, rej) => {
    const c = new Client();
    const tm = setTimeout(() => { c.end(); rej(new Error("timeout")); }, t);
    c.on("ready", () => {
      c.exec(cmd, (e, s) => {
        if (e) { clearTimeout(tm); c.end(); rej(e); return; }
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", () => { clearTimeout(tm); c.end(); res(o.trim()); });
      });
    });
    c.on("error", (e) => { clearTimeout(tm); rej(e); });
    c.connect({ host: new URL(host.host_url).hostname, port: 22, username: "root", password: host.password });
  });
}
(async () => {
  const { data: h } = await sb.from("proxmox_hosts").select("*").eq("is_active", true).limit(1).single();
  console.log("Stopping VM " + vmid + "...");
  await ssh(h, "qm stop " + vmid + " --skiplock 2>/dev/null || true");
  await new Promise(r => setTimeout(r, 3000));
  console.log("Destroying VM " + vmid + "...");
  await ssh(h, "qm destroy " + vmid + " --purge --skiplock");
  console.log("Done - VM " + vmid + " destroyed");
})();
