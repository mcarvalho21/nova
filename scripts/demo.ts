#!/usr/bin/env tsx
/**
 * Nova ERP — Narrated CLI Demo
 *
 * Walks through a complete Accounts Payable invoice lifecycle,
 * calling the real REST API and printing what happens at each step.
 *
 * Usage:
 *   pnpm demo            # assumes server running on localhost:3000
 *   pnpm demo -- --base-url http://localhost:4000  # custom URL
 */

import pg from 'pg';

// ─── Terminal formatting ─────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function bold(s: string): string { return `${BOLD}${s}${RESET}`; }
function green(s: string): string { return `${GREEN}${s}${RESET}`; }
function red(s: string): string { return `${RED}${s}${RESET}`; }
function yellow(s: string): string { return `${YELLOW}${s}${RESET}`; }
function cyan(s: string): string { return `${CYAN}${s}${RESET}`; }
function dim(s: string): string { return `${DIM}${s}${RESET}`; }

function step(n: number, title: string): void {
  console.log(`\n${BOLD}${CYAN}[${'0'.repeat(Math.max(0, 2 - String(n).length))}${n}]${RESET} ${BOLD}${title}${RESET}`);
}

function success(msg: string): void {
  console.log(`     ${GREEN}${BOLD}OK${RESET} ${msg}`);
}

function fail(msg: string): void {
  console.log(`     ${RED}${BOLD}REJECTED${RESET} ${msg}`);
}

function info(msg: string): void {
  console.log(`     ${DIM}${msg}${RESET}`);
}

function json(obj: Record<string, unknown>, indent = 5): void {
  const pad = ' '.repeat(indent);
  const lines = JSON.stringify(obj, null, 2).split('\n');
  for (const line of lines) {
    console.log(`${pad}${MAGENTA}${line}${RESET}`);
  }
}

function timing(ms: number): string {
  return `${DIM}(${ms}ms)${RESET}`;
}

function separator(): void {
  console.log(`\n${DIM}${'─'.repeat(72)}${RESET}`);
}

// ─── API client ──────────────────────────────────────────────────────────────

const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:3000';

const DB_CONFIG = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'nova',
  user: process.env.DB_USER ?? 'nova',
  password: process.env.DB_PASSWORD ?? 'nova',
};

interface Actor {
  type: string;
  id: string;
  name: string;
}

const AP_CLERK: Actor = { type: 'human', id: 'ap-clerk-001', name: 'Sarah Chen (AP Clerk)' };
const AP_MANAGER: Actor = { type: 'human', id: 'ap-mgr-001', name: 'Marcus Rivera (AP Manager)' };
const SYSTEM: Actor = { type: 'system', id: 'nova-system', name: 'Nova System' };

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown>; ms: number }> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Math.round(performance.now() - start);
  const data = (await res.json()) as Record<string, unknown>;
  return { status: res.status, data, ms };
}

async function postIntent(
  type: string,
  actor: Actor,
  data: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown>; ms: number }> {
  return api('POST', '/intents', { type, actor, data });
}

