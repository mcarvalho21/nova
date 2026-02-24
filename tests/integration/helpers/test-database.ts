import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import pg from 'pg';
import { runMigrations } from '@nova/core';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TestDatabase {
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

export async function createTestDatabase(): Promise<TestDatabase> {
  const container = await new GenericContainer('postgres:16')
    .withEnvironment({
      POSTGRES_DB: 'nova_test',
      POSTGRES_USER: 'nova_test',
      POSTGRES_PASSWORD: 'nova_test',
    })
    .withExposedPorts(5432)
    .start();

  const connectionConfig = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'nova_test',
    user: 'nova_test',
    password: 'nova_test',
  };

  const pool = new pg.Pool(connectionConfig);

  // Wait for PostgreSQL to be ready
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      retries--;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Run migrations
  const migrationsDir = join(__dirname, '../../../migrations');
  await runMigrations(pool, migrationsDir);

  return { pool, container, connectionConfig };
}

export async function destroyTestDatabase(db: TestDatabase): Promise<void> {
  await db.pool.end();
  await db.container.stop();
}
