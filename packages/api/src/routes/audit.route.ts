import type { FastifyInstance } from 'fastify';
import type { EventStoreService, BaseEvent } from '@nova/core';

function serializeEvent(event: BaseEvent) {
  return {
    id: event.id,
    type: event.type,
    schema_version: event.schema_version,
    sequence: event.sequence.toString(),
    occurred_at: event.occurred_at,
    recorded_at: event.recorded_at,
    effective_date: event.effective_date,
    scope: event.scope,
    actor: event.actor,
    caused_by: event.caused_by,
    intent_id: event.intent_id,
    correlation_id: event.correlation_id,
    data: event.data,
    dimensions: event.dimensions,
    entities: event.entities,
    rules_evaluated: event.rules_evaluated,
    tags: event.tags,
    source: event.source,
    idempotency_key: event.idempotency_key,
  };
}

export function registerAuditRoutes(
  app: FastifyInstance,
  eventStore: EventStoreService,
): void {
  // List events with pagination
  app.get<{
    Querystring: { after_sequence?: string; limit?: string };
  }>('/audit/events', async (request, reply) => {
    const afterSequence = request.query.after_sequence
      ? BigInt(request.query.after_sequence)
      : undefined;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;

    const page = await eventStore.readStream({
      after_sequence: afterSequence,
      limit,
    });

    return reply.send({
      events: page.events.map(serializeEvent),
      has_more: page.has_more,
      next_sequence: page.next_sequence?.toString() ?? null,
    });
  });

  // Get single event by ID
  app.get<{ Params: { event_id: string } }>(
    '/audit/events/:event_id',
    async (request, reply) => {
      const event = await eventStore.getById(request.params.event_id);

      if (!event) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Event ${request.params.event_id} not found`,
        });
      }

      return reply.send(serializeEvent(event));
    },
  );
}
