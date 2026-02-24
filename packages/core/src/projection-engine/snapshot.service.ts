import pg from 'pg';
import { generateId } from '../shared/types.js';

export interface ProjectionSnapshot {
  snapshot_id: string;
  projection_type: string;
  sequence_number: bigint;
  snapshot_data: Record<string, unknown>[];
  is_stale: boolean;
  created_at: Date;
}

const QUERIES = {
  CREATE_SNAPSHOT: `
    INSERT INTO projection_snapshots (snapshot_id, projection_type, sequence_number, snapshot_data)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM projection_snapshots WHERE snapshot_id = $1
  `,

  GET_LATEST_VALID: `
    SELECT * FROM projection_snapshots
    WHERE projection_type = $1 AND is_stale = FALSE
    ORDER BY sequence_number DESC
    LIMIT 1
  `,

  MARK_STALE: `
    UPDATE projection_snapshots
    SET is_stale = TRUE
    WHERE projection_type = $1
      AND is_stale = FALSE
      AND sequence_number >= $2
    RETURNING *
  `,

  MARK_ALL_STALE: `
    UPDATE projection_snapshots
    SET is_stale = TRUE
    WHERE projection_type = $1 AND is_stale = FALSE
    RETURNING *
  `,

  LIST_BY_TYPE: `
    SELECT * FROM projection_snapshots
    WHERE projection_type = $1
    ORDER BY sequence_number DESC
  `,
} as const;

function rowToSnapshot(row: Record<string, unknown>): ProjectionSnapshot {
  return {
    snapshot_id: row.snapshot_id as string,
    projection_type: row.projection_type as string,
    sequence_number: BigInt(row.sequence_number as string | number),
    snapshot_data: row.snapshot_data as Record<string, unknown>[],
    is_stale: row.is_stale as boolean,
    created_at: row.created_at as Date,
  };
}

/**
 * Mapping from projection type to its table name and primary key column.
 * Used for snapshot create/restore operations.
 */
export interface ProjectionTableConfig {
  tableName: string;
  primaryKey: string;
}

const PROJECTION_TABLE_MAP: Record<string, ProjectionTableConfig> = {
  vendor_list: { tableName: 'vendor_list', primaryKey: 'vendor_id' },
  item_list: { tableName: 'item_list', primaryKey: 'item_id' },
};

export function registerProjectionTable(
  projectionType: string,
  config: ProjectionTableConfig,
): void {
  PROJECTION_TABLE_MAP[projectionType] = config;
}

export class SnapshotService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Create a snapshot of the current projection state at the current cursor position.
   */
  async createSnapshot(projectionType: string): Promise<ProjectionSnapshot> {
    const tableConfig = PROJECTION_TABLE_MAP[projectionType];
    if (!tableConfig) {
      throw new Error(`No table configuration for projection type: ${projectionType}`);
    }

    // Read current cursor position
    const { rows: subRows } = await this.pool.query(
      `SELECT COALESCE(last_processed_seq, 0) as seq
       FROM event_subscriptions
       WHERE projection_type = $1`,
      [projectionType],
    );
    const sequenceNumber = subRows.length > 0 ? BigInt(subRows[0].seq) : 0n;

    // Read current projection data
    const { rows: dataRows } = await this.pool.query(
      `SELECT * FROM ${tableConfig.tableName}`,
    );

    const snapshotId = generateId();
    const { rows } = await this.pool.query(QUERIES.CREATE_SNAPSHOT, [
      snapshotId,
      projectionType,
      sequenceNumber.toString(),
      JSON.stringify(dataRows),
    ]);

    return rowToSnapshot(rows[0]);
  }

  /**
   * Restore a projection from a snapshot.
   * Truncates the projection table, inserts snapshot data, and updates the cursor.
   */
  async restoreFromSnapshot(
    projectionType: string,
    snapshotId: string,
  ): Promise<ProjectionSnapshot> {
    const tableConfig = PROJECTION_TABLE_MAP[projectionType];
    if (!tableConfig) {
      throw new Error(`No table configuration for projection type: ${projectionType}`);
    }

    const { rows: snapRows } = await this.pool.query(QUERIES.GET_BY_ID, [snapshotId]);
    if (snapRows.length === 0) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    const snapshot = rowToSnapshot(snapRows[0]);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Truncate the projection table
      await client.query(`TRUNCATE TABLE ${tableConfig.tableName}`);

      // Insert snapshot data row by row
      const snapshotData = snapshot.snapshot_data;
      for (const row of snapshotData) {
        const columns = Object.keys(row);
        const values = columns.map((_, i) => `$${i + 1}`);
        const params = columns.map((col) => {
          const val = row[col];
          // Serialize objects/arrays to JSON string for JSONB columns
          if (val !== null && typeof val === 'object') return JSON.stringify(val);
          return val;
        });

        await client.query(
          `INSERT INTO ${tableConfig.tableName} (${columns.join(', ')}) VALUES (${values.join(', ')})`,
          params,
        );
      }

      // Update subscription cursor to snapshot's sequence
      await client.query(
        `UPDATE event_subscriptions
         SET last_processed_seq = $1, updated_at = NOW()
         WHERE projection_type = $2`,
        [snapshot.sequence_number.toString(), projectionType],
      );

      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the latest valid (non-stale) snapshot for a projection type.
   */
  async getLatestValidSnapshot(projectionType: string): Promise<ProjectionSnapshot | null> {
    const { rows } = await this.pool.query(QUERIES.GET_LATEST_VALID, [projectionType]);
    return rows.length > 0 ? rowToSnapshot(rows[0]) : null;
  }

  /**
   * Invalidate snapshots that are at or after the given sequence number.
   * Used when a back-dated event arrives before a snapshot's point-in-time.
   */
  async invalidateSnapshots(
    projectionType: string,
    fromSequence: bigint,
  ): Promise<number> {
    const { rows } = await this.pool.query(QUERIES.MARK_STALE, [
      projectionType,
      fromSequence.toString(),
    ]);
    return rows.length;
  }

  /**
   * Mark all snapshots for a projection type as stale.
   */
  async invalidateAllSnapshots(projectionType: string): Promise<number> {
    const { rows } = await this.pool.query(QUERIES.MARK_ALL_STALE, [projectionType]);
    return rows.length;
  }

  /**
   * List all snapshots for a projection type.
   */
  async listSnapshots(projectionType: string): Promise<ProjectionSnapshot[]> {
    const { rows } = await this.pool.query(QUERIES.LIST_BY_TYPE, [projectionType]);
    return rows.map(rowToSnapshot);
  }

  /**
   * Get a snapshot by ID.
   */
  async getById(snapshotId: string): Promise<ProjectionSnapshot | null> {
    const { rows } = await this.pool.query(QUERIES.GET_BY_ID, [snapshotId]);
    return rows.length > 0 ? rowToSnapshot(rows[0]) : null;
  }
}
