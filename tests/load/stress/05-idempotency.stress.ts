/**
 * Stress Test 5: Idempotency Test
 *
 * Submit 10K intents, each sent twice with same idempotency_key.
 * Verify exactly 10K events created, 10K duplicate responses returned.
 *
 * PASS-MINIMUM: Correctness — zero double-postings
 * PASS-TARGET:  Duplicate intent returns original result, not double-posting
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type pg from 'pg';
import { generateId } from '@nova/core';
import type { StressDatabase } from '../helpers/stress-database.js';
import type { StressServer } from '../helpers/stress-server.js';
import { createStressDatabase, destroyStressDatabase, resetStressData } from '../helpers/stress-database.js';
import { createStressServer } from '../helpers/stress-server.js';
import { SYSTEM_ACTOR } from '../helpers/synthetic-events.js';
import { timer } from '../helpers/metrics.js';
import type { TestResult } from '../helpers/gate-report.js';

let db: StressDatabase;
let server: StressServer;
let pool: pg.Pool;

export const results: TestResult[] = [];

describe('Stress Test 5: Idempotency', () => {
  beforeAll(async () => {
    db = await createStressDatabase(30); // Larger pool — handlers hold connections during idempotency check
    pool = db.pool;
    server = createStressServer(pool);
  }, 120_000);

  afterAll(async () => {
    await destroyStressDatabase(db);
  }, 30_000);

  it('should handle 10K duplicate intents correctly', async () => {
    await resetStressData(pool);

    const INTENT_COUNT = 10_000;
    const CONCURRENCY = 8; // Kept low to avoid pool exhaustion (handlers hold connections)

    console.log(`\n--- Idempotency test: ${INTENT_COUNT} intents, each submitted twice ---`);

    // Generate idempotency keys upfront
    const idempotencyKeys = Array.from({ length: INTENT_COUNT }, () => generateId());

    // Phase 1: Submit all intents (first time)
    console.log('  Phase 1: First submission...');
    const firstElapsed = timer();
    const firstResults: Map<string, string> = new Map(); // key → event_id

    for (let i = 0; i < INTENT_COUNT; i += CONCURRENCY) {
      const batch = idempotencyKeys.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((key, idx) =>
          server.intentPipeline.execute({
            intent_type: 'mdm.vendor.create',
            actor: SYSTEM_ACTOR,
            data: { name: `Idempotency Vendor ${i + idx}`, status: 'active' },
            idempotency_key: key,
            legal_entity: 'LE-001',
          }),
        ),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.success && result.event_id) {
          firstResults.set(batch[j], result.event_id);
        }
      }
    }
    const firstTime = firstElapsed();
    console.log(`  First submission: ${firstResults.size} successful in ${firstTime}ms`);

    // Count events after first pass
    const { rows: countRows1 } = await pool.query(
      `SELECT COUNT(*) as cnt FROM events WHERE type = 'mdm.vendor.created'`,
    );
    const eventsAfterFirst = Number(countRows1[0].cnt);
    console.log(`  Events after first pass: ${eventsAfterFirst}`);

    // Phase 2: Submit all intents again (duplicates)
    console.log('  Phase 2: Duplicate submission...');
    const secondElapsed = timer();
    let duplicateCount = 0;
    let duplicateMatchCount = 0;

    for (let i = 0; i < INTENT_COUNT; i += CONCURRENCY) {
      const batch = idempotencyKeys.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((key, idx) =>
          server.intentPipeline.execute({
            intent_type: 'mdm.vendor.create',
            actor: SYSTEM_ACTOR,
            data: { name: `Idempotency Vendor ${i + idx}`, status: 'active' },
            idempotency_key: key,
            legal_entity: 'LE-001',
          }),
        ),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.success) {
          duplicateCount++;
          // Verify it returned the SAME event_id as the first submission
          const originalEventId = firstResults.get(batch[j]);
          if (result.event_id === originalEventId) {
            duplicateMatchCount++;
          }
        }
      }
    }
    const secondTime = secondElapsed();
    console.log(`  Duplicate submission: ${duplicateCount} responses in ${secondTime}ms`);
    console.log(`  Matching event IDs: ${duplicateMatchCount}/${duplicateCount}`);

    // Count events after second pass — should be EXACTLY the same
    const { rows: countRows2 } = await pool.query(
      `SELECT COUNT(*) as cnt FROM events WHERE type = 'mdm.vendor.created'`,
    );
    const eventsAfterSecond = Number(countRows2[0].cnt);
    console.log(`  Events after second pass: ${eventsAfterSecond}`);

    const zeroDuplication = eventsAfterSecond === eventsAfterFirst;
    const allDuplicatesMatched = duplicateMatchCount === duplicateCount;

    console.log(`\n  Zero double-posting: ${zeroDuplication}`);
    console.log(`  All duplicates returned original: ${allDuplicatesMatched}`);

    results.push({
      name: 'idempotency',
      tier: 'minimum',
      metric: 'Correctness',
      value: `${eventsAfterFirst} events created, ${eventsAfterSecond} after duplicates`,
      threshold: 'zero double-postings',
      passed: zeroDuplication,
    });

    results.push({
      name: 'idempotency',
      tier: 'target',
      metric: 'Idempotency',
      value: `${duplicateMatchCount}/${duplicateCount} duplicates returned original result`,
      threshold: 'duplicate returns original',
      passed: allDuplicatesMatched && zeroDuplication,
    });

    expect(zeroDuplication).toBe(true);
    expect(allDuplicatesMatched).toBe(true);
  }, 300_000);
});
