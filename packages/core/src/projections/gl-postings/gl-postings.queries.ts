export const GL_POSTINGS_QUERIES = {
  INSERT: `
    INSERT INTO gl_postings (posting_id, legal_entity, event_id, event_type, invoice_id, account_code, debit, credit, currency, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `,

  LIST: `
    SELECT * FROM gl_postings ORDER BY posted_at DESC
  `,

  LIST_BY_INVOICE: `
    SELECT * FROM gl_postings WHERE invoice_id = $1 ORDER BY posted_at
  `,

  LIST_BY_ACCOUNT: `
    SELECT * FROM gl_postings WHERE account_code = $1 AND legal_entity = $2 ORDER BY posted_at
  `,

  BALANCE_BY_ACCOUNT: `
    SELECT account_code, SUM(debit) as total_debit, SUM(credit) as total_credit,
           SUM(debit) - SUM(credit) as balance, currency
    FROM gl_postings
    WHERE legal_entity = $1
    GROUP BY account_code, currency
    ORDER BY account_code
  `,
} as const;
