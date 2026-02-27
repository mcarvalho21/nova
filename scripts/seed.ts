#!/usr/bin/env tsx
/**
 * Nova ERP — Seed Data
 *
 * Populates Nova with realistic mid-size company data for exploration
 * and demo purposes. Assumes server is already running.
 *
 * Usage:
 *   pnpm seed              # assumes server on localhost:3000
 *   pnpm seed -- --base-url http://localhost:4000
 *
 * Idempotent: running twice doesn't create duplicates
 * (uses idempotency keys based on seed entity names).
 */

import pg from 'pg';

// ─── Terminal formatting ────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function green(s: string): string { return `${GREEN}${s}${RESET}`; }
function red(s: string): string { return `${RED}${s}${RESET}`; }
function dim(s: string): string { return `${DIM}${s}${RESET}`; }

function progress(current: number, total: number, label: string): void {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round(pct / 5);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
  process.stdout.write(`\r  ${DIM}[${bar}]${RESET} ${current}/${total} ${label}`);
  if (current === total) console.log('');
}

function section(title: string): void {
  console.log(`\n${BOLD}${CYAN}\u25b8 ${title}${RESET}`);
}

// ─── Config ─────────────────────────────────────────────────────────────────

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

// ─── Actors ─────────────────────────────────────────────────────────────────

interface Actor { type: string; id: string; name: string }

const AP_CLERK: Actor = { type: 'human', id: 'jennifer-walsh', name: 'Jennifer Walsh (AP Clerk)' };
const AP_MANAGER: Actor = { type: 'human', id: 'robert-kim', name: 'Robert Kim (AP Manager)' };
const BUYER: Actor = { type: 'human', id: 'david-chen', name: 'David Chen (Procurement)' };
const SYSTEM: Actor = { type: 'system', id: 'nova-system', name: 'Nova System' };

// ─── Data Definitions ───────────────────────────────────────────────────────

const VENDORS = [
  // USMF — US Manufacturing Inc.
  { name: 'Acme Industrial Supply',    tax_id: 'EIN-12-3456789', payment_terms: 'net-30', currency: 'USD' },
  { name: 'Pacific Components Ltd',    tax_id: 'EIN-23-4567890', payment_terms: 'net-45', currency: 'USD' },
  { name: 'Midwest Steel & Alloys',    tax_id: 'EIN-34-5678901', payment_terms: 'net-30', currency: 'USD' },
  { name: 'TechParts Direct',          tax_id: 'EIN-45-6789012', payment_terms: 'net-60', currency: 'USD' },
  { name: 'Green Valley Packaging',    tax_id: 'EIN-56-7890123', payment_terms: 'net-30', currency: 'USD' },
  { name: 'Summit Logistics Group',    tax_id: 'EIN-67-8901234', payment_terms: 'net-15', currency: 'USD' },
  { name: 'Precision Tool Co',         tax_id: 'EIN-78-9012345', payment_terms: 'net-30', currency: 'USD' },
  { name: 'National Office Solutions', tax_id: 'EIN-89-0123456', payment_terms: 'net-45', currency: 'USD' },
  // GBUK — UK Distribution Ltd.
  { name: 'Sterling Materials UK',     tax_id: 'GB-123456789', payment_terms: 'net-30', currency: 'GBP' },
  { name: 'Thames Valley Electronics', tax_id: 'GB-234567890', payment_terms: 'net-45', currency: 'GBP' },
  { name: 'Manchester Tooling Ltd',    tax_id: 'GB-345678901', payment_terms: 'net-30', currency: 'GBP' },
  { name: 'Edinburgh Chemical Supply', tax_id: 'GB-456789012', payment_terms: 'net-60', currency: 'GBP' },
  { name: 'Bristol Freight Services',  tax_id: 'GB-567890123', payment_terms: 'net-15', currency: 'GBP' },
  { name: 'Crown Packaging PLC',       tax_id: 'GB-678901234', payment_terms: 'net-30', currency: 'GBP' },
  { name: 'York Industrial Fasteners', tax_id: 'GB-789012345', payment_terms: 'net-45', currency: 'GBP' },
];

