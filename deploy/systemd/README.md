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
