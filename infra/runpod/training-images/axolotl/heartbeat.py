#!/usr/bin/env python3
"""
Heartbeat daemon — posts every 30s to the control plane so the BullMQ
ft-runner can detect stalled / crashed training jobs.

Reads training progress from axolotl's trainer_state.json checkpoint files
to surface live step / loss / ETA. If no checkpoint exists yet (early in
training) just sends a "still alive" ping with empty stats.
"""
import base64
import glob
import hashlib
import hmac
import json
import os
import sys
import time
from urllib import request, error

JOB_ID = os.environ["JOB_ID"]
WEBHOOK_URL = os.environ["WEBHOOK_URL"].rstrip("/").replace(
    "/api/inference/fine-tuning/jobs/" + JOB_ID + "/webhook",
    "/api/inference/fine-tuning/jobs/" + JOB_ID + "/heartbeat",
)
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"].encode("utf-8")
INTERVAL_S = int(os.environ.get("HEARTBEAT_INTERVAL_S", "30"))
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/workspace/output")


def latest_checkpoint_state():
    """Read the most recent trainer_state.json (if any) for current step/loss."""
    states = sorted(glob.glob(f"{OUTPUT_DIR}/checkpoint-*/trainer_state.json"))
    if not states:
        return {}
    try:
        s = json.load(open(states[-1]))
        log_history = s.get("log_history", [])
        last_loss = next(
            (x["loss"] for x in reversed(log_history) if "loss" in x), None
        )
        return {
            "global_step": s.get("global_step"),
            "epoch": s.get("epoch"),
            "max_steps": s.get("max_steps"),
            "loss": last_loss,
        }
    except Exception:
        return {}


def post_heartbeat(payload: dict):
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sig = base64.b64encode(hmac.new(WEBHOOK_SECRET, body, hashlib.sha256).digest()).decode("ascii")

    req = request.Request(
        WEBHOOK_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Ahura-Webhook-Signature": sig,
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=5):
            pass
    except error.URLError as e:
        # Don't fail the training run because heartbeat POST failed —
        # the ft-runner will eventually time out and check pod status.
        print(f"heartbeat: post failed: {e}", file=sys.stderr)


def main():
    started_at = time.time()
    while True:
        time.sleep(INTERVAL_S)
        payload = {
            "job_id": JOB_ID,
            "uptime_seconds": int(time.time() - started_at),
            **latest_checkpoint_state(),
        }
        post_heartbeat(payload)


if __name__ == "__main__":
    main()
