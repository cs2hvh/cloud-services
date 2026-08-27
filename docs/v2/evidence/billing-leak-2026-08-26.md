# The billing leak — what it was, what was done

## What it was

`billing.active_platform_apps.service_id` referenced `public.platform_apps(id)`
by convention only: **no foreign key, no cascade**. Deleting an app destroyed the
app row and left the meter running forever.

The delete path made it worse rather than causing it:

```
.delete().eq("service_id", X).eq("user_id", Y)
```

where `Y` is the **caller's** id. An admin deleting someone else's app matches
zero rows — and a delete that removes nothing reports success. Same shape as
every other defect on this project: an operation that examined nothing and
called it done.

## What it cost

**$543.17 across 26,329 transactions, 3 users**, for apps that no longer exist.

| user | charges | total |
|---|---|---|
| `ab6bf954` | 70 | $6.62 |
| `ccf391ef` | 1,046 | $28.55 |
| `fa9e8802` | 25,213 | $508.00 |

A first pass reported **$55.44** because PostgREST caps at 1,000 rows per page.
Full pagination gives the real figure. *A truncated read looks exactly like a
complete one.*

`acac0191` bills at `0.277778/h` ($200/mo), a rate matching **no product** in the
catalogue — highest is `xxlarge` at `0.415278`, next is `xlarge` at `0.083333`.
Either rates were hand-edited once, or a resize wrote a rate from a product row
since changed. Unresolved.

## What was done — 2026-08-26

1. **Snapshotted** all five meter rows to `orphaned-meters-2026-08-26.json`
   before touching anything.
2. **Terminated** all five (`status='terminated'`). Every read in
   `lib/supabase/queries/billing.ts` filters `.eq("status","active")`, so this
   halts billing everywhere. Verified: 5 total, 0 active.
   - `status='stopped'` was tried first and the database **refused it** — the
     CHECK allows only `active`, `paused`, `terminated`. The constraint caught a
     guess that would have left them billing.
   - Rows kept rather than deleted. Deleting is what the code does normally and
     would erase which meters leaked, which is what a refund needs.
3. **Added the missing FK**, `ON DELETE CASCADE`, `NOT VALID`. New rows are
   checked from now on; the terminated orphans are tolerated as evidence. The
   database now enforces what the code intended, so a meter cannot survive its
   app regardless of which user id the caller passes.

## Still open — the user's call

- **The $543.17 refund.** Not executed. Money movement is not something this
  session performs.
- **The delete-path user id.** The FK makes the meter die with the app, so the
  leak is closed either way; the wrong-user-id bug still means an admin delete
  reports success while removing nothing. v1 code — worth fixing only if v1 is
  staying.
- **The `0.277778/h` rate with no matching product.**
