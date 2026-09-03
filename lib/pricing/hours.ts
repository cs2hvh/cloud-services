/**
 * Hours used to convert a monthly price into an hourly rate.
 *
 * Kept in its own leaf module, importing nothing, so that both the SERVER side
 * (the price book, which pulls in the service-role Supabase client) and the
 * CLIENT side (the GPU deploy wizard, which quotes storage in the browser) can
 * share one value. Importing it from price-book.ts instead would drag
 * @/lib/supabase/server into the client bundle.
 *
 * MUST equal billing.hours_in_month(). The quote and the charge are computed by
 * different code in different languages; the only thing keeping them honest is
 * that they divide by the same number.
 *
 * OPEN QUESTION — 720 vs 730. This is 720 (a flat 30-day month) and so is the
 * SQL. lib/paas/tiers.ts independently chose 730 (365 * 24 / 12) and argues,
 * correctly, that 720 collects 12.17 months of a monthly price over a
 * 8,760-hour year — 1.4% more than the price implies — and that 730 is what
 * Linode, DigitalOcean and AWS use. Sixty-nine of the seventy-two live price
 * rows are quoted per month and converted through this constant, so changing it
 * is a platform-wide pricing decision, not a refactor. Whoever settles it must
 * change this AND billing.hours_in_month() together.
 */
export const HOURS_IN_MONTH = 24 * 30;
