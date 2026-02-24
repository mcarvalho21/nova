import pg from 'pg';
import { generateId } from '../shared/types.js';
import { EventStoreError, ConcurrencyConflictError } from '../shared/errors.js';
import type { EventTypeRegistryService } from './event-type-registry.js';

// Override pg type parser for DATE (OID 1082) to return raw YYYY-MM-DD string
// instead of creating a JavaScript Date object (which introduces timezone shifts)
pg.types.setTypeParser(1082, (val: string) => val);
import type {
  AppendEventInput,
  BaseEvent,
  EventPage,
  ReadStreamParams,
} from './types.js';
import { QUERIES } from './event-store.queries.js';

function rowToEvent(row: Record<string, unknown>): BaseEvent {
  return {
    id: row.id as string,
    sequence: BigInt(row.sequence as string | number),
    type: row.type as string,
    schema_version: row.schema_version as number,
    occurred_at: row.occurred_at as Date,
    recorded_at: row.recorded_at as Date,
    effective_date: row.effective_date as string,
    scope: {
      tenant_id: row.tenant_id as string,
      legal_entity: row.legal_entity as string,
    },
    actor: {
      type: row.actor_type as BaseEvent['actor']['type'],
      id: row.actor_id as string,
      name: row.actor_name as string,
    },
    caused_by: (row.caused_by ?? undefined) as string | undefined,
    intent_id: (row.intent_id ?? undefined) as string | undefined,
    correlation_id: row.correlation_id as string,
    data: row.data as Record<string, unknown>,
    dimensions: (row.dimensions ?? {}) as Record<string, string>,
    entities: (row.entity_refs ?? []) as BaseEvent['entities'],
    rules_evaluated: (row.rules_evaluated ?? []) as BaseEvent['rules_evaluated'],
    tags: (row.tags ?? []) as string[],
    source: {
      system: row.source_system as string,
      channel: row.source_channel as string,
      reference: row.source_ref as string | undefined,
    },
    idempotency_key: (row.idempotency_key ?? undefined) as string | undefined,
  };
}

export { rowToEvent };

export class EventStoreService {
  private registry?: EventTypeRegistryService;

  constructor(private readonly pool: pg.Pool) {}

  /**
   * Set the event type registry for schema validation on append.
   */
  setRegistry(registry: EventTypeRegistryService): void {
    this.registry = registry;
  }

  async append(
    input: AppendEventInput,
    client?: pg.PoolClient,
  ): Promise<BaseEvent> {
    const shouldRelease = !client;
    const conn = client ?? (await this.pool.connect());

    try {
      // Validate against registered schema if registry is set
      if (this.registry) {
        await this.registry.validate(
          input.type,
          input.schema_version ?? 1,
          input.data,
        );
      }

      // Check idempotency first
      if (input.idempotency_key) {
        const { rows } = await conn.query(QUERIES.GET_BY_IDEMPOTENCY_KEY, [
          input.idempotency_key,
        ]);
        if (rows.length > 0) {
          return rowToEvent(rows[0]);
        }
      }

      const id = generateId();
      const now = new Date();
      const scope = input.scope ?? { tenant_id: 'default', legal_entity: 'default' };
      const source = input.source ?? { system: 'nova', channel: 'api' };

      // OCC: verify entity version before appending
      if (input.expected_entity_version !== undefined && input.entities) {
        const subject = input.entities.find((e) => e.role === 'subject');
        if (subject) {
          const { rows: entityRows } = await conn.query(
            QUERIES.CHECK_ENTITY_VERSION,
            [subject.entity_type, subject.entity_id],
          );
          if (entityRows.length > 0) {
            const actualVersion = Number(entityRows[0].version);
            if (actualVersion !== input.expected_entity_version) {
              throw new ConcurrencyConflictError(
                subject.entity_id,
                input.expected_entity_version,
                actualVersion,
              );
            }
          }
        }
      }

      const { rows } = await conn.query(QUERIES.INSERT_EVENT, [
        id,
        input.type,
        input.schema_version ?? 1,
        input.occurred_at ?? now,
        input.effective_date ?? now.toISOString().slice(0, 10),
        scope.tenant_id,
        scope.legal_entity,
        input.actor.type,
        input.actor.id,
        input.actor.name,
        input.caused_by ?? null,
        input.intent_id ?? null,
        input.correlation_id,
        JSON.stringify(input.data),
        JSON.stringify(input.dimensions ?? {}),
        JSON.stringify(input.entities ?? []),
        JSON.stringify(input.rules_evaluated ?? []),
        input.tags ?? [],
        source.system,
        source.channel,
        source.reference ?? null,
        input.idempotency_key ?? null,
        input.expected_entity_version ?? null,
      ]);

      return rowToEvent(rows[0]);
    } catch (error: unknown) {
      const pgError = error as { code?: string; constraint?: string };
      if (pgError.code === '23505' && pgError.constraint?.includes('idempotency')) {
        // Race condition: another request inserted the same key
        const { rows } = await conn.query(QUERIES.GET_BY_IDEMPOTENCY_KEY, [
          input.idempotency_key,
        ]);
        if (rows.length > 0) {
          return rowToEvent(rows[0]);
        }
      }
      throw new EventStoreError(
        `Failed to append event: ${(error as Error).message}`,
        'APPEND_FAILED',
        error,
      );
    } finally {
      if (shouldRelease) conn.release();
    }
  }

