import { generateId } from '@nova/core';
import type { AppendEventInput, EventActor } from '@nova/core';

const LEGAL_ENTITIES = ['LE-001', 'LE-002', 'LE-003', 'LE-004', 'LE-005'];
const CURRENCIES = ['USD', 'EUR', 'GBP'];
const EXPENSE_ACCOUNTS = ['5000-00', '5100-00', '5200-00', '5300-00'];

const SYSTEM_ACTOR: EventActor = {
  type: 'system',
  id: 'stress-generator',
  name: 'Stress Test Generator',
};

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(): number {
  return Math.round((Math.random() * 99_000 + 1_000) * 100) / 100;
}

function randomDueDate(): string {
  const offset = Math.floor(Math.random() * 120) - 30; // -30 to +90 days
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function randomPastDate(daysBack: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date.toISOString().slice(0, 10);
}

/**
 * Generate a single synthetic AP invoice submitted event.
 */
export function generateInvoiceSubmittedEvent(
  options: {
    legalEntity?: string;
    vendorId?: string;
    invoiceId?: string;
    amount?: number;
    correlationId?: string;
  } = {},
): AppendEventInput {
  const legalEntity = options.legalEntity ?? randomItem(LEGAL_ENTITIES);
  const vendorId = options.vendorId ?? `vendor-${generateId()}`;
  const invoiceId = options.invoiceId ?? generateId();
  const amount = options.amount ?? randomAmount();
  const currency = randomItem(CURRENCIES);
  const correlationId = options.correlationId ?? generateId();

  return {
    type: 'ap.invoice.submitted',
    actor: SYSTEM_ACTOR,
    correlation_id: correlationId,
    scope: { tenant_id: 'default', legal_entity: legalEntity },
    data: {
      invoice_number: `INV-${invoiceId.slice(0, 8)}`,
      vendor_id: vendorId,
      vendor_name: `Vendor ${vendorId.slice(0, 6)}`,
      amount,
      currency,
      due_date: randomDueDate(),
      lines: [
        { description: 'Line item 1', quantity: 1, unit_price: amount },
      ],
    },
    entities: [
      { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
      { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
    ],
    effective_date: randomPastDate(30),
  };
}

/**
 * Generate a batch of AP events for a complete invoice lifecycle:
 * submitted → matched → approved → posted → paid
 * Returns 5 events per invoice.
 */
export function generateInvoiceLifecycleBatch(
  options: {
    legalEntity?: string;
    vendorId?: string;
    count?: number;
  } = {},
): AppendEventInput[] {
  const legalEntity = options.legalEntity ?? randomItem(LEGAL_ENTITIES);
  const vendorId = options.vendorId ?? `vendor-${generateId()}`;
  const events: AppendEventInput[] = [];

  const count = options.count ?? 1;

  for (let i = 0; i < count; i++) {
    const invoiceId = generateId();
    const amount = randomAmount();
    const currency = randomItem(CURRENCIES);
    const dueDate = randomDueDate();
    const correlationId = generateId();
    const expenseAccount = randomItem(EXPENSE_ACCOUNTS);

    // 1. submitted
    events.push({
      type: 'ap.invoice.submitted',
      actor: SYSTEM_ACTOR,
      correlation_id: correlationId,
      scope: { tenant_id: 'default', legal_entity: legalEntity },
      data: {
        invoice_number: `INV-${invoiceId.slice(0, 8)}`,
        vendor_id: vendorId,
        vendor_name: `Vendor ${vendorId.slice(0, 6)}`,
        amount,
        currency,
        due_date: dueDate,
        lines: [{ description: 'Line 1', quantity: 1, unit_price: amount }],
      },
      entities: [
        { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
        { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
      ],
      effective_date: randomPastDate(30),
    });

    // 2. matched
    events.push({
      type: 'ap.invoice.matched',
      actor: { type: 'system', id: 'system', name: 'Match Engine' },
      correlation_id: correlationId,
      scope: { tenant_id: 'default', legal_entity: legalEntity },
      data: {
        invoice_id: invoiceId,
        match_type: '3-way',
        po_amount: amount,
        invoice_amount: amount,
        variance: 0,
      },
      entities: [
        { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
      ],
    });

    // 3. approved
    events.push({
      type: 'ap.invoice.approved',
      actor: { type: 'human', id: 'approver-001', name: 'AP Manager' },
      correlation_id: correlationId,
      scope: { tenant_id: 'default', legal_entity: legalEntity },
      data: {
        invoice_id: invoiceId,
        approved_by_id: 'approver-001',
        approved_by_name: 'AP Manager',
      },
      entities: [
        { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
      ],
    });

    // 4. posted (with GL entries)
    events.push({
      type: 'ap.invoice.posted',
      actor: SYSTEM_ACTOR,
      correlation_id: correlationId,
      scope: { tenant_id: 'default', legal_entity: legalEntity },
      data: {
        invoice_id: invoiceId,
        amount,
        currency,
        vendor_id: vendorId,
        expense_account: expenseAccount,
        gl_entries: [
          { account_code: expenseAccount, debit: amount, credit: 0, description: 'AP posted - expense' },
          { account_code: '2100-00', debit: 0, credit: amount, description: 'AP posted - AP control' },
        ],
      },
      entities: [
        { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
      ],
    });

    // 5. paid (with GL entries)
    events.push({
      type: 'ap.invoice.paid',
      actor: SYSTEM_ACTOR,
      correlation_id: correlationId,
      scope: { tenant_id: 'default', legal_entity: legalEntity },
      data: {
        invoice_id: invoiceId,
        payment_reference: `PAY-${generateId().slice(0, 8)}`,
        payment_date: new Date().toISOString().slice(0, 10),
        amount,
        currency,
        vendor_id: vendorId,
      },
      entities: [
        { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
      ],
    });
  }

  return events;
}

/**
 * Generate N raw AP events distributed across legal entities.
 * Used for throughput testing — events are not lifecycle-correlated.
 */
export function generateBulkEvents(
  count: number,
  legalEntity?: string,
): AppendEventInput[] {
  const events: AppendEventInput[] = [];
  for (let i = 0; i < count; i++) {
    events.push(
      generateInvoiceSubmittedEvent({
        legalEntity: legalEntity ?? randomItem(LEGAL_ENTITIES),
      }),
    );
  }
  return events;
}

/**
 * Seed events directly via SQL for fast bulk loading (bypasses service layer).
 * Returns the number of events inserted.
 */
export async function seedEventsDirectSQL(
  pool: import('pg').Pool,
  count: number,
  legalEntity: string = 'LE-001',
): Promise<number> {
  const batchSize = 500;
  let inserted = 0;

  for (let batch = 0; batch < count; batch += batchSize) {
    const size = Math.min(batchSize, count - batch);
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (let i = 0; i < size; i++) {
      const id = generateId();
      const invoiceId = generateId();
      const vendorId = `vendor-${(batch + i) % 100}`;
      const amount = Math.round((Math.random() * 99_000 + 1_000) * 100) / 100;
      const currency = randomItem(CURRENCIES);
      const dueDate = randomDueDate();
      const correlationId = generateId();

      values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12})`);
      params.push(
        id, // id
        'ap.invoice.submitted', // type
        1, // schema_version
        new Date(), // occurred_at
        'default', // tenant_id
        legalEntity, // legal_entity
        'system', // actor_type
        'stress-generator', // actor_id
        'Stress Generator', // actor_name
        correlationId, // correlation_id
        JSON.stringify({
          invoice_number: `INV-${id.slice(0, 8)}`,
          vendor_id: vendorId,
          vendor_name: `Vendor ${vendorId}`,
          amount,
          currency,
          due_date: dueDate,
          lines: [{ description: 'Bulk item', quantity: 1, unit_price: amount }],
        }), // data
        JSON.stringify([
          { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
          { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
        ]), // entity_refs
        dueDate, // effective_date
      );
      paramIdx += 13;
    }

    await pool.query(
      `INSERT INTO events (id, type, schema_version, occurred_at, tenant_id, legal_entity, actor_type, actor_id, actor_name, correlation_id, data, entity_refs, effective_date)
       VALUES ${values.join(', ')}`,
      params,
    );
    inserted += size;
  }

  return inserted;
}

/**
 * Seed lifecycle events (submitted + posted) via SQL for reconciliation testing.
 * Each invoice gets a submitted event and a posted event with balanced GL entries.
 */
export async function seedLifecycleEventsDirectSQL(
  pool: import('pg').Pool,
  invoiceCount: number,
  legalEntity: string = 'LE-001',
): Promise<{ eventCount: number; totalAmount: number }> {
  const batchSize = 250; // 2 events per invoice = 500 rows per batch
  let totalAmount = 0;
  let eventCount = 0;

  for (let batch = 0; batch < invoiceCount; batch += batchSize) {
    const size = Math.min(batchSize, invoiceCount - batch);
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (let i = 0; i < size; i++) {
      const invoiceId = generateId();
      const vendorId = `vendor-${(batch + i) % 100}`;
      const amount = Math.round((Math.random() * 99_000 + 1_000) * 100) / 100;
      totalAmount += amount;
      const currency = 'USD';
      const dueDate = randomDueDate();
      const correlationId = generateId();
      const submittedId = generateId();
      const postedId = generateId();

      const now = new Date();

      // submitted event
      values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12})`);
      params.push(
        submittedId,
        'ap.invoice.submitted',
        1,
        now, // occurred_at
        'default',
        legalEntity,
        'system', 'stress-generator', 'Stress Generator',
        correlationId,
        JSON.stringify({
          invoice_number: `INV-${submittedId.slice(0, 8)}`,
          vendor_id: vendorId,
          vendor_name: `Vendor ${vendorId}`,
          amount,
          currency,
          due_date: dueDate,
          lines: [{ description: 'Line 1', quantity: 1, unit_price: amount }],
        }),
        JSON.stringify([
          { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
          { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
        ]),
        dueDate,
      );
      paramIdx += 13;

      // posted event (with GL entries in data)
      values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12})`);
      params.push(
        postedId,
        'ap.invoice.posted',
        1,
        now, // occurred_at
        'default',
        legalEntity,
        'system', 'stress-generator', 'Stress Generator',
        correlationId,
        JSON.stringify({
          invoice_id: invoiceId,
          amount,
          currency,
          vendor_id: vendorId,
          expense_account: '5000-00',
          gl_entries: [
            { account_code: '5000-00', debit: amount, credit: 0, description: 'AP posted - expense' },
            { account_code: '2100-00', debit: 0, credit: amount, description: 'AP posted - AP control' },
          ],
        }),
        JSON.stringify([
          { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
        ]),
        dueDate,
      );
      paramIdx += 13;

      eventCount += 2;
    }

    await pool.query(
      `INSERT INTO events (id, type, schema_version, occurred_at, tenant_id, legal_entity, actor_type, actor_id, actor_name, correlation_id, data, entity_refs, effective_date)
       VALUES ${values.join(', ')}`,
      params,
    );
  }

  return { eventCount, totalAmount };
}

export { LEGAL_ENTITIES, SYSTEM_ACTOR };
