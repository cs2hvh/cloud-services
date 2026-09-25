-- "No cost basis" is NULL, not "equal to the billed cost".
--
-- The consumer's old convention for a request whose backend cost it did not
-- know was upstream_cost_cents = cost_cents. The admin-panel session showed
-- (2026-09-25) that this is indistinguishable from the rounding floor: a
-- sub-cent request bills 1 c and costs 1 c, which is 5,205 of 5,210 "equal"
-- Starimg rows over three days. A marker that collides with a real value is
-- not a marker. NULL cannot collide, needs no convention to decode, and
-- SUM/AVG exclude it by default instead of counting it as zero margin.
--
-- The ten audn rows written before the consumer stopped borrowing another
-- partner's rate (b2ed79e9) carried abliteration's cost; they are nulled.

begin;

alter table inference.usage alter column upstream_cost_cents drop not null;
alter table inference.usage alter column upstream_cost_cents drop default;

comment on column inference.usage.upstream_cost_cents is
  'What the serving backend charged us, in cents, from the partner''s own rate. NULL = no cost basis recorded (our own pods, or a partner with no rate set at the time). Never equal-to-cost as a marker: sub-cent requests round both columns to 1.';

update inference.usage
   set upstream_cost_cents = null
 where provider = 'audn'
   and created_at < '2026-09-25 15:40:00+00';

commit;
