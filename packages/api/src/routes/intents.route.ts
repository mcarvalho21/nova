import type { FastifyInstance } from 'fastify';
import type { IntentPipeline, Intent } from '@nova/intent';

interface CreateIntentBody {
  type: string;
  actor: {
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
): void {
  app.post<{ Body: CreateIntentBody }>('/intents', async (request, reply) => {
    const body = request.body;

    if (!body || !body.type) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Intent type is required',
      });
    }

    if (!body.actor || !body.actor.type || !body.actor.id || !body.actor.name) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Actor with type, id, and name is required',
      });
    }

    if (!body.data || typeof body.data !== 'object') {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Data object is required',
      });
    }

    const intent: Intent = {
      intent_type: body.type,
      actor: body.actor,
      data: body.data,
      idempotency_key: body.idempotency_key,
      correlation_id: body.correlation_id,
      occurred_at: body.occurred_at ? new Date(body.occurred_at) : undefined,
      effective_date: body.effective_date ? new Date(body.effective_date) : undefined,
      expected_entity_version: body.expected_entity_version,
    };

    const result = await pipeline.execute(intent);

    if (!result.success) {
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
            data: result.event.data,
            entities: result.event.entities,
            rules_evaluated: result.event.rules_evaluated,
          }
        : undefined,
    });
  });
}
