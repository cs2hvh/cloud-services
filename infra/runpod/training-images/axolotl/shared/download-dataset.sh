#!/usr/bin/env bash
# Download a dataset from one of: https://, s3://, r2://
#
#   ./download-dataset.sh <url> <local_path>
#
# Required env (for s3/r2):
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT

set -euo pipefail

URL="${1:?missing dataset URL}"
OUT="${2:?missing local path}"

mkdir -p "$(dirname "$OUT")"

case "$URL" in
    https://*|http://*)
        echo "Downloading via HTTP"
        curl -fsSL --retry 3 --retry-delay 2 -o "$OUT" "$URL"
        ;;
    s3://*|r2://*)
        SCHEME="${URL%%://*}"
        REST="${URL#*://}"
        BUCKET="${REST%%/*}"
        KEY="${REST#*/}"

        echo "Downloading from $SCHEME://$BUCKET/$KEY"

        # Configure rclone for R2 / S3-compat on the fly
        cat > /tmp/rclone.conf <<EOF
[remote]
type = s3
provider = ${SCHEME^^}
access_key_id = ${R2_ACCESS_KEY_ID}
secret_access_key = ${R2_SECRET_ACCESS_KEY}
endpoint = ${R2_ENDPOINT}
acl = private
EOF

        rclone --config /tmp/rclone.conf copyto "remote:$BUCKET/$KEY" "$OUT" --retries 3
        ;;
    *)
        echo "ERROR: unsupported URL scheme in $URL" >&2
        exit 1
        ;;
esac

# Verify the file landed
if [ ! -s "$OUT" ]; then
    echo "ERROR: dataset file is empty or missing: $OUT" >&2
    exit 1
fi

BYTES=$(wc -c < "$OUT")
LINES=$(wc -l < "$OUT")
echo "Downloaded $OUT — $BYTES bytes, $LINES lines"
