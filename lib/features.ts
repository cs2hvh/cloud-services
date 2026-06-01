/**
 * Feature flags for platform features.
 * Set to true to enable, false to disable.
 * All original implementation code is preserved — flip the flag when ready.
 */

// Bandwidth packs (one-time GB top-ups). Disabled while on DigitalOcean droplets
// with fixed network limits. Re-enable when on infra with metered egress or better cost control.
export const BANDWIDTH_PACKS_ENABLED = false;
