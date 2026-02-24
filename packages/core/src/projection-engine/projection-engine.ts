import pg from 'pg';
import type { BaseEvent } from '../event-store/types.js';
import { EventStoreService } from '../event-store/event-store.service.js';
import type { ProjectionHandler } from './types.js';

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

  async processEvent(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      await handler.handle(event, client);
    }
    await this.updateSubscriptionCursor(event, client);
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

  private async pollOnce(): Promise<void> {
    const lastSeq = await this.getLastProcessedSequence();
    const page = await this.eventStore.readStream({
      after_sequence: lastSeq,
      limit: 100,
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
}
