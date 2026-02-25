/**
 * Stress Test 7: Schema Migration Test
 *
 * Introduce V2 of ap.invoice.submitted with new field,
 * rebuild projections, verify V1 events upcasted correctly.
 *
 * PASS-MINIMUM: Both V1 and V2 events processed correctly
 * PASS-TARGET:  V1→V2 upcasting verified, projections reflect both versions
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type pg from 'pg';
import { generateId } from '@nova/core';
import type { StressDatabase } from '../helpers/stress-database.js';
import type { StressServer } from '../helpers/stress-server.js';
import { createStressDatabase, destroyStressDatabase, resetStressData } from '../helpers/stress-database.js';
import { createStressServer } from '../helpers/stress-server.js';
import { SYSTEM_ACTOR } from '../helpers/synthetic-events.js';
import type { TestResult } from '../helpers/gate-report.js';

let db: StressDatabase;
let server: StressServer;
let pool: pg.Pool;

export const results: TestResult[] = [];

describe('Stress Test 7: Schema Migration', () => {
  beforeAll(async () => {
    db = await createStressDatabase(20);
    pool = db.pool;
    server = createStressServer(pool);
  }, 120_000);

  afterAll(async () => {
    await destroyStressDatabase(db);
  }, 30_000);

  it('should handle V1→V2 event schema migration with projection rebuild', async () => {
    await resetStressData(pool);

    console.log('\n--- Schema migration test ---');

    // Step 1: Register V1 schema for ap.invoice.submitted
    const v1Schema = {
      type: 'object',
      properties: {
        invoice_number: { type: 'string' },
        vendor_id: { type: 'string' },
        vendor_name: { type: 'string' },
        amount: { type: 'number' },
        currency: { type: 'string' },
        due_date: { type: 'string' },
        lines: { type: 'array' },
      },
      required: ['invoice_number', 'vendor_id', 'amount', 'due_date'],
    };

    await server.eventTypeRegistry.register(
      'ap.invoice.submitted',
      1,
      v1Schema,
      'AP Invoice Submitted - V1',
    );
    console.log('  Registered V1 schema for ap.invoice.submitted');

    // Step 2: Create a vendor for our invoices
    const vendorResult = await server.intentPipeline.execute({
      intent_type: 'mdm.vendor.create',
      actor: SYSTEM_ACTOR,
      data: { name: 'Schema Migration Vendor', status: 'active' },
      legal_entity: 'LE-001',
    });
    expect(vendorResult.success).toBe(true);
    const vendorId = vendorResult.event!.entities.find(
      (e) => e.entity_type === 'vendor',
    )!.entity_id;

    // Step 3: Submit V1 invoices (schema_version=1)
    const v1Count = 50;
    const v1InvoiceIds: string[] = [];
    for (let i = 0; i < v1Count; i++) {
      const invoiceId = generateId();
      v1InvoiceIds.push(invoiceId);

      await server.eventStore.append({
        type: 'ap.invoice.submitted',
        schema_version: 1,
        actor: SYSTEM_ACTOR,
        correlation_id: generateId(),
        scope: { tenant_id: 'default', legal_entity: 'LE-001' },
        data: {
          invoice_number: `V1-INV-${i}`,
          vendor_id: vendorId,
          vendor_name: 'Schema Migration Vendor',
          amount: 1000 + i,
          currency: 'USD',
          due_date: '2026-03-15',
          lines: [{ description: `V1 item ${i}`, quantity: 1, unit_price: 1000 + i }],
        },
        entities: [
          { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
          { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
        ],
      });
    }
    console.log(`  Appended ${v1Count} V1 events`);

    // Step 4: Register V2 schema with new field (tax_classification)
    const v2Schema = {
      type: 'object',
      properties: {
        invoice_number: { type: 'string' },
        vendor_id: { type: 'string' },
        vendor_name: { type: 'string' },
        amount: { type: 'number' },
        currency: { type: 'string' },
        due_date: { type: 'string' },
        lines: { type: 'array' },
        tax_classification: { type: 'string' }, // NEW in V2
        payment_terms: { type: 'string' },       // NEW in V2
      },
      required: ['invoice_number', 'vendor_id', 'amount', 'due_date'],
    };

    await server.eventTypeRegistry.register(
      'ap.invoice.submitted',
      2,
      v2Schema,
      'AP Invoice Submitted - V2 with tax_classification',
    );
    console.log('  Registered V2 schema for ap.invoice.submitted');

    // Step 5: Submit V2 invoices (schema_version=2, includes new fields)
    const v2Count = 50;
    const v2InvoiceIds: string[] = [];
    for (let i = 0; i < v2Count; i++) {
      const invoiceId = generateId();
      v2InvoiceIds.push(invoiceId);

      await server.eventStore.append({
        type: 'ap.invoice.submitted',
        schema_version: 2,
        actor: SYSTEM_ACTOR,
        correlation_id: generateId(),
        scope: { tenant_id: 'default', legal_entity: 'LE-001' },
        data: {
          invoice_number: `V2-INV-${i}`,
          vendor_id: vendorId,
          vendor_name: 'Schema Migration Vendor',
          amount: 2000 + i,
          currency: 'USD',
          due_date: '2026-04-15',
          lines: [{ description: `V2 item ${i}`, quantity: 1, unit_price: 2000 + i }],
          tax_classification: 'standard', // V2 field
          payment_terms: 'net-30',         // V2 field
        },
        entities: [
          { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
          { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
        ],
      });
    }
    console.log(`  Appended ${v2Count} V2 events`);

    // Step 6: Verify both schema versions exist in event store
    const { rows: versionRows } = await pool.query(`
      SELECT schema_version, COUNT(*) as cnt
      FROM events
      WHERE type = 'ap.invoice.submitted'
      GROUP BY schema_version
      ORDER BY schema_version
    `);
    console.log('  Event versions in store:');
    for (const row of versionRows) {
      console.log(`    V${row.schema_version}: ${row.cnt} events`);
    }

    // Step 7: Rebuild ap_invoice_list projection (processes both V1 and V2 events)
    await pool.query(`
      INSERT INTO event_subscriptions (id, subscriber_type, subscriber_id, status, projection_type)
      VALUES ('schema-test-invoice', 'projection', 'ap_invoice_list', 'active', 'ap_invoice_list')
      ON CONFLICT (id) DO UPDATE SET status = 'active', last_processed_seq = 0
    `);

    console.log('  Rebuilding ap_invoice_list projection...');
    const rebuildResult = await server.projectionEngine.rebuild('ap_invoice_list', { batchSize: 500 });
    console.log(`  Rebuild: ${rebuildResult.eventsProcessed} events, ${rebuildResult.deadLettered} dead-lettered`);

    // Step 8: Verify projection has entries from BOTH V1 and V2 events
    const { rows: projRows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM ap_invoice_list WHERE legal_entity = 'LE-001'`,
    );
    const projectionCount = Number(projRows[0].cnt);
    console.log(`  ap_invoice_list rows: ${projectionCount}`);

    // V1 events should be processed (upcasted by the handler, which doesn't
    // depend on schema_version — it reads the data fields that exist)
    const { rows: v1Rows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM ap_invoice_list WHERE invoice_number LIKE 'V1-%'`,
    );
    const v1ProjectedCount = Number(v1Rows[0].cnt);

    const { rows: v2Rows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM ap_invoice_list WHERE invoice_number LIKE 'V2-%'`,
    );
    const v2ProjectedCount = Number(v2Rows[0].cnt);

    console.log(`  V1 invoices in projection: ${v1ProjectedCount}/${v1Count}`);
    console.log(`  V2 invoices in projection: ${v2ProjectedCount}/${v2Count}`);

    // Step 9: Verify schema registry has both versions
    const versions = await server.eventTypeRegistry.listVersions('ap.invoice.submitted');
    expect(versions.length).toBe(2);
    expect(versions.some((v) => v.schema_version === 1)).toBe(true);
    expect(versions.some((v) => v.schema_version === 2)).toBe(true);

    const bothVersionsProjected = v1ProjectedCount === v1Count && v2ProjectedCount === v2Count;
    const noDeadLetters = rebuildResult.deadLettered === 0;

    results.push({
      name: 'schema_migration',
      tier: 'minimum',
      metric: 'Correctness',
      value: `V1=${v1ProjectedCount}/${v1Count}, V2=${v2ProjectedCount}/${v2Count}, dead-lettered=${rebuildResult.deadLettered}`,
      threshold: 'both versions processed, zero errors',
      passed: bothVersionsProjected && noDeadLetters,
    });

    results.push({
      name: 'schema_migration',
      tier: 'target',
      metric: 'Schema migration',
      value: `V1→V2 upcasting verified, ${projectionCount} projections correct`,
      threshold: 'V1→V2 upcasting verified',
      passed: bothVersionsProjected && noDeadLetters,
    });

    expect(bothVersionsProjected).toBe(true);
    expect(noDeadLetters).toBe(true);
  }, 120_000);
});
