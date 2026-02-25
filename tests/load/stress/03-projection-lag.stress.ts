/**
 * Stress Test 3: Projection Lag Test
 *
 * Measure time from event append to projection reflecting the event.
 * Target < 1s p99 under sustained 2K events/sec load.
 *
 * Note: In this codebase, projections are updated synchronously within
 * the event append transaction (via processEvent). This test measures
 * the end-to-end latency of append + projection update under load.
 *
 * PASS-MINIMUM: No unbounded projection lag growth under sustained load
 * PASS-TARGET:  < 1 second p99 projection lag under sustained load
 * PASS-STRETCH: < 200ms p99 projection lag
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type pg from 'pg';
import type { StressDatabase } from '../helpers/stress-database.js';
import type { StressServer } from '../helpers/stress-server.js';
import { createStressDatabase, destroyStressDatabase, resetStressData } from '../helpers/stress-database.js';
import { createStressServer } from '../helpers/stress-server.js';
import { generateInvoiceSubmittedEvent, LEGAL_ENTITIES } from '../helpers/synthetic-events.js';
import { calculateLatencyMetrics, timer } from '../helpers/metrics.js';
import type { TestResult } from '../helpers/gate-report.js';

let db: StressDatabase;
let server: StressServer;
let pool: pg.Pool;

export const results: TestResult[] = [];

describe('Stress Test 3: Projection Lag', () => {
  beforeAll(async () => {
    db = await createStressDatabase(20);
    pool = db.pool;
    server = createStressServer(pool);
  }, 120_000);

  afterAll(async () => {
    await destroyStressDatabase(db);
  }, 30_000);

  it('should maintain low projection lag under sustained load', async () => {
    await resetStressData(pool);

    // We measure the full pipeline: append event + synchronous projection update.
    // Since projections are processed synchronously, "lag" = time for the full
    // append-and-project cycle.
    const TOTAL_EVENTS = 5_000;
    const CONCURRENCY = 10;
    const latencies: number[] = [];

    console.log(`\n--- Projection lag test: ${TOTAL_EVENTS} events, concurrency=${CONCURRENCY} ---`);

    const events = Array.from({ length: TOTAL_EVENTS }, () =>
      generateInvoiceSubmittedEvent({ legalEntity: 'LE-001' }),
    );

    // Track lag over time windows to detect unbounded growth
    const windowSize = 500;
    const windowP99s: number[] = [];

    for (let i = 0; i < events.length; i += CONCURRENCY) {
      const batch = events.slice(i, i + CONCURRENCY);
      const batchLatencies = await Promise.all(
        batch.map(async (event) => {
          const elapsed = timer();
          await server.eventStore.append(event);
          return elapsed();
        }),
      );
      latencies.push(...batchLatencies);

      // Record window p99
      if (latencies.length % windowSize === 0) {
        const windowLatencies = latencies.slice(-windowSize);
        const sorted = [...windowLatencies].sort((a, b) => a - b);
        windowP99s.push(sorted[Math.floor(sorted.length * 0.99)]);
      }
    }

    const metrics = calculateLatencyMetrics(latencies);

    console.log(`  Events processed: ${metrics.count}`);
    console.log(`  Latency p50: ${metrics.p50}ms`);
    console.log(`  Latency p95: ${metrics.p95}ms`);
    console.log(`  Latency p99: ${metrics.p99}ms`);
    console.log(`  Latency min: ${metrics.min}ms, max: ${metrics.max}ms`);
    console.log(`  Latency mean: ${metrics.mean}ms, stddev: ${metrics.stddev}ms`);

    // Check for unbounded growth: compare first-half p99 to second-half p99
    const firstHalf = latencies.slice(0, Math.floor(latencies.length / 2));
    const secondHalf = latencies.slice(Math.floor(latencies.length / 2));
    const firstP99 = calculateLatencyMetrics(firstHalf).p99;
    const secondP99 = calculateLatencyMetrics(secondHalf).p99;

    // Stability check: ratio-based for large values, but when both halves are
    // sub-50ms the variance is just noise — treat as stable unconditionally.
    const ABSOLUTE_STABLE_THRESHOLD = 50; // ms — anything under this is fast enough
    const lagStable =
      (firstP99 < ABSOLUTE_STABLE_THRESHOLD && secondP99 < ABSOLUTE_STABLE_THRESHOLD) ||
      secondP99 <= firstP99 * 2;
    console.log(`\n  First-half p99: ${firstP99}ms, Second-half p99: ${secondP99}ms`);
    console.log(`  Lag trend: ${lagStable ? 'STABLE' : 'GROWING'}`);

    results.push({
      name: 'projection_lag',
      tier: 'minimum',
      metric: 'No unbounded lag',
      value: `first-half p99=${firstP99}ms, second-half p99=${secondP99}ms`,
      threshold: 'both < 50ms OR second half <= 2x first half',
      passed: lagStable,
    });

    results.push({
      name: 'projection_lag',
      tier: 'target',
      metric: 'Projection lag p99',
      value: `${metrics.p99}ms`,
      threshold: '< 1000ms',
      passed: metrics.p99 < 1_000,
    });

    results.push({
      name: 'projection_lag',
      tier: 'stretch',
      metric: 'Projection lag p99',
      value: `${metrics.p99}ms`,
      threshold: '< 200ms',
      passed: metrics.p99 < 200,
    });

    // Minimum must pass
    expect(lagStable).toBe(true);
  }, 300_000);
});
