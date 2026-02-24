import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createPool,
  runMigrations,
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  SubscriptionService,
  SnapshotService,
  EventTypeRegistryService,
  registerProjectionTable,
  vendorListHandler,
  itemListHandler,
  apInvoiceListHandler,
  apAgingHandler,
  apVendorBalanceHandler,
  glPostingsHandler,
} from '@nova/core';
import {
  IntentPipeline,
  VendorCreateHandler,
  VendorUpdateHandler,
  ItemCreateHandler,
  VendorAddContactHandler,
  InvoiceSubmitHandler,
  InvoiceApproveHandler,
  InvoiceRejectHandler,
  InvoicePostHandler,
  InvoicePayHandler,
  PurchaseOrderCreateHandler,
  IntentStoreService,
} from '@nova/intent';
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
  const subscriptionService = new SubscriptionService(pool);
  const snapshotService = new SnapshotService(pool);
  const eventTypeRegistry = new EventTypeRegistryService(pool);
  const intentStore = new IntentStoreService(pool);

  // Register projection table configs for snapshot operations
  registerProjectionTable('vendor_list', { tableName: 'vendor_list', primaryKey: 'vendor_id' });
  registerProjectionTable('item_list', { tableName: 'item_list', primaryKey: 'item_id' });
  registerProjectionTable('ap_invoice_list', { tableName: 'ap_invoice_list', primaryKey: 'invoice_id' });
  registerProjectionTable('ap_aging', { tableName: 'ap_aging', primaryKey: 'id' });
  registerProjectionTable('ap_vendor_balance', { tableName: 'ap_vendor_balance', primaryKey: 'vendor_id' });
  registerProjectionTable('gl_postings', { tableName: 'gl_postings', primaryKey: 'posting_id' });

  // Register projection handlers
  projectionEngine.registerHandler(vendorListHandler);
  projectionEngine.registerHandler(itemListHandler);
  projectionEngine.registerHandler(apInvoiceListHandler);
  projectionEngine.registerHandler(apAgingHandler);
  projectionEngine.registerHandler(apVendorBalanceHandler);
  projectionEngine.registerHandler(glPostingsHandler);

  // Wire intent pipeline
  const intentPipeline = new IntentPipeline();
  intentPipeline.setIntentStore(intentStore);
  intentPipeline.registerHandler(
    new VendorCreateHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new VendorUpdateHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new ItemCreateHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new VendorAddContactHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new InvoiceSubmitHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new InvoiceApproveHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new InvoiceRejectHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new InvoicePostHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new InvoicePayHandler(pool, eventStore, entityGraph, projectionEngine),
  );
  intentPipeline.registerHandler(
    new PurchaseOrderCreateHandler(pool, eventStore, entityGraph, projectionEngine),
  );

  // Create and start server
  const jwtSecret = process.env.JWT_SECRET;
  const server = createServer({
    pool,
    intentPipeline,
    eventStore,
    intentStore,
    projectionEngine,
    subscriptionService,
    snapshotService,
    eventTypeRegistry,
    jwtSecret,
  });
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
