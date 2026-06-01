#!/usr/bin/env tsx
/**
 * Export Jenkins Container Configuration as JSON
 * 
 * Usage: 
 *   npx tsx infra/jenkins/export-jenkins-containers.ts > jenkins-containers.json
 *   npx tsx infra/jenkins/export-jenkins-containers.ts --format=yaml > jenkins-containers.yaml
 */

import { getContainerUsageReport } from '../../lib/jenkins/security';

const args = process.argv.slice(2);
const format = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'json';

const report = getContainerUsageReport();

if (format === 'json') {
  console.log(JSON.stringify(report, null, 2));
} else if (format === 'yaml') {
  // Simple YAML output for Jenkins
  console.log('# Jenkins Pod Template Container Configuration');
  console.log('# Add these containers to: Manage Jenkins → Clouds → linode-kube → common-agent');
  console.log('');
  console.log('# Current containers (already in Jenkins):');
  
  Object.entries(report.inJenkins)
    .filter(([_, config]) => config.inJenkins)
    .forEach(([name, config]) => {
      console.log(`\n# ${config.name} - ${config.purpose}`);
      console.log(`- name: ${config.name}`);
      console.log(`  image: ${config.image}`);
      console.log(`  resources:`);
      console.log(`    requests:`);
      console.log(`      memory: "${config.resources.requests.memory}"`);
      console.log(`      cpu: "${config.resources.requests.cpu}"`);
      console.log(`    limits:`);
      console.log(`      memory: "${config.resources.limits.memory}"`);
      console.log(`      cpu: "${config.resources.limits.cpu}"`);
    });
  
  console.log('\n\n# Recommended containers to add:');
  
  Object.entries(report.inJenkins)
    .filter(([_, config]) => !config.inJenkins && 'recommended' in config && (config as { recommended?: boolean }).recommended)
    .forEach(([name, config]) => {
      console.log(`\n# ${config.name} - ${config.purpose}`);
      console.log(`# Benefit: ${(config as { migration?: { benefit?: string } }).migration?.benefit || 'N/A'}`);
      console.log(`- name: ${config.name}`);
      console.log(`  image: ${config.image}`);
      console.log(`  resources:`);
      console.log(`    requests:`);
      console.log(`      memory: "${config.resources.requests.memory}"`);
      console.log(`      cpu: "${config.resources.requests.cpu}"`);
      console.log(`    limits:`);
      console.log(`      memory: "${config.resources.limits.memory}"`);
      console.log(`      cpu: "${config.resources.limits.cpu}"`);
    });
} else if (format === 'markdown') {
  console.log('# Jenkins Container Configuration Report\n');
  console.log('## Current Containers in Jenkins\n');
  console.log('| Container | Image | Memory Limit | CPU Limit | Purpose | Security Stages |');
  console.log('|-----------|-------|--------------|-----------|---------|-----------------|');
  
  Object.entries(report.inJenkins)
    .filter(([_, config]) => config.inJenkins)
    .forEach(([name, config]) => {
      const stages = config.usedBySecurityStages.length > 0 
        ? config.usedBySecurityStages.join(', ') 
        : 'None';
      console.log(`| ${config.name} | ${config.image} | ${config.resources.limits.memory} | ${config.resources.limits.cpu} | ${config.purpose} | ${stages} |`);
    });
  
  console.log('\n## Recommended Containers to Add\n');
  console.log('| Container | Image | Memory Limit | CPU Limit | Purpose | Benefit |');
  console.log('|-----------|-------|--------------|-----------|---------|---------|');
  
  Object.entries(report.inJenkins)
    .filter(([_, config]) => !config.inJenkins && 'recommended' in config && (config as { recommended?: boolean }).recommended)
    .forEach(([name, config]) => {
      const benefit = (config as { migration?: { benefit?: string } }).migration?.benefit || '';
      console.log(`| ${config.name} | ${config.image} | ${config.resources.limits.memory} | ${config.resources.limits.cpu} | ${config.purpose} | ${benefit} |`);
    });
  
  console.log('\n## Security Stage Container Mapping\n');
  console.log('| Security Stage | Primary Container | Downloads at Runtime | Recommended Action |');
  console.log('|----------------|-------------------|----------------------|-------------------|');
  
  Object.entries(report.stageMapping).forEach(([stage, mapping]) => {
    const downloads = mapping.downloads.length > 0 ? mapping.downloads.join(', ') : 'None';
    const action = mapping.recommended ? `Add '${mapping.recommended}' container` : 'No action needed';
    console.log(`| ${stage} | ${mapping.primary} | ${downloads} | ${action} |`);
  });
}
