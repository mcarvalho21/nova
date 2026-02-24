import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import {
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  vendorListHandler,
  itemListHandler,
} from '@nova/core';
import {
  IntentPipeline,
  VendorCreateHandler,
  VendorUpdateHandler,
  ItemCreateHandler,
} from '@nova/intent';
import { createServer } from '../../../packages/api/src/server.js';

export interface TestServer {
  app: FastifyInstance;
  eventStore: EventStoreService;
  entityGraph: EntityGraphService;
  projectionEngine: ProjectionEngine;
  intentPipeline: IntentPipeline;
}

export function createTestServer(pool: pg.Pool): TestServer {
  const eventStore = new EventStoreService(pool);
  const entityGraph = new EntityGraphService(pool);
  const projectionEngine = new ProjectionEngine(pool, eventStore);

  projectionEngine.registerHandler(vendorListHandler);
  projectionEngine.registerHandler(itemListHandler);

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

  const app = createServer({ pool, intentPipeline, eventStore });

  return { app, eventStore, entityGraph, projectionEngine, intentPipeline };
}
