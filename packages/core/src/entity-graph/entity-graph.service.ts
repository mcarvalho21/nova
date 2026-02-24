import pg from 'pg';
import { ConcurrencyConflictError, EntityNotFoundError } from '../shared/errors.js';
import type { Entity } from './types.js';

function rowToEntity(row: Record<string, unknown>): Entity {
  return {
    entity_id: row.entity_id as string,
    entity_type: row.entity_type as string,
    attributes: row.attributes as Record<string, unknown>,
    version: Number(row.version),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export class EntityGraphService {
  constructor(private readonly pool: pg.Pool) {}

  async createEntity(
    entityType: string,
    entityId: string,
    attributes: Record<string, unknown>,
    client?: pg.PoolClient,
  ): Promise<Entity> {
    const conn = client ?? this.pool;
    const { rows } = await conn.query(
      `INSERT INTO entities (entity_type, entity_id, attributes)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [entityType, entityId, JSON.stringify(attributes)],
    );
    return rowToEntity(rows[0]);
  }

  async getEntity(
    entityType: string,
    entityId: string,
    client?: pg.PoolClient,
  ): Promise<Entity | null> {
    const conn = client ?? this.pool;
    const { rows } = await conn.query(
      `SELECT * FROM entities WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId],
    );
    return rows.length > 0 ? rowToEntity(rows[0]) : null;
  }

  async getEntityByTypeAndAttribute(
    entityType: string,
    attributePath: string,
    attributeValue: string,
    client?: pg.PoolClient,
  ): Promise<Entity | null> {
    const conn = client ?? this.pool;
    const { rows } = await conn.query(
      `SELECT * FROM entities
       WHERE entity_type = $1
         AND attributes->>$2 = $3
       LIMIT 1`,
      [entityType, attributePath, attributeValue],
    );
    return rows.length > 0 ? rowToEntity(rows[0]) : null;
  }

  async updateEntity(
    entityType: string,
    entityId: string,
    attributes: Record<string, unknown>,
    expectedVersion: number,
    client?: pg.PoolClient,
  ): Promise<Entity> {
    const conn = client ?? this.pool;
    const { rows } = await conn.query(
      `UPDATE entities
       SET attributes = $3, version = version + 1, updated_at = NOW()
       WHERE entity_type = $1 AND entity_id = $2 AND version = $4
       RETURNING *`,
      [entityType, entityId, JSON.stringify(attributes), expectedVersion],
    );

    if (rows.length === 0) {
      const existing = await this.getEntity(entityType, entityId, client);
      if (!existing) {
        throw new EntityNotFoundError(entityType, entityId);
      }
      throw new ConcurrencyConflictError(entityId, expectedVersion, existing.version);
    }

    return rowToEntity(rows[0]);
  }

  async findByType(
    entityType: string,
    client?: pg.PoolClient,
  ): Promise<Entity[]> {
    const conn = client ?? this.pool;
    const { rows } = await conn.query(
      `SELECT * FROM entities WHERE entity_type = $1 ORDER BY created_at`,
      [entityType],
    );
    return rows.map(rowToEntity);
  }
}
