// Default Linux cloud-init vendor snippet deployed to every Proxmox
// host as `/var/lib/vz/snippets/linux-cloud-init.yml`. The VM-create
// flow references it as `vendor=<storage>:snippets/linux-cloud-init.yml`
// in the `cicustom` config of every Linux VM, so it must exist on
// every host that provisions VMs.
//
// What it does inside the freshly-cloned VM:
//   1. Enables PasswordAuthentication on sshd so the dashboard's
//      generated SSH password actually works for the user.
//   2. Writes a persistent netplan (`99-static.yaml`) with an on-link
//      route to the /32 OVH gateway — the only working pattern when
//      the VM holds a single /32 public IP and the gateway lives on a
//      different subnet (the OVH HG Scale / vMAC failover model).
//   3. Does the equivalent NetworkManager dance for CentOS / RHEL /
//      AlmaLinux / Rocky.
//   4. Disables cloud-init's own network management on second boot so
//      the persistent netplan isn't overwritten.
//
// Keep this file in sync with scripts/deploy-snippet.js — the script
// embeds the same content for bulk deployment from CLI.

export const DEFAULT_LINUX_CLOUD_INIT_SNIPPET = `#cloud-config
ssh_pwauth: true
write_files:
  - path: /etc/ssh/sshd_config.d/99-cloud-init-pwauth.conf
    content: |
      PasswordAuthentication yes
    owner: root:root
    permissions: '0644'
runcmd:
  - mkdir -p /etc/ssh/sshd_config.d
  - sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
  - systemctl restart ssh 2>/dev/null; systemctl restart sshd 2>/dev/null; true
  - |
    # Fix /32 gateway routing for OVH-style routed IPs
    GW=$(grep -oP 'gateway4: \\K[0-9.]+' /etc/netplan/50-cloud-init.yaml 2>/dev/null)
    [ -z "$GW" ] && GW=$(grep -oP 'via \\K[0-9.]+' /etc/netplan/50-cloud-init.yaml 2>/dev/null | head -1)
    [ -z "$GW" ] && GW=$(grep -oP 'Gateway=\\K[0-9.]+' /run/systemd/network/*.network 2>/dev/null | head -1)
    DEV=$(ip -o link show | awk -F': ' '/ether/{print $2; exit}')
    if [ -n "$GW" ] && [ -n "$DEV" ]; then
      ip route replace $GW/32 dev $DEV 2>/dev/null
      ip route replace default via $GW dev $DEV onlink 2>/dev/null
    fi
    if [ -n "$GW" ] && [ -n "$DEV" ] && [ -d /etc/netplan ]; then
      MYIP=$(ip -4 addr show $DEV | grep -oP 'inet \\K[0-9./]+' | head -1)
      MAC=$(ip link show $DEV | grep -oP 'link/ether \\K[0-9a-f:]+')
      DNS1=$(grep -oP 'nameserver \\K[0-9.]+' /etc/resolv.conf 2>/dev/null | sed -n '1p')
      DNS2=$(grep -oP 'nameserver \\K[0-9.]+' /etc/resolv.conf 2>/dev/null | sed -n '2p')
      [ -z "$DNS1" ] && DNS1="1.1.1.1"
      [ -z "$DNS2" ] && DNS2="8.8.8.8"
      cat > /etc/netplan/99-static.yaml <<NETEOF
    network:
      version: 2
      ethernets:
        $DEV:
          addresses:
          - $MYIP
          match:
            macaddress: $MAC
          nameservers:
            addresses:
            - $DNS1
            - $DNS2
          routes:
          - to: $GW/32
            scope: link
          - to: 0.0.0.0/0
            via: $GW
            on-link: true
          set-name: $DEV
    NETEOF
      chmod 600 /etc/netplan/99-static.yaml
      rm -f /etc/netplan/50-cloud-init.yaml
      mkdir -p /etc/cloud/cloud.cfg.d
      echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
      netplan apply 2>/dev/null || true
    fi
    if [ -n "$GW" ] && [ -n "$DEV" ] && command -v nmcli >/dev/null 2>&1 && ! [ -d /etc/netplan ]; then
      CONN=$(nmcli -t -f NAME,DEVICE con show --active | grep ":$DEV$" | head -1 | cut -d: -f1)
      if [ -n "$CONN" ]; then
        nmcli con mod "$CONN" ipv4.routes "0.0.0.0/0 $GW" ipv4.route-metric 100 2>/dev/null
        nmcli con mod "$CONN" ipv4.gateway "$GW" 2>/dev/null
        nmcli con up "$CONN" 2>/dev/null || true
      fi
      mkdir -p /etc/cloud/cloud.cfg.d
      echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
    fi
`;

export const DEFAULT_LINUX_CLOUD_INIT_FILENAME = "linux-cloud-init.yml";
