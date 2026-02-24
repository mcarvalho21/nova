export const QUERIES = {
  INSERT_EVENT: `
    INSERT INTO events (
      id, type, schema_version,
      occurred_at, effective_date,
      tenant_id, legal_entity,
      actor_type, actor_id, actor_name,
      caused_by, intent_id, correlation_id,
      data, dimensions, entity_refs,
      rules_evaluated, tags,
      source_system, source_channel, source_ref,
      idempotency_key
    ) VALUES (
      $1, $2, $3,
      $4, $5,
      $6, $7,
      $8, $9, $10,
      $11, $12, $13,
      $14, $15, $16,
      $17, $18,
      $19, $20, $21,
      $22
    )
    RETURNING *
  `,

  GET_BY_IDEMPOTENCY_KEY: `
    SELECT * FROM events WHERE idempotency_key = $1
  `,

  GET_BY_ID: `
    SELECT * FROM events WHERE id = $1
  `,

  GET_BY_INTENT_ID: `
    SELECT * FROM events WHERE intent_id = $1 ORDER BY sequence
  `,

  READ_STREAM: `
    SELECT * FROM events
    WHERE sequence > $1
    ORDER BY sequence
    LIMIT $2
  `,

  READ_STREAM_BY_TYPE: `
    SELECT * FROM events
    WHERE sequence > $1
      AND type = ANY($3)
    ORDER BY sequence
    LIMIT $2
  `,
} as const;
