/**
 * Services Index
 * Export all platform services
 */
export { DNSService } from './dns';
export { JenkinsService } from './jenkins';
export { BuildPollingService } from './build-polling';
export { PortAllocator } from './port-allocator';
export { DeploymentService } from './deployment';
export type { DeploymentConfig, DeploymentResult } from './deployment';
export type { BuildPollConfig, BuildPollResult } from './build-polling';