// 30 POs — 2 per vendor
const PURCHASE_ORDERS = [
  { po_number: 'PO-SEED-001', vendor_idx: 0,  total:  8500, desc: 'Steel fasteners bulk order' },
  { po_number: 'PO-SEED-002', vendor_idx: 0,  total: 12500, desc: 'Industrial bearings Q1' },
  { po_number: 'PO-SEED-003', vendor_idx: 1,  total:  3200, desc: 'PCB assemblies batch A' },
  { po_number: 'PO-SEED-004', vendor_idx: 1,  total: 14200, desc: 'Sensor modules quarterly' },
  { po_number: 'PO-SEED-005', vendor_idx: 2,  total: 15000, desc: 'Sheet metal 2mm stock' },
  { po_number: 'PO-SEED-006', vendor_idx: 2,  total: 18000, desc: 'Aluminum extrusions custom' },
  { po_number: 'PO-SEED-007', vendor_idx: 3,  total:  6750, desc: 'Micro-controllers STM32' },
  { po_number: 'PO-SEED-008', vendor_idx: 3,  total: 16800, desc: 'Power supply modules' },
  { po_number: 'PO-SEED-009', vendor_idx: 4,  total: 22500, desc: 'Custom packaging 50K units' },
  { po_number: 'PO-SEED-010', vendor_idx: 4,  total: 19500, desc: 'Shipping materials Q2' },
  { po_number: 'PO-SEED-011', vendor_idx: 5,  total:  4800, desc: 'Warehouse supplies monthly' },
  { po_number: 'PO-SEED-012', vendor_idx: 5,  total:  4500, desc: 'Pallet wrap & tape' },
  { po_number: 'PO-SEED-013', vendor_idx: 6,  total: 45000, desc: 'CNC end mills set' },
  { po_number: 'PO-SEED-014', vendor_idx: 6,  total: 75000, desc: 'Hydraulic press tooling' },
  { po_number: 'PO-SEED-015', vendor_idx: 7,  total:  2100, desc: 'Printer paper 50 cases' },
  { po_number: 'PO-SEED-016', vendor_idx: 7,  total:  2800, desc: 'Office furniture chairs x4' },
  { po_number: 'PO-SEED-017', vendor_idx: 8,  total: 35000, desc: 'Carbon fiber sheets' },
  { po_number: 'PO-SEED-018', vendor_idx: 8,  total: 42000, desc: 'Composite materials kit' },
  { po_number: 'PO-SEED-019', vendor_idx: 9,  total:  7200, desc: 'LED display panels' },
  { po_number: 'PO-SEED-020', vendor_idx: 9,  total: 32000, desc: 'Industrial controllers' },
  { po_number: 'PO-SEED-021', vendor_idx: 10, total:  1500, desc: 'Drill bits HSS set' },
  { po_number: 'PO-SEED-022', vendor_idx: 10, total: 25000, desc: 'Lathe tooling upgrades' },
  { po_number: 'PO-SEED-023', vendor_idx: 11, total:  7600, desc: 'Solvent supplies Q1' },
  { po_number: 'PO-SEED-024', vendor_idx: 11, total: 11800, desc: 'Catalyst compounds' },
  { po_number: 'PO-SEED-025', vendor_idx: 12, total: 28000, desc: 'Freight contract Q1-Q2' },
  { po_number: 'PO-SEED-026', vendor_idx: 12, total: 21000, desc: 'Express shipping retainer' },
  { po_number: 'PO-SEED-027', vendor_idx: 13, total:  3900, desc: 'Gift box inserts 10K' },
  { po_number: 'PO-SEED-028', vendor_idx: 13, total:  8200, desc: 'Custom branded boxes' },
  { po_number: 'PO-SEED-029', vendor_idx: 14, total: 55000, desc: 'Titanium bolts aerospace' },
  { po_number: 'PO-SEED-030', vendor_idx: 14, total:  6900, desc: 'Standard fasteners mixed' },
];

type TargetState =
  | 'paid' | 'posted' | 'approved' | 'pending_approval'
  | 'auto_approved' | 'match_exception' | 'submitted' | 'rejected';

interface InvoiceSeed {
  invoice_number: string;
  vendor_idx: number;
  po_idx: number | null;       // index into PURCHASE_ORDERS, null = no PO
  amount: number;              // for match_exception, differs from PO total
  due_date: string;
  target_state: TargetState;
  submitter: Actor;
  expense_account: string;     // for posted/paid
  payment_ref?: string;        // for paid
  payment_date?: string;       // for paid
  rejection_reason?: string;   // for rejected
}

