import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  generateId,
  ValidationError,
  ConcurrencyConflictError,
  EntityNotFoundError,
  AuthenticationError,
  AuthorizationError,
} from '@nova/core';
import type {
  EventStoreService,
  ProjectionEngine,
  SubscriptionService,
  SnapshotService,
  EventTypeRegistryService,
} from '@nova/core';
import type { IntentPipeline } from '@nova/intent';
import { jwtAuthPlugin } from './auth/index.js';
import { registerIntentRoutes } from './routes/intents.route.js';
import { registerProjectionRoutes } from './routes/projections.route.js';
import { registerAuditRoutes } from './routes/audit.route.js';
import { registerIntentActionRoutes } from './routes/intent-actions.route.js';
import { registerHealthRoutes } from './routes/health.route.js';
import { registerSubscriptionRoutes } from './routes/subscriptions.route.js';
import { registerEventTypeRoutes } from './routes/event-types.route.js';
import { registerProjectionOpsRoutes } from './routes/projection-ops.route.js';
import type pg from 'pg';
import type { IntentStoreService } from '@nova/intent';
import './auth/types.js';

export interface ServerDeps {
  pool: pg.Pool;
  intentPipeline: IntentPipeline;
  eventStore: EventStoreService;
  intentStore?: IntentStoreService;
  projectionEngine?: ProjectionEngine;
  subscriptionService?: SubscriptionService;
  snapshotService?: SnapshotService;
  eventTypeRegistry?: EventTypeRegistryService;
  jwtSecret?: string;
}

export function createServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({
    logger: true,
    genReqId: () => generateId(),
  });

  // Register JWT auth plugin
  app.register(jwtAuthPlugin, { jwtSecret: deps.jwtSecret });

  // Add correlation ID to every request
  app.addHook('onRequest', async (request) => {
    const correlationId = (request.headers['x-correlation-id'] as string) ?? generateId();
    request.headers['x-correlation-id'] = correlationId;
    request.log = request.log.child({ correlation_id: correlationId });
  });

  // Register routes
  registerIntentRoutes(app, deps.intentPipeline, deps.intentStore);
  registerProjectionRoutes(app, deps.pool);
  registerAuditRoutes(app, deps.eventStore);
  registerIntentActionRoutes(app, deps.intentStore);
  registerHealthRoutes(app, deps.pool);

  // Week 4: subscription management routes
  if (deps.subscriptionService) {
    registerSubscriptionRoutes(app, deps.subscriptionService);
  }

  // Week 4: event type registry routes
  if (deps.eventTypeRegistry) {
    registerEventTypeRoutes(app, deps.eventTypeRegistry);
  }

  // Week 4: projection operations (rebuild, snapshot) routes
  if (deps.projectionEngine && deps.snapshotService) {
    registerProjectionOpsRoutes(app, deps.projectionEngine, deps.snapshotService);
  }

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: error.message,
      });
    }

    if (error instanceof AuthorizationError) {
      const authzError = error as unknown as AuthorizationError;
      return reply.status(403).send({
        error: 'Forbidden',
        message: authzError.message,
        required_capabilities: authzError.requiredCapabilities,
      });
    }

    if (error instanceof ValidationError) {
      const valError = error as unknown as ValidationError;
      return reply.status(400).send({
        error: 'Validation Error',
        message: valError.message,
        field: valError.field,
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

    // @fastify/jwt throws errors with statusCode
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 401) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: error.message,
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
