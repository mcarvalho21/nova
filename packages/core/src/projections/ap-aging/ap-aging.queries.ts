export const AP_AGING_QUERIES = {
  UPSERT: `
    INSERT INTO ap_aging (id, legal_entity, vendor_id, invoice_id, amount, currency, due_date, aging_bucket, status, last_event_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (invoice_id) DO UPDATE SET
      aging_bucket = EXCLUDED.aging_bucket,
      status = EXCLUDED.status,
      last_event_id = EXCLUDED.last_event_id,
      updated_at = NOW()
  `,

  UPDATE_STATUS: `
    UPDATE ap_aging
    SET status = $2, last_event_id = $3, updated_at = NOW()
    WHERE invoice_id = $1
  `,

  LIST: `
    SELECT * FROM ap_aging ORDER BY due_date
  `,

  LIST_BY_BUCKET: `
    SELECT * FROM ap_aging WHERE aging_bucket = $1 AND status = 'open' ORDER BY due_date
  `,

  SUMMARY_BY_BUCKET: `
    SELECT aging_bucket, COUNT(*) as invoice_count, SUM(amount) as total_amount, currency
    FROM ap_aging
    WHERE status = 'open' AND legal_entity = $1
    GROUP BY aging_bucket, currency
    ORDER BY aging_bucket
  `,

  GET_BY_INVOICE: `
    SELECT * FROM ap_aging WHERE invoice_id = $1
  `,
} as const;
