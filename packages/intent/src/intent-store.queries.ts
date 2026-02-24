export const INTENT_STORE_QUERIES = {
  INSERT: `
    INSERT INTO intents (
      id, type, status, actor_id, actor_name, actor_type,
      legal_entity, data, required_approver_role,
      correlation_id, idempotency_key, effective_date, occurred_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12, $13
    )
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM intents WHERE id = $1
  `,

  UPDATE_STATUS: `
    UPDATE intents
    SET status = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  APPROVE: `
    UPDATE intents
    SET status = 'approved',
        approved_by_id = $2,
        approved_by_name = $3,
        approval_reason = $4,
        updated_at = NOW()
    WHERE id = $1 AND status = 'pending_approval'
    RETURNING *
  `,

  REJECT: `
    UPDATE intents
    SET status = 'rejected',
        rejected_by_id = $2,
        rejected_by_name = $3,
        rejection_reason = $4,
        updated_at = NOW()
    WHERE id = $1 AND status = 'pending_approval'
    RETURNING *
  `,

  MARK_EXECUTED: `
    UPDATE intents
    SET status = 'executed',
        result_event_id = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  MARK_FAILED: `
    UPDATE intents
    SET status = 'failed',
        result_error = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,
} as const;
