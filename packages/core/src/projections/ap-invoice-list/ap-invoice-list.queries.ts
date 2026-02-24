export const AP_INVOICE_LIST_QUERIES = {
  UPSERT: `
    INSERT INTO ap_invoice_list (
      invoice_id, invoice_number, vendor_id, vendor_name, po_id, po_number,
      amount, currency, due_date, status, submitted_by_id, submitted_by_name,
      legal_entity, last_event_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (invoice_id) DO UPDATE SET
      status = EXCLUDED.status,
      last_event_id = EXCLUDED.last_event_id,
      updated_at = NOW()
  `,

  UPDATE_STATUS: `
    UPDATE ap_invoice_list
    SET status = $2, last_event_id = $3, updated_at = NOW()
    WHERE invoice_id = $1
  `,

  UPDATE_APPROVED: `
    UPDATE ap_invoice_list
    SET status = 'approved', approved_by_id = $2, approved_by_name = $3,
        last_event_id = $4, updated_at = NOW()
    WHERE invoice_id = $1
  `,

  UPDATE_REJECTED: `
    UPDATE ap_invoice_list
    SET status = 'rejected', rejection_reason = $2,
        last_event_id = $3, updated_at = NOW()
    WHERE invoice_id = $1
  `,

  UPDATE_PAID: `
    UPDATE ap_invoice_list
    SET status = 'paid', payment_reference = $2, payment_date = $3,
        last_event_id = $4, updated_at = NOW()
    WHERE invoice_id = $1
  `,

  UPDATE_MATCH_VARIANCE: `
    UPDATE ap_invoice_list
    SET match_variance = $2, last_event_id = $3, updated_at = NOW()
    WHERE invoice_id = $1
  `,

  LIST: `
    SELECT * FROM ap_invoice_list ORDER BY created_at DESC
  `,

  GET_BY_ID: `
    SELECT * FROM ap_invoice_list WHERE invoice_id = $1
  `,

  LIST_BY_VENDOR: `
    SELECT * FROM ap_invoice_list WHERE vendor_id = $1 ORDER BY created_at DESC
  `,

  LIST_BY_STATUS: `
    SELECT * FROM ap_invoice_list WHERE status = $1 ORDER BY created_at DESC
  `,
} as const;
