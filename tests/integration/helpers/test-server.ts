import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import {
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  SubscriptionService,
  SnapshotService,
  EventTypeRegistryService,
  registerProjectionTable,
  vendorListHandler,
  itemListHandler,
} from '@nova/core';
import {
  IntentPipeline,
  VendorCreateHandler,
  VendorUpdateHandler,
  ItemCreateHandler,
  VendorAddContactHandler,
  IntentStoreService,
} from '@nova/intent';
import { createServer } from '../../../packages/api/src/server.js';

export interface TestServer {
  app: FastifyInstance;
  eventStore: EventStoreService;
  entityGraph: EntityGraphService;
  projectionEngine: ProjectionEngine;
  subscriptionService: SubscriptionService;
  snapshotService: SnapshotService;
  eventTypeRegistry: EventTypeRegistryService;
  intentPipeline: IntentPipeline;
  intentStore: IntentStoreService;
}

export function createTestServer(pool: pg.Pool, jwtSecret?: string): TestServer {
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

  projectionEngine.registerHandler(vendorListHandler);
  projectionEngine.registerHandler(itemListHandler);

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

  const app = createServer({
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

  return {
    app,
    eventStore,
    entityGraph,
    projectionEngine,
    subscriptionService,
    snapshotService,
    eventTypeRegistry,
    intentPipeline,
    intentStore,
  };
}
