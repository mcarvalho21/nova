import type { FastifyInstance } from 'fastify';
import type { IntentPipeline, Intent, IntentStoreService } from '@nova/intent';
import { getJwtPayload } from '../auth/index.js';

interface CreateIntentBody {
  type: string;
  actor?: {
    type: 'human' | 'agent' | 'system' | 'external' | 'import';
    id: string;
    name: string;
  };
  data: Record<string, unknown>;
  idempotency_key?: string;
  correlation_id?: string;
  occurred_at?: string;
  effective_date?: string;
  expected_entity_version?: number;
}

export function registerIntentRoutes(
  app: FastifyInstance,
  pipeline: IntentPipeline,
  _intentStore?: IntentStoreService,
): void {
  app.post<{ Body: CreateIntentBody }>('/intents', {
    preHandler: async (request, reply) => {
      // If auth is configured (authenticate decorator exists), require it on POST /intents
      if (app.hasDecorator('authenticate')) {
        await app.authenticate(request, reply);
      }
    },
  }, async (request, reply) => {
    const body = request.body;

    if (!body || !body.type) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Intent type is required',
      });
    }

    if (!body.data || typeof body.data !== 'object') {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Data object is required',
      });
    }

    // Actor comes from JWT if available, otherwise from body (backward compat)
    const jwtPayload = getJwtPayload(request);
    let actor: Intent['actor'];
    let capabilities: string[] | undefined;
    let legalEntity: string | undefined;

    if (jwtPayload) {
      actor = {
        type: jwtPayload.actor_type,
        id: jwtPayload.sub,
        name: jwtPayload.name,
      };
      capabilities = jwtPayload.capabilities;
      legalEntity = jwtPayload.legal_entity;
    } else {
      // Fallback for backward compat (no auth mode)
      if (!body.actor || !body.actor.type || !body.actor.id || !body.actor.name) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Actor with type, id, and name is required',
        });
      }
      actor = body.actor;
    }

    const intent: Intent = {
      intent_type: body.type,
      actor,
      data: body.data,
      idempotency_key: body.idempotency_key,
      correlation_id: body.correlation_id,
      occurred_at: body.occurred_at ? new Date(body.occurred_at) : undefined,
      effective_date: body.effective_date ?? undefined,
      expected_entity_version: body.expected_entity_version,
      capabilities,
      legal_entity: legalEntity,
    };

    const result = await pipeline.execute(intent);

    if (!result.success) {
      // Check if this is a pending_approval result
      if (result.status === 'pending_approval') {
        return reply.status(202).send({
          intent_id: result.intent_id,
          status: 'pending_approval',
          required_approver_role: result.required_approver_role,
        });
      }

      return reply.status(400).send({
        error: 'Intent Rejected',
        message: result.error,
        intent_id: result.intent_id,
        traces: result.traces,
      });
    }

    return reply.status(201).send({
      intent_id: result.intent_id,
      event_id: result.event_id,
      event: result.event
        ? {
            id: result.event.id,
            type: result.event.type,
            sequence: result.event.sequence.toString(),
            occurred_at: result.event.occurred_at,
            recorded_at: result.event.recorded_at,
            effective_date: result.event.effective_date,
            data: result.event.data,
            entities: result.event.entities,
            rules_evaluated: result.event.rules_evaluated,
          }
        : undefined,
    });
  });
}
