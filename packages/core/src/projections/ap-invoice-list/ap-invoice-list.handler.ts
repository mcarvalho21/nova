import type pg from 'pg';
import type { BaseEvent } from '../../event-store/types.js';
import type { ProjectionHandler } from '../../projection-engine/types.js';
import { AP_INVOICE_LIST_QUERIES } from './ap-invoice-list.queries.js';

export const apInvoiceListHandler: ProjectionHandler = {
  projection_type: 'ap_invoice_list',
  event_types: [
    'ap.invoice.submitted',
    'ap.invoice.matched',
    'ap.invoice.match_exception',
    'ap.invoice.approved',
    'ap.invoice.rejected',
    'ap.invoice.posted',
    'ap.invoice.paid',
    'ap.invoice.cancelled',
  ],

  async handle(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const data = event.data as Record<string, unknown>;
    const legalEntity = event.scope.legal_entity ?? 'default';

    switch (event.type) {
      case 'ap.invoice.submitted': {
        const invoiceRef = event.entities.find(
          (e) => e.entity_type === 'invoice' && e.role === 'subject',
        );
        if (!invoiceRef) return;

        await client.query(AP_INVOICE_LIST_QUERIES.UPSERT, [
          invoiceRef.entity_id,
          data.invoice_number as string,
          data.vendor_id as string,
          data.vendor_name as string,
          data.po_id ?? null,
          data.po_number ?? null,
          data.amount as number,
          (data.currency as string) ?? 'USD',
          data.due_date as string,
          'submitted',
          event.actor.id,
          event.actor.name,
          legalEntity,
          event.id,
        ]);
        break;
      }

      case 'ap.invoice.matched': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_STATUS, [
          invoiceId,
          'matched',
          event.id,
        ]);
        if (data.variance !== undefined) {
          await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_MATCH_VARIANCE, [
            invoiceId,
            data.variance as number,
            event.id,
          ]);
        }
        break;
      }

      case 'ap.invoice.match_exception': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_STATUS, [
          invoiceId,
          'match_exception',
          event.id,
        ]);
        if (data.variance !== undefined) {
          await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_MATCH_VARIANCE, [
            invoiceId,
            data.variance as number,
            event.id,
          ]);
        }
        break;
      }

      case 'ap.invoice.approved': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_APPROVED, [
          invoiceId,
          data.approved_by_id ?? event.actor.id,
          data.approved_by_name ?? event.actor.name,
          event.id,
        ]);
        break;
      }

      case 'ap.invoice.rejected': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_REJECTED, [
          invoiceId,
          data.rejection_reason as string,
          event.id,
        ]);
        break;
      }

      case 'ap.invoice.posted': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_STATUS, [
          invoiceId,
          'posted',
          event.id,
        ]);
        break;
      }

      case 'ap.invoice.paid': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_PAID, [
          invoiceId,
          data.payment_reference as string,
          data.payment_date as string,
          event.id,
        ]);
        break;
      }

      case 'ap.invoice.cancelled': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_INVOICE_LIST_QUERIES.UPDATE_STATUS, [
          invoiceId,
          'cancelled',
          event.id,
        ]);
        break;
      }
    }
  },

  async reset(client: pg.PoolClient): Promise<void> {
    await client.query('TRUNCATE TABLE ap_invoice_list');
  },
};
