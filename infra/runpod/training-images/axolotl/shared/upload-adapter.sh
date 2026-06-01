#!/usr/bin/env bash
# Upload the trained adapter directory to R2.
#
#   ./upload-adapter.sh <local_dir> <r2_prefix>
#
# Example:
#   ./upload-adapter.sh /workspace/output r2://ahura-ft-adapters/<org_id>/<job_id>/
#
# Uploads:
#   - All adapter_*.safetensors / adapter_config.json / chat_template
#   - tokenizer.json + tokenizer_config.json
#   - training_args.bin
#   - The final checkpoint-*/trainer_state.json for loss curve

set -euo pipefail

SRC="${1:?missing source dir}"
DEST="${2:?missing destination URL (r2://bucket/path/)}"

[[ ! -d "$SRC" ]] && { echo "ERROR: source dir $SRC does not exist"; exit 1; }

# Strip scheme
SCHEME="${DEST%%://*}"
REST="${DEST#*://}"
BUCKET="${REST%%/*}"
PREFIX="${REST#*/}"

# Trailing slash on prefix is required for directory-style uploads
[[ "${PREFIX: -1}" != "/" ]] && PREFIX="${PREFIX}/"

echo "Uploading $SRC -> $SCHEME://$BUCKET/$PREFIX"

cat > /tmp/rclone.conf <<EOF
[remote]
type = s3
provider = ${SCHEME^^}
access_key_id = ${R2_ACCESS_KEY_ID}
secret_access_key = ${R2_SECRET_ACCESS_KEY}
endpoint = ${R2_ENDPOINT}
acl = private
EOF

# Filter — include only the artifacts a serving stack needs
rclone --config /tmp/rclone.conf copy "$SRC" "remote:$BUCKET/$PREFIX" \
    --include "adapter_*.safetensors" \
    --include "adapter_config.json" \
    --include "chat_template.json" \
    --include "tokenizer.json" \
    --include "tokenizer_config.json" \
    --include "tokenizer.model" \
    --include "special_tokens_map.json" \
    --include "training_args.bin" \
    --include "checkpoint-*/trainer_state.json" \
    --transfers 4 \
    --retries 3 \
    --stats 5s

echo "Upload complete"
