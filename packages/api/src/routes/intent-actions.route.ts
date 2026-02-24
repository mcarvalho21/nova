import type { FastifyInstance } from 'fastify';
import type { IntentStoreService } from '@nova/intent';
import { getJwtPayload } from '../auth/index.js';

interface ApproveRejectBody {
  reason?: string;
}

export function registerIntentActionRoutes(
  app: FastifyInstance,
  intentStore?: IntentStoreService,
): void {
  if (!intentStore) return;

  // GET /intents/:id — retrieve intent status
  app.get<{ Params: { id: string } }>('/intents/:id', async (request, reply) => {
    const stored = await intentStore.getById(request.params.id);
    if (!stored) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Intent ${request.params.id} not found`,
      });
    }
    return reply.send(stored);
  });

  // POST /intents/:id/approve — approve a pending intent
  app.post<{ Params: { id: string }; Body: ApproveRejectBody }>('/intents/:id/approve', {
    preHandler: async (request, reply) => {
      if (app.hasDecorator('authenticate')) {
        await app.authenticate(request, reply);
      }
    },
  }, async (request, reply) => {
    const jwtPayload = getJwtPayload(request);
    const approverId = jwtPayload?.sub ?? 'unknown';
    const approverName = jwtPayload?.name ?? 'Unknown';

    const stored = await intentStore.approve(
      request.params.id,
      approverId,
      approverName,
      request.body?.reason,
    );

    return reply.send({
      intent_id: stored.id,
      status: stored.status,
      approved_by_id: stored.approved_by_id,
    });
  });

  // POST /intents/:id/reject — reject a pending intent
  app.post<{ Params: { id: string }; Body: ApproveRejectBody }>('/intents/:id/reject', {
    preHandler: async (request, reply) => {
      if (app.hasDecorator('authenticate')) {
        await app.authenticate(request, reply);
      }
    },
  }, async (request, reply) => {
    const jwtPayload = getJwtPayload(request);
    const rejectorId = jwtPayload?.sub ?? 'unknown';
    const rejectorName = jwtPayload?.name ?? 'Unknown';

    const stored = await intentStore.reject(
      request.params.id,
      rejectorId,
      rejectorName,
      request.body?.reason,
    );

    return reply.send({
      intent_id: stored.id,
      status: stored.status,
      rejected_by_id: stored.rejected_by_id,
    });
  });

  // POST /intents/:id/execute — execute an approved intent (deferred execution)
  app.post<{ Params: { id: string } }>('/intents/:id/execute', {
    preHandler: async (request, reply) => {
      if (app.hasDecorator('authenticate')) {
        await app.authenticate(request, reply);
      }
    },
  }, async (request, reply) => {
    const stored = await intentStore.getById(request.params.id);
    if (!stored) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Intent ${request.params.id} not found`,
      });
    }

    if (stored.status !== 'approved') {
      return reply.status(400).send({
        error: 'Invalid State',
        message: `Intent ${request.params.id} is not approved (status: ${stored.status})`,
      });
    }

    return reply.send({
      intent_id: stored.id,
      status: stored.status,
    });
  });
}
