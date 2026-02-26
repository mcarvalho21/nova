#!/usr/bin/env tsx
/**
 * Nova ERP — Demo Setup
 *
 * Starts a PostgreSQL container, runs migrations, and launches the API server.
 * Designed for a zero-config demo experience.
 *
 * Usage:
 *   pnpm demo:setup       # start everything
 *   Ctrl+C                # stop and clean up
 */

import { execSync, spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

function log(msg: string): void {
  console.log(`${CYAN}[demo-setup]${RESET} ${msg}`);
}

function ok(msg: string): void {
  console.log(`${CYAN}[demo-setup]${RESET} ${GREEN}${BOLD}OK${RESET} ${msg}`);
}

const DB_NAME = 'nova_demo';
const DB_USER = 'nova';
const DB_PASSWORD = 'nova';
const DB_PORT = 5433; // Use non-default port to avoid conflicts
const CONTAINER_NAME = 'nova-demo-pg';
const API_PORT = 3000;

async function waitForPostgres(port: number, maxWait = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const pool = new pg.Pool({
        host: 'localhost',
        port,
        database: 'postgres',
        user: DB_USER,
        password: DB_PASSWORD,
      });
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('PostgreSQL did not become ready in time');
}

async function main(): Promise<void> {
  console.log(`\n${BOLD}${CYAN}Nova ERP — Demo Setup${RESET}\n`);

  // Step 1: Start PostgreSQL container
  log('Starting PostgreSQL container...');

  // Remove existing container if present
  try {
    execSync(`docker rm -f ${CONTAINER_NAME} 2>/dev/null`, { stdio: 'ignore' });
  } catch { /* ignore */ }

  execSync(
    `docker run -d --name ${CONTAINER_NAME} ` +
    `-e POSTGRES_DB=${DB_NAME} ` +
    `-e POSTGRES_USER=${DB_USER} ` +
    `-e POSTGRES_PASSWORD=${DB_PASSWORD} ` +
    `-p ${DB_PORT}:5432 ` +
    `postgres:16-alpine`,
    { stdio: 'pipe' },
  );
  ok(`PostgreSQL container started on port ${DB_PORT}`);

  // Step 2: Wait for PostgreSQL to be ready
  log('Waiting for PostgreSQL to be ready...');
  await waitForPostgres(DB_PORT);
  ok('PostgreSQL is ready');

  // Step 3: Run migrations
  log('Running migrations...');
  const pool = new pg.Pool({
    host: 'localhost',
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  // Import and run migrations
  const { runMigrations } = await import(resolve(ROOT, 'packages/core/src/shared/database.ts'));
  const migrationsDir = resolve(ROOT, 'migrations');
  await runMigrations(pool, migrationsDir);
  await pool.end();
  ok('Migrations complete');

  // Step 4: Build the API package
  log('Building API package...');
  try {
    execSync('pnpm -r build', { cwd: ROOT, stdio: 'pipe' });
    ok('Build complete');
  } catch {
    log('Build failed, trying to start with tsx directly...');
  }

  // Step 5: Start the API server
  log(`Starting Nova API on port ${API_PORT}...`);

  const env = {
    ...process.env,
    DB_HOST: 'localhost',
    DB_PORT: String(DB_PORT),
    DB_NAME,
    DB_USER,
    DB_PASSWORD,
    PORT: String(API_PORT),
  };

  const server = spawn('npx', ['tsx', resolve(ROOT, 'packages/api/src/index.ts')], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for server to start
  let serverReady = false;
  const serverStart = Date.now();

  server.stdout?.on('data', (data: Buffer) => {
    const line = data.toString();
    if (line.includes('listening') || line.includes('started')) {
      serverReady = true;
    }
  });

  server.stderr?.on('data', (data: Buffer) => {
    const line = data.toString();
    // Fastify logs to stderr when using its logger
    if (line.includes('listening') || line.includes(String(API_PORT))) {
      serverReady = true;
    }
  });

  while (!serverReady && Date.now() - serverStart < 30_000) {
    // Also try hitting the health endpoint
    try {
      const res = await fetch(`http://localhost:${API_PORT}/health`);
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch { /* server not ready yet */ }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!serverReady) {
    console.error(`${RED}Server failed to start within 30 seconds${RESET}`);
    server.kill();
    process.exit(1);
  }

  ok(`Nova API listening on http://localhost:${API_PORT}`);

  console.log(`\n${DIM}─────────────────────────────────────────────────────${RESET}`);
  console.log(`\n  Server is running. In another terminal, run:\n`);
  console.log(`  ${BOLD}DB_PORT=${DB_PORT} DB_NAME=${DB_NAME} pnpm demo${RESET}`);
  console.log(`  ${DIM}(or: DB_PORT=${DB_PORT} DB_NAME=${DB_NAME} npx tsx scripts/demo.ts)${RESET}\n`);
  console.log(`  Press ${BOLD}Ctrl+C${RESET} to stop and clean up.\n`);

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n${CYAN}[demo-setup]${RESET} Shutting down...`);
    server.kill();
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
      ok('PostgreSQL container removed');
    } catch { /* ignore */ }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(`${RED}Setup failed: ${(err as Error).message}${RESET}`);
  console.error(`${DIM}${(err as Error).stack}${RESET}`);
  // Clean up container on failure
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
  } catch { /* ignore */ }
  process.exit(1);
});
