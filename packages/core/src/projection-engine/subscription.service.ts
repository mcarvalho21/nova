import pg from 'pg';
import { generateId } from '../shared/types.js';

export interface Subscription {
  id: string;
  projection_type: string;
  subscriber_type: string;
  event_types: string[] | null;
  last_processed_id: string | null;
  last_processed_seq: bigint;
  status: string;
  batch_size: number;
  created_at: Date;
  updated_at: Date;
}

const QUERIES = {
  CREATE: `
    INSERT INTO event_subscriptions (id, projection_type, subscriber_type, subscriber_id, event_types, status, batch_size)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `,

  GET_BY_TYPE: `
    SELECT * FROM event_subscriptions WHERE projection_type = $1
  `,

  LIST: `
    SELECT * FROM event_subscriptions ORDER BY projection_type
  `,

  PAUSE: `
    UPDATE event_subscriptions
    SET status = 'paused', updated_at = NOW()
    WHERE projection_type = $1 AND status = 'active'
    RETURNING *
  `,

  RESUME: `
    UPDATE event_subscriptions
    SET status = 'active', updated_at = NOW()
    WHERE projection_type = $1 AND status = 'paused'
    RETURNING *
  `,

  RESET: `
    UPDATE event_subscriptions
    SET status = 'resetting',
        last_processed_id = NULL,
        last_processed_seq = 0,
        updated_at = NOW()
    WHERE projection_type = $1
    RETURNING *
  `,

  SET_ACTIVE: `
    UPDATE event_subscriptions
    SET status = 'active', updated_at = NOW()
    WHERE projection_type = $1
    RETURNING *
  `,

  UPDATE_CURSOR: `
    UPDATE event_subscriptions
    SET last_processed_id = $2,
        last_processed_seq = $3,
        updated_at = NOW()
    WHERE projection_type = $1
    RETURNING *
  `,
} as const;

function rowToSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    projection_type: row.projection_type as string,
    subscriber_type: row.subscriber_type as string,
    event_types: row.event_types as string[] | null,
    last_processed_id: (row.last_processed_id as string) ?? null,
    last_processed_seq: BigInt((row.last_processed_seq as string | number) ?? 0),
    status: row.status as string,
    batch_size: (row.batch_size as number) ?? 100,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export class SubscriptionService {
  constructor(private readonly pool: pg.Pool) {}

  async create(
    projectionType: string,
    options?: {
      subscriberType?: string;
      subscriberId?: string;
      eventTypes?: string[];
      batchSize?: number;
    },
  ): Promise<Subscription> {
    const id = generateId();
    const { rows } = await this.pool.query(QUERIES.CREATE, [
      id,
      projectionType,
      options?.subscriberType ?? 'projection',
      options?.subscriberId ?? projectionType,
      options?.eventTypes ?? null,
      'active',
      options?.batchSize ?? 100,
    ]);
    return rowToSubscription(rows[0]);
  }

  async getByType(projectionType: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(QUERIES.GET_BY_TYPE, [projectionType]);
    return rows.length > 0 ? rowToSubscription(rows[0]) : null;
  }

  async list(): Promise<Subscription[]> {
    const { rows } = await this.pool.query(QUERIES.LIST);
    return rows.map(rowToSubscription);
  }

  async pause(projectionType: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(QUERIES.PAUSE, [projectionType]);
    return rows.length > 0 ? rowToSubscription(rows[0]) : null;
  }

  async resume(projectionType: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(QUERIES.RESUME, [projectionType]);
    return rows.length > 0 ? rowToSubscription(rows[0]) : null;
  }

  async reset(projectionType: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(QUERIES.RESET, [projectionType]);
    return rows.length > 0 ? rowToSubscription(rows[0]) : null;
  }

  async setActive(projectionType: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(QUERIES.SET_ACTIVE, [projectionType]);
    return rows.length > 0 ? rowToSubscription(rows[0]) : null;
  }

  async updateCursor(
    projectionType: string,
    lastProcessedId: string,
    lastProcessedSeq: bigint,
  ): Promise<Subscription | null> {
    const { rows } = await this.pool.query(QUERIES.UPDATE_CURSOR, [
      projectionType,
      lastProcessedId,
      lastProcessedSeq.toString(),
    ]);
    return rows.length > 0 ? rowToSubscription(rows[0]) : null;
  }
}
