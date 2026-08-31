-- Two kinds app-deploy-3 declined to record rather than file under a heading
-- that would have misdescribed them. That was right, and the fix is more enum
-- values, not looser ones.
--
--   expired   — a build VM alive past its deadline. The ROW IS CORRECT; the
--               reaper failed. Recording it as `stale` would assert the control
--               plane is lying when it is telling the truth.
--   claimable — a hostname resolving to the gateway with nothing routing it.
--               A security finding: another tenant's Ingress can claim it.
--               Filing it under a spend heading buries it.
--
-- Separate migration because a new enum value cannot be USED in the same
-- transaction that adds it.
alter type paas.drift_kind add value if not exists 'expired';
alter type paas.drift_kind add value if not exists 'claimable';