// 40 invoices across all lifecycle states
// Dates spread over 120 days for AP aging buckets (ref: 2026-02-25)
const INVOICES: InvoiceSeed[] = [
  // ── 10 Paid (full lifecycle) ──────────────────────────────────────────
  { invoice_number: 'INV-SEED-001', vendor_idx: 0,  po_idx: 0,  amount:  8500, due_date: '2025-11-15', target_state: 'paid', submitter: AP_CLERK, expense_account: '5100-00', payment_ref: 'WIRE-SEED-001', payment_date: '2025-12-01' },
  { invoice_number: 'INV-SEED-002', vendor_idx: 1,  po_idx: 2,  amount:  3200, due_date: '2025-11-25', target_state: 'paid', submitter: AP_CLERK, expense_account: '5200-00', payment_ref: 'WIRE-SEED-002', payment_date: '2025-12-10' },
  { invoice_number: 'INV-SEED-003', vendor_idx: 2,  po_idx: 4,  amount: 15000, due_date: '2025-12-01', target_state: 'paid', submitter: BUYER,    expense_account: '5400-00', payment_ref: 'WIRE-SEED-003', payment_date: '2025-12-20' },
  { invoice_number: 'INV-SEED-004', vendor_idx: 3,  po_idx: 6,  amount:  6750, due_date: '2025-12-10', target_state: 'paid', submitter: AP_CLERK, expense_account: '5200-00', payment_ref: 'WIRE-SEED-004', payment_date: '2025-12-30' },
  { invoice_number: 'INV-SEED-005', vendor_idx: 4,  po_idx: 8,  amount: 22500, due_date: '2025-12-15', target_state: 'paid', submitter: BUYER,    expense_account: '5100-00', payment_ref: 'WIRE-SEED-005', payment_date: '2026-01-05' },
  { invoice_number: 'INV-SEED-006', vendor_idx: 5,  po_idx: 10, amount:  4800, due_date: '2025-12-20', target_state: 'paid', submitter: AP_CLERK, expense_account: '5700-00', payment_ref: 'WIRE-SEED-006', payment_date: '2026-01-10' },
  { invoice_number: 'INV-SEED-007', vendor_idx: 8,  po_idx: 16, amount: 35000, due_date: '2026-01-05', target_state: 'paid', submitter: BUYER,    expense_account: '5400-00', payment_ref: 'WIRE-SEED-007', payment_date: '2026-01-20' },
  { invoice_number: 'INV-SEED-008', vendor_idx: 9,  po_idx: 18, amount:  7200, due_date: '2026-01-10', target_state: 'paid', submitter: AP_CLERK, expense_account: '5200-00', payment_ref: 'WIRE-SEED-008', payment_date: '2026-01-25' },
  { invoice_number: 'INV-SEED-009', vendor_idx: 10, po_idx: 20, amount:  1500, due_date: '2026-01-15', target_state: 'paid', submitter: AP_CLERK, expense_account: '5500-00', payment_ref: 'WIRE-SEED-009', payment_date: '2026-01-30' },
  { invoice_number: 'INV-SEED-010', vendor_idx: 6,  po_idx: 12, amount: 45000, due_date: '2026-01-20', target_state: 'paid', submitter: BUYER,    expense_account: '5100-00', payment_ref: 'WIRE-SEED-010', payment_date: '2026-02-05' },

  // ── 8 Posted (approved + posted to GL) ────────────────────────────────
  { invoice_number: 'INV-SEED-011', vendor_idx: 0,  po_idx: 1,  amount: 12500, due_date: '2025-11-10', target_state: 'posted', submitter: AP_CLERK, expense_account: '5100-00' },
  { invoice_number: 'INV-SEED-012', vendor_idx: 1,  po_idx: null, amount: 5400, due_date: '2025-12-20', target_state: 'posted', submitter: AP_CLERK, expense_account: '5300-00' },
  { invoice_number: 'INV-SEED-013', vendor_idx: 2,  po_idx: 5,  amount: 18000, due_date: '2025-12-28', target_state: 'posted', submitter: BUYER,    expense_account: '5400-00' },
  { invoice_number: 'INV-SEED-014', vendor_idx: 11, po_idx: 22, amount:  7600, due_date: '2026-01-20', target_state: 'posted', submitter: AP_CLERK, expense_account: '5100-00' },
  { invoice_number: 'INV-SEED-015', vendor_idx: 12, po_idx: 24, amount: 28000, due_date: '2026-02-01', target_state: 'posted', submitter: BUYER,    expense_account: '5700-00' },
  { invoice_number: 'INV-SEED-016', vendor_idx: 13, po_idx: 26, amount:  3900, due_date: '2026-02-10', target_state: 'posted', submitter: AP_CLERK, expense_account: '5600-00' },
  { invoice_number: 'INV-SEED-017', vendor_idx: 14, po_idx: 28, amount: 55000, due_date: '2026-03-15', target_state: 'posted', submitter: BUYER,    expense_account: '5400-00' },
  { invoice_number: 'INV-SEED-018', vendor_idx: 7,  po_idx: 14, amount:  2100, due_date: '2026-03-10', target_state: 'posted', submitter: AP_CLERK, expense_account: '5600-00' },

  // ── 5 Approved (deferred, >$10K) ──────────────────────────────────────
  { invoice_number: 'INV-SEED-019', vendor_idx: 0,  po_idx: null, amount: 12500, due_date: '2025-11-20', target_state: 'approved',  submitter: AP_CLERK, expense_account: '5100-00' },
  { invoice_number: 'INV-SEED-020', vendor_idx: 3,  po_idx: 7,   amount: 16800, due_date: '2025-12-10', target_state: 'approved',  submitter: BUYER,    expense_account: '5200-00' },
  { invoice_number: 'INV-SEED-021', vendor_idx: 8,  po_idx: 17,  amount: 42000, due_date: '2026-01-15', target_state: 'approved',  submitter: AP_CLERK, expense_account: '5400-00' },
  { invoice_number: 'INV-SEED-022', vendor_idx: 10, po_idx: 21,  amount: 25000, due_date: '2026-02-15', target_state: 'approved',  submitter: BUYER,    expense_account: '5100-00' },
  { invoice_number: 'INV-SEED-023', vendor_idx: 6,  po_idx: 13,  amount: 75000, due_date: '2026-03-20', target_state: 'approved',  submitter: AP_CLERK, expense_account: '5100-00' },

  // ── 5 Pending Approval (>$10K, awaiting manager approval) ─────────────
  { invoice_number: 'INV-SEED-024', vendor_idx: 1,  po_idx: 3,   amount: 14200, due_date: '2025-12-05', target_state: 'pending_approval', submitter: AP_CLERK, expense_account: '5200-00' },
  { invoice_number: 'INV-SEED-025', vendor_idx: 4,  po_idx: 9,   amount: 19500, due_date: '2026-01-10', target_state: 'pending_approval', submitter: BUYER,    expense_account: '5100-00' },
  { invoice_number: 'INV-SEED-026', vendor_idx: 9,  po_idx: 19,  amount: 32000, due_date: '2026-02-20', target_state: 'pending_approval', submitter: AP_CLERK, expense_account: '5200-00' },
  { invoice_number: 'INV-SEED-027', vendor_idx: 11, po_idx: 23,  amount: 11800, due_date: '2026-01-30', target_state: 'pending_approval', submitter: AP_CLERK, expense_account: '5100-00' },
  { invoice_number: 'INV-SEED-028', vendor_idx: 12, po_idx: 25,  amount: 21000, due_date: '2026-03-05', target_state: 'pending_approval', submitter: BUYER,    expense_account: '5700-00' },

  // ── 4 Auto-approved (\u2264$10K) ──────────────────────────────────────────
  { invoice_number: 'INV-SEED-029', vendor_idx: 5,  po_idx: 11,  amount:  4500, due_date: '2025-12-25', target_state: 'auto_approved', submitter: AP_CLERK, expense_account: '5700-00' },
  { invoice_number: 'INV-SEED-030', vendor_idx: 13, po_idx: 27,  amount:  8200, due_date: '2026-02-05', target_state: 'auto_approved', submitter: AP_CLERK, expense_account: '5600-00' },
  { invoice_number: 'INV-SEED-031', vendor_idx: 14, po_idx: 29,  amount:  6900, due_date: '2026-02-28', target_state: 'auto_approved', submitter: BUYER,    expense_account: '5400-00' },
  { invoice_number: 'INV-SEED-032', vendor_idx: 7,  po_idx: 15,  amount:  2800, due_date: '2026-01-25', target_state: 'auto_approved', submitter: AP_CLERK, expense_account: '5600-00' },

  // ── 3 Match Exception (PO amount mismatch) ────────────────────────────
  // Reuse POs — invoice amount differs from PO total beyond 1% tolerance
  { invoice_number: 'INV-SEED-033', vendor_idx: 0,  po_idx: 0,   amount:  9500, due_date: '2026-02-18', target_state: 'match_exception', submitter: AP_CLERK, expense_account: '5100-00' },
  { invoice_number: 'INV-SEED-034', vendor_idx: 2,  po_idx: 4,   amount: 13800, due_date: '2026-01-05', target_state: 'match_exception', submitter: AP_CLERK, expense_account: '5400-00' },
  { invoice_number: 'INV-SEED-035', vendor_idx: 5,  po_idx: 10,  amount:  5200, due_date: '2025-12-15', target_state: 'match_exception', submitter: BUYER,    expense_account: '5700-00' },

  // ── 3 Submitted (no further action) ───────────────────────────────────
  { invoice_number: 'INV-SEED-036', vendor_idx: 3,  po_idx: null, amount:  4200, due_date: '2026-03-01', target_state: 'submitted', submitter: AP_CLERK, expense_account: '5200-00' },
  { invoice_number: 'INV-SEED-037', vendor_idx: 4,  po_idx: null, amount:  8900, due_date: '2026-02-22', target_state: 'submitted', submitter: BUYER,    expense_account: '5100-00' },
  { invoice_number: 'INV-SEED-038', vendor_idx: 9,  po_idx: null, amount:  3100, due_date: '2026-01-18', target_state: 'submitted', submitter: AP_CLERK, expense_account: '5200-00' },

  // ── 2 Rejected ────────────────────────────────────────────────────────
  { invoice_number: 'INV-SEED-039', vendor_idx: 11, po_idx: null, amount:  6400, due_date: '2026-02-08', target_state: 'rejected', submitter: AP_CLERK, expense_account: '5100-00', rejection_reason: 'Incorrect billing address \u2014 return to vendor' },
  { invoice_number: 'INV-SEED-040', vendor_idx: 14, po_idx: null, amount:  9200, due_date: '2025-11-25', target_state: 'rejected', submitter: AP_CLERK, expense_account: '5400-00', rejection_reason: 'Duplicate of existing purchase \u2014 already processed under PO-2025-4892' },
];

