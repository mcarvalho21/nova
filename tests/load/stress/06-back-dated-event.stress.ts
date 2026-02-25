/**
 * Stress Test 6: Back-Dated Event Test
 *
 * Create snapshots, post back-dated invoice to prior period,
 * verify snapshot invalidated and projections corrected.
 *
 * PASS-MINIMUM: Correctness — snapshots invalidated, projections corrected
 * PASS-TARGET:  Affected snapshots invalidated, projections corrected within 5 seconds
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

describe('Stress Test 6: Back-Dated Events', () => {
  beforeAll(async () => {
    db = await createStressDatabase(20);
    pool = db.pool;
    server = createStressServer(pool);
  }, 120_000);

  afterAll(async () => {
    await destroyStressDatabase(db);
  }, 30_000);

  it('should invalidate snapshots and correct projections on back-dated events', async () => {
    await resetStressData(pool);

    console.log('\n--- Back-dated event test ---');

    // Step 1: Create a vendor
    const vendorResult = await server.intentPipeline.execute({
      intent_type: 'mdm.vendor.create',
      actor: SYSTEM_ACTOR,
      data: { name: 'Backdated Test Vendor', status: 'active' },
      legal_entity: 'LE-001',
    });
    expect(vendorResult.success).toBe(true);
    const vendorId = vendorResult.event!.entities.find(
      (e) => e.entity_type === 'vendor',
    )!.entity_id;

    // Step 2: Submit several invoices
    const invoiceIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await server.intentPipeline.execute({
        intent_type: 'ap.invoice.submit',
        actor: SYSTEM_ACTOR,
        data: {
          invoice_number: `BD-INV-${i}`,
          vendor_id: vendorId,
          amount: 1000 + i * 100,
          currency: 'USD',
          due_date: '2026-03-15',
        },
        legal_entity: 'LE-001',
      });
      expect(result.success).toBe(true);
      const invoiceId = result.event!.entities.find(
        (e) => e.entity_type === 'invoice',
      )!.entity_id;
      invoiceIds.push(invoiceId);
    }

    // Step 3: Ensure ap_aging subscription exists
    await pool.query(`
      INSERT INTO event_subscriptions (id, subscriber_type, subscriber_id, status, projection_type)
      VALUES ('bd-test-aging', 'projection', 'ap_aging', 'active', 'ap_aging')
      ON CONFLICT (id) DO UPDATE SET status = 'active'
    `);

    // Step 4: Create a snapshot of ap_aging
    const snapshot = await server.snapshotService.createSnapshot('ap_aging');
    console.log(`  Snapshot created: seq=${snapshot.sequence_number}, rows=${snapshot.snapshot_data.length}`);
    expect(snapshot.is_stale).toBe(false);

    // Step 5: Record current ap_aging state
    const { rows: agingBefore } = await pool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM ap_aging WHERE legal_entity = 'LE-001'`,
    );
    const countBefore = Number(agingBefore[0].cnt);
    const totalBefore = Number(agingBefore[0].total);
    console.log(`  ap_aging before: ${countBefore} rows, total=${totalBefore}`);

    // Step 6: Post a BACK-DATED invoice (effective_date in the past)
    const backDatedElapsed = timer();
    const backdatedInvoiceId = generateId();
    const backdatedAmount = 5000;

    const backdatedEvent = await server.eventStore.append({
      type: 'ap.invoice.submitted',
      actor: SYSTEM_ACTOR,
      correlation_id: generateId(),
      scope: { tenant_id: 'default', legal_entity: 'LE-001' },
      effective_date: '2025-12-01', // Far in the past
      data: {
        invoice_number: 'BD-BACKDATED-001',
        vendor_id: vendorId,
        vendor_name: 'Backdated Test Vendor',
        amount: backdatedAmount,
        currency: 'USD',
        due_date: '2025-12-31',
        lines: [{ description: 'Backdated item', quantity: 1, unit_price: backdatedAmount }],
      },
      entities: [
        { entity_type: 'invoice', entity_id: backdatedInvoiceId, role: 'subject' },
        { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
      ],
    });

    console.log(`  Back-dated event appended: seq=${backdatedEvent.sequence}, effective_date=2025-12-01`);

    // Step 7: Invalidate snapshots created before this event
    const invalidated = await server.snapshotService.invalidateSnapshots(
      'ap_aging',
      snapshot.sequence_number,
    );
    console.log(`  Snapshots invalidated: ${invalidated}`);

    // Verify snapshot is now stale
    const staleSnapshot = await server.snapshotService.getById(snapshot.snapshot_id);
    expect(staleSnapshot!.is_stale).toBe(true);

    // Step 8: Rebuild projection to incorporate back-dated event
    const rebuildResult = await server.projectionEngine.rebuild('ap_aging', { batchSize: 500 });
    const backdatedMs = backDatedElapsed();

    console.log(`  Rebuild after back-date: ${rebuildResult.eventsProcessed} events, ${backdatedMs}ms`);

    // Step 9: Verify projection now includes the back-dated invoice
    const { rows: agingAfter } = await pool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM ap_aging WHERE legal_entity = 'LE-001'`,
    );
    const countAfter = Number(agingAfter[0].cnt);
    const totalAfter = Number(agingAfter[0].total);
    console.log(`  ap_aging after: ${countAfter} rows, total=${totalAfter}`);

    // The back-dated invoice should be included
    expect(countAfter).toBe(countBefore + 1);
    expect(totalAfter).toBeCloseTo(totalBefore + backdatedAmount, 2);

    // Verify the specific back-dated invoice exists in the projection
    const { rows: bdRow } = await pool.query(
      `SELECT * FROM ap_aging WHERE invoice_id = $1`,
      [backdatedInvoiceId],
    );
    expect(bdRow.length).toBe(1);

    const correctionComplete = countAfter === countBefore + 1 && invalidated >= 1;
    const withinTimeLimit = backdatedMs < 5_000;

    results.push({
      name: 'back_dated_event',
      tier: 'minimum',
      metric: 'Correctness',
      value: `snapshot invalidated, projection corrected (${countBefore}→${countAfter} rows)`,
      threshold: 'snapshots invalidated, projections corrected',
      passed: correctionComplete,
    });

    results.push({
      name: 'back_dated_event',
      tier: 'target',
      metric: 'Back-dated events',
      value: `invalidated + rebuilt in ${backdatedMs}ms`,
      threshold: '< 5000ms',
      passed: withinTimeLimit,
    });

    expect(correctionComplete).toBe(true);
  }, 120_000);
});
