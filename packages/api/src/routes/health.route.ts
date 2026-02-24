import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

export function registerHealthRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
): void {
  app.get('/health', async (_request, reply) => {
    let dbStatus: 'ok' | 'error' = 'error';

    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000),
      );
      await Promise.race([pool.query('SELECT 1'), timeoutPromise]);
      dbStatus = 'ok';
    } catch {
      // Database check failed
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';
    const statusCode = dbStatus === 'ok' ? 200 : 503;

    return reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
      },
    });
  });
}
