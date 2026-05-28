#!/usr/bin/env bash
# Common bootstrap for AhuraCloud GPU pod images.
#
# The platform injects SSH credentials as env at pod-create time
# (see lib/services/runpod/operations/pod-lifecycle-operations.ts):
#   PUBLIC_KEY     - SSH public key, appended to root's authorized_keys
#   ROOT_PASSWORD  - optional root password (enables password SSH)
#
# Each image sets SERVICE_CMD to its long-running service (jupyter / vllm /
# comfyui). If SERVICE_CMD is empty the container stays up on SSH only.
#
# NOTE (brand): this script and image are AhuraCloud's own. They contain no
# upstream-provider names. Keep it that way — nothing here should echo the
# compute vendor.

set -euo pipefail
log() { echo "[ahura-init $(date -Iseconds)] $*"; }

# ─── SSH access ──────────────────────────────────────────────────────
mkdir -p /root/.ssh && chmod 700 /root/.ssh

if [ -n "${PUBLIC_KEY:-}" ]; then
    # Append (don't clobber) so a pod can carry more than one key.
    grep -qxF "$PUBLIC_KEY" /root/.ssh/authorized_keys 2>/dev/null \
        || echo "$PUBLIC_KEY" >> /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
    log "Installed injected SSH public key"
fi

if [ -n "${ROOT_PASSWORD:-}" ]; then
    echo "root:${ROOT_PASSWORD}" | chpasswd
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
    log "Root password authentication enabled"
fi

sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
# Host keys are generated on first boot if the image didn't ship them.
ssh-keygen -A >/dev/null 2>&1 || true
mkdir -p /run/sshd
/usr/sbin/sshd
log "sshd listening on :22"

# ─── Service ─────────────────────────────────────────────────────────
if [ -n "${SERVICE_CMD:-}" ]; then
    log "Launching service"
    # `bash -lc` so SERVICE_CMD can reference runtime env (MODEL, tokens, …).
    exec bash -lc "${SERVICE_CMD}"
else
    log "No service configured — holding open for SSH"
    exec sleep infinity
fi