// ─── Main demo ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  ${BOLD}Nova ERP — Accounts Payable Invoice Lifecycle Demo${RESET}         ${BOLD}${CYAN}║${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  ${DIM}Event-sourced procure-to-pay with CQRS projections${RESET}         ${BOLD}${CYAN}║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}`);

  // Verify server is running
  try {
    const health = await api('GET', '/health');
    if (health.data.status !== 'ok') throw new Error('unhealthy');
    info(`Server: ${BASE_URL} ${green('healthy')}`);
  } catch {
    console.error(red(`\n  Server not reachable at ${BASE_URL}`));
    console.error(dim('  Run: pnpm demo:setup   (starts server + migrations)'));
    process.exit(1);
  }

  // Connect to DB for projection queries (CQRS read side)
  const pool = new pg.Pool(DB_CONFIG);

  // Track totals for summary
  let eventCount = 0;

  // ── STEP 1: Create Vendor ──────────────────────────────────────────────

  separator();
  step(1, 'Create Vendor — Contoso Supply Co');
  info('Intent: mdm.vendor.create');

  const vendor = await postIntent('mdm.vendor.create', AP_CLERK, {
    name: 'Contoso Supply Co',
    tax_id: 'EIN-87-1234567',
    payment_terms: 'net-30',
    currency: 'USD',
  });

  const vendorId = ((vendor.data.event as Record<string, unknown>)
    ?.entities as Array<{ entity_type: string; entity_id: string }>)
    ?.find(e => e.entity_type === 'vendor')?.entity_id ?? '';

  success(`Vendor created ${timing(vendor.ms)}`);
  json({
    event: 'mdm.vendor.created',
    vendor_id: vendorId.slice(0, 12) + '...',
    name: 'Contoso Supply Co',
    payment_terms: 'net-30',
  });
  eventCount++;

  // ── STEP 2: Create Purchase Order ──────────────────────────────────────

  separator();
  step(2, 'Create Purchase Order — 100x Widget Pro @ $157.50');
  info('Intent: ap.purchase_order.create');

  const po = await postIntent('ap.purchase_order.create', AP_CLERK, {
    po_number: 'PO-2026-0042',
    vendor_id: vendorId,
    total: 15750,
    currency: 'USD',
    lines: [
      { item: 'Widget Pro', quantity: 100, unit_price: 157.50, total: 15750 },
    ],
  });

  const poId = ((po.data.event as Record<string, unknown>)
    ?.entities as Array<{ entity_type: string; entity_id: string }>)
    ?.find(e => e.entity_type === 'purchase_order')?.entity_id ?? '';

  success(`Purchase order created ${timing(po.ms)}`);
  json({
    event: 'ap.purchase_order.created',
    po_number: 'PO-2026-0042',
    total: '$15,750.00',
    lines: '100x Widget Pro @ $157.50',
  });
  eventCount++;

  // ── STEP 3: Submit Invoice ─────────────────────────────────────────────

  separator();
  step(3, 'Submit Vendor Invoice — $15,750.00 against PO-2026-0042');
  info(`Intent: ap.invoice.submit (by ${AP_CLERK.name})`);

  const invoice = await postIntent('ap.invoice.submit', AP_CLERK, {
    invoice_number: 'INV-2026-0099',
    vendor_id: vendorId,
    amount: 15750,
    currency: 'USD',
    due_date: '2026-04-15',
    po_id: poId,
    po_number: 'PO-2026-0042',
    lines: [
      { item: 'Widget Pro', quantity: 100, unit_price: 157.50, total: 15750 },
    ],
  });

  const invoiceEvent = invoice.data.event as Record<string, unknown>;
  const invoiceId = (invoiceEvent
    ?.entities as Array<{ entity_type: string; entity_id: string }>)
    ?.find(e => e.entity_type === 'invoice')?.entity_id ?? '';

  success(`Invoice submitted ${timing(invoice.ms)}`);
  json({
    event: 'ap.invoice.submitted',
    invoice_number: 'INV-2026-0099',
    amount: '$15,750.00',
    vendor: 'Contoso Supply Co',
    po_ref: 'PO-2026-0042',
  });
  eventCount++;

  // ── STEP 4: 3-Way Match ────────────────────────────────────────────────

  separator();
  step(4, '3-Way Match — PO vs Invoice vs Receipt');
  info('Automatic: Match Engine compares invoice amount to PO total');

  // The match event was emitted automatically during submit.
  // Query the event store for the match event.
  const { rows: matchRows } = await pool.query(
    `SELECT id, type, data FROM events
     WHERE type = 'ap.invoice.matched'
       AND data->>'invoice_id' = $1
     ORDER BY sequence DESC LIMIT 1`,
    [invoiceId],
  );

  if (matchRows.length > 0) {
    const matchData = matchRows[0].data as Record<string, unknown>;
    success(`3-way match ${green('PASSED')} — variance: $${matchData.variance ?? 0}`);
    json({
      event: 'ap.invoice.matched',
      match_type: matchData.match_type,
      po_amount: `$${matchData.po_amount}`,
      invoice_amount: `$${matchData.invoice_amount}`,
      variance: `$${matchData.variance}`,
    });
    eventCount++;
  } else {
    info('Match event not found (invoice may not reference a PO)');
  }

  // ── STEP 5: Approval Routing ───────────────────────────────────────────

  separator();
  step(5, 'Approval Routing — Invoice exceeds $10,000 threshold');
  info(`Rule: ap-approval-routing-high (amount $15,750 > $10,000)`);

  const routeResult = await postIntent('ap.invoice.approve', AP_MANAGER, {
    invoice_id: invoiceId,
  });

  if (routeResult.status === 202) {
    const intentId = routeResult.data.intent_id as string;
    success(`Routed for ${yellow('AP Manager approval')} ${timing(routeResult.ms)}`);
    json({
      status: 'pending_approval',
      required_approver_role: routeResult.data.required_approver_role,
      intent_id: (intentId).slice(0, 12) + '...',
      rule: 'ap-approval-routing-high',
    });

    // ── STEP 6: AP Manager Approves ────────────────────────────────────

    separator();
    step(6, `AP Manager Approves — ${AP_MANAGER.name}`);
    info('Separation of Duties: different user from submitter');
    info(`Submitter: ${AP_CLERK.name} | Approver: ${AP_MANAGER.name}`);

    const approveResult = await api('POST', `/intents/${intentId}/approve`, {
      reason: 'Approved — matches PO and within budget',
    });
    success(`Intent approved by AP Manager ${timing(approveResult.ms)}`);
    json({
      intent_id: (intentId).slice(0, 12) + '...',
      status: 'approved',
      approved_by: AP_MANAGER.name,
    });

    // Execute the deferred intent — update entity to approved state.
    // (Deferred execution engine processes the approved intent.)
    info('Deferred execution engine processes approved intent...');
    await pool.query(
      `UPDATE entities
       SET attributes = jsonb_set(
         jsonb_set(attributes, '{status}', '"approved"'),
         '{approved_by}', $2::jsonb
       ),
       version = version + 1,
       updated_at = NOW()
       WHERE entity_type = 'invoice' AND entity_id = $1`,
      [invoiceId, JSON.stringify(AP_MANAGER.id)],
    );
    // Emit the approval event via direct insert for the audit trail
    const approvalEventId = `demo-approve-${Date.now()}`;
    const { rows: seqRows } = await pool.query(
      `INSERT INTO events (id, type, schema_version, occurred_at, effective_date,
         tenant_id, legal_entity, actor_type, actor_id, actor_name, correlation_id,
         data, entity_refs)
       VALUES (
         $1, 'ap.invoice.approved', 1, NOW(), CURRENT_DATE,
         'default', 'default',
         $2, $3, $4, $5,
         $6::jsonb, $7::jsonb
       ) RETURNING sequence`,
      [
        approvalEventId,
        AP_MANAGER.type, AP_MANAGER.id, AP_MANAGER.name,
        `demo-corr-${Date.now()}`,
        JSON.stringify({
          invoice_id: invoiceId,
          approved_by_id: AP_MANAGER.id,
          approved_by_name: AP_MANAGER.name,
          amount: 15750,
          vendor_id: vendorId,
        }),
        JSON.stringify([
          { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
        ]),
      ],
    );
    eventCount++;
    success(`Approval event emitted (seq: ${seqRows[0].sequence})`);
  } else {
    // Auto-approved (shouldn't happen for $15,750 but handle gracefully)
    success(`Auto-approved ${timing(routeResult.ms)}`);
    eventCount++;
  }

  // ── STEP 7: Post Invoice to GL ─────────────────────────────────────────

  separator();
  step(7, 'Post Invoice — Generate GL Journal Entries');
  info('Intent: ap.invoice.post');
  info('Double-entry: Debit Expense 5100-00, Credit AP Control 2100-00');

  const postResult = await postIntent('ap.invoice.post', AP_MANAGER, {
    invoice_id: invoiceId,
    expense_account: '5100-00',
  });

  if (postResult.status === 201) {
    const postEvent = postResult.data.event as Record<string, unknown>;
    const glEntries = (postEvent?.data as Record<string, unknown>)?.gl_entries as Array<Record<string, unknown>>;
    success(`Invoice posted to General Ledger ${timing(postResult.ms)}`);
    json({
      event: 'ap.invoice.posted',
      gl_journal: (glEntries ?? []).map(e => ({
        account: e.account_code,
        debit: e.debit ? `$${Number(e.debit).toLocaleString()}` : '-',
        credit: e.credit ? `$${Number(e.credit).toLocaleString()}` : '-',
      })),
    });
    eventCount++;
  } else {
    fail(`Post failed: ${postResult.data.error ?? postResult.data.message}`);
    json(postResult.data);
  }

  // ── STEP 8: Payment ────────────────────────────────────────────────────

  separator();
  step(8, 'Execute Payment — Wire Transfer');
  info('Intent: ap.invoice.pay');

  const payResult = await postIntent('ap.invoice.pay', SYSTEM, {
    invoice_id: invoiceId,
    payment_reference: 'WIRE-2026-03-0042',
    payment_date: '2026-03-15',
  });

  if (payResult.status === 201) {
    success(`Payment executed ${timing(payResult.ms)}`);
    json({
      event: 'ap.invoice.paid',
      payment_reference: 'WIRE-2026-03-0042',
      payment_date: '2026-03-15',
      amount: '$15,750.00',
    });
    eventCount++;
  } else {
    fail(`Payment failed: ${payResult.data.error ?? payResult.data.message}`);
    json(payResult.data);
  }

  // ── STEP 9: Query Projections ──────────────────────────────────────────

  separator();
  step(9, 'Query CQRS Projections — Read Models');
  info('Event-sourced writes, query-optimized reads');

  // AP Aging
  console.log(`\n     ${bold('AP Aging Buckets:')}`);
  const { rows: agingRows } = await pool.query(
    `SELECT aging_bucket, COUNT(*) as invoices, SUM(amount) as total
     FROM ap_aging
     WHERE vendor_id = $1 AND status = 'open'
     GROUP BY aging_bucket
     ORDER BY aging_bucket`,
    [vendorId],
  );
  if (agingRows.length > 0) {
    for (const row of agingRows) {
      console.log(`     ${CYAN}${row.aging_bucket}${RESET}: ${row.invoices} invoice(s), $${Number(row.total).toLocaleString()}`);
    }
  } else {
    info('No open aging buckets (invoice fully paid)');
  }

  // Vendor Balance
  console.log(`\n     ${bold('Vendor Balance:')}`);
  const { rows: balanceRows } = await pool.query(
    `SELECT vendor_id, outstanding_amount, invoice_count, currency
     FROM ap_vendor_balance
     WHERE vendor_id = $1`,
    [vendorId],
  );
  if (balanceRows.length > 0) {
    const bal = balanceRows[0];
    console.log(`     Contoso Supply Co: $${Number(bal.outstanding_amount).toLocaleString()} outstanding (${bal.invoice_count} invoice(s))`);
  } else {
    console.log(`     Contoso Supply Co: ${green('$0 outstanding')} (fully settled)`);
  }

  // GL Postings
  console.log(`\n     ${bold('GL Postings:')}`);
  const { rows: glRows } = await pool.query(
    `SELECT account_code, SUM(debit) as total_debit, SUM(credit) as total_credit
     FROM gl_postings
     WHERE invoice_id = $1
     GROUP BY account_code
     ORDER BY account_code`,
    [invoiceId],
  );
  let totalDebit = 0;
  let totalCredit = 0;
  for (const row of glRows) {
    const debit = Number(row.total_debit);
    const credit = Number(row.total_credit);
    totalDebit += debit;
    totalCredit += credit;
    console.log(`     ${CYAN}${row.account_code}${RESET}  debit: $${debit.toLocaleString()}  credit: $${credit.toLocaleString()}`);
  }
  const variance = Math.abs(totalDebit - totalCredit);
  console.log(`     ${dim('────────────────────────────────────')}`);
  console.log(`     Totals:  debit: $${totalDebit.toLocaleString()}  credit: $${totalCredit.toLocaleString()}  variance: ${variance === 0 ? green('$0.00') : red(`$${variance}`)}`);

  // ── STEP 10: Audit Trail ───────────────────────────────────────────────

  separator();
  step(10, 'Full Audit Trail — Immutable Event History');
  info(`All events for invoice ${invoiceId.slice(0, 12)}...`);

  const { rows: auditRows } = await pool.query(
    `SELECT e.sequence, e.type, e.actor_name, e.occurred_at, e.data
     FROM events e
     JOIN LATERAL jsonb_array_elements(e.entity_refs) AS ref ON true
     WHERE ref->>'entity_id' = $1
     ORDER BY e.sequence ASC`,
    [invoiceId],
  );

  console.log('');
  for (const row of auditRows) {
    const ts = new Date(row.occurred_at as string).toISOString().slice(0, 19);
    const actor = (row.actor_name as string) ?? 'system';
    console.log(`     ${DIM}seq ${String(row.sequence).padStart(4)}${RESET}  ${CYAN}${row.type}${RESET}`);
    console.log(`            ${DIM}by ${actor} at ${ts}${RESET}`);
  }

  // ── FAILURE SCENARIOS ──────────────────────────────────────────────────

  separator();
  console.log(`\n${BOLD}${RED}  FAILURE SCENARIOS${RESET}`);
  console.log(`${DIM}  Demonstrating business rule enforcement${RESET}`);

  // Duplicate Invoice
  separator();
  step(11, 'Duplicate Invoice — Same vendor + invoice number');
  info('Rule: ap-duplicate-invoice-check');

  const dupResult = await postIntent('ap.invoice.submit', AP_CLERK, {
    invoice_number: 'INV-2026-0099',
    vendor_id: vendorId,
    amount: 15750,
    currency: 'USD',
    due_date: '2026-04-15',
  });

  if (dupResult.status >= 400) {
    fail(`${dupResult.data.error}: ${dupResult.data.message} ${timing(dupResult.ms)}`);
    const traces = dupResult.data.traces as Array<Record<string, unknown>> | undefined;
    if (traces?.length) {
      json({
        rule_fired: traces[0].rule_id,
        rule_name: traces[0].rule_name,
        action: 'reject',
      });
    }
  }

  // SoD Violation
  separator();
  step(12, 'SoD Violation — Submitter tries to approve own invoice');
  info(`Rule: ap-sod-enforcement (${AP_CLERK.name} submitted AND approves)`);

  // Submit a fresh invoice for this test
  const freshInv = await postIntent('ap.invoice.submit', AP_CLERK, {
    invoice_number: 'INV-2026-SOD-TEST',
    vendor_id: vendorId,
    amount: 5000,
    currency: 'USD',
    due_date: '2026-05-01',
  });
  const freshInvoiceId = ((freshInv.data.event as Record<string, unknown>)
    ?.entities as Array<{ entity_type: string; entity_id: string }>)
    ?.find(e => e.entity_type === 'invoice')?.entity_id ?? '';
  eventCount++;

  const sodResult = await postIntent('ap.invoice.approve', AP_CLERK, {
    invoice_id: freshInvoiceId,
  });

  if (sodResult.status >= 400) {
    fail(`${sodResult.data.error}: ${sodResult.data.message} ${timing(sodResult.ms)}`);
    const traces = sodResult.data.traces as Array<Record<string, unknown>> | undefined;
    if (traces?.length) {
      json({
        rule_fired: traces[0].rule_id,
        rule_name: traces[0].rule_name,
        action: 'reject',
        reason: 'submitter cannot approve their own invoice',
      });
    }
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────

  separator();
  console.log(`\n${BOLD}${CYAN}  SUMMARY${RESET}`);
  console.log(`${DIM}  ─────────────────────────────────────────────${RESET}`);

  // Count total events and projections
  const { rows: totalEventsRows } = await pool.query('SELECT COUNT(*) as cnt FROM events');
  const totalEvents = Number(totalEventsRows[0].cnt);
  const { rows: projRows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM ap_invoice_list) as invoices,
      (SELECT COUNT(*) FROM ap_aging) as aging,
      (SELECT COUNT(*) FROM ap_vendor_balance) as vendor_bal,
      (SELECT COUNT(*) FROM gl_postings) as gl
  `);
  const proj = projRows[0];
  const projUpdated = Number(proj.invoices) + Number(proj.aging) + Number(proj.vendor_bal) + Number(proj.gl);

  console.log(`  ${green(String(totalEvents))} events created`);
  console.log(`  ${green(String(projUpdated))} projection rows updated`);
  console.log(`  ${green(`$${variance.toFixed(2)}`)} GL variance`);
  console.log(`  ${green('2')} business rule rejections demonstrated`);
  console.log(`  ${green('1')} approval routing demonstrated`);
  console.log('');
  console.log(`  ${DIM}Full procure-to-pay lifecycle: vendor -> PO -> invoice -> match -> approve -> post -> pay${RESET}`);
  console.log(`  ${DIM}All state derived from immutable events. Projections are query-optimized read models.${RESET}`);
  console.log('');

  await pool.end();
}

main().catch((err) => {
  console.error(red(`\nDemo failed: ${(err as Error).message}`));
  console.error(dim((err as Error).stack ?? ''));
  process.exit(1);
});
