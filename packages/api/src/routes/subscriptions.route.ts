import type { FastifyInstance } from 'fastify';
import type { SubscriptionService } from '@nova/core';

export function registerSubscriptionRoutes(
  app: FastifyInstance,
  subscriptionService: SubscriptionService,
): void {
  // GET /subscriptions — list all subscriptions
  app.get('/subscriptions', async (_request, reply) => {
    const subscriptions = await subscriptionService.list();
    return reply.send(
      subscriptions.map((s) => ({
        ...s,
        last_processed_seq: s.last_processed_seq.toString(),
      })),
    );
  });

  // GET /subscriptions/:type — get subscription by projection type
  app.get<{ Params: { type: string } }>(
    '/subscriptions/:type',
    async (request, reply) => {
      const sub = await subscriptionService.getByType(request.params.type);
      if (!sub) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Subscription for ${request.params.type} not found`,
        });
      }
      return reply.send({
        ...sub,
        last_processed_seq: sub.last_processed_seq.toString(),
      });
    },
  );

  // POST /subscriptions/:type/pause — pause subscription
  app.post<{ Params: { type: string } }>(
    '/subscriptions/:type/pause',
    async (request, reply) => {
      const sub = await subscriptionService.pause(request.params.type);
      if (!sub) {
        return reply.status(400).send({
          error: 'Invalid State',
          message: `Subscription ${request.params.type} is not active or does not exist`,
        });
      }
      return reply.send({
        projection_type: sub.projection_type,
        status: sub.status,
      });
    },
  );

  // POST /subscriptions/:type/resume — resume subscription
  app.post<{ Params: { type: string } }>(
    '/subscriptions/:type/resume',
    async (request, reply) => {
      const sub = await subscriptionService.resume(request.params.type);
      if (!sub) {
        return reply.status(400).send({
          error: 'Invalid State',
          message: `Subscription ${request.params.type} is not paused or does not exist`,
        });
      }
      return reply.send({
        projection_type: sub.projection_type,
        status: sub.status,
      });
    },
  );

  // POST /subscriptions/:type/reset — reset subscription cursor
  app.post<{ Params: { type: string } }>(
    '/subscriptions/:type/reset',
    async (request, reply) => {
      const sub = await subscriptionService.reset(request.params.type);
      if (!sub) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Subscription ${request.params.type} not found`,
        });
      }
      return reply.send({
        projection_type: sub.projection_type,
        status: sub.status,
        last_processed_seq: sub.last_processed_seq.toString(),
      });
    },
  );
}
