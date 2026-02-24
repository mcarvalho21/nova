export const ITEM_LIST_QUERIES = {
  UPSERT: `
    INSERT INTO item_list (item_id, name, sku, attributes, created_by_event_id, version, legal_entity)
    VALUES ($1, $2, $3, $4, $5, 1, $6)
    ON CONFLICT (item_id) DO UPDATE SET
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      attributes = EXCLUDED.attributes,
      updated_at = NOW(),
      version = item_list.version + 1
  `,

  LIST: `
    SELECT * FROM item_list ORDER BY created_at
  `,

  GET_BY_ID: `
    SELECT * FROM item_list WHERE item_id = $1
  `,
} as const;
