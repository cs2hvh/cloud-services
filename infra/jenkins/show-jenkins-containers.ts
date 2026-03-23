#!/usr/bin/env tsx
/**
 * Jenkins Container Usage Report
 * Shows which containers are used by security stages and recommendations
 * 
 * Usage: npx tsx infra/jenkins/show-jenkins-containers.ts
 */

import { getContainerUsageReport } from '../../lib/jenkins/security';

const report = getContainerUsageReport();

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║          JENKINS POD TEMPLATE CONTAINER REPORT                    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

console.log('📦 CONTAINERS CURRENTLY IN JENKINS POD TEMPLATE:\n');
console.log('Pod Template: common-agent');
console.log('Location: Jenkins → Manage Jenkins → Clouds → linode-kube → common-agent\n');

Object.entries(report.inJenkins)
  .filter(([_, config]) => config.inJenkins)
  .forEach(([name, config]) => {
    console.log(`✅ ${config.name}`);
    console.log(`   Image: ${config.image}`);
    console.log(`   Resources: ${config.resources.limits.memory} / ${config.resources.limits.cpu} CPU`);
    console.log(`   Purpose: ${config.purpose}`);
    if (config.usedBySecurityStages.length > 0) {
      console.log(`   🔒 Security Stages: ${config.usedBySecurityStages.join(', ')}`);
    }
    console.log('');
  });

console.log('\n⚠️  CONTAINERS DOWNLOADED AT RUNTIME (NOT IN JENKINS):\n');

Object.entries(report.inJenkins)
  .filter(([_, config]) => !config.inJenkins)
  .forEach(([name, config]) => {
    const isRecommended = 'recommended' in config && (config as { recommended?: boolean }).recommended;
    console.log(`❌ ${config.name} (${isRecommended ? 'RECOMMENDED TO ADD' : 'OPTIONAL'})`);
    console.log(`   Image: ${config.image}`);
    console.log(`   Resources: ${config.resources.limits.memory} / ${config.resources.limits.cpu} CPU`);
    console.log(`   Purpose: ${config.purpose}`);
    console.log(`   🔒 Security Stages: ${config.usedBySecurityStages.join(', ')}`);
    const migration = (config as { migration?: { current?: string; benefit?: string } }).migration;
    if (migration) {
      console.log(`   📊 Current: ${migration.current || 'N/A'}`);
      console.log(`   💡 Benefit: ${migration.benefit || 'N/A'}`);
    }
    console.log('');
  });

console.log('\n🔍 SECURITY STAGE → CONTAINER MAPPING:\n');

Object.entries(report.stageMapping).forEach(([stage, mapping]) => {
  console.log(`${stage}:`);
  console.log(`   Primary Container: ${mapping.primary}`);
  if (mapping.downloads.length > 0) {
    console.log(`   Downloads at Runtime: ${mapping.downloads.join(', ')}`);
  }
  if (mapping.recommended) {
    console.log(`   ⭐ Recommended: Add '${mapping.recommended}' container to Jenkins`);
  }
  console.log(`   Note: ${mapping.notes}`);
  console.log('');
});

console.log('\n📋 RECOMMENDATIONS FOR JENKINS POD TEMPLATE:\n');

if (report.recommendations.length === 0) {
  console.log('✅ All recommended containers are already in Jenkins!\n');
} else {
  report.recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ADD CONTAINER: ${rec.container}`);
    console.log(`   Benefit: ${rec.benefit}`);
    console.log(`   \n   To add in Jenkins UI:`);
    console.log(`   - Navigate to: Manage Jenkins → Clouds → linode-kube → common-agent`);
    console.log(`   - Click "Add Container"`);
    console.log(`   - Name: ${rec.jenkinsConfig.containerTemplate.name}`);
    console.log(`   - Docker image: ${rec.jenkinsConfig.containerTemplate.image}`);
    console.log(`   - Command: ${rec.jenkinsConfig.containerTemplate.command}`);
    console.log(`   - Allocate pseudo-TTY: ✓`);
    console.log(`   - Working directory: ${rec.jenkinsConfig.containerTemplate.workingDir}`);
    console.log(`   \n   Raw YAML to add to "Raw YAML for the Pod":`);
    console.log(rec.jenkinsConfig.rawYaml);
    console.log('\n');
  });
}

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  TOTAL RESOURCE ALLOCATION (if all containers added):             ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const totalMemoryMi = Object.values(report.inJenkins).reduce((sum, config) => {
  const memStr = config.resources.limits.memory;
  const memMi = memStr.endsWith('Gi') 
    ? parseFloat(memStr) * 1024 
    : parseFloat(memStr);
  return sum + memMi;
}, 0);

const totalCpuCores = Object.values(report.inJenkins).reduce((sum, config) => {
  const cpuStr = config.resources.limits.cpu;
  const cpu = cpuStr.endsWith('m') 
    ? parseFloat(cpuStr) / 1000 
    : parseFloat(cpuStr);
  return sum + cpu;
}, 0);

const currentMemoryMi = Object.values(report.inJenkins)
  .filter(config => config.inJenkins)
  .reduce((sum, config) => {
    const memStr = config.resources.limits.memory;
    const memMi = memStr.endsWith('Gi') 
      ? parseFloat(memStr) * 1024 
      : parseFloat(memStr);
    return sum + memMi;
  }, 0);

const currentCpuCores = Object.values(report.inJenkins)
  .filter(config => config.inJenkins)
  .reduce((sum, config) => {
    const cpuStr = config.resources.limits.cpu;
    const cpu = cpuStr.endsWith('m') 
      ? parseFloat(cpuStr) / 1000 
      : parseFloat(cpuStr);
    return sum + cpu;
  }, 0);

console.log(`Current Allocation (in Jenkins now):`);
console.log(`   Memory: ${(currentMemoryMi / 1024).toFixed(2)} Gi`);
console.log(`   CPU: ${currentCpuCores.toFixed(2)} cores`);
console.log('');
console.log(`Total if All Recommended Added:`);
console.log(`   Memory: ${(totalMemoryMi / 1024).toFixed(2)} Gi`);
console.log(`   CPU: ${totalCpuCores.toFixed(2)} cores`);
console.log('');
console.log(`Additional Resources Needed:`);
console.log(`   Memory: +${((totalMemoryMi - currentMemoryMi) / 1024).toFixed(2)} Gi`);
console.log(`   CPU: +${(totalCpuCores - currentCpuCores).toFixed(2)} cores`);
console.log('');

console.log('💡 TIP: Adding hadolint and gitleaks containers will:');
console.log('   - Reduce build time by ~10-15 seconds (no runtime downloads)');
console.log('   - Improve supply-chain security (no wget downloads)');
console.log('   - Only cost ~384Mi memory total (minimal overhead)');
console.log('');
