import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import pg from 'pg';
import { runMigrations } from '@nova/core';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface StressDatabase {
  pool: pg.Pool;
  container: StartedTestContainer;
  connectionConfig: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

/**
 * Create a PostgreSQL testcontainer tuned for stress testing.
 * Larger connection pool and PostgreSQL tuning for throughput.
 */
export async function createStressDatabase(
  poolSize = 20,
): Promise<StressDatabase> {
  const container = await new GenericContainer('postgres:16')
    .withEnvironment({
      POSTGRES_DB: 'nova_stress',
      POSTGRES_USER: 'nova_stress',
      POSTGRES_PASSWORD: 'nova_stress',
    })
    // Tune PostgreSQL for throughput
    .withCommand([
      'postgres',
      '-c', 'shared_buffers=256MB',
      '-c', 'work_mem=16MB',
      '-c', 'maintenance_work_mem=128MB',
      '-c', 'effective_cache_size=512MB',
      '-c', 'synchronous_commit=off', // Faster writes for stress tests
      '-c', 'max_wal_size=1GB',
      '-c', 'checkpoint_completion_target=0.9',
      '-c', 'max_connections=100',
    ])
    .withExposedPorts(5432)
    .withStartupTimeout(60_000)
    .start();

  const connectionConfig = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'nova_stress',
    user: 'nova_stress',
    password: 'nova_stress',
  };

  const pool = new pg.Pool({
    ...connectionConfig,
    max: poolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Wait for PostgreSQL to be ready
  let retries = 20;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      retries--;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (retries === 0) {
    throw new Error('PostgreSQL container did not become ready');
  }

  // Run migrations
  const migrationsDir = join(__dirname, '../../../migrations');
  await runMigrations(pool, migrationsDir);

  return { pool, container, connectionConfig };
}

export async function destroyStressDatabase(
  db: StressDatabase,
): Promise<void> {
  await db.pool.end();
  await db.container.stop();
}

/**
 * Truncate all data tables for a clean state between tests.
 */
export async function resetStressData(pool: pg.Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      gl_postings,
      ap_vendor_balance,
      ap_aging,
      ap_invoice_list,
      vendor_list,
      item_list,
      dead_letter_events,
      projection_snapshots,
      entity_relationships,
      entities,
      events
    CASCADE
  `);
  // Reset event sequence
  await pool.query(`ALTER SEQUENCE events_sequence_seq RESTART WITH 1`);
  // Reset subscription cursors
  await pool.query(`
    UPDATE event_subscriptions
    SET last_processed_id = NULL, last_processed_seq = 0, status = 'active'
  `);
}
