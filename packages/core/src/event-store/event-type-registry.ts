import pg from 'pg';
import { ValidationError } from '../shared/errors.js';

type AjvValidateFunction = (data: unknown) => boolean;
interface AjvInstance {
  compile(schema: Record<string, unknown>): AjvValidateFunction & { errors?: Array<{ instancePath?: string; message?: string }> };
}

// Lazy-initialized Ajv instance (avoids ESM/CJS import issues at module level)
let _ajv: AjvInstance | null = null;
async function getAjv(): Promise<AjvInstance> {
  if (_ajv) return _ajv;
  // Dynamic import handles ESM/CJS interop correctly
  const mod = await import('ajv');
  const AjvClass = mod.default ?? mod;
  _ajv = new (AjvClass as unknown as { new(opts: { allErrors: boolean }): AjvInstance })({ allErrors: true });
  return _ajv;
}

export interface RegisteredEventType {
  type_name: string;
  schema_version: number;
  json_schema: Record<string, unknown>;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

const QUERIES = {
  UPSERT: `
    INSERT INTO event_type_registry (type_name, schema_version, json_schema, description)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (type_name, schema_version) DO UPDATE SET
      json_schema = EXCLUDED.json_schema,
      description = EXCLUDED.description,
      updated_at = NOW()
    RETURNING *
  `,

  GET_SCHEMA: `
    SELECT * FROM event_type_registry
    WHERE type_name = $1 AND schema_version = $2
  `,

  LIST_TYPES: `
    SELECT * FROM event_type_registry
    ORDER BY type_name, schema_version
  `,

  LIST_BY_TYPE: `
    SELECT * FROM event_type_registry
    WHERE type_name = $1
    ORDER BY schema_version DESC
  `,
} as const;

function rowToRegisteredType(row: Record<string, unknown>): RegisteredEventType {
  return {
    type_name: row.type_name as string,
    schema_version: row.schema_version as number,
    json_schema: row.json_schema as Record<string, unknown>,
    description: (row.description as string) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export class EventTypeRegistryService {
  constructor(private readonly pool: pg.Pool) {}

  async register(
    typeName: string,
    schemaVersion: number,
    jsonSchema: Record<string, unknown>,
    description?: string,
  ): Promise<RegisteredEventType> {
    // Validate that the provided schema is itself valid JSON Schema
    const ajv = await getAjv();
    try {
      ajv.compile(jsonSchema);
    } catch (error) {
      throw new ValidationError(
        `Invalid JSON Schema for ${typeName} v${schemaVersion}: ${(error as Error).message}`,
        'json_schema',
      );
    }

    const { rows } = await this.pool.query(QUERIES.UPSERT, [
      typeName,
      schemaVersion,
      JSON.stringify(jsonSchema),
      description ?? null,
    ]);
    return rowToRegisteredType(rows[0]);
  }

  async getSchema(
    typeName: string,
    schemaVersion: number,
  ): Promise<RegisteredEventType | null> {
    const { rows } = await this.pool.query(QUERIES.GET_SCHEMA, [
      typeName,
      schemaVersion,
    ]);
    return rows.length > 0 ? rowToRegisteredType(rows[0]) : null;
  }

  async listTypes(): Promise<RegisteredEventType[]> {
    const { rows } = await this.pool.query(QUERIES.LIST_TYPES);
    return rows.map(rowToRegisteredType);
  }

  async listVersions(typeName: string): Promise<RegisteredEventType[]> {
    const { rows } = await this.pool.query(QUERIES.LIST_BY_TYPE, [typeName]);
    return rows.map(rowToRegisteredType);
  }

  /**
   * Validate event data against the registered schema for the given type and version.
   * Returns true if no schema is registered (permissive by default).
   * Throws ValidationError if data fails schema validation.
   */
  async validate(
    typeName: string,
    schemaVersion: number,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const registered = await this.getSchema(typeName, schemaVersion);
    if (!registered) return true; // No schema registered — permissive

    const ajv = await getAjv();
    const validateFn = ajv.compile(registered.json_schema);
    const valid = validateFn(data);
    if (!valid) {
      const errors = validateFn.errors
        ?.map((e) => `${e.instancePath || '/'}: ${e.message}`)
        .join('; ');
      throw new ValidationError(
        `Event data validation failed for ${typeName} v${schemaVersion}: ${errors}`,
        'data',
        { schema_errors: validateFn.errors },
      );
    }
    return true;
  }
}
