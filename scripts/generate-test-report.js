/**
 * Generate Excel Test Case Report from Vitest JSON results.
 * Usage: node scripts/generate-test-report.js
 *
 * Reads: test-results.json (produced by vitest --reporter=json)
 * Writes: TEST_CASE_REPORT.xlsx
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const JSON_FILE = path.join(ROOT, 'test-results.json');
const OUTPUT = path.join(ROOT, 'TEST_CASE_REPORT.xlsx');

// ─── Service & type classification ───────────────────────────────────

function classifyFile(relPath) {
  const p = relPath.replace(/\\/g, '/').toLowerCase();

  // Test type
  let testType = 'Unit';
  if (p.includes('integration/api/security') || p.includes('unit/security'))
    testType = 'Security';
  else if (p.includes('tests/components/') || p.includes('/components/'))
    testType = 'Component';
  else if (p.includes('integration/')) testType = 'Integration';

  // Service
  let service = 'General';

  if (p.includes('auth-mfa') || p.includes('mfa'))
    service = 'Authentication (MFA)';
  else if (
    p.includes('auth-signup') ||
    p.includes('auth-signin') ||
    p.includes('auth-change-password') ||
    p.includes('auth-forgot-password') ||
    p.includes('auth-profile')
  )
    service = 'Authentication';
  else if (p.includes('admin-kubernetes'))
    service = 'Admin - Kubernetes';
  else if (p.includes('admin-databases'))
    service = 'Admin - Databases';
  else if (p.includes('admin-audit'))
    service = 'Admin - Audit Logs';
  else if (p.includes('admin-users') || p.includes('admin-products'))
    service = 'Admin - Users & Products';
  else if (
    p.includes('database') ||
    p.includes('connection-string') ||
    p.includes('validation/database')
  )
    service = 'Database';
  else if (p.includes('kubernetes') || p.includes('validation/kubernetes') || p.includes('cluster'))
    service = 'Kubernetes';
  else if (p.includes('object-storage') || p.includes('validation/object-storage'))
    service = 'Object Storage';
  else if (p.includes('platform-app') || p.includes('validation/platform-app'))
    service = 'Platform Apps';
  else if (p.includes('spectrum') || p.includes('validation/spectrum'))
    service = 'Spectrum';
  else if (p.includes('billing') || p.includes('coupon') || p.includes('credits') || p.includes('pricing'))
    service = 'Billing';
  else if (p.includes('webhook'))
    service = 'Webhooks';
  else if (p.includes('git-github') || p.includes('git-bitbucket') || p.includes('git-gitlab'))
    service = 'Git Integrations';
  else if (p.includes('notification'))
    service = 'Notifications';
  else if (p.includes('project'))
    service = 'Projects';
  else if (p.includes('rate-limit'))
    service = 'Rate Limiting';
  else if (p.includes('dns'))
    service = 'DNS';
  else if (p.includes('build-polling'))
    service = 'Build Polling';
  else if (p.includes('deployment'))
    service = 'Deployment';
  else if (p.includes('app-status'))
    service = 'App Status';
  else if (p.includes('crypto') || p.includes('middleware-security'))
    service = 'Security';
  else if (p.includes('webhook'))
    service = 'Webhooks';
  else if (p.includes('route-auth') || p.includes('admin-privilege'))
    service = 'Security';
  else if (p.includes('info-disclosure') || p.includes('input-validation'))
    service = 'Security';

  return { service, testType };
}

function extractTestId(fullName) {
  // Match patterns like TC-DB-001, SEC-CRYPTO-001, TC-AUTH-001 etc.
  const m = fullName.match(/((?:TC|SEC)-[A-Z]+-\d+)/);
  return m ? m[1] : '';
}

function severityFromType(testType) {
  if (testType === 'Security') return 'Critical';
  if (testType === 'Integration') return 'High';
  if (testType === 'Component') return 'High';
  return 'Medium';
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(JSON_FILE)) {
    console.error('test-results.json not found – run tests first with --reporter=json --outputFile=test-results.json');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));

  // ── Collect rows ──
  const rows = [];
  let serial = 0;

  for (const suite of data.testResults) {
    const relPath = suite.name
      .replace(/\\/g, '/')
      .split('cloud-services/')[1] || suite.name;

    // Skip E2E tests
    if (relPath.toLowerCase().includes('/e2e/')) continue;

    const { service, testType } = classifyFile(relPath);

    for (const t of suite.assertionResults) {
      serial++;

      const ancestors = t.ancestorTitles || [];
      const fullName = t.fullName || '';
      const testId = extractTestId(fullName) || extractTestId(ancestors.join(' '));
      const description = t.title || '';
      const suiteName = ancestors.length > 0 ? ancestors[ancestors.length - 1] : '';
      const status = t.status === 'passed' ? 'Pass' : t.status === 'failed' ? 'Fail' : t.status === 'skipped' ? 'Skipped' : t.status;
      const duration = typeof t.duration === 'number' ? `${t.duration.toFixed(1)}ms` : '-';
      const failureMsg =
        t.failureMessages && t.failureMessages.length > 0
          ? t.failureMessages[0].split('\n')[0].substring(0, 200)
          : '';

      rows.push({
        serial,
        testId: testId || `T-${String(serial).padStart(4, '0')}`,
        service,
        testType,
        suiteName,
        description,
        precondition: testType === 'Security' ? 'Auth/Config mocked' : testType === 'Integration' ? 'API mocked via vi.mock' : 'Module imported',
        expectedResult: status === 'Pass' ? 'As expected' : 'Defect found',
        status,
        priority: severityFromType(testType),
        duration,
        failureMessage: failureMsg,
        filePath: relPath,
      });
    }
  }

  console.log(`Collected ${rows.length} test cases (excluding E2E)`);

  // ── Build workbook ──
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cloud Services QA';
  wb.created = new Date();

  // ━━━ Summary Sheet ━━━
  const summary = wb.addWorksheet('Summary', {
    properties: { tabColor: { argb: '4472C4' } },
  });

  summary.columns = [
    { header: 'Metric', key: 'metric', width: 35 },
    { header: 'Value', key: 'value', width: 20 },
  ];

  const totalPass = rows.filter((r) => r.status === 'Pass').length;
  const totalFail = rows.filter((r) => r.status === 'Fail').length;
  const totalSkip = rows.filter((r) => r.status === 'Skipped').length;

  const summaryData = [
    { metric: 'Project', value: 'Cloud Services Platform' },
    { metric: 'Report Generated', value: new Date().toISOString().split('T')[0] },
    { metric: 'Test Framework', value: 'Vitest' },
    { metric: 'Total Test Cases', value: rows.length },
    { metric: 'Passed', value: totalPass },
    { metric: 'Failed', value: totalFail },
    { metric: 'Skipped', value: totalSkip },
    { metric: 'Pass Rate (%)', value: rows.length ? `${((totalPass / rows.length) * 100).toFixed(1)}%` : '0%' },
    { metric: '', value: '' },
    { metric: 'Breakdown by Service', value: '' },
  ];

  // Per-service breakdown
  const serviceMap = {};
  for (const r of rows) {
    if (!serviceMap[r.service]) serviceMap[r.service] = { total: 0, pass: 0, fail: 0 };
    serviceMap[r.service].total++;
    if (r.status === 'Pass') serviceMap[r.service].pass++;
    if (r.status === 'Fail') serviceMap[r.service].fail++;
  }
  for (const [svc, counts] of Object.entries(serviceMap).sort((a, b) => b[1].total - a[1].total)) {
    summaryData.push({ metric: `  ${svc}`, value: `${counts.pass}/${counts.total} passed` });
  }

  summaryData.push({ metric: '', value: '' });
  summaryData.push({ metric: 'Breakdown by Test Type', value: '' });

  const typeMap = {};
  for (const r of rows) {
    if (!typeMap[r.testType]) typeMap[r.testType] = { total: 0, pass: 0, fail: 0 };
    typeMap[r.testType].total++;
    if (r.status === 'Pass') typeMap[r.testType].pass++;
    if (r.status === 'Fail') typeMap[r.testType].fail++;
  }
  for (const [typ, counts] of Object.entries(typeMap).sort((a, b) => b[1].total - a[1].total)) {
    summaryData.push({ metric: `  ${typ}`, value: `${counts.pass}/${counts.total} passed` });
  }

  summary.addRows(summaryData);

  // Style summary header
  summary.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  // Bold section headers
  summary.eachRow((row, idx) => {
    if (idx === 1) return;
    const val = row.getCell(1).value;
    if (typeof val === 'string' && (val.includes('Breakdown') || val === 'Project')) {
      row.getCell(1).font = { bold: true, size: 11 };
    }
  });

  // ━━━ Test Cases Sheet ━━━
  const sheet = wb.addWorksheet('Test Cases', {
    properties: { tabColor: { argb: '70AD47' } },
  });

  sheet.columns = [
    { header: 'S.No', key: 'serial', width: 7 },
    { header: 'Test Case ID', key: 'testId', width: 16 },
    { header: 'Service / Module', key: 'service', width: 24 },
    { header: 'Test Type', key: 'testType', width: 14 },
    { header: 'Test Suite', key: 'suiteName', width: 38 },
    { header: 'Test Description', key: 'description', width: 60 },
    { header: 'Pre-Condition', key: 'precondition', width: 24 },
    { header: 'Expected Result', key: 'expectedResult', width: 18 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Duration', key: 'duration', width: 12 },
    { header: 'Failure Reason', key: 'failureMessage', width: 50 },
    { header: 'File Path', key: 'filePath', width: 55 },
  ];

  // Header style
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  sheet.getRow(1).height = 30;

  // Freeze header
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Auto-filter
  sheet.autoFilter = {
    from: 'A1',
    to: `M1`,
  };

  // Add data rows
  for (const r of rows) {
    const row = sheet.addRow(r);

    // Status color
    const statusCell = row.getCell('status');
    if (r.status === 'Pass') {
      statusCell.font = { bold: true, color: { argb: '006100' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } };
    } else if (r.status === 'Fail') {
      statusCell.font = { bold: true, color: { argb: '9C0006' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } };
    } else {
      statusCell.font = { bold: true, color: { argb: '9C6500' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } };
    }

    // Priority color
    const prioCell = row.getCell('priority');
    if (r.priority === 'Critical') {
      prioCell.font = { bold: true, color: { argb: 'FFFFFF' } };
      prioCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C00000' } };
    } else if (r.priority === 'High') {
      prioCell.font = { bold: true, color: { argb: 'FFFFFF' } };
      prioCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ED7D31' } };
    } else {
      prioCell.font = { bold: true };
      prioCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC000' } };
    }

    // Test type color
    const typeCell = row.getCell('testType');
    if (r.testType === 'Security') {
      typeCell.font = { color: { argb: 'FFFFFF' } };
      typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7030A0' } };
    } else if (r.testType === 'Integration') {
      typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E2F3' } };
    } else {
      typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } };
    }

    // Border all cells
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'D9D9D9' } },
        left: { style: 'thin', color: { argb: 'D9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
        right: { style: 'thin', color: { argb: 'D9D9D9' } },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  }

  // ━━━ Failed Tests Sheet ━━━
  const failedRows = rows.filter((r) => r.status === 'Fail');
  if (failedRows.length > 0) {
    const failSheet = wb.addWorksheet('Failed Tests', {
      properties: { tabColor: { argb: 'FF0000' } },
    });

    failSheet.columns = [
      { header: 'S.No', key: 'serial', width: 7 },
      { header: 'Test Case ID', key: 'testId', width: 16 },
      { header: 'Service / Module', key: 'service', width: 24 },
      { header: 'Test Type', key: 'testType', width: 14 },
      { header: 'Test Description', key: 'description', width: 60 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Failure Reason', key: 'failureMessage', width: 80 },
      { header: 'File Path', key: 'filePath', width: 55 },
    ];

    failSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C00000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    failSheet.views = [{ state: 'frozen', ySplit: 1 }];

    let fSerial = 0;
    for (const r of failedRows) {
      fSerial++;
      const row = failSheet.addRow({ ...r, serial: fSerial });
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'D9D9D9' } },
          left: { style: 'thin', color: { argb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
          right: { style: 'thin', color: { argb: 'D9D9D9' } },
        };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      const statusCell = row.getCell('status');
      statusCell.font = { bold: true, color: { argb: '9C0006' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } };
    }
  }

  // ━━━ Service Coverage Sheet ━━━
  const covSheet = wb.addWorksheet('Service Coverage', {
    properties: { tabColor: { argb: 'FFC000' } },
  });

  covSheet.columns = [
    { header: 'Service / Module', key: 'service', width: 28 },
    { header: 'Total Tests', key: 'total', width: 14 },
    { header: 'Passed', key: 'pass', width: 12 },
    { header: 'Failed', key: 'fail', width: 12 },
    { header: 'Skipped', key: 'skip', width: 12 },
    { header: 'Pass Rate', key: 'rate', width: 14 },
    { header: 'Test Types', key: 'types', width: 30 },
  ];

  covSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  covSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const covMap = {};
  for (const r of rows) {
    if (!covMap[r.service])
      covMap[r.service] = { total: 0, pass: 0, fail: 0, skip: 0, types: new Set() };
    covMap[r.service].total++;
    covMap[r.service].types.add(r.testType);
    if (r.status === 'Pass') covMap[r.service].pass++;
    else if (r.status === 'Fail') covMap[r.service].fail++;
    else covMap[r.service].skip++;
  }

  for (const [svc, c] of Object.entries(covMap).sort((a, b) => b[1].total - a[1].total)) {
    const rate = c.total ? ((c.pass / c.total) * 100).toFixed(1) + '%' : '0%';
    const row = covSheet.addRow({
      service: svc,
      total: c.total,
      pass: c.pass,
      fail: c.fail,
      skip: c.skip,
      rate,
      types: [...c.types].join(', '),
    });

    // Color the pass rate
    const rateCell = row.getCell('rate');
    const pct = parseFloat(rate);
    if (pct === 100) {
      rateCell.font = { bold: true, color: { argb: '006100' } };
      rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } };
    } else if (pct >= 80) {
      rateCell.font = { bold: true, color: { argb: '9C6500' } };
      rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } };
    } else {
      rateCell.font = { bold: true, color: { argb: '9C0006' } };
      rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } };
    }

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'D9D9D9' } },
        left: { style: 'thin', color: { argb: 'D9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
        right: { style: 'thin', color: { argb: 'D9D9D9' } },
      };
      cell.alignment = { vertical: 'middle' };
    });
  }

  // ── Save ──
  await wb.xlsx.writeFile(OUTPUT);
  console.log(`\n✅ Report saved to: ${OUTPUT}`);
  console.log(`   Sheets: Summary | Test Cases (${rows.length}) | Failed Tests (${failedRows.length}) | Service Coverage (${Object.keys(covMap).length} services)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
