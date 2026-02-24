import pg from 'pg';
import { ConcurrencyConflictError, EntityNotFoundError, AuthorizationError } from '../shared/errors.js';
import type { Entity, EntityRelationship } from './types.js';

function rowToEntity(row: Record<string, unknown>): Entity {
  return {
    entity_id: row.entity_id as string,
    entity_type: row.entity_type as string,
    attributes: row.attributes as Record<string, unknown>,
    version: Number(row.version),
    legal_entity: (row.legal_entity as string) ?? 'default',
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function rowToRelationship(row: Record<string, unknown>): EntityRelationship {
  return {
    source_type: row.source_type as string,
    source_id: row.source_id as string,
    target_type: row.target_type as string,
    target_id: row.target_id as string,
    relationship_type: row.relationship_type as string,
    attributes: (row.attributes as Record<string, unknown>) ?? {},
    created_at: row.created_at as Date,
  };
}

export class EntityGraphService {
  constructor(private readonly pool: pg.Pool) {}

  async createEntity(
    entityType: string,
    entityId: string,
    attributes: Record<string, unknown>,
    client?: pg.PoolClient,
    legalEntity?: string,
  ): Promise<Entity> {
    const conn = client ?? this.pool;
    const le = legalEntity ?? 'default';
    const { rows } = await conn.query(
      `INSERT INTO entities (entity_type, entity_id, attributes, legal_entity)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [entityType, entityId, JSON.stringify(attributes), le],
    );
    return rowToEntity(rows[0]);
  }

  async getEntity(
    entityType: string,
    entityId: string,
    client?: pg.PoolClient,
    legalEntity?: string,
  ): Promise<Entity | null> {
    const conn = client ?? this.pool;
    if (legalEntity) {
      const { rows } = await conn.query(
        `SELECT * FROM entities WHERE entity_type = $1 AND entity_id = $2 AND legal_entity = $3`,
        [entityType, entityId, legalEntity],
      );
      return rows.length > 0 ? rowToEntity(rows[0]) : null;
    }
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
    legalEntity?: string,
  ): Promise<Entity | null> {
    const conn = client ?? this.pool;
    if (legalEntity) {
      const { rows } = await conn.query(
        `SELECT * FROM entities
         WHERE entity_type = $1
           AND attributes->>$2 = $3
           AND legal_entity = $4
         LIMIT 1`,
        [entityType, attributePath, attributeValue, legalEntity],
      );
      return rows.length > 0 ? rowToEntity(rows[0]) : null;
    }
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
    legalEntity?: string,
  ): Promise<Entity> {
    const conn = client ?? this.pool;

    // If legalEntity provided, verify it matches
    if (legalEntity) {
      const existing = await this.getEntity(entityType, entityId, client);
      if (!existing) {
        throw new EntityNotFoundError(entityType, entityId);
      }
      if (existing.legal_entity !== legalEntity) {
        throw new AuthorizationError(
          `Entity ${entityType}/${entityId} belongs to legal entity ${existing.legal_entity}, not ${legalEntity}`,
        );
      }
    }

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

  // ── Relationship Methods ──────────────────────────────────

  async createRelationship(
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string,
    relationshipType: string,
    attributes: Record<string, unknown> = {},
    client?: pg.PoolClient,
  ): Promise<EntityRelationship> {
    const conn = client ?? this.pool;
    const { rows } = await conn.query(
      `INSERT INTO entity_relationships (source_type, source_id, target_type, target_id, relationship_type, attributes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [sourceType, sourceId, targetType, targetId, relationshipType, JSON.stringify(attributes)],
    );
    return rowToRelationship(rows[0]);
  }

  async getRelationships(
    entityType: string,
    entityId: string,
    relationshipType?: string,
    client?: pg.PoolClient,
  ): Promise<EntityRelationship[]> {
    const conn = client ?? this.pool;
    if (relationshipType) {
      const { rows } = await conn.query(
        `SELECT * FROM entity_relationships
         WHERE source_type = $1 AND source_id = $2 AND relationship_type = $3
         ORDER BY created_at`,
        [entityType, entityId, relationshipType],
      );
      return rows.map(rowToRelationship);
    }
    const { rows } = await conn.query(
      `SELECT * FROM entity_relationships
       WHERE source_type = $1 AND source_id = $2
       ORDER BY created_at`,
      [entityType, entityId],
    );
    return rows.map(rowToRelationship);
  }

  async getRelatedEntities(
    entityType: string,
    entityId: string,
    relationshipType: string,
    client?: pg.PoolClient,
  ): Promise<Entity[]> {
    const conn = client ?? this.pool;
    const { rows } = await conn.query(
      `SELECT e.* FROM entities e
       JOIN entity_relationships r
         ON r.target_type = e.entity_type AND r.target_id = e.entity_id
       WHERE r.source_type = $1 AND r.source_id = $2 AND r.relationship_type = $3
       ORDER BY e.created_at`,
      [entityType, entityId, relationshipType],
    );
    return rows.map(rowToEntity);
  }
}
