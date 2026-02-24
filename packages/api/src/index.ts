import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createPool,
  runMigrations,
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  vendorListHandler,
  itemListHandler,
} from '@nova/core';
import { IntentPipeline, VendorCreateHandler, VendorUpdateHandler, ItemCreateHandler } from '@nova/intent';
import { createServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'nova',
    user: process.env.DB_USER ?? 'nova',
    password: process.env.DB_PASSWORD ?? 'nova',
  });

  // Run migrations
  const migrationsDir = join(__dirname, '../../../migrations');
  await runMigrations(pool, migrationsDir);

  // Wire services
  const eventStore = new EventStoreService(pool);
  const entityGraph = new EntityGraphService(pool);
  const projectionEngine = new ProjectionEngine(pool, eventStore);

  // Register projection handlers
  projectionEngine.registerHandler(vendorListHandler);
  projectionEngine.registerHandler(itemListHandler);

  // Wire intent pipeline
  const intentPipeline = new IntentPipeline();
  intentPipeline.registerHandler(
    new VendorCreateHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new VendorUpdateHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new ItemCreateHandler(pool, eventStore, entityGraph, projectionEngine),
  );

  // Create and start server
  const server = createServer({ pool, intentPipeline, eventStore });
  const port = Number(process.env.PORT ?? 3000);

  await server.listen({ port, host: '0.0.0.0' });
  console.log(`Nova API listening on port ${port}`);

  // Graceful shutdown
  const shutdown = async () => {
    await server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
