export const AP_VENDOR_BALANCE_QUERIES = {
  UPSERT_ADD: `
    INSERT INTO ap_vendor_balance (vendor_id, legal_entity, outstanding_amount, currency, invoice_count, last_event_id)
    VALUES ($1, $2, $3, $4, 1, $5)
    ON CONFLICT (vendor_id, legal_entity) DO UPDATE SET
      outstanding_amount = ap_vendor_balance.outstanding_amount + $3,
      invoice_count = ap_vendor_balance.invoice_count + 1,
      last_event_id = EXCLUDED.last_event_id,
      updated_at = NOW()
  `,

  REDUCE: `
    UPDATE ap_vendor_balance
    SET outstanding_amount = outstanding_amount - $3,
        invoice_count = GREATEST(invoice_count - 1, 0),
        last_event_id = $4,
        updated_at = NOW()
    WHERE vendor_id = $1 AND legal_entity = $2
  `,

  GET: `
    SELECT * FROM ap_vendor_balance WHERE vendor_id = $1 AND legal_entity = $2
  `,

  LIST: `
    SELECT * FROM ap_vendor_balance ORDER BY outstanding_amount DESC
  `,
} as const;
