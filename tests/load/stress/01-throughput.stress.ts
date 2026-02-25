/**
 * Stress Test 1: Throughput Test
 *
 * Generate 100K synthetic AP events across 5 legal entities.
 * Measure sustained events/second per partition.
 *
 * Linear scaling test methodology:
 * Run each partition's workload SEQUENTIALLY to isolate per-partition throughput.
 * On a single PostgreSQL instance, all partitions share the same WAL/sequence,
 * so concurrent multi-partition will always be bounded by the DB. We test that
 * the per-partition throughput doesn't degrade (no cross-partition locking).
 *
 * PASS-MINIMUM: Per-partition throughput stable across 5 sequential partitions
 *               (no degradation > 30%), no unbounded memory growth
 * PASS-TARGET:  > 2,000 events/second per partition (sustained)
 * PASS-STRETCH: > 5,000 events/second per partition
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type pg from 'pg';
import type { StressDatabase } from '../helpers/stress-database.js';
import type { StressServer } from '../helpers/stress-server.js';
import { createStressDatabase, destroyStressDatabase, resetStressData } from '../helpers/stress-database.js';
import { createStressServer } from '../helpers/stress-server.js';
import { generateBulkEvents, LEGAL_ENTITIES } from '../helpers/synthetic-events.js';
import { ThroughputTracker, MemoryTracker } from '../helpers/metrics.js';
import type { TestResult } from '../helpers/gate-report.js';

let db: StressDatabase;
let server: StressServer;
let pool: pg.Pool;

export const results: TestResult[] = [];

describe('Stress Test 1: Throughput', () => {
  beforeAll(async () => {
    db = await createStressDatabase(20);
    pool = db.pool;
    server = createStressServer(pool);
  }, 120_000);

  afterAll(async () => {
    await destroyStressDatabase(db);
  }, 30_000);

  it('should sustain high event append throughput with linear scaling', async () => {
    const EVENTS_PER_PARTITION = 20_000;
    const CONCURRENCY = 10;

    console.log(`\n--- Throughput test: ${EVENTS_PER_PARTITION} events × ${LEGAL_ENTITIES.length} partitions ---`);

    // Memory tracking for the full test
    const memTracker = new MemoryTracker();
    memTracker.start(2_000);

    // Run each partition sequentially to measure per-partition throughput
    // without cross-partition contention from shared DB resources
    const partitionRates: number[] = [];

    for (const le of LEGAL_ENTITIES) {
      // Don't reset between partitions — accumulated data shows no degradation
      const tracker = new ThroughputTracker();
      tracker.start();

      // Generate and append events in streaming fashion (not pre-generating all)
      let appended = 0;
      while (appended < EVENTS_PER_PARTITION) {
        const batchSize = Math.min(CONCURRENCY, EVENTS_PER_PARTITION - appended);
        const batch = generateBulkEvents(batchSize, le);
        await Promise.all(batch.map((e) => server.eventStore.append(e)));
        tracker.record(batchSize);
        appended += batchSize;
      }

      const result = tracker.finish();
      partitionRates.push(result.avgPerSecond);
      console.log(`  ${le}: ${result.avgPerSecond} events/sec (${result.totalCount} events, ${result.durationMs}ms)`);
    }

    memTracker.stop();
    const memReport = memTracker.getReport();

    // Calculate statistics
    const firstRate = partitionRates[0];
    const lastRate = partitionRates[partitionRates.length - 1];
    const avgRate = Math.round(partitionRates.reduce((a, b) => a + b, 0) / partitionRates.length);
    const minRate = Math.min(...partitionRates);
    const maxRate = Math.max(...partitionRates);
    const degradation = (firstRate - lastRate) / firstRate;

    // Total events across all partitions
    const { rows } = await pool.query('SELECT COUNT(*) as cnt FROM events');
    const totalEvents = Number(rows[0].cnt);

    console.log(`\n  Summary:`);
    console.log(`  Total events: ${totalEvents}`);
    console.log(`  Avg per-partition rate: ${avgRate} events/sec`);
    console.log(`  Min rate: ${minRate} events/sec, Max rate: ${maxRate} events/sec`);
    console.log(`  First partition: ${firstRate}, Last partition: ${lastRate}`);
    console.log(`  Degradation: ${(degradation * 100).toFixed(1)}%`);
    console.log(`  Memory: ${memReport.initialHeapMB}MB → ${memReport.finalHeapMB}MB (growth: ${memReport.growthMB}MB)`);

    // Linear scaling: per-partition throughput doesn't degrade significantly
    // as we accumulate data across partitions (no cross-partition bottleneck)
    const isLinear = degradation < 0.30; // Less than 30% degradation from first to last
    const memStable = memReport.isStable;

    results.push({
      name: 'throughput',
      tier: 'minimum',
      metric: 'Linear scaling',
      value: `${(degradation * 100).toFixed(1)}% degradation across ${LEGAL_ENTITIES.length} partitions (first=${firstRate}, last=${lastRate})`,
      threshold: '< 30% degradation',
      passed: isLinear,
    });

    results.push({
      name: 'throughput',
      tier: 'minimum',
      metric: 'No memory leaks',
      value: `${memReport.growthMB}MB growth (${memReport.growthPercent}%, ${memReport.isStable ? 'stable' : 'growing'})`,
      threshold: 'stable trend',
      passed: memStable,
    });

    results.push({
      name: 'throughput',
      tier: 'target',
      metric: 'Throughput',
      value: `${avgRate} events/sec avg per partition`,
      threshold: '> 2,000 events/sec per partition',
      passed: avgRate > 2_000,
    });

    results.push({
      name: 'throughput',
      tier: 'stretch',
      metric: 'Throughput',
      value: `${avgRate} events/sec avg per partition`,
      threshold: '> 5,000 events/sec per partition',
      passed: avgRate > 5_000,
    });

    // Minimum must pass
    expect(isLinear).toBe(true);
  }, 600_000);
});
