# Billing v2 systemd units

## Install

```bash
cp /root/cloud-services/deploy/systemd/ahura-billing-sweep.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ahura-billing-sweep.timer
systemctl list-timers ahura-billing-sweep.timer
```

## Retire the old cron

`ahura-cron.service` has been crash-looping since 2026-08-24 (`MODULE_NOT_FOUND`
— its worker was deleted from `dev` and the deploy wiped it). It must **not** be
restarted: it bills from `billing.active_*`, whose rates include the poisoned
meters found in the audit, and it caps a billing window at 24h and *charges the
cap*.

```bash
systemctl disable --now ahura-cron.service
```

## What it does when there are no prices

Nothing, loudly. With an empty `billing.service_pricing` the sweep returns
`no-price` for every meter, charges zero, and exits 1. It is therefore safe to
enable before prices are seeded — it starts billing the moment they land,
rather than needing someone to remember to turn it on.

## Checking it

```bash
systemctl list-timers ahura-billing-sweep.timer      # when it next runs
journalctl -u ahura-billing-sweep -n 50 --no-pager   # what it did
```

The authoritative check is not this unit, though — it is the dead-man
(`.github/workflows/billing-deadman.yml`), which asks the *database* whether
billing has stopped. An observer running on this host cannot report that this
host is down, which is exactly how six days of unbilled usage went unnoticed.

# Build worker

## Install (one-time, per host)

```bash
cp /root/cloud-services/deploy/systemd/ahura-build-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ahura-build-worker
systemctl status ahura-build-worker --no-pager
```

## Why it needed a unit

It did not have one. The worker ran as an unmanaged process, and `deploy.sh`
restarts only `ahura-web` and `ahura-cron` — so every change to the build path
deployed green and never ran. Between 2026-08-27 and 2026-09-01 that included
the build-time secret mount, the customer-facing error wording, and the
Next.js `output:'standalone'` layout. A customer's failed build surfaced it,
not any check we had.

`deploy.sh` now restarts this service too, and warns loudly when it is missing
rather than skipping in silence.

## Checking it

```bash
systemctl status ahura-build-worker --no-pager
journalctl -u ahura-build-worker -n 50 --no-pager   # "queue empty" every ~20 idle passes
```

The worker prints `queue empty` periodically on purpose: a worker with no
output is indistinguishable from a dead one. If the journal is silent, it is
not idle — it is gone.

## Confirming it actually picked up new code

Status says nothing about which revision is running. Deploy, then check that a
fresh build reflects the change — e.g. a Next.js app's generated Dockerfile
should carry `--mount=type=secret,id=ahura-env` on its build step. A green
deploy is not evidence.
