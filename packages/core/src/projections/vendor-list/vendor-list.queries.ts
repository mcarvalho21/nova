export const VENDOR_LIST_QUERIES = {
  UPSERT: `
    INSERT INTO vendor_list (vendor_id, name, attributes, created_by_event_id, version)
    VALUES ($1, $2, $3, $4, 1)
    ON CONFLICT (vendor_id) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      updated_at = NOW(),
      version = vendor_list.version + 1
  `,

  LIST: `
    SELECT * FROM vendor_list ORDER BY created_at
  `,

  GET_BY_ID: `
    SELECT * FROM vendor_list WHERE vendor_id = $1
  `,
} as const;
