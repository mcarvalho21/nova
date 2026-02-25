/**
 * Phase 0 Exit Gate report generator.
 * Three-tier evaluation: PASS-MINIMUM, PASS-TARGET, PASS-STRETCH.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  tier: 'minimum' | 'target' | 'stretch';
  metric: string;
  value: string;
  threshold: string;
}

export interface GateReport {
  minimum: TestResult[];
  target: TestResult[];
  stretch: TestResult[];
  verdict: 'PASS-MINIMUM' | 'PASS-TARGET' | 'PASS-STRETCH' | 'FAIL';
}

export function evaluateGate(results: TestResult[]): GateReport {
  const minimum = results.filter((r) => r.tier === 'minimum');
  const target = results.filter((r) => r.tier === 'target');
  const stretch = results.filter((r) => r.tier === 'stretch');

  const minimumPassed = minimum.every((r) => r.passed);
  const targetPassed = target.every((r) => r.passed);
  const stretchPassed = stretch.every((r) => r.passed);

  let verdict: GateReport['verdict'] = 'FAIL';
  if (minimumPassed && targetPassed && stretchPassed) verdict = 'PASS-STRETCH';
  else if (minimumPassed && targetPassed) verdict = 'PASS-TARGET';
  else if (minimumPassed) verdict = 'PASS-MINIMUM';

  return { minimum, target, stretch, verdict };
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

export function formatGateReport(report: GateReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('PHASE 0 EXIT GATE REPORT');
  lines.push('========================');
  lines.push('');

  // TIER 1: PASS-MINIMUM
  lines.push('TIER: PASS-MINIMUM (architecture scales linearly, no pathological behavior)');
  for (const r of report.minimum) {
    const status = r.passed ? 'PASS' : 'FAIL';
    lines.push(`  ${padRight(r.metric + ':', 26)} ${status} (${r.value})`);
  }
  lines.push('');

  // TIER 2: PASS-TARGET
  lines.push('TIER: PASS-TARGET (meets stated NFR targets)');
  for (const r of report.target) {
    const status = r.passed ? 'PASS' : 'FAIL';
    lines.push(`  ${padRight(r.metric + ':', 26)} ${status} (${r.value})`);
  }
  lines.push('');

  // TIER 3: PASS-STRETCH
  lines.push('TIER: PASS-STRETCH (headroom beyond targets)');
  for (const r of report.stretch) {
    const status = r.passed ? 'PASS' : 'FAIL';
    lines.push(`  ${padRight(r.metric + ':', 26)} ${status} (${r.value})`);
  }
  lines.push('');

  // Verdict
  const verdictMessage =
    report.verdict === 'FAIL'
      ? 'FAIL. Minimum criteria not met. DO NOT PROCEED.'
      : report.verdict === 'PASS-MINIMUM'
        ? 'PASS-MINIMUM achieved. Architecture sound. Proceed with caution — target numbers should be verified on production hardware.'
        : report.verdict === 'PASS-TARGET'
          ? 'PASS-TARGET achieved. PROCEED TO PHASE 1.'
          : 'PASS-STRETCH achieved. Excellent headroom. PROCEED TO PHASE 1.';

  lines.push(`VERDICT: ${verdictMessage}`);
  lines.push('');
  lines.push('NOTE: Gate tests ARCHITECTURAL SOUNDNESS, not hardware-dependent numbers.');
  lines.push('If running on limited hardware: Pass-minimum (linear scaling) is sufficient');
  lines.push('to proceed. Pass-target numbers can be verified on production-grade hardware.');
  lines.push('');

  return lines.join('\n');
}
