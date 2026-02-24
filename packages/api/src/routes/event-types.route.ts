import type { FastifyInstance } from 'fastify';
import type { EventTypeRegistryService } from '@nova/core';

interface RegisterEventTypeBody {
  type_name: string;
  schema_version: number;
  json_schema: Record<string, unknown>;
  description?: string;
}

export function registerEventTypeRoutes(
  app: FastifyInstance,
  registry: EventTypeRegistryService,
): void {
  // GET /event-types — list all registered event types
  app.get('/event-types', async (_request, reply) => {
    const types = await registry.listTypes();
    return reply.send(types);
  });

  // GET /event-types/:name — list all versions of an event type
  app.get<{ Params: { name: string } }>(
    '/event-types/:name',
    async (request, reply) => {
      const versions = await registry.listVersions(request.params.name);
      if (versions.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Event type ${request.params.name} not found`,
        });
      }
      return reply.send(versions);
    },
  );

  // POST /event-types — register a new event type schema
  app.post<{ Body: RegisterEventTypeBody }>(
    '/event-types',
    async (request, reply) => {
      const body = request.body;
      if (!body?.type_name || !body.json_schema) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'type_name and json_schema are required',
        });
      }

      const registered = await registry.register(
        body.type_name,
        body.schema_version ?? 1,
        body.json_schema,
        body.description,
      );

      return reply.status(201).send(registered);
    },
  );
}
