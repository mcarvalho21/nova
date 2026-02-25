/**
 * Phase 0 Exit Gate Report
 *
 * This file runs LAST (numerically after 01-08) and aggregates
 * all stress test results into the formatted gate report.
 *
 * Since all tests run in a single fork (vitest singleFork mode),
 * the exported result arrays from each test module are shared
 * via ES module live bindings.
 */
import { describe, it } from 'vitest';
import { evaluateGate, formatGateReport } from '../helpers/gate-report.js';
import type { TestResult } from '../helpers/gate-report.js';

// ES module live bindings — these reference the SAME arrays
// that the stress tests push results into
import { results as throughputResults } from './01-throughput.stress.js';
import { results as concurrentResults } from './02-concurrent-intent.stress.js';
import { results as lagResults } from './03-projection-lag.stress.js';
import { results as rebuildResults } from './04-projection-rebuild.stress.js';
import { results as idempotencyResults } from './05-idempotency.stress.js';
import { results as backdatedResults } from './06-back-dated-event.stress.js';
import { results as schemaResults } from './07-schema-migration.stress.js';
import { results as reconResults } from './08-reconciliation.stress.js';

describe('Phase 0 Exit Gate Report', () => {
  it('generates gate report', () => {
    const allResults: TestResult[] = [
      ...throughputResults,
      ...concurrentResults,
      ...lagResults,
      ...rebuildResults,
      ...idempotencyResults,
      ...backdatedResults,
      ...schemaResults,
      ...reconResults,
    ];

    if (allResults.length === 0) {
      console.log('\n⚠ No stress test results collected.');
      console.log('  This may happen if tests ran in separate processes.');
      console.log('  Review individual test output above for results.\n');
      return;
    }

    const report = evaluateGate(allResults);
    console.log(formatGateReport(report));
  });
});
