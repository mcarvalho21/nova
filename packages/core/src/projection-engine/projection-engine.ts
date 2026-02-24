import pg from 'pg';
import type { BaseEvent } from '../event-store/types.js';
import { EventStoreService } from '../event-store/event-store.service.js';
import { generateId } from '../shared/types.js';
import type { ProjectionHandler } from './types.js';

export interface DeadLetterEntry {
  id: string;
  event_id: string;
  event_sequence: bigint | null;
  projection_type: string;
  error_message: string;
  error_stack: string | null;
  created_at: Date;
}

export interface RebuildOptions {
  batchSize?: number;
}

export class ProjectionEngine {
  private handlers: Map<string, ProjectionHandler[]> = new Map();
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private listenerClient: pg.PoolClient | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly eventStore: EventStoreService,
  ) {}

  registerHandler(handler: ProjectionHandler): void {
    for (const eventType of handler.event_types) {
      const existing = this.handlers.get(eventType) ?? [];
      existing.push(handler);
      this.handlers.set(eventType, existing);
    }
  }

  /**
   * Get all registered handlers (useful for rebuild operations).
   */
  getHandlers(): Map<string, ProjectionHandler[]> {
    return this.handlers;
  }

  async processEvent(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        await handler.handle(event, client);
      } catch (error) {
        // Dead-letter: log the failed event and skip
        await this.recordDeadLetter(event, handler, error as Error, client);
      }
    }
    await this.updateSubscriptionCursor(event, client);
  }

  /**
   * Rebuild a projection from scratch by replaying all events.
   * 1. Set subscription status to 'resetting'
   * 2. Truncate projection table via handler's reset()
   * 3. Reset cursor to 0
   * 4. Replay all events in batches
   * 5. Set subscription status to 'active'
   */
  async rebuild(
    projectionType: string,
    options?: RebuildOptions,
  ): Promise<{ eventsProcessed: number; deadLettered: number }> {
    const batchSize = options?.batchSize ?? 100;
    let eventsProcessed = 0;
    let deadLettered = 0;

    // Find all handlers that match this projection type
    const projectionHandlers = this.findHandlersForProjection(projectionType);
    if (projectionHandlers.length === 0) {
      throw new Error(`No handlers found for projection type: ${projectionType}`);
    }

    // Set subscription to resetting
    await this.pool.query(
      `UPDATE event_subscriptions SET status = 'resetting', last_processed_seq = 0, last_processed_id = NULL, updated_at = NOW()
       WHERE projection_type = $1`,
      [projectionType],
    );

    // Truncate/reset projection table
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const handler of projectionHandlers) {
        if (handler.reset) {
          await handler.reset(client);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Replay all events in batches
    let afterSequence = 0n;
    let hasMore = true;

    while (hasMore) {
      // Collect all event types this projection cares about
      const eventTypes = projectionHandlers.flatMap((h) => h.event_types);
      const uniqueEventTypes = [...new Set(eventTypes)];

      const page = await this.eventStore.readStream({
        after_sequence: afterSequence,
        limit: batchSize,
        event_types: uniqueEventTypes,
      });

      for (const event of page.events) {
        const txClient = await this.pool.connect();
        try {
          await txClient.query('BEGIN');
          for (const handler of projectionHandlers) {
            if (handler.event_types.includes(event.type)) {
              try {
                await handler.handle(event, txClient);
              } catch (error) {
                await this.recordDeadLetter(event, handler, error as Error, txClient);
                deadLettered++;
              }
            }
          }
          // Update cursor for this projection specifically
          await txClient.query(
            `UPDATE event_subscriptions
             SET last_processed_id = $1, last_processed_seq = $2, updated_at = NOW()
             WHERE projection_type = $3`,
            [event.id, event.sequence.toString(), projectionType],
          );
          await txClient.query('COMMIT');
          eventsProcessed++;
          afterSequence = event.sequence;
        } catch (error) {
          await txClient.query('ROLLBACK');
          throw error;
        } finally {
          txClient.release();
        }
      }

      hasMore = page.has_more;
    }

    // Set subscription back to active
    await this.pool.query(
      `UPDATE event_subscriptions SET status = 'active', updated_at = NOW()
       WHERE projection_type = $1`,
      [projectionType],
    );

    return { eventsProcessed, deadLettered };
  }

  async startPolling(intervalMs = 500): Promise<void> {
    // Set up LISTEN/NOTIFY wakeup
    try {
      this.listenerClient = await this.eventStore.setupNotificationListener(() => {
        this.pollOnce().catch(() => {
          // Errors are tracked per-subscription
        });
      });
    } catch {
      // Fallback to pure polling if LISTEN fails
    }

    // Polling fallback
    this.pollingInterval = setInterval(() => {
      this.pollOnce().catch(() => {
        // Errors are tracked per-subscription
      });
    }, intervalMs);
  }

  async stopPolling(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.listenerClient) {
      this.listenerClient.release();
      this.listenerClient = null;
    }
  }

  /**
   * Get dead-letter events, optionally filtered by projection type.
   */
  async getDeadLetterEvents(projectionType?: string): Promise<DeadLetterEntry[]> {
    const query = projectionType
      ? `SELECT * FROM dead_letter_events WHERE projection_type = $1 ORDER BY created_at DESC`
      : `SELECT * FROM dead_letter_events ORDER BY created_at DESC`;
    const params = projectionType ? [projectionType] : [];
    const { rows } = await this.pool.query(query, params);
    return rows.map((row) => ({
      id: row.id as string,
      event_id: row.event_id as string,
      event_sequence: row.event_sequence ? BigInt(row.event_sequence as string | number) : null,
      projection_type: row.projection_type as string,
      error_message: row.error_message as string,
      error_stack: (row.error_stack as string) ?? null,
      created_at: row.created_at as Date,
    }));
  }

  private async pollOnce(): Promise<void> {
    const lastSeq = await this.getLastProcessedSequence();
    const batchSize = await this.getBatchSize();
    const page = await this.eventStore.readStream({
      after_sequence: lastSeq,
      limit: batchSize,
    });

    for (const event of page.events) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await this.processEvent(event, client);
        await client.query('COMMIT');
      } catch {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  }

  private async getLastProcessedSequence(): Promise<bigint> {
    const { rows } = await this.pool.query(
      `SELECT COALESCE(MAX(last_processed_seq), 0) as seq
       FROM event_subscriptions
       WHERE subscriber_type = 'projection' AND status = 'active'`,
    );
    return BigInt(rows[0].seq);
  }

  private async getBatchSize(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COALESCE(MIN(batch_size), 100) as batch_size
       FROM event_subscriptions
       WHERE subscriber_type = 'projection' AND status = 'active'`,
    );
    return rows[0].batch_size as number;
  }

  private async updateSubscriptionCursor(
    event: BaseEvent,
    client: pg.PoolClient,
  ): Promise<void> {
    await client.query(
      `UPDATE event_subscriptions
       SET last_processed_id = $1,
           last_processed_seq = $2,
           updated_at = NOW()
       WHERE subscriber_type = 'projection'
         AND status = 'active'
         AND (event_types IS NULL OR $3 = ANY(event_types))`,
      [event.id, event.sequence.toString(), event.type],
    );
  }

  private async recordDeadLetter(
    event: BaseEvent,
    handler: ProjectionHandler,
    error: Error,
    client: pg.PoolClient,
  ): Promise<void> {
    const projectionType = handler.projection_type ?? 'unknown';
    try {
      await client.query(
        `INSERT INTO dead_letter_events (id, event_id, event_sequence, projection_type, error_message, error_stack)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          generateId(),
          event.id,
          event.sequence.toString(),
          projectionType,
          error.message,
          error.stack ?? null,
        ],
      );
    } catch {
      // If we can't even record the dead letter, just log
    }
  }

  /**
   * Find handlers that belong to a specific projection type.
   */
  private findHandlersForProjection(projectionType: string): ProjectionHandler[] {
    const seen = new Set<ProjectionHandler>();
    for (const handlers of this.handlers.values()) {
      for (const handler of handlers) {
        if (handler.projection_type === projectionType && !seen.has(handler)) {
          seen.add(handler);
        }
      }
    }
    return [...seen];
  }
}
