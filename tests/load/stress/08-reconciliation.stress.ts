/**
 * Stress Test 8: Reconciliation Test
 *
 * After all tests, verify trial balance = sum of all posted GL events.
 * Zero variance.
 *
 * PASS-MINIMUM: Zero data loss, trial balance reconciles
 * PASS-TARGET:  $0.00 variance across all events
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

describe('Stress Test 8: Reconciliation', () => {
  beforeAll(async () => {
    db = await createStressDatabase(20);
    pool = db.pool;
    server = createStressServer(pool);
  }, 120_000);

  afterAll(async () => {
    await destroyStressDatabase(db);
  }, 30_000);

  it('should reconcile GL postings with zero variance', async () => {
    await resetStressData(pool);

    const INVOICE_COUNT = 500;

    console.log(`\n--- Reconciliation test: ${INVOICE_COUNT} invoice lifecycles ---`);

    // Step 1: Create vendors
    const vendorIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await server.intentPipeline.execute({
        intent_type: 'mdm.vendor.create',
        actor: SYSTEM_ACTOR,
        data: { name: `Recon Vendor ${i}`, status: 'active' },
        legal_entity: 'LE-001',
      });
      expect(result.success).toBe(true);
      vendorIds.push(
        result.event!.entities.find((e) => e.entity_type === 'vendor')!.entity_id,
      );
    }
    console.log(`  Created ${vendorIds.length} vendors`);

    // Step 2: Run full invoice lifecycle for each invoice:
    //   submit → approve → post (creates GL entries)
    let totalPostedAmount = 0;
    let successfulLifecycles = 0;

    for (let i = 0; i < INVOICE_COUNT; i++) {
      const vendorId = vendorIds[i % vendorIds.length];
      const amount = Math.round((1000 + Math.random() * 9000) * 100) / 100;

      // Submit
      const submitResult = await server.intentPipeline.execute({
        intent_type: 'ap.invoice.submit',
        actor: SYSTEM_ACTOR,
        data: {
          invoice_number: `RECON-INV-${i}`,
          vendor_id: vendorId,
          amount,
          currency: 'USD',
          due_date: '2026-04-15',
        },
        legal_entity: 'LE-001',
      });
      if (!submitResult.success) continue;

      const invoiceId = submitResult.event!.entities.find(
        (e) => e.entity_type === 'invoice',
      )!.entity_id;

      // Approve (direct entity update to set status = approved, bypassing full approval flow)
      const invoice = await server.entityGraph.getEntity('invoice', invoiceId);
      if (!invoice) continue;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await server.entityGraph.updateEntity(
          'invoice', invoiceId,
          { ...invoice.attributes, status: 'approved' },
          invoice.version, client, 'LE-001',
        );

        // Append approved event for the record
        const approvedEvent = await server.eventStore.append({
          type: 'ap.invoice.approved',
          actor: { type: 'human', id: 'approver-001', name: 'AP Manager' },
          correlation_id: generateId(),
          scope: { tenant_id: 'default', legal_entity: 'LE-001' },
          data: {
            invoice_id: invoiceId,
            approved_by_id: 'approver-001',
            approved_by_name: 'AP Manager',
          },
          entities: [
            { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
          ],
        }, client);

        await server.projectionEngine.processEvent(approvedEvent, client);
        await client.query('COMMIT');
      } catch {
        await client.query('ROLLBACK');
        continue;
      } finally {
        client.release();
      }

      // Post (creates GL entries: debit expense, credit AP control)
      const postResult = await server.intentPipeline.execute({
        intent_type: 'ap.invoice.post',
        actor: SYSTEM_ACTOR,
        data: {
          invoice_id: invoiceId,
          expense_account: '5000-00',
        },
        legal_entity: 'LE-001',
      });

      if (postResult.success) {
        totalPostedAmount += amount;
        successfulLifecycles++;
      }
    }

    console.log(`  Completed ${successfulLifecycles}/${INVOICE_COUNT} lifecycles`);
    console.log(`  Total posted amount: $${totalPostedAmount.toFixed(2)}`);

    // Step 3: Query GL postings trial balance
    const { rows: glRows } = await pool.query(`
      SELECT
        SUM(debit) as total_debit,
        SUM(credit) as total_credit,
        SUM(debit) - SUM(credit) as net_balance
      FROM gl_postings
      WHERE legal_entity = 'LE-001'
    `);

    const totalDebit = Number(glRows[0].total_debit) || 0;
    const totalCredit = Number(glRows[0].total_credit) || 0;
    const netBalance = Number(glRows[0].net_balance) || 0;

    console.log(`\n  GL Trial Balance:`);
    console.log(`    Total Debits:  $${totalDebit.toFixed(2)}`);
    console.log(`    Total Credits: $${totalCredit.toFixed(2)}`);
    console.log(`    Net Balance:   $${netBalance.toFixed(2)}`);

    // Step 4: Verify debits = credits (balanced GL)
    const variance = Math.abs(netBalance);
    const isBalanced = variance < 0.01; // Allow for floating point

    console.log(`    Variance:      $${variance.toFixed(2)}`);
    console.log(`    Balanced:      ${isBalanced}`);

    // Step 5: Verify GL totals match posted amounts
    // Each posted invoice creates: debit expense = amount, credit AP = amount
    // So total debits should equal totalPostedAmount, total credits should equal totalPostedAmount
    const debitMatchesPosted = Math.abs(totalDebit - totalPostedAmount) < 0.01;
    const creditMatchesPosted = Math.abs(totalCredit - totalPostedAmount) < 0.01;

    console.log(`\n  Amount Reconciliation:`);
    console.log(`    Expected posted: $${totalPostedAmount.toFixed(2)}`);
    console.log(`    Actual debits:   $${totalDebit.toFixed(2)} (match: ${debitMatchesPosted})`);
    console.log(`    Actual credits:  $${totalCredit.toFixed(2)} (match: ${creditMatchesPosted})`);

    // Step 6: Verify per-account balances
    const { rows: accountRows } = await pool.query(`
      SELECT account_code,
             SUM(debit) as total_debit,
             SUM(credit) as total_credit,
             SUM(debit) - SUM(credit) as balance
      FROM gl_postings
      WHERE legal_entity = 'LE-001'
      GROUP BY account_code
      ORDER BY account_code
    `);

    console.log(`\n  Per-Account Balances:`);
    for (const row of accountRows) {
      console.log(`    ${row.account_code}: debit=$${Number(row.total_debit).toFixed(2)}, credit=$${Number(row.total_credit).toFixed(2)}, balance=$${Number(row.balance).toFixed(2)}`);
    }

    // Step 7: Count posted events vs GL postings (should be 1:2 — each post creates 2 GL entries)
    const { rows: postedEventRows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM events WHERE type = 'ap.invoice.posted'`,
    );
    const postedEvents = Number(postedEventRows[0].cnt);

    const { rows: glPostingRows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM gl_postings`,
    );
    const glPostings = Number(glPostingRows[0].cnt);

    console.log(`\n  Event/Posting Counts:`);
    console.log(`    Posted events: ${postedEvents}`);
    console.log(`    GL postings:   ${glPostings} (expected: ${postedEvents * 2})`);

    const correctPostingCount = glPostings === postedEvents * 2;

    results.push({
      name: 'reconciliation',
      tier: 'minimum',
      metric: 'Correctness',
      value: `${successfulLifecycles} lifecycles, GL balanced (variance=$${variance.toFixed(2)})`,
      threshold: 'zero data loss, trial balance reconciles',
      passed: isBalanced && correctPostingCount,
    });

    results.push({
      name: 'reconciliation',
      tier: 'target',
      metric: 'Reconciliation',
      value: `$${variance.toFixed(2)} variance across ${postedEvents} posted events`,
      threshold: '$0.00 variance',
      passed: isBalanced && debitMatchesPosted && creditMatchesPosted,
    });

    expect(isBalanced).toBe(true);
    expect(correctPostingCount).toBe(true);
  }, 300_000);
});
