# Worklogs

One file per session-day. Where the architecture docs describe the system as it
is, these describe how it got that way: what was asked, what was found, what
changed (commit shas, migration versions as applied), how it was verified, what
was deliberately not done, what was got wrong, and what is still open and whose
call it is.

| Date | Lane | File |
|---|---|---|
| 2026-09-03 | Lead: billing spine, security, scheduling, observability | [2026-09-03-lead-billing-and-security.md](2026-09-03-lead-billing-and-security.md) |
| 2026-09-03 | Compute/billing lane: GPU frozen rate, reconcile leak, migration recovery, admin repo | [2026-09-03-gpu-and-compute-lane.md](2026-09-03-gpu-and-compute-lane.md) |

Conventions are the same as [docs/architecture](../architecture/README.md):
verified against the running system with the date and the numbers seen, gaps
listed rather than omitted, incidents named by cost, mistakes recorded rather
than amended away.