  async readStream(params: ReadStreamParams = {}): Promise<EventPage> {
    const afterSequence = params.after_sequence ?? 0n;
    const limit = params.limit ?? 100;

    let rows: Record<string, unknown>[];
    if (params.event_types && params.event_types.length > 0) {
      const result = await this.pool.query(QUERIES.READ_STREAM_BY_TYPE, [
        afterSequence.toString(),
        limit + 1,
        params.event_types,
      ]);
      rows = result.rows;
    } else {
      const result = await this.pool.query(QUERIES.READ_STREAM, [
        afterSequence.toString(),
        limit + 1,
      ]);
      rows = result.rows;
    }

    const hasMore = rows.length > limit;
    const events = rows.slice(0, limit).map(rowToEvent);
    const nextSequence = hasMore ? events[events.length - 1].sequence + 1n : undefined;

    return { events, has_more: hasMore, next_sequence: nextSequence };
  }

  async getById(id: string): Promise<BaseEvent | null> {
    const { rows } = await this.pool.query(QUERIES.GET_BY_ID, [id]);
    return rows.length > 0 ? rowToEvent(rows[0]) : null;
  }

  async getByIntentId(intentId: string): Promise<BaseEvent[]> {
    const { rows } = await this.pool.query(QUERIES.GET_BY_INTENT_ID, [intentId]);
    return rows.map(rowToEvent);
  }

  /**
   * Read events filtered by legal entity (partition).
   */
  async readByPartition(
    legalEntity: string,
    params: ReadStreamParams = {},
  ): Promise<EventPage> {
    const afterSequence = params.after_sequence ?? 0n;
    const limit = params.limit ?? 100;

    let query: string;
    let queryParams: (string | number | string[])[];

    if (params.event_types && params.event_types.length > 0) {
      query = `SELECT * FROM events WHERE sequence > $1 AND legal_entity = $2 AND type = ANY($4) ORDER BY sequence LIMIT $3`;
      queryParams = [afterSequence.toString(), legalEntity, limit + 1, params.event_types];
    } else {
      query = `SELECT * FROM events WHERE sequence > $1 AND legal_entity = $2 ORDER BY sequence LIMIT $3`;
      queryParams = [afterSequence.toString(), legalEntity, limit + 1];
    }

    const { rows } = await this.pool.query(query, queryParams);
    const hasMore = rows.length > limit;
    const events = rows.slice(0, limit).map(rowToEvent);
    const nextSequence = hasMore ? events[events.length - 1].sequence + 1n : undefined;

    return { events, has_more: hasMore, next_sequence: nextSequence };
  }

  async setupNotificationListener(
    callback: (payload: { id: string; type: string; sequence: number }) => void,
  ): Promise<pg.PoolClient> {
    const client = await this.pool.connect();
    await client.query('LISTEN event_appended');
    client.on('notification', (msg) => {
      if (msg.channel === 'event_appended' && msg.payload) {
        callback(JSON.parse(msg.payload));
      }
    });
    return client;
  }
}
