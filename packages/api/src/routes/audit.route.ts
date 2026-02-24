import type { FastifyInstance } from 'fastify';
import type { EventStoreService } from '@nova/core';

export function registerAuditRoutes(
  app: FastifyInstance,
  eventStore: EventStoreService,
): void {
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

      return reply.send({
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
      });
    },
  );
}