// ─── API helpers ────────────────────────────────────────────────────────────

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
  idempotency_key?: string,
): Promise<{ status: number; data: Record<string, unknown>; ms: number }> {
  return api('POST', '/intents', { type, actor, data, idempotency_key });
}

function extractEntityId(
  result: { data: Record<string, unknown> },
  entityType: string,
): string {
  return ((result.data.event as Record<string, unknown>)
    ?.entities as Array<{ entity_type: string; entity_id: string }>)
    ?.find(e => e.entity_type === entityType)?.entity_id ?? '';
}

// ─── Deferred approval helper ───────────────────────────────────────────────
// For >$10K invoices, the approve handler routes for approval (202).
// After the stored intent is approved, we update the entity + projections
// directly, since the deferred execution endpoint is a stub.

async function deferredApprove(
  pool: pg.Pool,
  invoiceId: string,
  approver: Actor,
  eventIdPrefix: string,
): Promise<void> {
  const approvalEventId = `${eventIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Update entity status
  await pool.query(
    `UPDATE entities
     SET attributes = jsonb_set(
       jsonb_set(attributes, '{status}', '"approved"'),
       '{approved_by}', $2::jsonb
     ),
     version = version + 1,
     updated_at = NOW()
     WHERE entity_type = 'invoice' AND entity_id = $1`,
    [invoiceId, JSON.stringify(approver.id)],
  );
  // Insert approval event for audit trail
  await pool.query(
    `INSERT INTO events (id, type, schema_version, occurred_at, effective_date,
       tenant_id, legal_entity, actor_type, actor_id, actor_name, correlation_id,
       data, entity_refs)
     VALUES (
       $1, 'ap.invoice.approved', 1, NOW(), CURRENT_DATE,
       'default', 'default',
       $2, $3, $4, $5,
       $6::jsonb, $7::jsonb
     )`,
    [
      approvalEventId,
      approver.type, approver.id, approver.name,
      `seed-corr-${Date.now()}`,
      JSON.stringify({
        invoice_id: invoiceId,
        approved_by_id: approver.id,
        approved_by_name: approver.name,
      }),
      JSON.stringify([
        { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
      ]),
    ],
  );
  // Update projections
  await pool.query(
    `UPDATE ap_invoice_list
     SET status = 'approved', approved_by_id = $2, approved_by_name = $3,
         last_event_id = $4, updated_at = NOW()
     WHERE invoice_id = $1`,
    [invoiceId, approver.id, approver.name, approvalEventId],
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${BOLD}${CYAN}Nova ERP \u2014 Seed Data${RESET}`);
  console.log(`${DIM}Populating realistic mid-size company scenario${RESET}\n`);

  // Verify server
  try {
    const health = await api('GET', '/health');
    if (health.data.status !== 'ok') throw new Error('unhealthy');
    console.log(`  Server: ${BASE_URL} ${green('healthy')}`);
  } catch {
    console.error(red(`\n  Server not reachable at ${BASE_URL}`));
    console.error(dim('  Run: pnpm demo:setup   (starts server + migrations)'));
    process.exit(1);
  }

  const pool = new pg.Pool(DB_CONFIG);
  const vendorIds: string[] = [];
  const poIds: string[] = [];
  const invoiceIds: string[] = [];
  let eventsCreated = 0;

  // ────────────────────────────────────────────────────────────────────────
  // Phase 1: Vendors
  // ────────────────────────────────────────────────────────────────────────

  section(`Creating ${VENDORS.length} vendors`);

  for (let i = 0; i < VENDORS.length; i++) {
    const v = VENDORS[i];
    const result = await postIntent('mdm.vendor.create', BUYER, {
      name: v.name,
      tax_id: v.tax_id,
      payment_terms: v.payment_terms,
      currency: v.currency,
      status: 'active',
    }, `seed-vendor-${v.name.toLowerCase().replace(/\s+/g, '-')}`);

    if (result.status >= 400) {
      console.error(red(`\n  Failed to create vendor ${v.name}: ${result.data.error ?? result.data.message}`));
      process.exit(1);
    }

    vendorIds.push(extractEntityId(result, 'vendor'));
    eventsCreated++;
    progress(i + 1, VENDORS.length, v.name);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Phase 2: Purchase Orders
  // ────────────────────────────────────────────────────────────────────────

  section(`Creating ${PURCHASE_ORDERS.length} purchase orders`);

  for (let i = 0; i < PURCHASE_ORDERS.length; i++) {
    const po = PURCHASE_ORDERS[i];
    const vendorId = vendorIds[po.vendor_idx];
    const currency = VENDORS[po.vendor_idx].currency;

    const result = await postIntent('ap.purchase_order.create', BUYER, {
      po_number: po.po_number,
      vendor_id: vendorId,
      total: po.total,
      currency,
      lines: [{ item: po.desc, quantity: 1, unit_price: po.total, total: po.total }],
    }, `seed-po-${po.po_number.toLowerCase()}`);

    if (result.status >= 400) {
      console.error(red(`\n  Failed to create PO ${po.po_number}: ${result.data.error ?? result.data.message}`));
      process.exit(1);
    }

    poIds.push(extractEntityId(result, 'purchase_order'));
    eventsCreated++;
    progress(i + 1, PURCHASE_ORDERS.length, po.po_number);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Phase 3: Submit all invoices
  // ────────────────────────────────────────────────────────────────────────

  section(`Submitting ${INVOICES.length} invoices`);

  for (let i = 0; i < INVOICES.length; i++) {
    const inv = INVOICES[i];
    const vendorId = vendorIds[inv.vendor_idx];
    const currency = VENDORS[inv.vendor_idx].currency;
    const poId = inv.po_idx !== null ? poIds[inv.po_idx] : undefined;
    const poNumber = inv.po_idx !== null ? PURCHASE_ORDERS[inv.po_idx].po_number : undefined;

    const intentData: Record<string, unknown> = {
      invoice_number: inv.invoice_number,
      vendor_id: vendorId,
      amount: inv.amount,
      currency,
      due_date: inv.due_date,
    };
    if (poId) {
      intentData.po_id = poId;
      intentData.po_number = poNumber;
    }

    const result = await postIntent(
      'ap.invoice.submit',
      inv.submitter,
      intentData,
      `seed-inv-${inv.invoice_number.toLowerCase()}`,
    );

    if (result.status >= 400) {
      console.error(red(`\n  Failed to submit ${inv.invoice_number}: ${result.data.error ?? result.data.message}`));
      process.exit(1);
    }

    invoiceIds.push(extractEntityId(result, 'invoice'));
    eventsCreated++;
    // Match events count toward total too
    if (inv.po_idx !== null) eventsCreated++;
    progress(i + 1, INVOICES.length, inv.invoice_number);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Phase 4: Progress invoices to target states
  // ────────────────────────────────────────────────────────────────────────

  section('Progressing invoices through lifecycle');

  // Helper: check current invoice entity status
  async function getInvoiceStatus(invoiceId: string): Promise<string> {
    const { rows } = await pool.query(
      `SELECT attributes->>'status' as status FROM entities
       WHERE entity_type = 'invoice' AND entity_id = $1`,
      [invoiceId],
    );
    return rows[0]?.status ?? 'unknown';
  }

  let lifecycleStep = 0;
  const lifecycleTotal = INVOICES.filter(inv =>
    inv.target_state !== 'submitted' && inv.target_state !== 'match_exception',
  ).length;

  for (let i = 0; i < INVOICES.length; i++) {
    const inv = INVOICES[i];
    const invoiceId = invoiceIds[i];

    // Skip invoices that need no further action
    if (inv.target_state === 'submitted' || inv.target_state === 'match_exception') {
      continue;
    }

    lifecycleStep++;
    const currentStatus = await getInvoiceStatus(invoiceId);

    // ── APPROVE step ──────────────────────────────────────────────────
    if (['paid', 'posted', 'approved', 'auto_approved', 'pending_approval'].includes(inv.target_state)) {
      if (currentStatus === 'submitted' || currentStatus === 'matched') {
        const approveResult = await postIntent('ap.invoice.approve', AP_MANAGER, {
          invoice_id: invoiceId,
        });

        if (approveResult.status === 202) {
          // >$10K: routed for approval
          const intentId = approveResult.data.intent_id as string;

          if (inv.target_state === 'pending_approval') {
            // Leave in pending state — don't execute
            progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 pending_approval`);
            continue;
          }

          // Approve the stored intent
          await api('POST', `/intents/${intentId}/approve`, {
            reason: 'Approved per procurement policy',
          });

          // Execute deferred approval via direct DB
          await deferredApprove(pool, invoiceId, AP_MANAGER, `seed-approve-${inv.invoice_number.toLowerCase()}`);
          eventsCreated++;
        } else if (approveResult.status === 201) {
          // ≤$10K: auto-approved
          eventsCreated++;
        } else {
          console.error(red(`\n  Approve failed for ${inv.invoice_number}: ${approveResult.data.error ?? approveResult.data.message}`));
          progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 FAILED`);
          continue;
        }
      }
    }

    // Stop here for auto_approved and approved
    if (inv.target_state === 'auto_approved' || inv.target_state === 'approved') {
      progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 approved`);
      continue;
    }

    // ── REJECT step ───────────────────────────────────────────────────
    if (inv.target_state === 'rejected') {
      const rejectStatus = await getInvoiceStatus(invoiceId);
      if (rejectStatus !== 'rejected') {
        const rejectResult = await postIntent('ap.invoice.reject', AP_MANAGER, {
          invoice_id: invoiceId,
          rejection_reason: inv.rejection_reason ?? 'Rejected during review',
        }, `seed-reject-${inv.invoice_number.toLowerCase()}`);

        if (rejectResult.status === 201) {
          eventsCreated++;
        } else {
          console.error(red(`\n  Reject failed for ${inv.invoice_number}: ${rejectResult.data.error ?? rejectResult.data.message}`));
        }
      }
      progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 rejected`);
      continue;
    }

    // ── POST step ─────────────────────────────────────────────────────
    if (['paid', 'posted'].includes(inv.target_state)) {
      const postStatus = await getInvoiceStatus(invoiceId);
      if (postStatus === 'approved') {
        const postResult = await postIntent('ap.invoice.post', AP_MANAGER, {
          invoice_id: invoiceId,
          expense_account: inv.expense_account,
        }, `seed-post-${inv.invoice_number.toLowerCase()}`);

        if (postResult.status === 201) {
          eventsCreated++;
        } else {
          console.error(red(`\n  Post failed for ${inv.invoice_number}: ${postResult.data.error ?? postResult.data.message}`));
          progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 FAILED`);
          continue;
        }
      }
    }

    // Stop here for posted
    if (inv.target_state === 'posted') {
      progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 posted`);
      continue;
    }

    // ── PAY step ──────────────────────────────────────────────────────
    if (inv.target_state === 'paid') {
      const payStatus = await getInvoiceStatus(invoiceId);
      if (payStatus === 'posted') {
        const payResult = await postIntent('ap.invoice.pay', SYSTEM, {
          invoice_id: invoiceId,
          payment_reference: inv.payment_ref,
          payment_date: inv.payment_date,
        }, `seed-pay-${inv.invoice_number.toLowerCase()}`);

        if (payResult.status === 201) {
          eventsCreated++;
        } else {
          console.error(red(`\n  Pay failed for ${inv.invoice_number}: ${payResult.data.error ?? payResult.data.message}`));
          progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 FAILED`);
          continue;
        }
      }
      progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 paid`);
      continue;
    }

    progress(lifecycleStep, lifecycleTotal, `${inv.invoice_number} \u2192 ${inv.target_state}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────────────────────

  section('Summary');

  // Count totals from DB
  const { rows: eventRows } = await pool.query('SELECT COUNT(*) as cnt FROM events');
  const totalEvents = Number(eventRows[0].cnt);

  const { rows: entityRows } = await pool.query(
    `SELECT entity_type, COUNT(*) as cnt FROM entities GROUP BY entity_type ORDER BY entity_type`,
  );

  const { rows: projRows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM ap_invoice_list) as invoices,
      (SELECT COUNT(*) FROM ap_aging) as aging,
      (SELECT COUNT(*) FROM ap_vendor_balance) as vendor_bal,
      (SELECT COUNT(*) FROM gl_postings) as gl
  `);
  const proj = projRows[0];

  // Invoice status distribution
  const { rows: statusRows } = await pool.query(
    `SELECT status, COUNT(*) as cnt FROM ap_invoice_list GROUP BY status ORDER BY status`,
  );

  // GL balance check
  const { rows: glBalance } = await pool.query(
    `SELECT SUM(debit) as total_debit, SUM(credit) as total_credit FROM gl_postings`,
  );
  const totalDebit = Number(glBalance[0]?.total_debit ?? 0);
  const totalCredit = Number(glBalance[0]?.total_credit ?? 0);
  const variance = Math.abs(totalDebit - totalCredit);

  // AP aging buckets
  const { rows: agingRows } = await pool.query(
    `SELECT aging_bucket, status, COUNT(*) as cnt, SUM(amount) as total
     FROM ap_aging
     GROUP BY aging_bucket, status
     ORDER BY aging_bucket`,
  );

  // Print results
  console.log(`\n  ${BOLD}Entities${RESET}`);
  for (const row of entityRows) {
    console.log(`    ${CYAN}${row.entity_type}${RESET}: ${row.cnt}`);
  }

  console.log(`\n  ${BOLD}Events${RESET}`);
  console.log(`    Total: ${green(String(totalEvents))}`);

  console.log(`\n  ${BOLD}Invoice Status Distribution${RESET}`);
  for (const row of statusRows) {
    const color = row.status === 'paid' ? GREEN
      : row.status === 'rejected' ? RED
      : row.status === 'match_exception' ? RED
      : CYAN;
    console.log(`    ${color}${row.status}${RESET}: ${row.cnt}`);
  }

  console.log(`\n  ${BOLD}Projections${RESET}`);
  console.log(`    Invoice list: ${proj.invoices} rows`);
  console.log(`    AP aging:     ${proj.aging} rows`);
  console.log(`    Vendor bal:   ${proj.vendor_bal} rows`);
  console.log(`    GL postings:  ${proj.gl} rows`);

  console.log(`\n  ${BOLD}AP Aging Buckets${RESET}`);
  for (const row of agingRows) {
    const amount = Number(row.total);
    console.log(`    ${CYAN}${row.aging_bucket.padEnd(8)}${RESET} (${row.status}): ${row.cnt} invoices, $${amount.toLocaleString()}`);
  }

  console.log(`\n  ${BOLD}GL Balance${RESET}`);
  console.log(`    Debits:   $${totalDebit.toLocaleString()}`);
  console.log(`    Credits:  $${totalCredit.toLocaleString()}`);
  console.log(`    Variance: ${variance === 0 ? green('$0.00') : red(`$${variance.toLocaleString()}`)}`);

  console.log(`\n  ${green('\u2713')} Seed complete\n`);

  await pool.end();
}

main().catch((err) => {
  console.error(red(`\nSeed failed: ${(err as Error).message}`));
  console.error(dim((err as Error).stack ?? ''));
  process.exit(1);
});
