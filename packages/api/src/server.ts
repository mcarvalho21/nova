import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { generateId, ValidationError, ConcurrencyConflictError, EntityNotFoundError } from '@nova/core';
import type { IntentPipeline } from '@nova/intent';
import { registerIntentRoutes } from './routes/intents.route.js';
import { registerProjectionRoutes } from './routes/projections.route.js';
import { registerAuditRoutes } from './routes/audit.route.js';
import type pg from 'pg';
import type { EventStoreService } from '@nova/core';

export interface ServerDeps {
  pool: pg.Pool;
  intentPipeline: IntentPipeline;
  eventStore: EventStoreService;
}

export function createServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({
    logger: true,
    genReqId: () => generateId(),
  });

  // Add correlation ID to every request
  app.addHook('onRequest', async (request) => {
    request.headers['x-correlation-id'] =
      request.headers['x-correlation-id'] ?? generateId();
  });

  // Register routes
  registerIntentRoutes(app, deps.intentPipeline);
  registerProjectionRoutes(app, deps.pool);
  registerAuditRoutes(app, deps.eventStore);

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
        field: error.field,
      });
    }

    if (error instanceof ConcurrencyConflictError) {
      return reply.status(409).send({
        error: 'Concurrency Conflict',
        message: error.message,
        entity_id: error.entityId,
        expected_version: error.expectedVersion,
        actual_version: error.actualVersion,
      });
    }

    if (error instanceof EntityNotFoundError) {
      return reply.status(404).send({
        error: 'Not Found',
        message: error.message,
        entity_type: error.entityType,
        entity_id: error.entityId,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  return app;
}
