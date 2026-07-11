-- Activate CS2 + FiveM. PREREQUISITE (manual, done on the panel): import the
-- community eggs and note their nest/egg ids —
--   CS2:   pelican-eggs/games-steamcmd counter_strike_2  → nest 5, egg 15
--   FiveM: pelican-eggs/games-standalone gta/fivem        → nest 6, egg 16
-- Also relax the FiveM egg's FIVEM_LICENSE rule to max:64 (real cfx.re keys
-- exceed the egg default max:33) directly in the panel DB.
-- Both games are BYO-credential: STEAM_GSLT / FIVEM_LICENSE.

update public.game_catalog set
  nest_id = 5, egg_id = 15,
  docker_image = 'ghcr.io/parkervcp/steamcmd:sniper',
  startup = 'LD_LIBRARY_PATH=$HOME/game/bin/linuxsteamrt64:$LD_LIBRARY_PATH ./game/bin/linuxsteamrt64/cs2 -dedicated $( [ "$VAC_ENABLED" == "1" ] || printf %s '' -insecure'' ) -ip 0.0.0.0 -port {{SERVER_PORT}} -tv_port {{TV_PORT}} -maxplayers {{MAX_PLAYERS}} $( [ "$RCON_ENABLED" == "0" ] || printf %s '' -usercon'' ) +game_mode {{GAME_MODE}} +game_type {{GAME_TYPE}} +map {{SRCDS_MAP}} +hostname "{{SERVER_NAME}}" +sv_password "{{SERVER_PASSWORD}}" +rcon_password "{{RCON_PASSWORD}}" +sv_setsteamaccount {{STEAM_GSLT}}',
  default_environment = '{"AUTO_UPDATE":"1","RCON_ENABLED":"1","VAC_ENABLED":"1","GAME_MODE":"1","GAME_TYPE":"0","SRCDS_MAP":"de_dust2","SERVER_PASSWORD":"","SRCDS_APPID":"730","TV_PORT":"27020"}'::jsonb,
  env_schema = '[
    {"key":"STEAM_GSLT","label":"Steam GSLT token","required":true,"secret":true,"customer_editable":true,"default":"","help":"32-character token from steamcommunity.com/dev/managegameservers (app 730), tied to YOUR Steam account."},
    {"key":"SERVER_NAME","label":"Server name","required":true,"secret":false,"customer_editable":true,"default":"A CS2 Server"},
    {"key":"MAX_PLAYERS","label":"Max players","required":true,"secret":false,"customer_editable":true,"default":"12","help":"1-64"},
    {"key":"SRCDS_MAP","label":"Starting map","required":true,"secret":false,"customer_editable":true,"default":"de_dust2"}
  ]'::jsonb,
  port_plan = '[{"name":"sourcetv","proto":"udp","env":"TV_PORT"}]'::jsonb,
  credential_field = 'STEAM_GSLT', min_memory_mb = 2048, min_disk_gb = 60, requires_eula = false, is_active = true
where id = 'cs2';

update public.game_catalog set
  nest_id = 6, egg_id = 16,
  docker_image = 'ghcr.io/parkervcp/yolks:debian',
  startup = '$(pwd)/alpine/opt/cfx-server/ld-musl-x86_64.so.1 --library-path "$(pwd)/alpine/usr/lib/v8/:$(pwd)/alpine/lib/:$(pwd)/alpine/usr/lib/" -- $(pwd)/alpine/opt/cfx-server/FXServer +set citizen_dir $(pwd)/alpine/opt/cfx-server/citizen/ +set sv_licenseKey {{FIVEM_LICENSE}} +set steam_webApiKey {{STEAM_WEBAPIKEY}} +set sv_maxplayers {{MAX_PLAYERS}} $( [ "$TXADMIN_ENABLE" == "1" ] || printf %s ''+exec server.cfg'' )',
  default_environment = '{"FIVEM_VERSION":"recommended","STEAM_WEBAPIKEY":"none","TXADMIN_ENABLE":"1","TXHOST_TXA_PORT":"40120","TXHOST_GAME_NAME":"fivem","TXHOST_DATA_PATH":"/home/container/txData","DOWNLOAD_URL":"","GAME_TYPE":""}'::jsonb,
  env_schema = '[
    {"key":"FIVEM_LICENSE","label":"cfx.re license key","required":true,"secret":true,"customer_editable":true,"default":"","help":"Register at portal.cfx.re on YOUR own account. Keys are non-transferable and IP-bound."},
    {"key":"SERVER_HOSTNAME","label":"Server name","required":true,"secret":false,"customer_editable":true,"default":"My FXServer"},
    {"key":"MAX_PLAYERS","label":"Max players","required":true,"secret":false,"customer_editable":true,"default":"48","help":"Up to 48 on the free cfx tier; higher needs your own Element Club sub."}
  ]'::jsonb,
  port_plan = '[{"name":"txadmin","proto":"tcp","env":"TXHOST_TXA_PORT"}]'::jsonb,
  credential_field = 'FIVEM_LICENSE', min_memory_mb = 4096, min_disk_gb = 30, requires_eula = false, is_active = true
where id = 'fivem';

insert into public.game_server_plans
  (slug, game_type, name, tagline, cpu_pct, memory_mb, disk_gb, backups, extra_allocations, monthly_price, is_active, sort_order)
values
  ('cs2-standard','cs2','CS2 Standard','Competitive 5v5',200,3072,80,2,1,9.00,true,10),
  ('cs2-plus','cs2','CS2 Plus','128-tick / plugins',300,4096,90,2,1,14.00,true,11),
  ('fivem-4g','fivem','FiveM 4GB','Starter RP',300,4096,40,2,1,12.00,true,12),
  ('fivem-8g','fivem','FiveM 8GB','~64 players',400,8192,60,2,1,22.00,true,13),
  ('fivem-16g','fivem','FiveM 16GB','Script-heavy RP',600,16384,100,3,1,44.00,true,14)
on conflict (slug) do nothing;
