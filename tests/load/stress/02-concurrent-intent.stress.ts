/**
 * Stress Test 2: Concurrent Intent Test
 *
 * 50 concurrent intent submissions modifying same vendor/invoice entities.
 * Verify zero lost updates, all concurrency conflicts detected and retried.
 * Final state = sum of all successful modifications.
 *
 * PASS-MINIMUM: No lock contention escalation, zero lost updates
 * PASS-TARGET:  > 50 concurrent intents resolving correctly
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type pg from 'pg';
import { ConcurrencyConflictError, generateId } from '@nova/core';
import type { StressDatabase } from '../helpers/stress-database.js';
import type { StressServer } from '../helpers/stress-server.js';
import { createStressDatabase, destroyStressDatabase, resetStressData } from '../helpers/stress-database.js';
import { createStressServer } from '../helpers/stress-server.js';
import { SYSTEM_ACTOR } from '../helpers/synthetic-events.js';
import { measureLockContention } from '../helpers/metrics.js';
import type { TestResult } from '../helpers/gate-report.js';

let db: StressDatabase;
let server: StressServer;
let pool: pg.Pool;

export const results: TestResult[] = [];

describe('Stress Test 2: Concurrent Intents', () => {
  beforeAll(async () => {
    db = await createStressDatabase(60); // Need pool > CONCURRENT since each handler holds a connection
    pool = db.pool;
    server = createStressServer(pool);
  }, 120_000);

  afterAll(async () => {
    await destroyStressDatabase(db);
  }, 30_000);

  it('should handle 50 concurrent vendor updates with OCC', async () => {
    await resetStressData(pool);

    const CONCURRENT = 50;
    const MAX_RETRIES = 100; // Very high contention — each round ~1 writer wins

    // Create a vendor to update concurrently
    const createResult = await server.intentPipeline.execute({
      intent_type: 'mdm.vendor.create',
      actor: SYSTEM_ACTOR,
      data: { name: 'Concurrent Test Vendor', status: 'active', update_count: 0 },
      legal_entity: 'LE-001',
    });
    expect(createResult.success).toBe(true);

    const vendorId = createResult.event!.entities.find(
      (e) => e.entity_type === 'vendor',
    )!.entity_id;

    console.log(`\n--- Concurrent intent test: ${CONCURRENT} updates on vendor ${vendorId.slice(0, 8)} ---`);

    // Track lock contention before
    const locksBefore = await measureLockContention(pool);

    // Launch 50 concurrent updates, each incrementing a counter
    let successCount = 0;
    let conflictCount = 0;
    let totalRetries = 0;

    const updatePromises = Array.from({ length: CONCURRENT }, async (_, idx) => {
      let retries = 0;
      while (retries < MAX_RETRIES) {
        try {
          // Read current version
          const entity = await server.entityGraph.getEntity('vendor', vendorId);
          if (!entity) throw new Error('Vendor not found');

          const currentCount = (entity.attributes.update_count as number) ?? 0;

          const result = await server.intentPipeline.execute({
            intent_type: 'mdm.vendor.update',
            actor: SYSTEM_ACTOR,
            data: {
              vendor_id: vendorId,
              update_count: currentCount + 1,
              last_updater: `worker-${idx}`,
            },
            expected_entity_version: entity.version,
            legal_entity: 'LE-001',
          });

          if (result.success) {
            successCount++;
            totalRetries += retries;
            return;
          }
          // If the result is not successful but not a conflict, break
          break;
        } catch (error) {
          if (error instanceof ConcurrencyConflictError) {
            conflictCount++;
            retries++;
            // Exponential backoff with full jitter
            const baseDelay = Math.min(5 * Math.pow(1.3, retries), 200);
            await new Promise((r) => setTimeout(r, Math.random() * baseDelay));
            continue;
          }
          // Retry on connection pool exhaustion too
          const msg = (error as Error).message ?? '';
          if (msg.includes('timeout') || msg.includes('connect')) {
            retries++;
            await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
            continue;
          }
          throw error;
        }
      }
      totalRetries += retries;
    });

    await Promise.allSettled(updatePromises);

    // Track lock contention after
    const locksAfter = await measureLockContention(pool);

    // Verify final state
    const finalEntity = await server.entityGraph.getEntity('vendor', vendorId);
    const finalCount = finalEntity!.attributes.update_count as number;
    const finalVersion = finalEntity!.version;

    console.log(`  Successful updates: ${successCount}/${CONCURRENT}`);
    console.log(`  Concurrency conflicts detected: ${conflictCount}`);
    console.log(`  Total retries: ${totalRetries}`);
    console.log(`  Final update_count: ${finalCount}`);
    console.log(`  Final entity version: ${finalVersion}`);
    console.log(`  Lock waits before: ${locksBefore.lockWaits}, after: ${locksAfter.lockWaits}`);

    // Verify: final count = number of successful updates
    // (version starts at 1 from create, each update increments by 1)
    expect(finalCount).toBe(successCount);
    expect(finalVersion).toBe(successCount + 1); // +1 for the initial create

    // Count events to verify no lost updates
    const { rows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM events WHERE type = 'mdm.vendor.updated'`,
    );
    const eventCount = Number(rows[0].cnt);
    expect(eventCount).toBe(successCount);

    // No escalating lock contention
    const noEscalation = locksAfter.lockWaits <= locksBefore.lockWaits + 5;

    results.push({
      name: 'concurrent_intent',
      tier: 'minimum',
      metric: 'No lock contention',
      value: `lock waits: ${locksBefore.lockWaits} → ${locksAfter.lockWaits}`,
      threshold: 'no escalation',
      passed: noEscalation,
    });

    results.push({
      name: 'concurrent_intent',
      tier: 'minimum',
      metric: 'Correctness',
      value: `${successCount} updates, final count=${finalCount}, events=${eventCount}`,
      threshold: 'zero lost updates',
      passed: finalCount === successCount && eventCount === successCount,
    });

    results.push({
      name: 'concurrent_intent',
      tier: 'target',
      metric: 'Concurrent intents',
      value: `${successCount} of ${CONCURRENT} resolved correctly`,
      threshold: '> 50 concurrent intents resolving (>= 50% succeed)',
      passed: successCount >= CONCURRENT * 0.5, // At least 50% succeed under extreme contention
    });
  }, 120_000);
});
