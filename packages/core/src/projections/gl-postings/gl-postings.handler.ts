import type pg from 'pg';
import type { BaseEvent } from '../../event-store/types.js';
import type { ProjectionHandler } from '../../projection-engine/types.js';
import { generateId } from '../../shared/types.js';
import { GL_POSTINGS_QUERIES } from './gl-postings.queries.js';

export const glPostingsHandler: ProjectionHandler = {
  projection_type: 'gl_postings',
  event_types: [
    'ap.invoice.posted',
    'ap.invoice.paid',
  ],

  async handle(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const data = event.data as Record<string, unknown>;
    const legalEntity = event.scope.legal_entity ?? 'default';
    const invoiceId = data.invoice_id as string;
    const amount = data.amount as number;
    const currency = (data.currency as string) ?? 'USD';

    switch (event.type) {
      case 'ap.invoice.posted': {
        // GL entries from provided data or generate standard AP posting
        const glEntries = data.gl_entries as Array<{
          account_code: string;
          debit: number;
          credit: number;
          description?: string;
        }> | undefined;

        if (glEntries && glEntries.length > 0) {
          for (const entry of glEntries) {
            await client.query(GL_POSTINGS_QUERIES.INSERT, [
              generateId(),
              legalEntity,
              event.id,
              event.type,
              invoiceId,
              entry.account_code,
              entry.debit,
              entry.credit,
              currency,
              entry.description ?? null,
            ]);
          }
        } else {
          // Default AP posting: debit expense, credit AP control
          const expenseAccount = (data.expense_account as string) ?? '5000-00';
          const apControlAccount = '2100-00';

          // Debit expense
          await client.query(GL_POSTINGS_QUERIES.INSERT, [
            generateId(),
            legalEntity,
            event.id,
            event.type,
            invoiceId,
            expenseAccount,
            amount,
            0,
            currency,
            `AP Invoice posted - expense`,
          ]);

          // Credit AP control
          await client.query(GL_POSTINGS_QUERIES.INSERT, [
            generateId(),
            legalEntity,
            event.id,
            event.type,
            invoiceId,
            apControlAccount,
            0,
            amount,
            currency,
            `AP Invoice posted - AP control`,
          ]);
        }
        break;
      }

      case 'ap.invoice.paid': {
        // Payment: debit AP control (reduce liability), credit cash/bank
        const apControlAccount = '2100-00';
        const cashAccount = (data.cash_account as string) ?? '1000-00';

        // Debit AP control
        await client.query(GL_POSTINGS_QUERIES.INSERT, [
          generateId(),
          legalEntity,
          event.id,
          event.type,
          invoiceId,
          apControlAccount,
          amount,
          0,
          currency,
          `AP Invoice paid - clear AP`,
        ]);

        // Credit cash
        await client.query(GL_POSTINGS_QUERIES.INSERT, [
          generateId(),
          legalEntity,
          event.id,
          event.type,
          invoiceId,
          cashAccount,
          0,
          amount,
          currency,
          `AP Invoice paid - cash out`,
        ]);
        break;
      }
    }
  },

  async reset(client: pg.PoolClient): Promise<void> {
    await client.query('TRUNCATE TABLE gl_postings');
  },
};
